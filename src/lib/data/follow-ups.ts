import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { contactChannels, type ChannelKind } from "@/lib/data/contact-channels";

// ---------------------------------------------------------------------------
// Who is waiting to hear from us again.
//
// Every send has had a follow-up date since 10 September, and nothing ever
// looked at one. Eight replies to recruiters went out that day with a date of
// the 14th; on the 15th no screen said so, and the requisitions they answered
// had already left the queue as handled.
//
// A follow-up is due when the last thing we did with that person was a send
// or an unanswered call, and its date has come. Anything recorded after it —
// their reply, a second email, a dead end — answers it, so nothing here is
// ever closed by hand and nothing is removed from the ledger: every send keeps
// its date, which is what the Phase 0 gate counts.
// ---------------------------------------------------------------------------

export interface FollowUp {
  actionId: string;
  /** Exactly one is set: what the attempt was recorded against. */
  target: { contactId?: string; leadId?: string; personId?: string };
  who: string;
  company: string | null;
  /** The role a reply answered, or the subject of the message. */
  about: string | null;
  channelKind: ChannelKind;
  /** The number or address to use again, when one is on record. */
  value: string | null;
  subject: string | null;
  /** What went out, as recorded. */
  sent: string | null;
  at: string;
  dueAt: string;
  /** 0 when it is due today. */
  daysOverdue: number;
  outcome: "sent" | "no_answer";
  /** True when Today deferred this with no send recorded. */
  lookAgain?: boolean;
}

const KIND_OF_CHANNEL: Record<string, ChannelKind> = {
  phone_call: "phone",
  email_cold: "email",
  email_followup: "email",
  linkedin_connect: "linkedin",
  linkedin_message: "linkedin",
};

const DAY = 86_400_000;

