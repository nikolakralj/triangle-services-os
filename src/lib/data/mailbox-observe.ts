import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { ImapMailSource } from "@/lib/job-intake/mail-source";
import { resolveMailboxPassword } from "@/lib/job-intake/credentials";
import { logContactAttempt } from "@/lib/data/contact-log";
import {
  normalizeEmail,
  normalizeMessageId,
  observationsFrom,
  type ObserveTarget,
} from "@/lib/mail/observe-policy";

// ---------------------------------------------------------------------------
// After job-intake ingest, look at INBOX + Sent and write the commercial
// ledger from what the mailbox already knows. No LLM, no send, no Today
// buttons. The mailbox owner is the actor. A new job from the same
// recruiter is not a reply — matching lives in observe-policy.ts.
// ---------------------------------------------------------------------------

export interface ObserveAccount {
  id: string;
  email_address: string;
  owner_user_id?: string | null;
  credential_ref: string | null;
  credential_encrypted: string | null;
  imap_host: string | null;
  imap_port: number | null;
  provider: string;
}

export interface ObserveSummary {
  account: string;
  fetched: number;
  sent: number;
  replied: number;
  skipped: number;
  errors: string[];
}

type Svc = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;

export async function observeAccount(
  account: ObserveAccount,
  orgId: string,
  opts: { since: Date; limit?: number },
): Promise<ObserveSummary> {
  const summary: ObserveSummary = {
    account: account.email_address,
    fetched: 0,
    sent: 0,
    replied: 0,
    skipped: 0,
    errors: [],
  };

  const userId = account.owner_user_id?.trim();
  if (!userId) {
    summary.errors.push("Mailbox has no owner; observation skipped.");
    return summary;
  }
  if (account.provider !== "imap") {
    summary.errors.push(`Provider "${account.provider}" is not implemented yet. Use imap.`);
    return summary;
  }

  let messages;
  try {
    const password = resolveMailboxPassword(account);
    const source = new ImapMailSource({
      emailAddress: account.email_address,
      password,
      host: account.imap_host,
      port: account.imap_port,
    });
    messages = await source.fetchForObserve(opts.since, opts.limit ?? 200);
  } catch (err) {
    summary.errors.push(err instanceof Error ? err.message : "Mailbox observe fetch failed.");
    return summary;
  }

  summary.fetched = messages.length;
  if (messages.length === 0) return summary;

  const svc = createServiceSupabaseClient();
  if (!svc) {
    summary.errors.push("Database unavailable.");
    return summary;
  }

  const { targets, alreadyRecorded } = await loadObserveTargets(svc, orgId);
  if (targets.length === 0) {
    summary.skipped = messages.length;
    return summary;
  }

  const hits = observationsFrom(messages, targets, [account.email_address], alreadyRecorded);
  const byId = new Map(messages.map((m) => [normalizeMessageId(m.messageId), m]));

  for (const obs of hits) {
    const msg = byId.get(obs.messageId);
    const logged = await logContactAttempt({
      orgId,
      userId,
      leadId: obs.target.leadId,
      contactId: obs.target.contactId,
      personId: obs.target.personId,
      channelKind: "email",
      value: obs.target.email,
      outcome: obs.kind === "sent" ? "sent" : "reached",
      subject: obs.kind === "sent" ? (msg?.subject ?? null) : null,
      note:
        obs.kind === "sent"
          ? "Observed in the Sent folder."
          : "Reply observed in the inbox.",
      occurredAt: msg?.sentAt ?? null,
      observedFromMailbox: {
        mailAccountId: account.id,
        rfc822Id: obs.messageId,
        threadId: msg?.threadId ?? null,
      },
    });
    if (!logged.ok) {
      summary.errors.push(`${obs.kind} ${obs.target.email}: ${logged.error}`);
      continue;
    }
    if (logged.duplicate) {
      summary.skipped += 1;
      continue;
    }
    if (obs.kind === "sent") summary.sent += 1;
    else summary.replied += 1;
  }

  summary.skipped = Math.max(0, messages.length - summary.sent - summary.replied);
  return summary;
}

