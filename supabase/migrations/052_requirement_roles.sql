-- ============================================================
-- Migration 052: requirement roles (P2 — one email, one case)
-- ============================================================
-- An email asking for people becomes one recruiting mission. Each role is
-- a row here: title, how many, level, skills, start, duration, location,
-- languages, rate. The mission is the case. Hanna's step and Bob's step
-- are ordinary assignments on that mission.
--
-- The same thread, the same message, or the same forward shares one
-- source_key, so a second sight does not open a second case.
--
-- Numbered 052 on purpose. The live database already has, from PR #29
-- (branch cursor/personal-mail-d3bd, still unmerged):
--   050_mailbox_observe.sql
--     inbound_emails.in_reply_to, references_header, folder
--     outreach_drafts.outbound_thread_id
--   051_mailbox_space.sql
--     job_leads.shared_at, shared_by
-- This file does not alter inbound_emails, outreach_drafts, or job_leads,
-- and it does not rewrite any existing row.
--
-- Idempotent. CREATE TABLE IF NOT EXISTS does not add columns to a table
-- that already exists, so each column is also ADD COLUMN IF NOT EXISTS.
-- Constraints, the unique key, indexes and the read policy are created
-- only when missing.
--
-- DO NOT APPLY THIS FROM A CODING AGENT.
-- Local development and Production share one database. Nikola applies it.
-- Until then the opener leaves the email on its reply card and wakes nobody.

create table if not exists public.requirement_roles (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  mission_id        uuid not null,
  job_lead_id       uuid,
  inbound_email_id  uuid,
  -- Shared by every role from one email. Thread, else forward, else message.
  source_key        text not null,
  message_key       text,
  thread_key        text,
  forward_key       text,
  position          smallint not null,
  title             text not null,
  headcount         integer not null,
  level             text,
  skills            text[] not null default '{}',
  start_text        text,
  duration_text     text,
  location          text,
  languages         text[] not null default '{}',
  rate_text         text,
  -- Questions nobody has answered, copied onto each row of the case.
  open_questions    text[] not null default '{}',
  created_at        timestamptz not null default now()
);

alter table public.requirement_roles
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists org_id uuid,
  add column if not exists mission_id uuid,
  add column if not exists job_lead_id uuid,
  add column if not exists inbound_email_id uuid,
  add column if not exists source_key text,
  add column if not exists message_key text,
  add column if not exists thread_key text,
  add column if not exists forward_key text,
  add column if not exists position smallint,
  add column if not exists title text,
  add column if not exists headcount integer,
  add column if not exists level text,
  add column if not exists skills text[] not null default '{}',
  add column if not exists start_text text,
  add column if not exists duration_text text,
  add column if not exists location text,
  add column if not exists languages text[] not null default '{}',
  add column if not exists rate_text text,
  add column if not exists open_questions text[] not null default '{}',
  add column if not exists created_at timestamptz not null default now();

-- A brand-new table is empty, so these are no-ops after CREATE TABLE.
-- They heal a table that was created without the constraint.
alter table public.requirement_roles alter column org_id set not null;
alter table public.requirement_roles alter column mission_id set not null;
alter table public.requirement_roles alter column source_key set not null;
alter table public.requirement_roles alter column position set not null;
alter table public.requirement_roles alter column title set not null;
alter table public.requirement_roles alter column headcount set not null;
alter table public.requirement_roles alter column skills set not null;
alter table public.requirement_roles alter column languages set not null;
alter table public.requirement_roles alter column open_questions set not null;
alter table public.requirement_roles alter column created_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.requirement_roles'::regclass
      and contype = 'p'
  ) then
    alter table public.requirement_roles
      add constraint requirement_roles_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'requirement_roles_org_id_fkey'
      and conrelid = 'public.requirement_roles'::regclass
  ) then
    alter table public.requirement_roles
      add constraint requirement_roles_org_id_fkey
      foreign key (org_id) references public.organizations(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'requirement_roles_mission_id_fkey'
      and conrelid = 'public.requirement_roles'::regclass
  ) then
    alter table public.requirement_roles
      add constraint requirement_roles_mission_id_fkey
      foreign key (mission_id) references public.missions(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'requirement_roles_job_lead_id_fkey'
      and conrelid = 'public.requirement_roles'::regclass
  ) then
    alter table public.requirement_roles
      add constraint requirement_roles_job_lead_id_fkey
      foreign key (job_lead_id) references public.job_leads(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'requirement_roles_inbound_email_id_fkey'
      and conrelid = 'public.requirement_roles'::regclass
  ) then
    alter table public.requirement_roles
      add constraint requirement_roles_inbound_email_id_fkey
      foreign key (inbound_email_id) references public.inbound_emails(id) on delete set null;
  end if;
end $$;

alter table public.requirement_roles drop constraint if exists requirement_roles_position_check;
alter table public.requirement_roles
  add constraint requirement_roles_position_check check (position >= 1);

alter table public.requirement_roles drop constraint if exists requirement_roles_headcount_check;
alter table public.requirement_roles
  add constraint requirement_roles_headcount_check check (headcount >= 1);

alter table public.requirement_roles drop constraint if exists requirement_roles_title_check;
alter table public.requirement_roles
  add constraint requirement_roles_title_check check (length(btrim(title)) > 0);

create unique index if not exists requirement_roles_source_position_key
  on public.requirement_roles (org_id, source_key, position);

create index if not exists requirement_roles_mission_idx
  on public.requirement_roles (org_id, mission_id);

create index if not exists requirement_roles_message_idx
  on public.requirement_roles (org_id, message_key)
  where message_key is not null;

create index if not exists requirement_roles_thread_idx
  on public.requirement_roles (org_id, thread_key)
  where thread_key is not null;

create index if not exists requirement_roles_forward_idx
  on public.requirement_roles (org_id, forward_key)
  where forward_key is not null;

create index if not exists requirement_roles_lead_idx
  on public.requirement_roles (job_lead_id)
  where job_lead_id is not null;

alter table public.requirement_roles enable row level security;

drop policy if exists "org members can view requirement_roles" on public.requirement_roles;
create policy "org members can view requirement_roles"
  on public.requirement_roles for select
  using (public.is_org_member(org_id));

comment on table public.requirement_roles is
  'Roles on one recruiting case opened from an inbound people request. One row per role. Writes go through the service client.';

notify pgrst, 'reload schema';
