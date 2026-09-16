-- ============================================================
-- Migration 049: human-approved Send from Triangle (DEV-013)
-- ============================================================
-- 16 September sending policy: a person may review, edit and press Send in
-- Triangle. Agent-autonomous sending stays AUTO / APPROVAL / FORBIDDEN and
-- the freeze on autonomous outbound holds.
--
-- Two things the database did not know:
--
--   Which mailbox may send. Connected mailboxes are for ingest. Sending is a
--   separate, opt-in permission on the mailbox, off by default, and only the
--   mailbox owner may use it. A colleague's inbox is never a fallback sender.
--
--   That a recorded send went from Triangle. commercial_actions already keeps
--   the AI draft, the final text, recipient, time, channel and follow-up
--   (DEV-001). The outreach_drafts row beside it now says how it left —
--   through Triangle or recorded from outside — from which mailbox, and with
--   which RFC 822 Message-ID, so a later mailbox sync can recognise a reply
--   without a person pressing "They replied".
--
-- Idempotent. No rows are changed; existing records keep sent_via null,
-- which reads as "recorded, not sent from Triangle".

alter table public.mail_accounts
  add column if not exists can_send boolean not null default false;

comment on column public.mail_accounts.can_send is
  'Opt-in: the owner of this mailbox may press Send in Triangle. Ingest does not need it. Default false.';

alter table public.outreach_drafts
  add column if not exists sent_via text
    check (sent_via is null or sent_via in ('triangle', 'outside')),
  add column if not exists mail_account_id uuid references public.mail_accounts(id) on delete set null,
  add column if not exists outbound_rfc822_id text;

comment on column public.outreach_drafts.sent_via is
  'triangle = a person pressed Send in Triangle and SMTP accepted it; outside = recorded after sending elsewhere; null = older record.';

create index if not exists outreach_drafts_outbound_rfc822_idx
  on public.outreach_drafts (org_id, outbound_rfc822_id)
  where outbound_rfc822_id is not null;

notify pgrst, 'reload schema';
