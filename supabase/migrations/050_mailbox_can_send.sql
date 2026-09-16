-- Outbound from Triangle is per-mailbox. Ingest stays on; send is opt-in
-- and only the mailbox owner may use it. Default is ingest-only.

alter table public.mail_accounts
  add column if not exists can_send boolean not null default false;

notify pgrst, 'reload schema';
