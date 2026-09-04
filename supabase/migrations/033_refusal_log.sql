-- 033 — The refusal log
--
-- Sixty-six guards across these migrations refuse to record commercial
-- progress that has not actually happened: an action marked complete with no
-- recipient, an order signed against an unqualified requirement, a worker
-- double-booked, a record reached across a tenant boundary.
--
-- Every one of those refusals was thrown away. The person saw an error and
-- moved on, and the company learned nothing from the fact that it had tried.
--
-- That is backwards. A refusal is the most informative event this system
-- produces: it is the exact moment someone — human or agent — tried to book
-- progress the evidence did not support. Collected, it is the only honest
-- measure of how often the company would have lied to itself.
--
-- Written from the application, not the trigger. A Postgres exception rolls
-- back its whole transaction, so a log line written inside the trigger would
-- roll back with it and never survive.

create table if not exists public.refusal_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  occurred_at timestamptz not null default now(),

  -- Where it was attempted, in the product's own words: "Record a send",
  -- "Qualify a requirement", "Reserve a worker".
  surface text not null,

  -- 'truth'    — progress claimed without the evidence the workflow requires
  -- 'boundary' — a record in another organization
  -- 'other'    — a constraint that is neither
  kind text not null default 'other'
    check (kind in ('truth', 'boundary', 'other')),

  -- The database's own sentence, kept verbatim. Paraphrasing it here would be
  -- the same failure the log exists to catch.
  reason text not null,

  -- Who tried. Null actor with a non-null agent name means an employee did.
  attempted_by uuid references auth.users(id) on delete set null,
  attempted_by_agent text,

  entity_type text,
  entity_id uuid,

  details jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists refusal_log_org_time_idx
  on public.refusal_log (org_id, occurred_at desc);
create index if not exists refusal_log_kind_idx
  on public.refusal_log (org_id, kind, occurred_at desc);

alter table public.refusal_log enable row level security;

drop policy if exists refusal_log_select on public.refusal_log;
create policy refusal_log_select on public.refusal_log
  for select using (public.is_org_member(org_id));

-- Written by the service role only: the application records a refusal after
-- the failed transaction has already rolled back.
drop policy if exists refusal_log_insert on public.refusal_log;
create policy refusal_log_insert on public.refusal_log
  for insert with check (false);

notify pgrst, 'reload schema';
