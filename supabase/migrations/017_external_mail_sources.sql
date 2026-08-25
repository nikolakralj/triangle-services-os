-- ============================================================
-- Migration 017: External mail sources
-- ============================================================
-- Lets an outside agent (a Grok/Claude bot, Zapier, an Airtable
-- automation) push raw messages into Job Intake via
-- POST /api/job-intake/ingest, instead of us connecting over IMAP.
--
-- Why this matters: bot platforms have verified Google/Microsoft OAuth,
-- which we cannot cheaply obtain (restricted Gmail scopes require an
-- annual third-party security assessment). Letting them own the pipe
-- while we own the scoring keeps both advantages.
--
-- These rows hold NO credentials. The bot keeps its own OAuth
-- connection; we only record which mailbox a lead arrived from, so two
-- people using two separate bots still see one attributed pipeline.

alter table public.mail_accounts
  drop constraint if exists mail_accounts_provider_check;

alter table public.mail_accounts
  add constraint mail_accounts_provider_check
  check (provider in ('imap', 'gmail_api', 'external'));

comment on column public.mail_accounts.provider is
  'imap = we connect directly; gmail_api = future OAuth; external = an agent/bot pushes messages to /api/job-intake/ingest';

notify pgrst, 'reload schema';
