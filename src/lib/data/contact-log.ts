import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// What has actually been tried on a person, and what came of it.
//
// The ask was "at least we track what has been done ... and then we know after
// some time if we have chance with project or company" — and the explicit
// instruction alongside it was not to build a CRM. So this is not a stage, a
// pipeline, a score or a set of custom fields. It is a list of attempts:
//
//     Called 4 Sep — no answer
//     Called 6 Sep — got through, asked for Einkauf
//
// Three outcomes, because those are the three things that happen on a cold
// call. Anything finer would be a form to fill in, and a form to fill in is
// the thing we are avoiding.
//
// Nothing new is stored. An attempt is an outreach_draft that was actually
// sent plus a commercial_action in the ledger — the same two records the rest
// of the system already treats as proof. Writing them from one button is the
// only new part.
// ---------------------------------------------------------------------------

export type AttemptOutcome = "reached" | "no_answer" | "dead_end";

export const ATTEMPT_LABEL: Record<AttemptOutcome, string> = {
  reached: "Got through",
  no_answer: "No answer",
  dead_end: "Dead end",
};

export interface ContactAttempt {
  id: string;
  contactId: string | null;
  /** "Called", "Emailed", "Messaged on LinkedIn". */
  verb: string;
  outcome: AttemptOutcome | null;
  at: string;
  note: string | null;
}

const DRAFT_CHANNEL: Record<string, string> = {
  phone: "phone_call",
  email: "email_cold",
  linkedin: "linkedin_message",
  contact_form: "email_cold",
  other: "email_cold",
};

const VERB: Record<string, string> = {
  phone_call: "Called",
  email_cold: "Emailed",
  email_followup: "Emailed",
  linkedin_connect: "Messaged on LinkedIn",
  linkedin_message: "Messaged on LinkedIn",
};

const ACTION_TYPE: Record<string, string> = {
  phone_call: "call",
  email_cold: "email",
  email_followup: "email",
  linkedin_connect: "linkedin",
  linkedin_message: "linkedin",
};

/** outreach_status for each outcome — the attempt happened either way. */
const DRAFT_STATUS: Record<AttemptOutcome, string> = {
  reached: "replied",
  no_answer: "no_reply",
  dead_end: "replied",
};

/** commercial_actions.status — all three are terminal, all need confirming. */
const ACTION_STATUS: Record<AttemptOutcome, string> = {
  reached: "responded",
  no_answer: "no_response",
  dead_end: "completed",
};

export async function logContactAttempt(params: {
  orgId: string;
  userId: string;
  contactId: string;
  /** ChannelKind from contact-channels. */
  channelKind: string;
  /** The number dialled or address written to — the record of what was used. */
  value: string;
  outcome: AttemptOutcome;
  /** What was said, or a precise record of it. */
  content?: string | null;
  note?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, error: "Database unavailable." };

  const { data: contact } = await svc
    .from("buyer_contacts")
    .select("id, full_name, email, company_name, discovered_project_id")
    .eq("id", params.contactId)
    .eq("organization_id", params.orgId)
    .maybeSingle();
  if (!contact) return { ok: false, error: "Contact not found." };

  // outreach_drafts.project_id is NOT NULL. A contact with no project behind
  // it cannot carry an attempt record, and saying so beats writing the
  // attempt somewhere it will never be read from.
  const projectId = contact.discovered_project_id as string | null;
  if (!projectId) {
    return {
      ok: false,
      error: "This contact is not attached to a project, so the attempt has nowhere to be recorded.",
    };
  }

  const channel = DRAFT_CHANNEL[params.channelKind] ?? "email_cold";
  const now = new Date().toISOString();
  const record =
    params.content?.trim() ||
    `${VERB[channel] ?? "Contacted"} ${contact.full_name ?? "contact"} on ${params.value}.`;

  const { data: draft, error: draftError } = await svc
    .from("outreach_drafts")
    .insert({
      org_id: params.orgId,
      project_id: projectId,
      buyer_contact_id: contact.id,
      channel,
      subject: null,
      body: record,
      status: DRAFT_STATUS[params.outcome],
      sent_at: now,
      replied_at: params.outcome === "reached" ? now : null,
      reply_summary: params.note?.trim() || ATTEMPT_LABEL[params.outcome],
      created_by_user_id: params.userId,
    })
    .select("id")
    .single();
  if (draftError) return { ok: false, error: draftError.message };

  // The ledger entry is the part that counts as commercial truth. A human
  // pressed the button, so the human confirmation is real — that is exactly
  // what the guard on this table is checking for.
  const { error: actionError } = await svc.from("commercial_actions").insert({
    org_id: params.orgId,
    outreach_draft_id: draft.id,
    action_type: ACTION_TYPE[channel] ?? "other",
    status: ACTION_STATUS[params.outcome],
    channel,
    sender_user_id: params.userId,
    recipient_name: contact.full_name,
    recipient_email: (contact.email as string | null) ?? null,
    recipient_company: (contact.company_name as string | null) ?? null,
    final_content: record,
    response_summary: params.note?.trim() || ATTEMPT_LABEL[params.outcome],
    outcome: params.outcome,
    occurred_at: now,
    human_confirmed_at: now,
    human_confirmed_by: params.userId,
    created_by: params.userId,
    updated_by: params.userId,
  });
  if (actionError) {
    // Leaving the draft behind would show an attempt in the history with
    // nothing in the ledger backing it — a record that says a call happened
    // while the books say it did not.
    await svc.from("outreach_drafts").delete().eq("id", draft.id);
    return { ok: false, error: actionError.message };
  }

  return { ok: true };
}

