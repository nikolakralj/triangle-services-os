-- ============================================================
-- Migration 056: pinned client tabs (exception approved 2026-10-12)
-- ============================================================
-- The owner names a client in a live negotiation and it becomes a pinned
-- tab (at most about five open). The tab closes when won, lost or gone
-- quiet; its lines stay on the company, so the bots still read them when the
-- client comes back.
--
-- Two additive tables. Nothing existing changes.
--   client_tabs       which companies are pinned, and when/why one closed
--   client_tab_lines  what the bots wrote: needs, agreed, open points, the
--                     next step, timeline lines and the Croatian firms Scout
--                     proposes. Every line carries who said it, when, and a
--                     source reference. No status ladder, no score.
--
-- Idempotent.
--
-- DO NOT APPLY THIS FROM A CODING AGENT.
-- Local development and Production share one database. Nikola applies it.
-- Until then the tab strip is empty and the agent endpoint says so.

create table if not exists public.client_tabs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  company_id     uuid references public.companies(id) on delete set null,
  company_name   text not null,
  pinned_by      uuid,
  pinned_at      timestamptz not null default now(),
  closed_at      timestamptz,
  closed_reason  text,
  created_at     timestamptz not null default now()
);

alter table public.client_tabs drop constraint if exists client_tabs_closed_reason_check;
alter table public.client_tabs
  add constraint client_tabs_closed_reason_check
  check (closed_reason is null or closed_reason in ('won', 'lost', 'quiet'));

create unique index if not exists client_tabs_one_open_idx
  on public.client_tabs (org_id, lower(company_name))
  where closed_at is null;

create table if not exists public.client_tab_lines (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  company_id         uuid references public.companies(id) on delete set null,
  company_name       text not null,
  agent_instance_id  uuid references public.agent_instances(id) on delete set null,
  employee_name      text not null,
  kind               text not null,
  topic              text,
  text               text not null,
  said_by            text,
  said_on            date,
  due_on             date,
  source_kind        text,
  source_ref         text,
  firm_name          text,
  posting_ok         text,
  firm_answered      boolean,
  replaces_id        uuid,
  idempotency_key    text not null,
  created_at         timestamptz not null default now()
);

alter table public.client_tab_lines drop constraint if exists client_tab_lines_kind_check;
alter table public.client_tab_lines
  add constraint client_tab_lines_kind_check
  check (kind in ('need', 'agreed', 'open', 'next_step', 'timeline', 'firm'));

alter table public.client_tab_lines drop constraint if exists client_tab_lines_source_kind_check;
alter table public.client_tab_lines
  add constraint client_tab_lines_source_kind_check
  check (source_kind is null or source_kind in ('email', 'whatsapp', 'voice_note', 'call_note', 'report', 'web'));

alter table public.client_tab_lines drop constraint if exists client_tab_lines_posting_ok_check;
alter table public.client_tab_lines
  add constraint client_tab_lines_posting_ok_check
  check (posting_ok is null or posting_ok in ('yes', 'no', 'unknown'));

create unique index if not exists client_tab_lines_idempotency_idx
  on public.client_tab_lines (org_id, idempotency_key);

create index if not exists client_tab_lines_company_idx
  on public.client_tab_lines (org_id, lower(company_name), created_at desc);

create index if not exists client_tab_lines_firm_idx
  on public.client_tab_lines (org_id, lower(firm_name))
  where kind = 'firm';

alter table public.client_tabs enable row level security;
alter table public.client_tab_lines enable row level security;

drop policy if exists "org members can view client_tabs" on public.client_tabs;
create policy "org members can view client_tabs"
  on public.client_tabs for select
  using (public.is_org_member(org_id));

drop policy if exists "org members can view client_tab_lines" on public.client_tab_lines;
create policy "org members can view client_tab_lines"
  on public.client_tab_lines for select
  using (public.is_org_member(org_id));

comment on table public.client_tabs is
  'Clients the owner pinned as a tab during a live negotiation. Writes go through the service client.';
comment on table public.client_tab_lines is
  'Bot-written lines for a client: needs, agreed, open, next step, timeline, proposed firms. Each line names who said it, when and the source. Nothing here sends anything.';

notify pgrst, 'reload schema';
