import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { ContactOutcome } from "@/lib/data/contact-channels";
import { normalizeMessageId } from "@/lib/mail/observe-policy";

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

/**
 * When a sent message or an unanswered call is worth looking at again.
 *
 * Every send gets one, without asking: the Phase 0 gate counts a send only
 * with a follow-up date, and a date picker on every Sent button is the form
 * this history was built to avoid. "Later" on Today moves it.
 */
export const FOLLOW_UP_AFTER_DAYS = 4;

export function followUpDate(days = FOLLOW_UP_AFTER_DAYS, from = Date.now()): string {
  return new Date(from + days * 86_400_000).toISOString();
}

type Svc = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;

async function existingByRfc822(
  svc: Svc,
  orgId: string,
  rfc822Id: string,
): Promise<{ actionId: string; draftId: string; followUpAt: string | null } | null> {
  const { data: draft, error } = await svc
    .from("outreach_drafts")
    .select("id")
    .eq("org_id", orgId)
    .eq("outbound_rfc822_id", rfc822Id)
    .maybeSingle();
  if (error || !draft) return null;
  const { data: action } = await svc
    .from("commercial_actions")
    .select("id, follow_up_at")
    .eq("org_id", orgId)
    .eq("outreach_draft_id", draft.id)
    .maybeSingle();
  return {
    actionId: (action?.id as string | undefined) ?? (draft.id as string),
    draftId: draft.id as string,
    followUpAt: (action?.follow_up_at as string | null | undefined) ?? null,
  };
}

/**
 * The line that stands in for the words when there are none to keep.
 *
 * It used to be "Emailed Oliver Hall on oliver@…" whatever happened, so a
 * reply was filed as another email from us.
 */
function recordOf(
  outcome: AttemptOutcome,
  channelKind: string,
  name: string | null,
  value: string,
): string {
  const who = name ?? "the contact";
  if (channelKind === "phone") {
    if (outcome === "reached") return `Called ${who} on ${value} and got through.`;
    if (outcome === "no_answer") return `Called ${who} on ${value}. No answer.`;
    if (outcome === "dead_end") return `Called ${who} on ${value}. Dead end.`;
    return `Called ${who} on ${value}.`;
  }
  if (outcome === "reached") return `${who} replied.`;
  if (outcome === "dead_end") return `${who} answered: not for us.`;
  if (channelKind === "linkedin") return `Messaged ${who} on LinkedIn.`;
  if (channelKind === "contact_form") return `Wrote to ${who} through the form at ${value}.`;
  return `Emailed ${who} at ${value}.`;
}

export async function logContactAttempt(params: {
  orgId: string;
  userId: string;
  /** A buyer contact, when the conversation is with one. */
  contactId?: string;
  /** An inbound requisition, when the conversation answers one. */
  leadId?: string;
  /** A person a mission found — a contacts row, with no project behind it. */
  personId?: string;
  /** ChannelKind from contact-channels. */
  channelKind: string;
  /** The number dialled or address written to — the record of what was used. */
  value: string;
  outcome: AttemptOutcome;
  /** What went out — the words as sent, or what was said on the call. */
  content?: string | null;
  /**
   * The words as Triangle wrote them, before the person changed anything.
   * Kept beside what went out so an edit is never lost; learning from the
   * CEO's edits starts from exactly this pair.
   */
  draft?: string | null;
  subject?: string | null;
  note?: string | null;
  /**
   * "Not now" with no prior send: archive a look-again without claiming a
   * mailbox send. The card leaves Today and comes back with the follow-up
   * date. Not a Sent record.
   */
  defer?: boolean;
  /**
   * Set only by Send from Triangle (DEV-013), after the mailbox's server
   * accepted the message: which mailbox, and the Message-ID it left with.
   * Written only when present, so a database without migration 049 keeps
   * recording every other kind of contact.
   */
  sentFromTriangle?: { mailAccountId: string; rfc822Id: string } | null;
  /**
   * Set only by mailbox observation (DEV-019): the connected mailbox already
   * has this message. sent_via = outside, Message-ID for idempotency. Not a
   * CEO button. The mailbox owner is the actor.
   */
  observedFromMailbox?: {
    mailAccountId: string;
    rfc822Id: string;
    threadId?: string | null;
  } | null;
  /** When the message actually went or arrived. Follow-up dates count from this. */
  occurredAt?: string | null;
}): Promise<
  | { ok: true; actionId: string; draftId: string; followUpAt: string | null; duplicate?: boolean }
  | { ok: false; error: string }
> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, error: "Database unavailable." };

  const rfc822Id = normalizeMessageId(
    params.sentFromTriangle?.rfc822Id ?? params.observedFromMailbox?.rfc822Id,
  );
  if (rfc822Id) {
    const existing = await existingByRfc822(svc, params.orgId, rfc822Id);
    if (existing) {
      const threadId = params.observedFromMailbox?.threadId?.trim();
      if (threadId) {
        await svc
          .from("outreach_drafts")
          .update({ outbound_thread_id: threadId })
          .eq("id", existing.draftId)
          .eq("org_id", params.orgId)
          .is("outbound_thread_id", null);
      }
      return {
        ok: true,
        actionId: existing.actionId,
        draftId: existing.draftId,
        followUpAt: existing.followUpAt,
        duplicate: true,
      };
    }
  }

  // Either a buyer contact or an inbound requisition. A conversation with a
  // recruiter at g2 about a live role is not attached to a discovered project
  // and never will be, and neither is a first call to Hays.
  let contactId: string | null = null;
  let leadId: string | null = null;
  let projectId: string | null = null;
  let recipientName: string | null = null;
  let recipientEmail: string | null = null;
  let recipientCompany: string | null = null;
  let personId: string | null = null;

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
  } else if (params.personId) {
    // Somebody a mission found. No project, no requisition — a company and a
    // name, which is how most first conversations actually start.
    const { data: person } = await svc
      .from("contacts")
      .select("id, full_name, email, company_id, do_not_contact")
      .eq("id", params.personId)
      .eq("organization_id", params.orgId)
      .maybeSingle();
    if (!person) return { ok: false, error: "Person not found." };
    if (person.do_not_contact) {
      return { ok: false, error: `${person.full_name as string} is marked do not contact.` };
    }
    personId = person.id as string;
    recipientName = (person.full_name as string | null) ?? null;
    recipientEmail = (person.email as string | null) ?? null;
    if (person.company_id) {
      const { data: company } = await svc
        .from("companies")
        .select("name")
        .eq("id", person.company_id as string)
        .eq("organization_id", params.orgId)
        .maybeSingle();
      recipientCompany = (company?.name as string | null) ?? null;
    }
  } else {
    return { ok: false, error: "Nothing to log this against." };
  }

  const channel = DRAFT_CHANNEL[params.channelKind] ?? "email_cold";
  const now = new Date().toISOString();
  const defer = Boolean(params.defer);
  const occurredMs = params.occurredAt ? Date.parse(params.occurredAt) : Date.now();
  const occurredIso =
    params.occurredAt && !Number.isNaN(occurredMs) ? new Date(occurredMs).toISOString() : now;
  // Something went and nothing came back yet, so there is a date to look again.
  // A defer is a look-again with no send — still needs a date, or it vanishes.
  // Observed sends count from the message date, not from the sync that saw it.
  const followUpAt =
    defer || params.outcome === "sent" || params.outcome === "no_answer"
      ? followUpDate(FOLLOW_UP_AFTER_DAYS, Number.isNaN(occurredMs) ? Date.now() : occurredMs)
      : null;
  // The words belong to what we did: a message that went, or a call. When the
  // event is their reply, the prepared email is not what happened, and filing
  // it as the content would say we sent it again.
  const ourWords = !defer && (params.outcome === "sent" || params.channelKind === "phone");
  const record = defer
    ? params.note?.trim() || "Not now. No message sent from Triangle."
    : (ourWords ? params.content?.trim() : null) ||
      recordOf(params.outcome, params.channelKind, recipientName, params.value);
  const aiDraft = ourWords ? params.draft?.trim() || null : null;
  const subject = ourWords ? params.subject?.trim() || null : null;
  const draftStatus = defer ? "archived" : DRAFT_STATUS[params.outcome];
  const actionStatus = defer ? "completed" : ACTION_STATUS[params.outcome];
  const outcome = defer ? "deferred" : params.outcome;
  const summary = params.note?.trim() || (defer ? "Not now" : ATTEMPT_LABEL[params.outcome]);

  const { data: draft, error: draftError } = await svc
    .from("outreach_drafts")
    .insert({
      org_id: params.orgId,
      project_id: projectId,
      buyer_contact_id: contactId,
      job_lead_id: leadId,
      // Sent only when set, so every other conversation keeps writing the
      // columns it always has.
      ...(personId ? { contact_id: personId } : {}),
      channel,
      subject,
      body: record,
      status: draftStatus,
      sent_at: occurredIso,
      replied_at: params.outcome === "reached" && !defer ? occurredIso : null,
      reply_summary: summary,
      created_by_user_id: params.userId,
      ...(params.sentFromTriangle
        ? {
            sent_via: "triangle",
            mail_account_id: params.sentFromTriangle.mailAccountId,
            outbound_rfc822_id: params.sentFromTriangle.rfc822Id,
          }
        : params.observedFromMailbox
          ? {
              sent_via: "outside",
              mail_account_id: params.observedFromMailbox.mailAccountId,
              outbound_rfc822_id: rfc822Id ?? params.observedFromMailbox.rfc822Id,
            }
          : {}),
    })
    .select("id")
    .single();
  if (draftError) return { ok: false, error: draftError.message };
  if (params.observedFromMailbox?.threadId) {
    await svc
      .from("outreach_drafts")
      .update({ outbound_thread_id: params.observedFromMailbox.threadId })
      .eq("id", draft.id)
      .eq("org_id", params.orgId);
  }

  // The ledger entry is the part that counts as commercial truth. A human
  // pressed the button, or the owner's mailbox already holds the message —
  // that is what the guard on this table is checking for.
  const { data: action, error: actionError } = await svc.from("commercial_actions").insert({
    org_id: params.orgId,
    outreach_draft_id: draft.id,
    ...(personId ? { contact_id: personId } : {}),
    action_type: ACTION_TYPE[channel] ?? "other",
    status: actionStatus,
    channel,
    sender_user_id: params.userId,
    recipient_name: recipientName,
    recipient_email: recipientEmail,
    recipient_company: recipientCompany,
    subject,
    ai_draft: aiDraft,
    final_content: record,
    response_summary: summary,
    outcome,
    occurred_at: occurredIso,
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
  if (params.outcome === "reached" && !defer) {
    try {
      const { recordClientReplyEvent } = await import("./event-outbox");
      await recordClientReplyEvent({
        orgId: params.orgId,
        sourceType: "contact_log",
        sourceId: action.id as string,
        recipientName,
        recipientEmail,
        recipientCompany,
        subject,
        replySummary: params.note?.trim() || ATTEMPT_LABEL[params.outcome],
      });
    } catch (err) {
      console.error("logContactAttempt: outbox dispatch failed:", err);
    }
  }

  return {
    ok: true,
    actionId: action.id as string,
    draftId: draft.id as string,
    followUpAt,
  };
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

/**
 * "Not yet" — look at this one again in a few days.
 *
 * Moves the date, never removes it: a send without a follow-up date does not
 * count toward the gate, and a follow-up nobody can see is how a live
 * conversation gets dropped. Anyone who may record contacts may move one; the
 * ledger keeps who did.
 */
export async function postponeFollowUp(params: {
  orgId: string;
  userId: string;
  actionId: string;
  days?: number;
}): Promise<{ ok: true; followUpAt: string } | { ok: false; error: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, error: "Database unavailable." };

  const { data: action } = await svc
    .from("commercial_actions")
    .select("id, follow_up_at")
    .eq("id", params.actionId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  if (!action) return { ok: false, error: "That record no longer exists." };
  if (!action.follow_up_at) {
    return { ok: false, error: "Nothing is waiting on a follow-up for this record." };
  }

  const followUpAt = followUpDate(params.days ?? FOLLOW_UP_AFTER_DAYS);
  const { error } = await svc
    .from("commercial_actions")
    .update({ follow_up_at: followUpAt, updated_by: params.userId })
    .eq("id", params.actionId)
    .eq("org_id", params.orgId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, followUpAt };
}
