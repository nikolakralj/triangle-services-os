-- Contextual work reuses agent_assignments (mission_id already optional).
-- Outbound replies sent from Triangle keep the RFC822 id so IMAP ingest can
-- recognise a reply without a human clicking "They replied".

alter table public.lead_reply_drafts
  add column if not exists outbound_rfc822_id text;

alter table public.lead_reply_drafts
  add column if not exists mail_account_id uuid references public.mail_accounts(id) on delete set null;

alter table public.job_leads
  add column if not exists reply_received_at timestamptz;

create index if not exists lead_reply_drafts_rfc822_idx
  on public.lead_reply_drafts (org_id, outbound_rfc822_id)
  where outbound_rfc822_id is not null;

notify pgrst, 'reload schema';
