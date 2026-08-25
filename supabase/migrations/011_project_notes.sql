-- ============================================================
-- Migration 011: Project Notes (per-project freeform memory)
-- ============================================================
-- A single human-authored note per discovered project. This is the
-- project's "memory" — the user writes context (required documents,
-- buyer quirks, client preferences) that the Project Agent reads on
-- every run. One row per project (unique project_id).

create table if not exists public.project_notes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  project_id  uuid not null references public.discovered_projects(id) on delete cascade,
  body        text not null default '',
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id)
);

create index if not exists project_notes_project_idx on public.project_notes (project_id);
create index if not exists project_notes_org_idx     on public.project_notes (org_id);

-- Standard set_updated_at trigger
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_project_notes_updated_at') then
    create trigger set_project_notes_updated_at
      before update on public.project_notes
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- RLS — any active org member can read and write the note for their org.
alter table public.project_notes enable row level security;

drop policy if exists "org members can view project_notes"   on public.project_notes;
drop policy if exists "org members can insert project_notes" on public.project_notes;
drop policy if exists "org members can update project_notes" on public.project_notes;
drop policy if exists "org members can delete project_notes" on public.project_notes;

create policy "org members can view project_notes"
  on public.project_notes for select
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can insert project_notes"
  on public.project_notes for insert
  with check (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can update project_notes"
  on public.project_notes for update
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can delete project_notes"
  on public.project_notes for delete
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

-- Reload schema for PostgREST
notify pgrst, 'reload schema';
