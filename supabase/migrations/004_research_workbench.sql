-- ============================================================
-- Migration 004: Research Workbench (idempotent — safe to re-run)
-- ============================================================

-- ── research_runs ─────────────────────────────────────────────────────────────

create table if not exists public.research_runs (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  project_id           uuid not null references public.discovered_projects(id) on delete cascade,
  started_by_user_id   uuid references auth.users(id) on delete set null,
  status               text not null default 'running'
                         check (status in ('running','completed','failed','cancelled')),
  research_goal        text,
  started_at           timestamptz not null default now(),
  finished_at          timestamptz,
  summary              text,
  confidence_score     smallint check (confidence_score between 0 and 100),
  sources_checked      integer not null default 0,
  suggestions_created  integer not null default 0,
  created_at           timestamptz not null default now()
);

create index if not exists research_runs_project_idx on public.research_runs (project_id);
create index if not exists research_runs_org_idx     on public.research_runs (org_id);

alter table public.research_runs enable row level security;

drop policy if exists "org members can view research_runs"   on public.research_runs;
drop policy if exists "org members can insert research_runs" on public.research_runs;
drop policy if exists "org members can update research_runs" on public.research_runs;

create policy "org members can view research_runs"
  on public.research_runs for select
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can insert research_runs"
  on public.research_runs for insert
  with check (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can update research_runs"
  on public.research_runs for update
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

-- ── research_sources ──────────────────────────────────────────────────────────

create table if not exists public.research_sources (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  project_id         uuid not null references public.discovered_projects(id) on delete cascade,
  research_run_id    uuid references public.research_runs(id) on delete set null,
  source_url         text not null,
  source_title       text,
  source_type        text,
  source_date        date,
  extracted_text     text,
  relevance_score    smallint check (relevance_score between 0 and 100),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now()
);

create index if not exists research_sources_project_idx on public.research_sources (project_id);
create index if not exists research_sources_org_idx     on public.research_sources (org_id);
create index if not exists research_sources_run_idx     on public.research_sources (research_run_id)
  where research_run_id is not null;

alter table public.research_sources enable row level security;

drop policy if exists "org members can view research_sources"   on public.research_sources;
drop policy if exists "org members can insert research_sources" on public.research_sources;

create policy "org members can view research_sources"
  on public.research_sources for select
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can insert research_sources"
  on public.research_sources for insert
  with check (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

-- ── Enums (safe create) ───────────────────────────────────────────────────────

do $$ begin
  create type public.research_suggestion_type as enum (
    'chain_node', 'buyer_contact', 'package_opportunity', 'note'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.research_suggestion_status as enum (
    'pending', 'accepted', 'edited_and_accepted', 'rejected'
  );
exception when duplicate_object then null;
end $$;

-- ── research_suggestions ──────────────────────────────────────────────────────

create table if not exists public.research_suggestions (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  project_id           uuid not null references public.discovered_projects(id) on delete cascade,
  research_run_id      uuid references public.research_runs(id) on delete set null,
  suggestion_type      public.research_suggestion_type not null,
  payload_json         jsonb not null,
  confidence           smallint check (confidence between 0 and 100),
  source_url           text not null,
  source_date          date,
  evidence_text        text not null,
  created_by_agent     text,
  created_by_user_id   uuid references auth.users(id) on delete set null,
  status               public.research_suggestion_status not null default 'pending',
  rejection_reason     text,
  edited_payload_json  jsonb,
  final_record_id      uuid,
  reviewed_at          timestamptz,
  reviewed_by_user_id  uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);

create index if not exists research_suggestions_project_idx on public.research_suggestions (project_id);
create index if not exists research_suggestions_org_idx     on public.research_suggestions (org_id);
create index if not exists research_suggestions_status_idx  on public.research_suggestions (status);
create index if not exists research_suggestions_type_idx    on public.research_suggestions (suggestion_type);
create index if not exists research_suggestions_run_idx     on public.research_suggestions (research_run_id)
  where research_run_id is not null;

alter table public.research_suggestions enable row level security;

drop policy if exists "org members can view research_suggestions"   on public.research_suggestions;
drop policy if exists "org members can insert research_suggestions" on public.research_suggestions;
drop policy if exists "org members can update research_suggestions" on public.research_suggestions;

create policy "org members can view research_suggestions"
  on public.research_suggestions for select
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can insert research_suggestions"
  on public.research_suggestions for insert
  with check (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can update research_suggestions"
  on public.research_suggestions for update
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

-- ── ai_tool_calls ─────────────────────────────────────────────────────────────

create table if not exists public.ai_tool_calls (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete set null,
  agent_name     text not null,
  tool_name      text not null,
  input_json     jsonb not null default '{}',
  output_json    jsonb not null default '{}',
  project_id     uuid references public.discovered_projects(id) on delete set null,
  success        boolean not null default true,
  error_message  text,
  duration_ms    integer,
  created_at     timestamptz not null default now()
);

create index if not exists ai_tool_calls_org_idx        on public.ai_tool_calls (org_id);
create index if not exists ai_tool_calls_user_idx       on public.ai_tool_calls (user_id);
create index if not exists ai_tool_calls_project_idx    on public.ai_tool_calls (project_id)
  where project_id is not null;
create index if not exists ai_tool_calls_created_at_idx on public.ai_tool_calls (created_at desc);

alter table public.ai_tool_calls enable row level security;

drop policy if exists "org members can view ai_tool_calls" on public.ai_tool_calls;

create policy "org members can view ai_tool_calls"
  on public.ai_tool_calls for select
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));