/** Everything tried on these people, newest first. */
export async function getContactLog(
  orgId: string,
  contactIds: string[],
): Promise<Map<string, ContactAttempt[]>> {
  const out = new Map<string, ContactAttempt[]>();
  const svc = createServiceSupabaseClient();
  if (!svc || contactIds.length === 0) return out;

  const { data } = await svc
    .from("outreach_drafts")
    .select("id, buyer_contact_id, channel, status, sent_at, replied_at, reply_summary, created_at")
    .eq("org_id", orgId)
    .in("buyer_contact_id", contactIds)
    .neq("status", "draft")
    .order("sent_at", { ascending: false });

  const rows = data ?? [];

  // The outcome is read back from the ledger, where it was written verbatim.
  //
  // It used to be inferred from the draft: status 'replied' plus a
  // reply_summary of exactly "Dead end" meant a dead end, anything else meant
  // a conversation. But a dead end and a conversation both store 'replied',
  // and the note the CEO is asked for replaces that summary — so "wrong
  // person, procurement is in Ijmuiden" came back as somebody who had picked
  // up and talked. That put a closed door into the follow-up queue, where it
  // would have been chased for as long as it sat there.
  const outcomeByDraft = new Map<string, AttemptOutcome>();
  if (rows.length > 0) {
    const { data: actions } = await svc
      .from("commercial_actions")
      .select("outreach_draft_id, outcome")
      .eq("org_id", orgId)
      .in(
        "outreach_draft_id",
        rows.map((r) => r.id as string),
      );
    for (const a of actions ?? []) {
      const value = String(a.outcome ?? "");
      if (value === "reached" || value === "no_answer" || value === "dead_end") {
        outcomeByDraft.set(a.outreach_draft_id as string, value);
      }
    }
  }

  for (const row of rows) {
    const contactId = row.buyer_contact_id as string;
    // Falls back to the draft status only for rows written before the ledger
    // carried an outcome — an email marked sent by the older outreach flow.
    const outcome: AttemptOutcome | null =
      outcomeByDraft.get(row.id as string) ??
      (row.status === "no_reply"
        ? "no_answer"
        : row.status === "replied"
          ? "reached"
          : null);
    const list = out.get(contactId) ?? [];
    list.push({
      id: row.id as string,
      contactId,
      verb: VERB[row.channel as string] ?? "Contacted",
      outcome,
      at: (row.sent_at as string) ?? (row.created_at as string),
      note: (row.reply_summary as string | null) ?? null,
    });
    out.set(contactId, list);
  }
  return out;
}
