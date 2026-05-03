-- ============================================================
-- Migration 006: Project Packages
-- ============================================================

-- ── project_packages ─────────────────────────────────────────────────────────

create table if not exists public.project_packages (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  project_id           uuid not null references public.discovered_projects(id) on delete cascade,
  title                text not null,
  summary              text,
  roles                text[] not null default '{}',
  estimated_crew_size  integer,
  confidence           smallint check (confidence between 0 and 100),
  source_suggestion_id uuid references public.research_suggestions(id) on delete set null,
  contractor_node_id   uuid references public.contractor_chain_nodes(id) on delete set null,
  status               text not null default 'draft'
                         check (status in ('draft','active','archived')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists project_packages_project_idx on public.project_packages (project_id);
create index if not exists project_packages_org_idx     on public.project_packages (org_id);
create index if not exists project_packages_status_idx  on public.project_packages (status);

-- Standard set_updated_at trigger
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_project_packages_updated_at') then
    create trigger set_project_packages_updated_at
      before update on public.project_packages
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- RLS
alter table public.project_packages enable row level security;

drop policy if exists "org members can view project_packages"   on public.project_packages;
drop policy if exists "org members can insert project_packages" on public.project_packages;
drop policy if exists "org members can update project_packages" on public.project_packages;
drop policy if exists "org members can delete project_packages" on public.project_packages;

create policy "org members can view project_packages"
  on public.project_packages for select
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can insert project_packages"
  on public.project_packages for insert
  with check (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can update project_packages"
  on public.project_packages for update
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can delete project_packages"
  on public.project_packages for delete
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

-- Reload schema for PostgREST
notify pgrst, 'reload schema';
