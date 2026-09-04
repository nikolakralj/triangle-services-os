import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  bestChannel,
  contactChannels,
  type ChannelKind,
  type ContactChannel,
} from "@/lib/data/contact-channels";
import { getContactLog, type ContactAttempt } from "@/lib/data/contact-log";

// ---------------------------------------------------------------------------
// The single most valuable thing available right now — and the means to do it
// without leaving the page.
//
// The first version named the move and then linked to /hunter, which is a list
// of projects. "When i click open the project it brings me to project list ...
// but when i click i need really help." Correct: naming the move and then
// handing over a directory is most of a suggestion and none of the help. The
// stated ceiling on effort is "copy prepared email ... pickup my phone", so the
// move has to arrive carrying the number, the sentence, and one button for
// what happened.
//
// It was also lying. It counted six unsent drafts as work waiting, when five
// of them have no recipient at all — May seed rows with a null contact and an
// empty subject — and the sixth is a cold email to someone whose only known
// address is a switchboard. "Send 6 written drafts" was six pieces of nothing.
// A draft only counts here if there is a person on the other end and a channel
// that actually reaches them.
//
// Deliberately one move, not a ranked list. A list is another thing to read.
// ---------------------------------------------------------------------------

export interface NextMoveAction {
  contactId: string;
  personName: string;
  personRole: string | null;
  company: string | null;
  project: string | null;
  channelKind: ChannelKind;
  /** The number to dial or the address to write to. */
  value: string;
  /** Whose desk it is — "switchboard — Waltenhofen office", "their own". */
  whose: string;
  sourceUrl: string | null;
  /** What to say on the call, or the prepared email. Copyable, verbatim. */
  script: string | null;
  subject: string | null;
  /** Every previous attempt on this person, newest first. */
  history: ContactAttempt[];
}

export interface NextMove {
  headline: string;
  because: string;
  href: string;
  cta: string;
  /** True when nothing needs a human — said plainly rather than hidden. */
  clear: boolean;
  /** Present when the move can be done here: dial, copy, then log it. */
  action?: NextMoveAction | null;
}

/** Long enough that calling back is not pestering, short enough to stay warm. */
const RETRY_AFTER_DAYS = 4;

interface ContactRow {
  id: string;
  full_name: string | null;
  job_title: string | null;
  company_name: string | null;
  email: string | null;
  linkedin_url: string | null;
  notes: string | null;
  discovered_project_id: string | null;
}