async function loadObserveTargets(
  svc: Svc,
  orgId: string,
): Promise<{ targets: ObserveTarget[]; alreadyRecorded: Set<string> }> {
  const alreadyRecorded = new Set<string>();
  const targets: ObserveTarget[] = [];

  const [leadsRes, rfcRes, findingsRes] = await Promise.all([
    svc
      .from("job_leads")
      .select("id, contact_email")
      .eq("org_id", orgId)
      .is("duplicate_of_id", null)
      .in("status", ["new", "reviewing", "replied", "qualified"])
      .not("contact_email", "is", null)
      .limit(500),
    svc
      .from("outreach_drafts")
      .select("outbound_rfc822_id")
      .eq("org_id", orgId)
      .not("outbound_rfc822_id", "is", null)
      .limit(2000),
    svc
      .from("agent_findings")
      .select("promoted_entity_id, payload")
      .eq("org_id", orgId)
      .eq("finding_type", "contact")
      .eq("status", "applied")
      .eq("finding_state", "reachable")
      .limit(500),
  ]);

  const draftQuery = (columns: string) =>
    svc
      .from("outreach_drafts")
      .select(columns)
      .eq("org_id", orgId)
      .in("channel", ["email_cold", "email_followup"])
      .neq("status", "draft")
      .limit(1000);
  let draftsRes = await draftQuery(
    "id, job_lead_id, buyer_contact_id, contact_id, outbound_rfc822_id, outbound_thread_id, subject, sent_at, status, channel",
  );
  if (draftsRes.error) {
    draftsRes = await draftQuery(
      "id, job_lead_id, buyer_contact_id, contact_id, outbound_rfc822_id, subject, sent_at, status, channel",
    );
  }

  for (const row of rfcRes.data ?? []) {
    const id = normalizeMessageId(row.outbound_rfc822_id as string | null);
    if (id) alreadyRecorded.add(id);
  }

  const drafts = (draftsRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  const draftIds = drafts.map((d) => d.id as string);
  const outcomeByDraft = new Map<string, { outcome: string; at: string | null }>();
  if (draftIds.length > 0) {
    const { data: actions } = await svc
      .from("commercial_actions")
      .select("outreach_draft_id, outcome, occurred_at")
      .eq("org_id", orgId)
      .in("outreach_draft_id", draftIds);
    for (const a of actions ?? []) {
      outcomeByDraft.set(a.outreach_draft_id as string, {
        outcome: String(a.outcome ?? ""),
        at: (a.occurred_at as string | null) ?? null,
      });
    }
  }

  const leadIds = new Set<string>();
  const contactIds = new Set<string>();
  const personIds = new Set<string>();
  for (const d of drafts) {
    if (d.job_lead_id) leadIds.add(d.job_lead_id as string);
    if (d.buyer_contact_id) contactIds.add(d.buyer_contact_id as string);
    if (d.contact_id) personIds.add(d.contact_id as string);
  }
  for (const lead of leadsRes.data ?? []) {
    leadIds.add(lead.id as string);
  }
  for (const f of findingsRes.data ?? []) {
    if (f.promoted_entity_id) personIds.add(f.promoted_entity_id as string);
  }

  const [leadsExtra, buyers, people] = await Promise.all([
    leadIds.size
      ? svc
          .from("job_leads")
          .select("id, contact_email")
          .eq("org_id", orgId)
          .in("id", Array.from(leadIds))
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    contactIds.size
      ? svc
          .from("buyer_contacts")
          .select("id, email")
          .eq("organization_id", orgId)
          .in("id", Array.from(contactIds))
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    personIds.size
      ? svc
          .from("contacts")
          .select("id, email, do_not_contact")
          .eq("organization_id", orgId)
          .in("id", Array.from(personIds))
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const emailByLead = new Map<string, string>();
  for (const row of [...(leadsRes.data ?? []), ...(leadsExtra.data ?? [])]) {
    const email = normalizeEmail((row.contact_email as string | null) ?? "");
    if (email.includes("@")) emailByLead.set(row.id as string, email);
  }
  const emailByBuyer = new Map<string, string>();
  for (const row of buyers.data ?? []) {
    const email = normalizeEmail((row.email as string | null) ?? "");
    if (email.includes("@")) emailByBuyer.set(row.id as string, email);
  }
  const emailByPerson = new Map<string, string>();
  for (const row of people.data ?? []) {
    if (row.do_not_contact) continue;
    const email = normalizeEmail((row.email as string | null) ?? "");
    if (email.includes("@")) emailByPerson.set(row.id as string, email);
  }
  for (const f of findingsRes.data ?? []) {
    const id = f.promoted_entity_id as string | null;
    if (!id || emailByPerson.has(id)) continue;
    const payload = (f.payload as { kind?: string; value?: string } | null) ?? null;
    if (payload?.kind === "email" && payload.value) {
      const email = normalizeEmail(payload.value);
      if (email.includes("@")) emailByPerson.set(id, email);
    }
  }

  const byKey = new Map<string, ObserveTarget>();
  const targetKey = (t: { leadId?: string; contactId?: string; personId?: string }) =>
    t.leadId ? `lead:${t.leadId}` : t.contactId ? `contact:${t.contactId}` : `person:${t.personId}`;

  const upsert = (partial: ObserveTarget) => {
    const key = targetKey(partial);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, partial);
      return;
    }
    prev.outboundRfc822Ids = [...new Set([...prev.outboundRfc822Ids, ...partial.outboundRfc822Ids])];
    prev.threadIds = [...new Set([...prev.threadIds, ...partial.threadIds])];
    const rank = { none: 0, other: 1, sent: 2, reached: 3 };
    if (rank[partial.latest] >= rank[prev.latest]) {
      prev.latest = partial.latest;
      prev.lastSubject = partial.lastSubject ?? prev.lastSubject;
      prev.lastAt = partial.lastAt ?? prev.lastAt;
    }
  };

  for (const [id, email] of emailByLead) {
    upsert({
      leadId: id,
      email,
      outboundRfc822Ids: [],
      threadIds: [],
      latest: "none",
    });
  }
  for (const [id, email] of emailByBuyer) {
    upsert({
      contactId: id,
      email,
      outboundRfc822Ids: [],
      threadIds: [],
      latest: "none",
    });
  }
  for (const [id, email] of emailByPerson) {
    upsert({
      personId: id,
      email,
      outboundRfc822Ids: [],
      threadIds: [],
      latest: "none",
    });
  }

  const draftsByKey = new Map<string, Array<Record<string, unknown>>>();
  for (const d of drafts) {
    const key = d.job_lead_id
      ? `lead:${d.job_lead_id}`
      : d.buyer_contact_id
        ? `contact:${d.buyer_contact_id}`
        : d.contact_id
          ? `person:${d.contact_id}`
          : null;
    if (!key) continue;
    const list = draftsByKey.get(key) ?? [];
    list.push(d);
    draftsByKey.set(key, list);
  }

  for (const [key, list] of draftsByKey) {
    const target = byKey.get(key);
    if (!target) continue;
    list.sort((a, b) => {
      const at = Date.parse(String(a.sent_at ?? "")) || 0;
      const bt = Date.parse(String(b.sent_at ?? "")) || 0;
      return bt - at;
    });
    const newest = list[0];
    const action = outcomeByDraft.get(newest.id as string);
    const outcome = action?.outcome ?? "";
    target.latest =
      outcome === "reached" || newest.status === "replied"
        ? "reached"
        : outcome === "sent" || newest.status === "sent" || newest.status === "no_reply"
          ? "sent"
          : "other";
    target.lastSubject = (newest.subject as string | null) ?? null;
    target.lastAt = action?.at ?? ((newest.sent_at as string | null) ?? null);
    for (const d of list) {
      const rfc = normalizeMessageId(d.outbound_rfc822_id as string | null);
      if (rfc) target.outboundRfc822Ids.push(rfc);
      const thread = (d.outbound_thread_id as string | null)?.trim();
      if (thread) target.threadIds.push(thread);
    }
  }

  for (const t of byKey.values()) {
    if (t.email.includes("@")) targets.push(t);
  }
  return { targets, alreadyRecorded };
}
