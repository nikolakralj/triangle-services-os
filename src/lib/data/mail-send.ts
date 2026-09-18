import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { logContactAttempt } from "@/lib/data/contact-log";
import { recordRefusal } from "@/lib/data/refusals";
import { pickSendableMailbox, SEND_NOT_ENABLED } from "@/lib/mail/send-policy";
import { isPlainAddress, sendViaMailbox } from "@/lib/mail/smtp-send";
import { buildPackAttachment } from "@/lib/mail/pack-attachment";
import { approvedPackForSend } from "@/lib/data/put-forward-cases";

// ---------------------------------------------------------------------------
// A person presses Send in Triangle (DEV-013).
//
// Review, edit, Send: allowed since the 16 September sending policy. Agents
// still do not send — this module is reached only from a route that refuses
// anything but a signed-in person with write rights — and the freeze on
// autonomous outbound holds.
//
// Order matters. The server is asked first; the record is written only after
// it accepted the message. A send the server refused is not recorded as a
// send; it is a refusal in the ledger, and the person is told why. The
// record itself is the DEV-001 one — commercial_actions with the AI draft
// beside the final text, recipient, time, channel, follow-up date — plus
// which mailbox it left from and its Message-ID.
// ---------------------------------------------------------------------------

export interface SendFromTriangleInput {
  orgId: string;
  userId: string;
  to: string;
  subject: string;
  body: string;
  /** The words as Triangle wrote them, before the person edited. */
  draft?: string | null;
  contactId?: string;
  leadId?: string;
  personId?: string;
  /** The mailbox the person picked, when they own more than one. */
  mailAccountId?: string | null;
  /** The inbound message this answers, for threading. */
  inReplyTo?: string | null;
  /**
   * Attach the profile a person approved on this case. Both are needed: the
   * tick says they meant it now, and the case id is what the approval is
   * read from. Neither is trusted on its own.
   */
  attachPack?: boolean;
  putForwardAssignmentId?: string | null;
}

export type SendFromTriangleResult =
  | {
      ok: true;
      actionId: string;
      draftId: string;
      followUpAt: string | null;
      from: string;
      rfc822Id: string;
      attachedFilename?: string | null;
    }
  | { ok: false; error: string; status: number };

interface MailboxRow {
  id: string;
  email_address: string;
  display_name: string | null;
  owner_user_id: string | null;
  can_send: boolean | null;
  status: string | null;
  credential_encrypted: string | null;
  credential_ref: string | null;
}

/** The mailbox this person may send from, if any. Never a colleague's. */
export async function sendableMailboxFor(
  orgId: string,
  userId: string,
  preferredId: string | null = null,
): Promise<{ id: string; emailAddress: string } | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data, error } = await svc
    .from("mail_accounts")
    .select("id, email_address, owner_user_id, can_send, status")
    .eq("org_id", orgId)
    .eq("owner_user_id", userId);
  // Before migration 049 the column does not exist; then nobody may send.
  if (error || !data) return null;
  const picked = pickSendableMailbox(
    data as Array<{ id: string; email_address: string; owner_user_id: string | null; can_send: boolean | null; status: string | null }>,
    userId,
    preferredId,
  );
  return picked ? { id: picked.id, emailAddress: picked.email_address } : null;
}

