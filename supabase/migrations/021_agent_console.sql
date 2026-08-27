-- ============================================================
-- Migration 021: Agent Console
-- ============================================================
-- Instruct agents from the app, and log what they did.
--
-- agent_tasks is the instruction inbox. Humans write instructions in the
-- dashboard; each agent fetches ITS OWN pending tasks (by credential name)
-- at the start of a run, acts, and reports back. Not live chat — a message
-- queue, which is what bot platforms can actually consume.
--
-- agent_runs is the activity feed: one row per run, whoever fed it (a bot
-- posting to /ingest, the IMAP fallback, a manual sync).

create table if not exists public.agent_tasks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  agent_name   text not null,
  instruction  text not null,
  status       text not null default 'pending'
                 check (status in ('pending','done','cancelled')),
  result       text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists agent_tasks_org_idx    on public.agent_tasks (org_id);
create index if not exists agent_tasks_agent_idx  on public.agent_tasks (agent_name, status);

create table if not exists public.agent_runs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  agent_name  text not null,
  source      text not null,
  summary     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists agent_runs_org_idx  on public.agent_runs (org_id, created_at desc);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_agent_tasks_updated_at') then
    create trigger set_agent_tasks_updated_at before update on public.agent_tasks
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.agent_tasks enable row level security;
alter table public.agent_runs  enable row level security;

drop policy if exists "org members can view agent_tasks" on public.agent_tasks;
create policy "org members can view agent_tasks" on public.agent_tasks for select
  using (org_id in (select organization_id from public.organization_members
                    where user_id = auth.uid() and status = 'active'));

drop policy if exists "org members can view agent_runs" on public.agent_runs;
create policy "org members can view agent_runs" on public.agent_runs for select
  using (org_id in (select organization_id from public.organization_members
                    where user_id = auth.uid() and status = 'active'));
-- Writes go through the service client only.

notify pgrst, 'reload schema';
