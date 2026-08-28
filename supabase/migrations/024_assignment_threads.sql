-- ---------------------------------------------------------------------------
-- 024 — Assignment threads
--
-- An assignment used to be one-shot: `objective` in, `result_summary` out.
-- Ask Scout to find projects in Austria, he reports once, and that was the end
-- of it. A follow-up question ("which of those are near Linz?") had nowhere to
-- go except a brand-new assignment that knew nothing about the first.
--
-- This makes an assignment a conversation. A human adds a message; the agent
-- picks it up on its next inbox poll and answers into the same thread. Bot
-- platforms poll and cannot be pushed to, so `delivered_at` records what the
-- agent has actually seen rather than assuming it saw everything.
--
-- Assignments also gain a project, so a thread about the Salzgitter chain is
-- filed against Salzgitter instead of floating loose in the workforce page.
-- ---------------------------------------------------------------------------

alter table public.agent_assignments
  add column if not exists project_id uuid
    references public.discovered_projects(id) on delete set null;

create index if not exists agent_assignments_project_idx
  on public.agent_assignments (project_id)
  where project_id is not null;

create table if not exists public.assignment_messages (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  assignment_id     uuid not null references public.agent_assignments(id) on delete cascade,
  -- Who is speaking. 'human' messages are instructions and questions;
  -- 'agent' messages are answers and progress notes. The final report still
  -- lives in agent_assignments.result_summary — this is the conversation
  -- around it, not a replacement for it.
  role              text not null check (role in ('human', 'agent')),
  body              text not null check (length(btrim(body)) > 0),
  author_user_id    uuid references auth.users(id) on delete set null,
  agent_instance_id uuid references public.agent_instances(id) on delete set null,
  -- Set when the agent has actually fetched this message. Null on a human
  -- message means "not yet seen", which is what the inbox uses to decide what
  -- still needs answering.
  delivered_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists assignment_messages_assignment_idx
  on public.assignment_messages (assignment_id, created_at);

create index if not exists assignment_messages_undelivered_idx
  on public.assignment_messages (assignment_id)
  where role = 'human' and delivered_at is null;

alter table public.assignment_messages enable row level security;

drop policy if exists "org members can view assignment_messages" on public.assignment_messages;
create policy "org members can view assignment_messages"
  on public.assignment_messages for select
  using (
    org_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and status = 'active'
    )
  );

drop policy if exists "org members can insert assignment_messages" on public.assignment_messages;
create policy "org members can insert assignment_messages"
  on public.assignment_messages for insert
  with check (
    org_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and status = 'active'
    )
  );

notify pgrst, 'reload schema';
