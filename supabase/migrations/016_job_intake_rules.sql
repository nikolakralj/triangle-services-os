-- ============================================================
-- Migration 016: Job Intake house rules
-- ============================================================
-- One editable block of text per organisation, written by the user in
-- plain language, injected into the classification/scoring prompt on
-- every email.
--
-- The point: Nikola and Ralph know this market far better than any
-- default rules shipped in code. "Rail work always scores high",
-- "Croatia matters more", "ignore anything under 3 months" — those are
-- sentences they should be able to add themselves, without a deploy.
--
-- The built-in hard rules (never invent facts, never auto-send) are NOT
-- overridable from here; see extract.ts for where this is injected.

create table if not exists public.job_intake_rules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  body        text not null default '',
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id)
);

create index if not exists job_intake_rules_org_idx on public.job_intake_rules (org_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_job_intake_rules_updated_at') then
    create trigger set_job_intake_rules_updated_at before update on public.job_intake_rules
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.job_intake_rules enable row level security;

drop policy if exists "org members can view job_intake_rules"   on public.job_intake_rules;
drop policy if exists "org members can insert job_intake_rules" on public.job_intake_rules;
drop policy if exists "org members can update job_intake_rules" on public.job_intake_rules;
drop policy if exists "org members can delete job_intake_rules" on public.job_intake_rules;

create policy "org members can view job_intake_rules" on public.job_intake_rules for select
  using (org_id in (select organization_id from public.organization_members where user_id = auth.uid() and status = 'active'));
create policy "org members can insert job_intake_rules" on public.job_intake_rules for insert
  with check (org_id in (select organization_id from public.organization_members where user_id = auth.uid() and status = 'active'));
create policy "org members can update job_intake_rules" on public.job_intake_rules for update
  using (org_id in (select organization_id from public.organization_members where user_id = auth.uid() and status = 'active'));
create policy "org members can delete job_intake_rules" on public.job_intake_rules for delete
  using (org_id in (select organization_id from public.organization_members where user_id = auth.uid() and status = 'active'));

notify pgrst, 'reload schema';
