import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { logContactAttempt } from "@/lib/data/contact-log";
import {
  getJobLead,
  listReplyDrafts,
  updateLeadStatus,
  updateReplyDraft,
} from "@/lib/data/job-intake";
import type { MailAccountRow } from "@/lib/job-intake/ingest";
import { sendViaMailbox } from "@/lib/mail/smtp-send";
import {
  pickSendableMailbox,
  userMaySendFromApp,
  SEND_FORBIDDEN,
} from "@/lib/mail/send-policy";

/** Mailboxes with owner + send flag. Separate from ingest so cron still works before migration 050. */
export async function listSendableMailAccounts(orgId: string): Promise<MailAccountRow[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data, error } = await svc
    .from("mail_accounts")
    .select(
      "id, email_address, credential_ref, credential_encrypted, imap_host, imap_port, provider, watch_label, status, last_synced_at, owner_user_id, can_send",
    )
    .eq("org_id", orgId)
    .eq("status", "active");
  if (error || !data) return [];
  return (data as MailAccountRow[]).map((row) => ({
    ...row,
    owner_user_id: row.owner_user_id ?? null,
    can_send: Boolean(row.can_send),
  }));
}

export async function userCanSendFromTriangle(
  orgId: string,
  userId: string,
): Promise<boolean> {
  const accounts = await listSendableMailAccounts(orgId);
  return userMaySendFromApp(accounts, userId);
}

export async function sendLeadReplyFromTriangle(params: {
  orgId: string;
  userId: string;
  leadId: string;
  draftId: string;
  subject: string;
  body: string;
}): Promise<{ ok: true; rfc822Id: string } | { ok: false; error: string }> {
  const lead = await getJobLead(params.leadId, params.orgId);
  if (!lead) return { ok: false, error: "That item is gone." };
  if (!lead.contactEmail) {
    return { ok: false, error: "No recipient address on this request." };
  }

  const drafts = await listReplyDrafts(params.leadId, params.orgId);
  const draft = drafts.find((d) => d.id === params.draftId);
  if (!draft) return { ok: false, error: "Draft not found." };

  const accounts = await listSendableMailAccounts(params.orgId);
  if (!userMaySendFromApp(accounts, params.userId)) {
    return { ok: false, error: SEND_FORBIDDEN };
  }
  const account = pickSendableMailbox(accounts, params.userId, lead.sourceMailbox);
  if (!account) {
    return { ok: false, error: SEND_FORBIDDEN };
  }

  const inboundId = await inboundRfc822Id(params.orgId, lead.inboundEmailId);
  const sent = await sendViaMailbox(account, {
    to: lead.contactEmail,
    subject: params.subject,
    body: params.body,
    inReplyTo: inboundId,
  });
  if ("error" in sent) return { ok: false, error: sent.error };

  const updated = await updateReplyDraft({
    draftId: params.draftId,
    orgId: params.orgId,
    subject: params.subject,
    body: params.body,
    status: "sent",
    outboundRfc822Id: sent.rfc822Id,
    mailAccountId: account.id,
  });
  if (!updated) {
    return {
      ok: false,
      error: "The message left Triangle but the draft could not be marked sent. Check the mailbox.",
    };
  }

  await updateLeadStatus(params.leadId, params.orgId, "replied");
  await logContactAttempt({
    orgId: params.orgId,
    userId: params.userId,
    leadId: params.leadId,
    channelKind: "email",
    value: lead.contactEmail,
    outcome: "sent",
    content: params.body,
    draft: draft.aiBody ?? draft.body,
    subject: params.subject,
  });

  return { ok: true, rfc822Id: sent.rfc822Id };
}

async function inboundRfc822Id(
  orgId: string,
  inboundEmailId: string | null,
): Promise<string | null> {
  if (!inboundEmailId) return null;
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data } = await svc
    .from("inbound_emails")
    .select("provider_message_id")
    .eq("org_id", orgId)
    .eq("id", inboundEmailId)
    .maybeSingle();
  return (data?.provider_message_id as string | null) ?? null;
}
