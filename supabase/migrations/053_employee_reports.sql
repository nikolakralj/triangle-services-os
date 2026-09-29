-- ============================================================
-- Migration 053: employees report work done outside Triangle (P3)
-- ============================================================
-- Hanna, Bob and Scout work on their own computers. A LinkedIn invitation,
-- an email a person sent, a candidate, a reply, "not available until", and
-- "I need access" are filed here, on the person, the company and the case,
-- with the follow-up date. Triangle does not send anything from this table.
--
-- A mailbox reply on a case's thread is the same table with source
-- 'mailbox', so the case shows it and the owner can be woken once.
--
-- Idempotent. CREATE TABLE IF NOT EXISTS does not add columns to a table
-- that already exists, so each column is also ADD COLUMN IF NOT EXISTS.
--
-- DO NOT APPLY THIS FROM A CODING AGENT.
-- Local development and Production share one database. Nikola applies it.
-- Until then the badge endpoint refuses to file, and says so.

create table if not exists public.employee_reports (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null,
  agent_instance_id   uuid,
  employee_name       text not null,
  source              text not null default 'employee',
  kind                text not null,
  worker_id           uuid,
  person_name         text,
  company_id          uuid,
  company_name        text,
  mission_id          uuid,
  role_title          text,
  evidence_url        text,
  note                text,
  unavailable_until   date,
  access_what         text,
  occurred_on         date not null,
  follow_up_on        date,
  inbound_email_id    uuid,
  thread_key          text,
  idempotency_key     text not null,
  created_at          timestamptz not null default now()
);

alter table public.employee_reports
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists org_id uuid,
  add column if not exists agent_instance_id uuid,
  add column if not exists employee_name text,
  add column if not exists source text default 'employee',
  add column if not exists kind text,
  add column if not exists worker_id uuid,
  add column if not exists person_name text,
  add column if not exists company_id uuid,
  add column if not exists company_name text,
  add column if not exists mission_id uuid,
  add column if not exists role_title text,
  add column if not exists evidence_url text,
  add column if not exists note text,
  add column if not exists unavailable_until date,
  add column if not exists access_what text,
  add column if not exists occurred_on date,
  add column if not exists follow_up_on date,
  add column if not exists inbound_email_id uuid,
  add column if not exists thread_key text,
  add column if not exists idempotency_key text,
  add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'employee_reports_pkey'
      and conrelid = 'public.employee_reports'::regclass
  ) then
    alter table public.employee_reports
      add constraint employee_reports_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'employee_reports_org_id_fkey'
      and conrelid = 'public.employee_reports'::regclass
  ) then
    alter table public.employee_reports
      add constraint employee_reports_org_id_fkey
      foreign key (org_id) references public.organizations(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'employee_reports_agent_instance_id_fkey'
      and conrelid = 'public.employee_reports'::regclass
  ) then
    alter table public.employee_reports
      add constraint employee_reports_agent_instance_id_fkey
      foreign key (agent_instance_id) references public.agent_instances(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'employee_reports_worker_id_fkey'
      and conrelid = 'public.employee_reports'::regclass
  ) then
    alter table public.employee_reports
      add constraint employee_reports_worker_id_fkey
      foreign key (worker_id) references public.workers(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'employee_reports_company_id_fkey'
      and conrelid = 'public.employee_reports'::regclass
  ) then
    alter table public.employee_reports
      add constraint employee_reports_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'employee_reports_mission_id_fkey'
      and conrelid = 'public.employee_reports'::regclass
  ) then
    alter table public.employee_reports
      add constraint employee_reports_mission_id_fkey
      foreign key (mission_id) references public.missions(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'employee_reports_inbound_email_id_fkey'
      and conrelid = 'public.employee_reports'::regclass
  ) then
    alter table public.employee_reports
      add constraint employee_reports_inbound_email_id_fkey
      foreign key (inbound_email_id) references public.inbound_emails(id) on delete set null;
  end if;
end $$;

alter table public.employee_reports drop constraint if exists employee_reports_source_check;
alter table public.employee_reports
  add constraint employee_reports_source_check
  check (source in ('employee', 'mailbox'));

alter table public.employee_reports drop constraint if exists employee_reports_kind_check;
alter table public.employee_reports
  add constraint employee_reports_kind_check
  check (kind in (
    'linkedin_invitation',
    'email_drafted',
    'email_sent',
    'candidate_found',
    'reply_received',
    'not_available',
    'access_needed'
  ));

alter table public.employee_reports drop constraint if exists employee_reports_employee_name_check;
alter table public.employee_reports
  add constraint employee_reports_employee_name_check
  check (length(btrim(employee_name)) > 0);

alter table public.employee_reports drop constraint if exists employee_reports_idempotency_check;
alter table public.employee_reports
  add constraint employee_reports_idempotency_check
  check (length(btrim(idempotency_key)) > 0);

create unique index if not exists employee_reports_idempotency_idx
  on public.employee_reports (org_id, idempotency_key);

create index if not exists employee_reports_worker_idx
  on public.employee_reports (org_id, worker_id, occurred_on desc)
  where worker_id is not null;

create index if not exists employee_reports_person_name_idx
  on public.employee_reports (org_id, lower(person_name))
  where person_name is not null;

create index if not exists employee_reports_company_idx
  on public.employee_reports (org_id, company_id, occurred_on desc)
  where company_id is not null;

create index if not exists employee_reports_mission_idx
  on public.employee_reports (org_id, mission_id, occurred_on desc)
  where mission_id is not null;

create index if not exists employee_reports_access_idx
  on public.employee_reports (org_id, created_at desc)
  where kind = 'access_needed';

alter table public.employee_reports enable row level security;

drop policy if exists "org members can view employee_reports" on public.employee_reports;
create policy "org members can view employee_reports"
  on public.employee_reports for select
  using (public.is_org_member(org_id));

comment on table public.employee_reports is
  'Work an employee did outside Triangle, or a mailbox reply attached to a case. Writes go through the service client. Nothing here sends mail.';

notify pgrst, 'reload schema';
