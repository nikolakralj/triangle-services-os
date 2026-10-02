-- ============================================================
-- Migration 055: WhatsApp routing and one document on a draft
-- ============================================================
-- An allowlisted inbound is routed to Scout, Bob, or Hanna. The choice and the
-- reason sit on the message row. A draft may name one document (a contractor,
-- company, or subcontractor list) stored in Supabase Storage. A CV, a bio
-- pack, and a worker profile are refused in the application before a row is
-- written; this table does not send by itself.
--
-- Idempotent. CREATE TABLE IF NOT EXISTS does not add columns to a table
-- that already exists, so each column is ADD COLUMN IF NOT EXISTS.
--
-- DO NOT APPLY THIS FROM A CODING AGENT.
-- Local development and Production share one database. Nikola applies it.
-- Until then a draft that carries a document, and an inbound that records
-- its route, answers 503 and files nothing.

alter table public.whatsapp_messages
  add column if not exists routed_employee text,
  add column if not exists route_reason text,
  add column if not exists attachment_filename text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_bucket text,
  add column if not exists attachment_path text,
  add column if not exists attachment_kind text,
  add column if not exists attachment_source_table text;

-- A key, not a fixed list. Adding a bot later does not need a new migration.
alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_routed_employee_check;
alter table public.whatsapp_messages
  add constraint whatsapp_messages_routed_employee_check
  check (
    routed_employee is null
    or routed_employee ~ '^[a-z][a-z0-9_]{0,63}$'
  );

insert into storage.buckets (id, name, public)
values ('whatsapp-drafts', 'whatsapp-drafts', false)
on conflict (id) do update set public = false;

comment on column public.whatsapp_messages.routed_employee is
  'Employee key for an allowlisted inbound: scout, bob, hanna, or a later bot. Unsure is stored as hanna. Null when the message was refused or not woken.';

comment on column public.whatsapp_messages.route_reason is
  'Why that employee was chosen, in one sentence. Does not quote a CV.';

comment on column public.whatsapp_messages.attachment_filename is
  'One document on an outbound draft. Contractor, company, and subcontractor lists only. A CV or worker profile is refused before insert.';

comment on column public.whatsapp_messages.attachment_path is
  'Object path in attachment_bucket. The service client reads it when a person approves the send. Nothing here sends by itself.';

notify pgrst, 'reload schema';
