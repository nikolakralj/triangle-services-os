-- ============================================================
-- Migration 023: Workforce model (applied live 2026-08-27)
-- ============================================================
-- The product pivot's structural heart: the employee is a durable,
-- provider-independent entity. machine_credentials becomes the badge;
-- agent_instances is the person; agent_provider_bindings is the brain
-- (Grok today, anything tomorrow); agent_assignments is the central
-- work object, able to attach business records as context so both
-- directions work: "find workers for THIS project" and "find work for
-- THESE workers".
--
-- Evidence this split matters: the 27 Aug token rotation created a
-- second credential row for Bob — under credential-as-employee his
-- history would have fragmented. The backfill below links BOTH badge
-- rows to one instance.

create table if not exists public.agent_instances (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  role_key        text not null,
  display_name    text not null,
  department      text,
  emoji           text,
  description     text,
  status          text not null default 'active'
                    check (status in ('draft','testing','active','paused','retired')),
  manager_user_id uuid references auth.users(id) on delete set null,
  role_version    text,
  config          jsonb not null default '{}',
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists agent_instances_org_idx on public.agent_instances (org_id, status);

create table if not exists public.agent_provider_bindings (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  agent_instance_id  uuid not null references public.agent_instances(id) on delete cascade,
  provider           text not null,
  external_agent_ref text,
  status             text not null default 'active'
                       check (status in ('active','inactive','error')),
  config             jsonb not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists agent_provider_bindings_instance_idx
  on public.agent_provider_bindings (agent_instance_id, status);

alter table public.machine_credentials
  add column if not exists agent_instance_id uuid references public.agent_instances(id) on delete set null,
  add column if not exists provider_binding_id uuid references public.agent_provider_bindings(id) on delete set null;

create table if not exists public.agent_assignments (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  agent_instance_id uuid not null references public.agent_instances(id) on delete cascade,
  title             text not null,
  objective         text not null,
  status            text not null default 'queued'
                      check (status in ('queued','active','waiting_review','completed','failed','cancelled')),
  priority          text not null default 'normal'
                      check (priority in ('low','normal','high','urgent')),
  constraints       jsonb not null default '{}',
  expected_output   text,
  created_by        uuid references auth.users(id) on delete set null,
  due_at            timestamptz,
  started_at        timestamptz,
  completed_at      timestamptz,
  result_summary    text,
  idempotency_key   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists agent_assignments_org_idx
  on public.agent_assignments (org_id, status);
create index if not exists agent_assignments_instance_idx
  on public.agent_assignments (agent_instance_id, status);
create unique index if not exists agent_assignments_idem_idx
  on public.agent_assignments (org_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.agent_assignment_entities (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  assignment_id uuid not null references public.agent_assignments(id) on delete cascade,
  entity_type   text not null
                  check (entity_type in ('worker','job_lead','project','project_package','company','contact','crew','other')),
  entity_id     uuid not null,
  relation      text not null default 'context'
                  check (relation in ('input','target','context','output')),
  created_at    timestamptz not null default now()
);
create index if not exists agent_assignment_entities_assignment_idx
  on public.agent_assignment_entities (assignment_id);

alter table public.agent_runs
  add column if not exists agent_instance_id uuid references public.agent_instances(id) on delete set null,
  add column if not exists assignment_id uuid references public.agent_assignments(id) on delete set null,
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists status text,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists estimated_cost numeric(10,4),
  add column if not exists error text,
  add column if not exists metadata jsonb not null default '{}';

create table if not exists public.agent_findings (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  agent_instance_id    uuid references public.agent_instances(id) on delete set null,
  assignment_id        uuid references public.agent_assignments(id) on delete set null,
  finding_type         text not null,
  payload              jsonb not null default '{}',
  source_url           text,
  source_date          date,
  evidence_text        text,
  confidence           smallint check (confidence between 0 and 100),
  status               text not null default 'pending'
                         check (status in ('pending','accepted','rejected')),
  idempotency_key      text,
  reviewed_by          uuid references auth.users(id) on delete set null,
  reviewed_at          timestamptz,
  promoted_entity_type text,
  promoted_entity_id   uuid,
  created_at           timestamptz not null default now()
);
create index if not exists agent_findings_org_idx on public.agent_findings (org_id, status);
create unique index if not exists agent_findings_idem_idx
  on public.agent_findings (org_id, idempotency_key)
  where idempotency_key is not null;

do $$
declare t text;
begin
  foreach t in array array['agent_instances','agent_provider_bindings','agent_assignments'] loop
    if not exists (select 1 from pg_trigger where tgname = 'set_'||t||'_updated_at') then
      execute format('create trigger set_%I_updated_at before update on public.%I
        for each row execute function public.set_updated_at()', t, t);
    end if;
  end loop;
end $$;

alter table public.agent_instances           enable row level security;
alter table public.agent_provider_bindings   enable row level security;
alter table public.agent_assignments         enable row level security;
alter table public.agent_assignment_entities enable row level security;
alter table public.agent_findings            enable row level security;

do $$
declare t text;
begin
  foreach t in array array['agent_instances','agent_provider_bindings','agent_assignments','agent_assignment_entities','agent_findings'] loop
    execute format('drop policy if exists "org members can view %1$s" on public.%1$I', t);
    execute format('create policy "org members can view %1$s" on public.%1$I for select
      using (org_id in (select organization_id from public.organization_members
                        where user_id = auth.uid() and status = ''active''))', t);
  end loop;
end $$;
-- Writes go through the service client only.

-- ── Backfill: Bob becomes a durable employee, both his badges linked ──
with ins as (
  insert into public.agent_instances
    (org_id, role_key, display_name, department, emoji, description, role_version)
  select '00000000-0000-0000-0000-000000000001', 'inbox_coordinator', 'Bob',
         'Operations', '📥',
         'Reads recruiter mail each morning and files new job opportunities for scoring.',
         'bob v1'
  where not exists (select 1 from public.agent_instances where role_key='inbox_coordinator'
                    and org_id='00000000-0000-0000-0000-000000000001')
  returning id, org_id
),
bind as (
  insert into public.agent_provider_bindings (org_id, agent_instance_id, provider, external_agent_ref)
  select org_id, id, 'grok', 'Bob_EmailExtracting' from ins
  returning agent_instance_id, id
)
update public.machine_credentials mc
set agent_instance_id = b.agent_instance_id,
    provider_binding_id = b.id
from bind b
where mc.name = 'triangle_bob_nikola' and mc.agent_instance_id is null;

notify pgrst, 'reload schema';
