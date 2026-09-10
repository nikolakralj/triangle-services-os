import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { ContactOutcome } from "@/lib/data/contact-channels";

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

/**
 * Defined once, in contact-channels, because the client needs the same list to
 * draw the buttons. Two copies of one union is how two things drift apart.
 * "sent" was added on 10 September: an email has no "no answer" at the moment
 * it goes.
 */
export type AttemptOutcome = ContactOutcome;

export const ATTEMPT_LABEL: Record<AttemptOutcome, string> = {
  sent: "Sent",
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
  sent: "sent",
  reached: "replied",
  no_answer: "no_reply",
  dead_end: "replied",
};

/** commercial_actions.status — all three are terminal, all need confirming. */
const ACTION_STATUS: Record<AttemptOutcome, string> = {
  sent: "completed",
  reached: "responded",
  no_answer: "no_response",
  dead_end: "completed",
};

/** When a sent email or an unanswered call is worth trying again. */
const FOLLOW_UP_AFTER_DAYS = 4;

export async function logContactAttempt(params: {
  orgId: string;
  userId: string;
  /** A buyer contact, when the conversation is with one. */
  contactId?: string;
  /** An inbound requisition, when the conversation answers one. */
  leadId?: string;
  /** ChannelKind from contact-channels. */
  channelKind: string;
  /** The number dialled or address written to — the record of what was used. */
  value: string;
  outcome: AttemptOutcome;
  /** What was said, or a precise record of it. */
  content?: string | null;
  note?: string | null;
}): Promise<
  { ok: true; actionId: string; draftId: string } | { ok: false; error: string }
> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, error: "Database unavailable." };

  // Either a buyer contact or an inbound requisition. A conversation with a
  // recruiter at g2 about a live role is not attached to a discovered project
  // and never will be, and neither is a first call to Hays.
  let contactId: string | null = null;
  let leadId: string | null = null;
  let projectId: string | null = null;
  let recipientName: string | null = null;
  let recipientEmail: string | null = null;
  let recipientCompany: string | null = null;

  if (params.contactId) {
    const { data: contact } = await svc
      .from("buyer_contacts")
      .select("id, full_name, email, company_name, discovered_project_id")
      .eq("id", params.contactId)
      .eq("organization_id", params.orgId)
      .maybeSingle();
    if (!contact) return { ok: false, error: "Contact not found." };
    contactId = contact.id as string;
    projectId = (contact.discovered_project_id as string | null) ?? null;
    recipientName = (contact.full_name as string | null) ?? null;
    recipientEmail = (contact.email as string | null) ?? null;
    recipientCompany = (contact.company_name as string | null) ?? null;
  } else if (params.leadId) {
    const { data: lead } = await svc
      .from("job_leads")
      .select("id, contact_name, contact_email, agency_name, discovered_project_id")
      .eq("id", params.leadId)
      .eq("org_id", params.orgId)
      .maybeSingle();
    if (!lead) return { ok: false, error: "Lead not found." };
    leadId = lead.id as string;
    projectId = (lead.discovered_project_id as string | null) ?? null;
    recipientName = (lead.contact_name as string | null) ?? null;
    recipientEmail = (lead.contact_email as string | null) ?? null;
    recipientCompany = (lead.agency_name as string | null) ?? null;
  } else {
    return { ok: false, error: "Nothing to log this against." };
  }

  const channel = DRAFT_CHANNEL[params.channelKind] ?? "email_cold";
  const now = new Date().toISOString();
  // Something went and nothing came back yet, so there is a date to look again.
  const followUpAt =
    params.outcome === "sent" || params.outcome === "no_answer"
      ? new Date(Date.now() + FOLLOW_UP_AFTER_DAYS * 86_400_000).toISOString()
      : null;
  const record =
    params.content?.trim() ||
    `${VERB[channel] ?? "Contacted"} ${recipientName ?? "contact"} on ${params.value}.`;

  const { data: draft, error: draftError } = await svc
    .from("outreach_drafts")
    .insert({
      org_id: params.orgId,
      project_id: projectId,
      buyer_contact_id: contactId,
      job_lead_id: leadId,
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
  const { data: action, error: actionError } = await svc.from("commercial_actions").insert({
    org_id: params.orgId,
    outreach_draft_id: draft.id,
    action_type: ACTION_TYPE[channel] ?? "other",
    status: ACTION_STATUS[params.outcome],
    channel,
    sender_user_id: params.userId,
    recipient_name: recipientName,
    recipient_email: recipientEmail,
    recipient_company: recipientCompany,
    final_content: record,
    response_summary: params.note?.trim() || ATTEMPT_LABEL[params.outcome],
    outcome: params.outcome,
    occurred_at: now,
    follow_up_at: followUpAt,
    human_confirmed_at: now,
    human_confirmed_by: params.userId,
    created_by: params.userId,
    updated_by: params.userId,
  }).select("id").single();
  if (actionError || !action) {
    // Leaving the draft behind would show an attempt in the history with
    // nothing in the ledger backing it — a record that says a call happened
    // while the books say it did not.
    await svc.from("outreach_drafts").delete().eq("id", draft.id);
    return { ok: false, error: actionError?.message ?? "Could not record it." };
  }

  // The ids go back so the screen can say what was recorded and offer to take
  // it back. Returning only {ok:true} is why a click looked like nothing.
  return { ok: true, actionId: action.id as string, draftId: draft.id as string };
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
      if (
        value === "sent" ||
        value === "reached" ||
        value === "no_answer" ||
        value === "dead_end"
      ) {
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
          : row.status === "sent"
            ? "sent"
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

/** Long enough to catch a mis-click, short enough that the ledger stays a ledger. */
export const UNDO_WINDOW_MINUTES = 15;

/**
 * Take back a contact attempt that was recorded by mistake.
 *
 * There was no way to. A mis-click on the Today card filed a requisition as
 * answered, took it out of the queue for good, and put an attempt in the
 * ledger that never happened; the only repair was somebody with direct
 * database access.
 *
 * Only the person who recorded it, and only inside the window. An undo that
 * works on anybody's history at any age is not an undo, it is a way to
 * rewrite the books.
 */
export async function undoContactAttempt(params: {
  orgId: string;
  userId: string;
  actionId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, error: "Database unavailable." };

  const { data: action } = await svc
    .from("commercial_actions")
    .select("id, outreach_draft_id, sender_user_id, created_at")
    .eq("id", params.actionId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  if (!action) return { ok: false, error: "That record no longer exists." };

  if (action.sender_user_id !== params.userId) {
    return { ok: false, error: "Only the person who recorded it can undo it." };
  }

  const ageMinutes =
    (Date.now() - new Date(action.created_at as string).getTime()) / 60_000;
  if (ageMinutes > UNDO_WINDOW_MINUTES) {
    return {
      ok: false,
      error: `Too late to undo — it was recorded ${Math.round(ageMinutes)} minutes ago, and undo is only for a mis-click.`,
    };
  }

  // The ledger entry first: it references the draft.
  const { error: actionError } = await svc
    .from("commercial_actions")
    .delete()
    .eq("id", params.actionId)
    .eq("org_id", params.orgId)
    .eq("sender_user_id", params.userId);
  if (actionError) return { ok: false, error: actionError.message };

  if (action.outreach_draft_id) {
    const { error: draftError } = await svc
      .from("outreach_drafts")
      .delete()
      .eq("id", action.outreach_draft_id as string)
      .eq("org_id", params.orgId);
    // Left behind, the draft would keep the requisition marked as answered —
    // a half-undo that looks complete. Say so instead.
    if (draftError) {
      return {
        ok: false,
        error: `The ledger entry is gone but the draft behind it could not be removed: ${draftError.message}`,
      };
    }
  }
  return { ok: true };
}
