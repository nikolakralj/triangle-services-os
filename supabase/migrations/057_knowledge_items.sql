-- ============================================================
-- Migration 057: one knowledge list
-- ============================================================
-- What the company has decided, how an employee should work, and the notes
-- already kept on a person, a project, or the intake rules — readable as one
-- list. knowledge_items is the place a new decision is proposed. The view
-- also reads the stores that already hold that knowledge, without copying
-- them.
--
-- This file creates the table and the view. It does not insert any rows.
-- Nikola's 2 Nov 2026 filtering rules live in
-- supabase/seed/knowledge-seed-2026-11-02.sql, which is not a migration and
-- is not applied from here.
--
-- Idempotent.
--
-- DO NOT APPLY THIS FROM A CODING AGENT.
-- Local development and Production share one database. Nikola applies it.
--
-- Roll back, in this order:
--   drop view if exists public.knowledge_view;
--   drop trigger if exists knowledge_items_supersede on public.knowledge_items;
--   drop trigger if exists knowledge_items_links on public.knowledge_items;
--   drop trigger if exists set_knowledge_items_updated_at on public.knowledge_items;
--   drop function if exists public.mark_superseded_knowledge_item();
--   drop function if exists public.enforce_knowledge_item_links();
--   drop table if exists public.knowledge_items;
--   notify pgrst, 'reload schema';

