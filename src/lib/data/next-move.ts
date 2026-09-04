import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// The single most valuable thing available right now.
//
// The state on 4 September: twenty-four pending decisions, nine of which were
// literally phone numbers and email addresses for two named buyers — Peter
// Östlund's Waltenhofen office line, the Port Talbot switchboard Scout found
// for Paul Boxer — and zero of four buyer contacts reachable. The work was
// already done. Nothing on any screen said so.
//
// Management's stated goal is to spend LESS time in this app and more time
// finding clients. A queue of twenty-four items does not serve that; a
// sentence naming the one move does.
//
// Deliberately one move, not a ranked list. A list is another thing to read.
// ---------------------------------------------------------------------------

export interface NextMove {
  /** What to do, in the imperative. */
  headline: string;
  /** Why this and not something else. */
  because: string;
  href: string;
  cta: string;
  /** True when nothing needs a human — said plainly rather than hidden. */
  clear: boolean;
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
      .select("full_name, email, linkedin_url, notes")
      .eq("organization_id", orgId),
    svc
      .from("outreach_drafts")
      .select("id")
      .eq("org_id", orgId)
      .eq("status", "draft"),
  ]);

  const pending = findings.data ?? [];
  const channels = pending.filter((f) => {
    const p = (f.payload as Record<string, unknown>) ?? {};
    return Boolean(p.kind && p.value);
  });

  const people = new Set(
    channels
      .map((f) => String((f.payload as Record<string, unknown>).full_name ?? ""))
      .filter(Boolean),
  );

  const reachable = (contacts.data ?? []).filter(
    (c) => c.email || c.linkedin_url || /Phone:/.test(String(c.notes ?? "")),
  );

  // 1. A way to reach someone, already found, still waiting on a decision.
  //    Nothing else comes close: it converts research into a phone call.
  if (channels.length > 0) {
    const names = Array.from(people).slice(0, 2).join(" and ");
    return {
      headline: `Accept ${channels.length} way${channels.length === 1 ? "" : "s"} to contact ${names || "a buyer"}`,
      because:
        reachable.length === 0
          ? "Nobody in this company is reachable yet. These are already found and sourced — accepting them is the whole distance between research and a phone call."
          : "Already found and sourced. Accepting adds them to the contact so you can act on them.",
      href: "/approvals",
      cta: "Review and accept",
      clear: false,
    };
  }

  // 2. Someone is reachable and nothing has been sent to them.
  if (reachable.length > 0 && (drafts.data ?? []).length === 0) {
    const who = reachable[0].full_name as string;
    return {
      headline: `Contact ${who}`,
      because:
        "They are reachable and nothing has been sent. This is the step the whole system exists to reach.",
      href: "/hunter",
      cta: "Open the project",
      clear: false,
    };
  }

  // 3. A draft is written and unsent.
  if ((drafts.data ?? []).length > 0) {
    const n = (drafts.data ?? []).length;
    return {
      headline: `Send ${n} written draft${n === 1 ? "" : "s"}`,
      because:
        "Written and waiting. A draft that is never sent is the same as no draft at all.",
      href: "/hunter",
      cta: "Open the project",
      clear: false,
    };
  }

  // 4. Other decisions, but none of them a route to a person.
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
      "No pending evidence, no unsent drafts. Your employees continue within their authority.",
    href: "/agents",
    cta: "See what they are working on",
    clear: true,
  };
}
