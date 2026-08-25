-- Create enum for match status
create type public.match_status as enum ('shortlisted', 'submitted', 'rejected', 'placed');

-- Create package_worker_matches table
create table public.package_worker_matches (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  package_id      uuid not null references public.project_packages(id) on delete cascade,
  worker_id       uuid not null references public.workers(id) on delete cascade,
  match_score     smallint not null default 0 check (match_score between 0 and 100),
  match_reasons   text[] not null default '{}',
  status          public.match_status not null default 'shortlisted',
  submitted_at    timestamptz,
  placed_at       timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (package_id, worker_id)
);

-- Trigger to keep updated_at current
create trigger set_package_worker_matches_updated_at
  before update on public.package_worker_matches
  for each row execute function public.set_updated_at();

-- Indexes
create index package_worker_matches_package_id_idx  on public.package_worker_matches(package_id);
create index package_worker_matches_worker_id_idx   on public.package_worker_matches(worker_id);
create index package_worker_matches_status_idx      on public.package_worker_matches(status);
create index package_worker_matches_org_id_idx      on public.package_worker_matches(org_id);

-- RLS
alter table public.package_worker_matches enable row level security;

create policy "members can read package_worker_matches"
  on public.package_worker_matches
  for select
  using (public.is_org_member(org_id));

create policy "admin partner can insert package_worker_matches"
  on public.package_worker_matches
  for insert
  with check (public.current_user_role(org_id) in ('admin', 'partner'));

create policy "admin partner can update package_worker_matches"
  on public.package_worker_matches
  for update
  using  (public.current_user_role(org_id) in ('admin', 'partner'))
  with check (public.current_user_role(org_id) in ('admin', 'partner'));

create policy "admin can delete package_worker_matches"
  on public.package_worker_matches
  for delete
  using (public.current_user_role(org_id) = 'admin');

notify pgrst, 'reload schema';
