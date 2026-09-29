-- ============================================================
-- Migration 050: requirement roles (P2 — one email, one case)
-- ============================================================
-- An email asking for people becomes one recruiting mission. Each role is
-- a row here: title, how many, level, skills, start, duration, location,
-- languages, rate. The mission is the case. Hanna's step and Bob's step
-- are ordinary assignments on that mission.
--
-- The same thread, the same message, or the same forward shares one
-- source_key, so a second sight does not open a second case.
--
-- DO NOT APPLY THIS FROM A CODING AGENT.
-- Local development and Production share one database. Nikola applies it.
-- Until then the opener leaves the email on its reply card and wakes nobody.

create table if not exists public.requirement_roles (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  mission_id        uuid not null references public.missions(id) on delete cascade,
  job_lead_id       uuid references public.job_leads(id) on delete set null,
  inbound_email_id  uuid references public.inbound_emails(id) on delete set null,
  -- Shared by every role from one email. Thread, else forward, else message.
  source_key        text not null,
  message_key       text,
  thread_key        text,
  forward_key       text,
  position          smallint not null check (position >= 1),
  title             text not null,
  headcount         integer not null check (headcount >= 1),
  level             text,
  skills            text[] not null default '{}',
  start_text        text,
  duration_text     text,
  location          text,
  languages         text[] not null default '{}',
  rate_text         text,
  -- Questions nobody has answered, copied onto each row of the case.
  open_questions    text[] not null default '{}',
  created_at        timestamptz not null default now(),
  constraint requirement_roles_title_check check (length(btrim(title)) > 0),
  unique (org_id, source_key, position)
);

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
