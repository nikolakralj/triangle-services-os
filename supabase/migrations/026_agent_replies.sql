-- ---------------------------------------------------------------------------
-- 026 — Knowing what your employees said
--
-- Two gaps, both about honesty rather than features.
--
-- 1. A quick note showed "Assigned" whether the agent had never seen it, had
--    read it and was working, or had read it and done nothing. A real case:
--    Scout polled ten seconds after the note was written, so he had it — and
--    the screen said exactly what it said before he polled.
--
-- 2. Answers came back to the bottom of a long page with nothing to say they
--    had arrived. Work an employee finishes is invisible until you happen to
--    scroll to it, which is the same failure the Approvals queue was built to
--    fix.
--
-- Delivery is recorded on the way out, and reading is recorded on the way
-- back, so the interface can stop guessing at both ends.
-- ---------------------------------------------------------------------------

-- Out: has the agent actually fetched this?
alter table public.agent_tasks
  add column if not exists delivered_at timestamptz;

-- Back: has a human read the answer?
alter table public.agent_tasks
  add column if not exists result_seen_at timestamptz;

alter table public.agent_assignments
  add column if not exists result_seen_at timestamptz;

alter table public.assignment_messages
  add column if not exists seen_at timestamptz;

-- The unread feed reads these three every page load; keep them cheap.
create index if not exists agent_tasks_unseen_idx
  on public.agent_tasks (org_id, completed_at desc)
  where status = 'done' and result_seen_at is null;

create index if not exists agent_assignments_unseen_idx
  on public.agent_assignments (org_id, completed_at desc)
  where result_seen_at is null and result_summary is not null;

create index if not exists assignment_messages_unseen_idx
  on public.assignment_messages (org_id, created_at desc)
  where role = 'agent' and seen_at is null;

notify pgrst, 'reload schema';