function utcDay(iso: string | number): number {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

type Row = Record<string, unknown>;

export async function listFollowUpsDue(
  orgId: string,
  limit = 8,
): Promise<{ items: FollowUp[]; total: number }> {
  const none = { items: [], total: 0 };
  const svc = createServiceSupabaseClient();
  if (!svc) return none;

  // Due today counts: the date is a day to look again, not a minute.
  const endOfToday = new Date(utcDay(Date.now()) + DAY).toISOString();

  const { data: actions, error } = await svc
    .from("commercial_actions")
    .select(
      "id, outreach_draft_id, contact_id, channel, outcome, recipient_name, recipient_email, recipient_company, subject, final_content, occurred_at, follow_up_at",
    )
    .eq("org_id", orgId)
    .in("status", ["completed", "no_response"])
    .not("follow_up_at", "is", null)
    .lt("follow_up_at", endOfToday)
    .not("human_confirmed_at", "is", null)
    .not("outreach_draft_id", "is", null)
    .order("follow_up_at", { ascending: true })
    .limit(200);
  if (error || !actions || actions.length === 0) return none;

  const draftIds = actions.map((a) => a.outreach_draft_id as string);
  const { data: drafts } = await svc
    .from("outreach_drafts")
    .select("id, job_lead_id, buyer_contact_id, contact_id")
    .eq("org_id", orgId)
    .in("id", draftIds);
  const draftById = new Map((drafts ?? []).map((d) => [d.id as string, d]));

  const leadIds = new Set<string>();
  const contactIds = new Set<string>();
  const personIds = new Set<string>();
  for (const a of actions) {
    const d = draftById.get(a.outreach_draft_id as string);
    if (!d) continue;
    if (d.job_lead_id) leadIds.add(d.job_lead_id as string);
    else if (d.buyer_contact_id) contactIds.add(d.buyer_contact_id as string);
    else if (d.contact_id ?? a.contact_id) personIds.add((d.contact_id ?? a.contact_id) as string);
  }

  const attemptsOn = (column: string, ids: Set<string>) =>
    ids.size === 0
      ? Promise.resolve({ data: [] as Row[] })
      : svc
          .from("outreach_drafts")
          .select(`id, ${column}, sent_at, created_at`)
          .eq("org_id", orgId)
          .in(column, Array.from(ids))
          .neq("status", "draft");

  const [onLeads, onContacts, onPeople, leads, buyerContacts, people, personFindings] =
    await Promise.all([
      attemptsOn("job_lead_id", leadIds),
      attemptsOn("buyer_contact_id", contactIds),
      attemptsOn("contact_id", personIds),
      leadIds.size
        ? svc
            .from("job_leads")
            .select("id, role_title, country, agency_name, contact_name, contact_email")
            .eq("org_id", orgId)
            .in("id", Array.from(leadIds))
        : Promise.resolve({ data: [] as Row[] }),
      contactIds.size
        ? svc
            .from("buyer_contacts")
            .select("id, full_name, company_name, email, linkedin_url, notes")
            .eq("organization_id", orgId)
            .in("id", Array.from(contactIds))
        : Promise.resolve({ data: [] as Row[] }),
      personIds.size
        ? svc
            .from("contacts")
            .select("id, full_name, email, phone, mobile, linkedin_url, do_not_contact")
            .eq("organization_id", orgId)
            .in("id", Array.from(personIds))
        : Promise.resolve({ data: [] as Row[] }),
      // A mission records a person's published way in on the finding, not on
      // the contact row; the row often has no number at all.
      personIds.size
        ? svc
            .from("agent_findings")
            .select("promoted_entity_id, payload, created_at")
            .eq("org_id", orgId)
            .eq("finding_type", "contact")
            .in("promoted_entity_id", Array.from(personIds))
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as Row[] }),
    ]);

  // The newest attempt on each person. Newer than the send means answered.
  const latest = new Map<string, { id: string; at: number }>();
  const note = (prefix: string, column: string, rows: Row[] | null) => {
    for (const r of rows ?? []) {
      const key = `${prefix}:${r[column] as string}`;
      const at = new Date((r.sent_at as string | null) ?? (r.created_at as string)).getTime();
      const seen = latest.get(key);
      if (!seen || at > seen.at) latest.set(key, { id: r.id as string, at });
    }
  };
  note("lead", "job_lead_id", onLeads.data as Row[] | null);
  note("contact", "buyer_contact_id", onContacts.data as Row[] | null);
  note("person", "contact_id", onPeople.data as Row[] | null);

  const leadById = new Map(((leads.data ?? []) as Row[]).map((r) => [r.id as string, r]));
  const contactById = new Map(((buyerContacts.data ?? []) as Row[]).map((r) => [r.id as string, r]));
  const personById = new Map(((people.data ?? []) as Row[]).map((r) => [r.id as string, r]));
  const doorsByPerson = new Map<string, Row[]>();
  for (const f of (personFindings.data ?? []) as Row[]) {
    const id = f.promoted_entity_id as string;
    const list = doorsByPerson.get(id) ?? [];
    list.push((f.payload as Row | null) ?? {});
    doorsByPerson.set(id, list);
  }

  const today = utcDay(Date.now());
  const items: FollowUp[] = [];
  const seenTargets = new Set<string>();

  for (const a of actions) {
    const d = draftById.get(a.outreach_draft_id as string);
    if (!d) continue;
    const channelKind = KIND_OF_CHANNEL[String(a.channel ?? "")] ?? "email";

    let key: string;
    let target: FollowUp["target"];
    let who = (a.recipient_name as string | null) ?? null;
    let company = (a.recipient_company as string | null) ?? null;
    let about = (a.subject as string | null) ?? null;
    let value: string | null = channelKind === "email" ? ((a.recipient_email as string | null) ?? null) : null;

    if (d.job_lead_id) {
      const leadId = d.job_lead_id as string;
      key = `lead:${leadId}`;
      target = { leadId };
      const lead = leadById.get(leadId);
      if (lead) {
        who = who ?? (lead.contact_name as string | null) ?? (lead.agency_name as string | null);
        company = company ?? (lead.agency_name as string | null);
        about = [lead.role_title, lead.country].filter(Boolean).join(" — ") || about;
        value = value ?? (lead.contact_email as string | null);
      }
    } else if (d.buyer_contact_id) {
      const contactId = d.buyer_contact_id as string;
      key = `contact:${contactId}`;
      target = { contactId };
      const contact = contactById.get(contactId);
      if (contact) {
        who = who ?? (contact.full_name as string | null);
        company = company ?? (contact.company_name as string | null);
        const door = contactChannels({
          email: contact.email as string | null,
          linkedin_url: contact.linkedin_url as string | null,
          notes: contact.notes as string | null,
        }).find((c) => c.kind === channelKind);
        value = door?.value ?? value;
      }
    } else if (d.contact_id ?? a.contact_id) {
      const personId = (d.contact_id ?? a.contact_id) as string;
      key = `person:${personId}`;
      target = { personId };
      const person = personById.get(personId);
      if (!person || person.do_not_contact) continue;
      who = who ?? (person.full_name as string | null);
      const own =
        channelKind === "phone"
          ? ((person.phone as string | null) ?? (person.mobile as string | null))
          : channelKind === "email"
            ? (person.email as string | null)
            : channelKind === "linkedin"
              ? (person.linkedin_url as string | null)
              : null;
      const published = (doorsByPerson.get(personId) ?? []).find(
        (p) => p.kind === channelKind && typeof p.value === "string",
      );
      value = own ?? ((published?.value as string | undefined) ?? null) ?? value;
    } else {
      continue;
    }

    // Something happened after this send, or an older send on the same person
    // is already listed through the newer one.
    if (latest.get(key)?.id !== d.id || seenTargets.has(key)) continue;
    seenTargets.add(key);

    const dueAt = a.follow_up_at as string;
    items.push({
      actionId: a.id as string,
      target,
      who: who ?? "Unnamed contact",
      company,
      about,
      channelKind,
      value,
      subject: (a.subject as string | null) ?? null,
      sent: (a.final_content as string | null) ?? null,
      at: (a.occurred_at as string | null) ?? dueAt,
      dueAt,
      daysOverdue: Math.max(0, Math.round((today - utcDay(dueAt)) / DAY)),
      outcome: a.outcome === "no_answer" ? "no_answer" : "sent",
      lookAgain: a.outcome === "deferred",
    });
  }

  return { items: items.slice(0, limit), total: items.length };
}
