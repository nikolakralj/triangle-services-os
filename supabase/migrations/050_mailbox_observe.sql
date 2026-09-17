-- ============================================================
-- Migration 050: mailbox-observed sent / replied
-- ============================================================
-- Today should not wait for a person to press Sent or They replied. The
-- connected mailbox already knows: our outgoing mail is in Sent; their
-- reply lands in INBOX with In-Reply-To pointing at our Message-ID
-- (DEV-013 stored that id on outreach_drafts.outbound_rfc822_id).
--
-- inbound_emails currently stores Message-ID for ingest dedup but not the
-- reply headers, and it never reads the Sent folder. These columns let a
-- sync keep the headers and mark which folder a row came from. Job-intake
-- classification is unchanged. No rows are rewritten.

alter table public.inbound_emails
  add column if not exists in_reply_to text,
  add column if not exists references_header text,
  add column if not exists folder text not null default 'inbox';

alter table public.inbound_emails
  drop constraint if exists inbound_emails_folder_check;

alter table public.inbound_emails
  add constraint inbound_emails_folder_check
  check (folder in ('inbox', 'sent'));

create index if not exists inbound_emails_in_reply_to_idx
  on public.inbound_emails (org_id, in_reply_to)
  where in_reply_to is not null;

comment on column public.inbound_emails.in_reply_to is
  'RFC 822 In-Reply-To, so a reply can be matched to outreach_drafts.outbound_rfc822_id.';
comment on column public.inbound_emails.folder is
  'inbox = received; sent = observed in the Sent folder. Default inbox for rows written before this migration.';

alter table public.outreach_drafts
  add column if not exists outbound_thread_id text;

comment on column public.outreach_drafts.outbound_thread_id is
  'Provider thread id of our outbound message (Gmail X-GM-THRID). A later inbox message with the same thread id is a reply without needing In-Reply-To.';

notify pgrst, 'reload schema';