create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  category text not null,
  topic text,
  title text not null,
  body text not null,
  applies_to_roles text[] not null default '{}',
  mission_id uuid references public.missions(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  worker_id uuid references public.workers(id) on delete set null,
  project_id uuid references public.discovered_projects(id) on delete set null,
  source_kind text not null,
  source_ref text,
  quote text,
  said_by text,
  said_on date,
  proposed_by_agent_instance_id uuid references public.agent_instances(id) on delete set null,
  source_finding_id uuid references public.agent_findings(id) on delete set null,
  status text not null default 'proposed',
  supersedes_id uuid references public.knowledge_items(id) on delete set null,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  retired_by uuid references auth.users(id),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.knowledge_items drop constraint if exists knowledge_items_category_check;
alter table public.knowledge_items
  add constraint knowledge_items_category_check
  check (category in (
    'house_rule', 'decision', 'process', 'rate',
    'worker_note', 'project_note', 'intake_rule'
  ));

alter table public.knowledge_items drop constraint if exists knowledge_items_title_check;
alter table public.knowledge_items
  add constraint knowledge_items_title_check
  check (length(btrim(title)) > 0 and length(title) <= 120);

alter table public.knowledge_items drop constraint if exists knowledge_items_body_check;
alter table public.knowledge_items
  add constraint knowledge_items_body_check
  check (length(btrim(body)) > 0 and length(body) <= 2000);

alter table public.knowledge_items drop constraint if exists knowledge_items_source_kind_check;
alter table public.knowledge_items
  add constraint knowledge_items_source_kind_check
  check (source_kind in ('voice', 'whatsapp', 'email', 'chat', 'call_note', 'migrated'));

alter table public.knowledge_items drop constraint if exists knowledge_items_status_check;
alter table public.knowledge_items
  add constraint knowledge_items_status_check
  check (status in ('proposed', 'approved', 'retired', 'superseded', 'rejected'));

alter table public.knowledge_items drop constraint if exists knowledge_items_approved_check;
alter table public.knowledge_items
  add constraint knowledge_items_approved_check
  check (status <> 'approved' or (approved_by is not null and approved_at is not null));

alter table public.knowledge_items drop constraint if exists knowledge_items_bot_quote_check;
alter table public.knowledge_items
  add constraint knowledge_items_bot_quote_check
  check (
    proposed_by_agent_instance_id is null
    or (quote is not null and length(btrim(quote)) > 0)
  );

alter table public.knowledge_items drop constraint if exists knowledge_items_no_self_supersede;
alter table public.knowledge_items
  add constraint knowledge_items_no_self_supersede
  check (supersedes_id is null or supersedes_id <> id);

create index if not exists knowledge_items_org_status_category_idx
  on public.knowledge_items (org_id, status, category);

create index if not exists knowledge_items_applies_to_roles_idx
  on public.knowledge_items using gin (applies_to_roles);

-- A linked mission, company, worker, project, proposer, finding, or superseded
-- item has to belong to the same organization. The foreign keys prove the row
-- exists. They do not prove the tenant.

create or replace function public.enforce_knowledge_item_links()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.mission_id is not null and not exists (
    select 1 from public.missions m
    where m.id = new.mission_id and m.org_id = new.org_id
  ) then
    raise exception 'knowledge item mission must belong to the same organization';
  end if;

  if new.company_id is not null and not exists (
    select 1 from public.companies c
    where c.id = new.company_id and c.organization_id = new.org_id
  ) then
    raise exception 'knowledge item company must belong to the same organization';
  end if;

  if new.worker_id is not null and not exists (
    select 1 from public.workers w
    where w.id = new.worker_id and w.organization_id = new.org_id
  ) then
    raise exception 'knowledge item worker must belong to the same organization';
  end if;

  if new.project_id is not null and not exists (
    select 1 from public.discovered_projects p
    where p.id = new.project_id and p.organization_id = new.org_id
  ) then
    raise exception 'knowledge item project must belong to the same organization';
  end if;

  if new.proposed_by_agent_instance_id is not null and not exists (
    select 1 from public.agent_instances a
    where a.id = new.proposed_by_agent_instance_id and a.org_id = new.org_id
  ) then
    raise exception 'knowledge item proposer must belong to the same organization';
  end if;

  if new.source_finding_id is not null and not exists (
    select 1 from public.agent_findings f
    where f.id = new.source_finding_id and f.org_id = new.org_id
  ) then
    raise exception 'knowledge item finding must belong to the same organization';
  end if;

  if new.supersedes_id is not null and not exists (
    select 1 from public.knowledge_items k
    where k.id = new.supersedes_id and k.org_id = new.org_id and k.id <> new.id
  ) then
    raise exception 'knowledge item can only supersede an item in the same organization';
  end if;

  return new;
end;
$$;

drop trigger if exists knowledge_items_links on public.knowledge_items;
create trigger knowledge_items_links
  before insert or update of org_id, mission_id, company_id, worker_id, project_id,
    proposed_by_agent_instance_id, source_finding_id, supersedes_id
  on public.knowledge_items
  for each row execute function public.enforce_knowledge_item_links();

-- Approving an item that names a predecessor retires that predecessor.
-- The predecessor is marked superseded. It is not deleted.

create or replace function public.mark_superseded_knowledge_item()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'approved' and new.supersedes_id is not null and new.supersedes_id <> new.id then
    update public.knowledge_items
    set status = 'superseded'
    where id = new.supersedes_id
      and org_id = new.org_id
      and id <> new.id
      and status is distinct from 'superseded';
  end if;
  return null;
end;
$$;

drop trigger if exists knowledge_items_supersede on public.knowledge_items;
create trigger knowledge_items_supersede
  after insert or update of status, supersedes_id
  on public.knowledge_items
  for each row
  when (new.status = 'approved' and new.supersedes_id is not null)
  execute function public.mark_superseded_knowledge_item();

drop trigger if exists set_knowledge_items_updated_at on public.knowledge_items;
create trigger set_knowledge_items_updated_at
  before update on public.knowledge_items
  for each row execute function public.set_updated_at();

alter table public.knowledge_items enable row level security;

drop policy if exists "org members can view knowledge_items" on public.knowledge_items;
create policy "org members can view knowledge_items"
  on public.knowledge_items for select
  using (public.is_org_member(org_id));

-- Writes are the service role only. The service role bypasses row level
-- security. These policies close the door for everyone else.
drop policy if exists "knowledge_items inserts are service role only" on public.knowledge_items;
create policy "knowledge_items inserts are service role only"
  on public.knowledge_items for insert
  with check (false);

drop policy if exists "knowledge_items updates are service role only" on public.knowledge_items;
create policy "knowledge_items updates are service role only"
  on public.knowledge_items for update
  using (false);

drop policy if exists "knowledge_items deletes are service role only" on public.knowledge_items;
create policy "knowledge_items deletes are service role only"
  on public.knowledge_items for delete
  using (false);

revoke all on table public.knowledge_items from public, anon, authenticated;
grant select on table public.knowledge_items to authenticated;
grant all on table public.knowledge_items to service_role;

comment on table public.knowledge_items is
  'A proposed or approved piece of company knowledge. Empty applies_to_roles means every employee. Bot proposals must quote the person. Writes go through the service role.';

comment on column public.knowledge_items.applies_to_roles is
  'Role keys this item is for. Empty means every employee.';

-- ── one readable list across the stores that already hold knowledge ─────────
-- Columns, in order: source_table, id, org_id, category, title, body,
-- applies_to, source, status, created_at.
-- security_invoker so each store's own row level security still applies.

create or replace view public.knowledge_view
with (security_invoker = true)
as
select
  'knowledge_items'::text as source_table,
  k.id::text as id,
  k.org_id,
  k.category,
  k.title,
  k.body,
  k.applies_to_roles as applies_to,
  concat_ws(' ', k.source_kind, nullif(btrim(k.source_ref), '')) as source,
  k.status,
  k.created_at
from public.knowledge_items k

union all

select
  'agent_house_rules'::text,
  current.id::text,
  current.org_id,
  'house_rule'::text,
  left(
    coalesce(nullif(btrim(employee.display_name), ''), 'Employee') || ' — how they work',
    120
  ),
  current.body,
  case
    when employee.role_key is null or btrim(employee.role_key) = '' then '{}'::text[]
    else array[employee.role_key]::text[]
  end,
  'house rules, version ' || current.version::text,
  'approved'::text,
  current.created_at
from (
  select distinct on (rules.agent_instance_id)
    rules.id,
    rules.org_id,
    rules.agent_instance_id,
    rules.body,
    rules.version,
    rules.created_at
  from public.agent_house_rules rules
  order by rules.agent_instance_id, rules.version desc
) current
join public.agent_instances employee on employee.id = current.agent_instance_id
where length(btrim(current.body)) > 0

union all

select
  'mission_decisions'::text,
  decision.id::text,
  decision.org_id,
  'decision'::text,
  left(btrim(decision.text), 120),
  decision.text,
  '{}'::text[],
  decision.quote,
  decision.status,
  decision.created_at
from public.mission_decisions decision
where decision.status = 'active'

union all

select
  'worker_notes'::text,
  note.id::text,
  note.org_id,
  'worker_note'::text,
  left(note.kind || ': ' || btrim(note.body), 120),
  note.body,
  '{}'::text[],
  'worker_notes'::text,
  'approved'::text,
  note.created_at
from public.worker_notes note

union all

select
  'job_intake_rules'::text,
  rules.id::text,
  rules.org_id,
  'intake_rule'::text,
  'Scoring rules'::text,
  rules.body,
  array['inbox_coordinator']::text[],
  'job_intake_rules'::text,
  'approved'::text,
  rules.created_at
from public.job_intake_rules rules
where length(btrim(rules.body)) > 0

union all

select
  'job_intake_rules'::text,
  rules.id::text || ':reply_style',
  rules.org_id,
  'intake_rule'::text,
  'Reply style'::text,
  rules.reply_style,
  array['inbox_coordinator']::text[],
  'job_intake_rules.reply_style'::text,
  'approved'::text,
  rules.updated_at
from public.job_intake_rules rules
where length(btrim(rules.reply_style)) > 0

union all

select
  'project_notes'::text,
  note.id::text,
  note.org_id,
  'project_note'::text,
  left('Project note: ' || btrim(note.body), 120),
  note.body,
  '{}'::text[],
  'project_notes'::text,
  'approved'::text,
  note.created_at
from public.project_notes note
where length(btrim(note.body)) > 0

union all

select
  'research_suggestions'::text,
  suggestion.id::text,
  suggestion.org_id,
  'project_note'::text,
  left(
    coalesce(
      nullif(btrim(coalesce(suggestion.edited_payload_json, suggestion.payload_json)->>'note_type'), ''),
      'Research note'
    ),
    120
  ),
  coalesce(coalesce(suggestion.edited_payload_json, suggestion.payload_json)->>'content', ''),
  '{}'::text[],
  suggestion.source_url,
  suggestion.status::text,
  suggestion.created_at
from public.research_suggestions suggestion
where suggestion.suggestion_type = 'note'
  and suggestion.status in ('accepted', 'edited_and_accepted');

revoke all on public.knowledge_view from public, anon;
grant select on public.knowledge_view to authenticated, service_role;

comment on view public.knowledge_view is
  'One list: knowledge_items, the current house-rules version per employee, active mission decisions, worker notes, intake rules and reply style, project notes, and accepted research notes. security_invoker.';

notify pgrst, 'reload schema';