export async function getNextMove(orgId: string): Promise<NextMove> {
  const svc = createServiceSupabaseClient();
  if (!svc) {
    return {
      headline: "Nothing to show",
      because: "No database connection.",
      href: "/decisions",
      cta: "Open Decision Inbox",
      clear: true,
    };
  }

  const [findings, contacts, drafts] = await Promise.all([
    svc
      .from("agent_findings")
      .select("payload")
      .eq("org_id", orgId)
      .eq("status", "pending"),
    svc
      .from("buyer_contacts")
      .select(
        "id, full_name, job_title, company_name, email, linkedin_url, notes, discovered_project_id",
      )
      .eq("organization_id", orgId),
    svc
      .from("outreach_drafts")
      .select("id, buyer_contact_id, subject, body, channel")
      .eq("org_id", orgId)
      .eq("status", "draft"),
  ]);

  const pending = findings.data ?? [];
  const rows = (contacts.data ?? []) as unknown as ContactRow[];
  const draftRows = drafts.data ?? [];

  // A way to reach someone, found and sourced, still waiting on a decision.
  const channelFindings = pending.filter((f) => {
    const p = (f.payload as Record<string, unknown>) ?? {};
    return Boolean(p.kind && p.value);
  });

  const reachable = rows.filter((c) => contactChannels(c).length > 0);
  const history = await getContactLog(
    orgId,
    reachable.map((c) => c.id),
  );

  // ── 1. Someone is reachable and has never been tried ──────────────────────
  //
  // Above everything else, including accepting more channels. Research that
  // is never acted on is the exact failure this product exists to prevent.
  const untried = reachable
    .filter((c) => (history.get(c.id) ?? []).length === 0)
    .sort(byActionability);

  if (untried.length > 0) {
    const person = untried[0];
    const channel = bestChannel(person);
    if (channel) {
      return {
        ...describe(person, channel, untried.length),
        action: buildAction(person, channel, draftRows, history),
      };
    }
  }

  // ── 2. Nobody reachable yet, but a route to one is waiting on you ─────────
  if (channelFindings.length > 0) {
    const names = Array.from(
      new Set(
        channelFindings
          .map((f) => String((f.payload as Record<string, unknown>).full_name ?? ""))
          .filter(Boolean),
      ),
    )
      .slice(0, 2)
      .join(" and ");
    return {
      headline: `Accept ${channelFindings.length} way${
        channelFindings.length === 1 ? "" : "s"
      } to contact ${names || "a buyer"}`,
      because:
        reachable.length === 0
          ? "Nobody in this company is reachable yet. These are already found and sourced — accepting them is the whole distance between research and a phone call."
          : "Already found and sourced. Accepting adds them to the contact so you can act on them.",
      href: "/approvals",
      cta: "Review and accept",
      clear: false,
    };
  }

  // ── 3. Tried, nobody picked up, and enough time has passed to try again ───
  const cutoff = Date.now() - RETRY_AFTER_DAYS * 86_400_000;
  const stale = reachable
    .filter((c) => {
      const log = history.get(c.id) ?? [];
      if (log.length === 0) return false;
      // A dead end is closed. Someone who answered is a conversation, not a
      // task to repeat.
      if (log.some((a) => a.outcome === "dead_end" || a.outcome === "reached")) {
        return false;
      }
      return new Date(log[0].at).getTime() < cutoff;
    })
    .sort(byActionability);

  if (stale.length > 0) {
    const person = stale[0];
    const log = history.get(person.id) ?? [];
    const channel = nextChannelToTry(person, log) ?? bestChannel(person);
    if (channel) {
      const tries = log.length;
      return {
        headline: `Try ${person.full_name ?? "them"} again`,
        because: `${tries} attempt${tries === 1 ? "" : "s"}, no answer, and the last was ${daysAgo(
          log[0].at,
        )}. ${
          channel.kind === "phone"
            ? "The number is published and the words are written."
            : "The message is ready."
        }`,
        href: "/decisions",
        cta: "Open Decision Inbox",
        clear: false,
        action: buildAction(person, channel, draftRows, history),
      };
    }
  }

  // ── 4. A draft that can actually be sent ──────────────────────────────────
  //
  // Sendable means there is a person attached AND a channel that reaches
  // them. Five of the six drafts on record fail the first test and the sixth
  // fails the second; counting those as waiting work is how a queue fills up
  // with things nobody can do.
  const byId = new Map(rows.map((c) => [c.id, c]));
  const sendable = draftRows.filter((d) => {
    const contact = d.buyer_contact_id
      ? byId.get(d.buyer_contact_id as string)
      : null;
    if (!contact) return false;
    return contactChannels(contact).some((ch) =>
      String(d.channel).startsWith("email")
        ? ch.kind === "email"
        : ch.kind === "linkedin",
    );
  });

  if (sendable.length > 0) {
    const n = sendable.length;
    return {
      headline: `Send ${n} written draft${n === 1 ? "" : "s"}`,
      because:
        "Written, addressed, and waiting. A draft that is never sent is the same as no draft at all.",
      href: "/decisions",
      cta: "Open Decision Inbox",
      clear: false,
    };
  }

  // ── 5. Decisions, but none of them a route to a person ────────────────────
  if (pending.length > 0) {
    return {
      headline: `${pending.length} decisions waiting`,
      because: "None of them is a way to reach a buyer, so none is urgent.",
      href: "/decisions",
      cta: "Open Decision Inbox",
      clear: false,
    };
  }

  return {
    headline: "Nothing needs you",
    because:
      "Everyone reachable has been contacted, nothing is unsent, and no evidence is waiting. Your employees continue within their authority.",
    href: "/agents",
    cta: "See what they are working on",
    clear: true,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** A number you can dial with a script beats an address you must compose for. */
function byActionability(a: ContactRow, b: ContactRow): number {
  const rank = (c: ContactRow) => {
    const ch = bestChannel(c);
    if (!ch) return 9;
    if (ch.kind === "phone") return ch.howToOpen ? 0 : 1;
    if (ch.kind === "email") return ch.howToOpen ? 2 : 3;
    return 4;
  };
  return rank(a) - rank(b);
}

function describe(
  person: ContactRow,
  channel: ContactChannel,
  total: number,
): Omit<NextMove, "action"> {
  const who = person.full_name ?? "this contact";
  const verb =
    channel.kind === "phone"
      ? "Call"
      : channel.kind === "email"
        ? "Email"
        : "Message";
  const others =
    total > 1
      ? ` ${total - 1} other${total === 2 ? " is" : "s are"} reachable and untried too.`
      : "";
  const desk = channel.whose.split(" — ")[0];
  return {
    headline: `${verb} ${who}${channel.kind === "phone" ? ` on ${channel.value}` : ""}`,
    because:
      channel.whose && channel.whose !== "their own"
        ? `Nothing has been tried on them yet. This is a ${desk}, not their direct line — the words to get past it are below.${others}`
        : `Nothing has been tried on them yet. This is their own ${channel.kind}.${others}`,
    href: "/decisions",
    cta: "Open Decision Inbox",
    clear: false,
  };
}

/** After a silent attempt, reach for a channel that has not been used yet. */
function nextChannelToTry(
  person: ContactRow,
  log: ContactAttempt[],
): ContactChannel | null {
  const usedVerbs = new Set(log.map((a) => a.verb));
  const verbFor: Record<string, string> = {
    phone: "Called",
    email: "Emailed",
    linkedin: "Messaged on LinkedIn",
  };
  const fresh = contactChannels(person).filter(
    (ch) => !usedVerbs.has(verbFor[ch.kind] ?? ""),
  );
  return fresh[0] ?? null;
}

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function buildAction(
  person: ContactRow,
  channel: ContactChannel,
  draftRows: Record<string, unknown>[],
  history: Map<string, ContactAttempt[]>,
): NextMoveAction {
  // For an email, the prepared draft is the script — there is no reason to ask
  // someone to write what an employee already wrote.
  const draft =
    channel.kind === "email"
      ? draftRows.find(
          (d) =>
            d.buyer_contact_id === person.id &&
            String(d.channel ?? "").startsWith("email"),
        )
      : undefined;

  return {
    contactId: person.id,
    personName: person.full_name ?? "Unnamed contact",
    personRole: person.job_title,
    company: person.company_name,
    project: null,
    channelKind: channel.kind,
    value: channel.value,
    whose: channel.whose,
    sourceUrl: channel.sourceUrl,
    script: draft ? String(draft.body ?? "") : channel.howToOpen,
    subject: draft ? String(draft.subject ?? "") || null : null,
    history: history.get(person.id) ?? [],
  };
}