export async function sendFromTriangle(input: SendFromTriangleInput): Promise<SendFromTriangleResult> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, error: "Database unavailable.", status: 503 };

  const to = input.to.trim();
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!isPlainAddress(to)) {
    return { ok: false, error: `"${to}" is not an email address Triangle can send to.`, status: 400 };
  }
  if (subject.length === 0) return { ok: false, error: "Give the message a subject.", status: 400 };
  if (body.length < 2) return { ok: false, error: "The message is empty.", status: 400 };

  const entityType = input.leadId ? "job_lead" : input.personId ? "contact" : "buyer_contact";
  const entityId = input.contactId ?? input.leadId ?? input.personId ?? null;

  const { data: rows, error: readError } = await svc
    .from("mail_accounts")
    .select(
      "id, email_address, display_name, owner_user_id, can_send, status, credential_encrypted, credential_ref",
    )
    .eq("org_id", input.orgId)
    .eq("owner_user_id", input.userId);
  if (readError) {
    return {
      ok: false,
      error: "Sending from Triangle is not set up on this database yet (migration 049).",
      status: 503,
    };
  }
  const mailbox = pickSendableMailbox((rows ?? []) as MailboxRow[], input.userId, input.mailAccountId ?? null);
  if (!mailbox) {
    await recordRefusal({
      orgId: input.orgId,
      surface: "Send from Triangle",
      reason: SEND_NOT_ENABLED,
      userId: input.userId,
      entityType,
      entityId,
      kind: "boundary",
    });
    return { ok: false, error: SEND_NOT_ENABLED, status: 403 };
  }

  // The human review gate, re-read from the record at the moment of sending.
  // A browser cannot assert that somebody approved this, and an approval
  // given on another case does not travel to this one. A refused attach is a
  // refusal in the ledger, not a silent plain-text send.
  let attachedFilename: string | null = null;
  const attachments: Array<{ filename: string; contentType: string; bytes: Buffer }> = [];
  if (input.attachPack) {
    const assignmentId = input.putForwardAssignmentId?.trim();
    if (!assignmentId) {
      return {
        ok: false,
        error: "Ask Hanna for a profile on this case, and approve it, before attaching one.",
        status: 400,
      };
    }
    const approved = await approvedPackForSend({
      orgId: input.orgId,
      assignmentId,
      ids: {
        leadId: input.leadId ?? null,
        contactId: input.contactId ?? null,
        personId: input.personId ?? null,
      },
    });
    if (!approved.ok) {
      await recordRefusal({
        orgId: input.orgId,
        surface: "Send from Triangle",
        reason: approved.error,
        userId: input.userId,
        entityType,
        entityId,
        details: { putForwardAssignmentId: assignmentId },
        kind: "boundary",
      });
      return { ok: false, error: approved.error, status: approved.status };
    }
    const file = await buildPackAttachment({
      orgId: input.orgId,
      workerId: approved.workerId,
      intent: approved.intent,
    });
    if (!file) {
      return {
        ok: false,
        error: "Could not build that profile. Nothing was sent.",
        status: 404,
      };
    }
    attachments.push(file);
    attachedFilename = file.filename;
  }

  const sent = await sendViaMailbox(mailbox, {
    to,
    subject,
    body,
    fromName: mailbox.display_name,
    inReplyTo: input.inReplyTo ?? null,
    attachments,
  });
  if ("error" in sent) {
    await recordRefusal({
      orgId: input.orgId,
      surface: "Send from Triangle",
      reason: sent.error,
      userId: input.userId,
      entityType,
      entityId,
      details: { mailbox: mailbox.email_address, to },
      kind: "truth",
    });
    return { ok: false, error: `Not sent. ${sent.error}`, status: 502 };
  }

  const logged = await logContactAttempt({
    orgId: input.orgId,
    userId: input.userId,
    contactId: input.contactId,
    leadId: input.leadId,
    personId: input.personId,
    channelKind: "email",
    value: to,
    outcome: "sent",
    content: body,
    draft: input.draft ?? null,
    subject,
    sentFromTriangle: { mailAccountId: mailbox.id, rfc822Id: sent.rfc822Id },
    note: attachedFilename
      ? `Approved Triangle profile attached: ${attachedFilename}`
      : undefined,
  });
  if (!logged.ok) {
    // The message is out; the books must say so even if the ledger write
    // failed. Loud, so it is fixed rather than lost.
    console.error("sendFromTriangle: sent but not recorded:", logged.error, sent.rfc822Id);
    return {
      ok: false,
      error: `The message was sent from ${mailbox.email_address} but could not be recorded: ${logged.error}. Record it under Dismiss → Recorded outside Triangle.`,
      status: 500,
    };
  }

  return {
    ok: true,
    actionId: logged.actionId,
    draftId: logged.draftId,
    followUpAt: logged.followUpAt,
    from: mailbox.email_address,
    rfc822Id: sent.rfc822Id,
    attachedFilename,
  };
}
