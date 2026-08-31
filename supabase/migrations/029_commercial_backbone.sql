-- ============================================================
-- Migration 029: Qualified requirement, buyer route, action truth
-- ============================================================

create table if not exists public.commercial_requirements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null default 'manual'
    check (source_type in ('manual','job_lead','discovered_project','opportunity','referral','supply_first')),
  job_lead_id uuid references public.job_leads(id) on delete set null,
  discovered_project_id uuid references public.discovered_projects(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  project_package_id uuid references public.project_packages(id) on delete set null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft','needs_information','qualified','disqualified','proposal_ready','ordered','closed')),
  decision_reason text,
  demand_evidence_url text,
  demand_evidence_summary text,
  demand_evidence_date date,
  buyer_confirmed_at timestamptz,
  buyer_confirmed_by uuid references auth.users(id) on delete set null,
  scope_summary text,
  exclusions text,
  roles text[] not null default '{}',
  headcount_min integer check (headcount_min is null or headcount_min > 0),
  headcount_max integer check (headcount_max is null or headcount_max > 0),
  seniority text,
  country text,
  city text,
  site_location text,
  start_date_from date,
  start_date_to date,
  start_window_text text,
  duration_weeks integer check (duration_weeks is null or duration_weeks > 0),
  duration_text text,
  shift_pattern text,
  required_skills text[] not null default '{}',
  required_documents text[] not null default '{}',
  engagement_model text not null default 'unknown'
    check (engagement_model in ('unknown','individual_contract','team_supply','managed_crew','subcontract_scope','recruitment_fee','framework_calloff')),
  budget_min numeric(14,2),
  budget_max numeric(14,2),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  rate_unit text check (rate_unit is null or rate_unit in ('hour','day','week','month','fixed','placement_fee')),
  payment_terms_days integer check (payment_terms_days is null or payment_terms_days >= 0),
  commercial_notes text,
  country_feasibility_state text not null default 'unknown'
    check (country_feasibility_state in ('unknown','review_needed','feasible','blocked')),
  supplier_onboarding_state text not null default 'unknown'
    check (supplier_onboarding_state in ('unknown','not_required','researching','in_progress','approved','blocked','rejected')),
  unknowns text[] not null default '{}',
  owner_id uuid references auth.users(id) on delete set null,
  next_action text,
  next_action_due_at timestamptz,
  qualified_at timestamptz,
  qualified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check (headcount_max is null or headcount_min is null or headcount_max >= headcount_min),
  check (start_date_to is null or start_date_from is null or start_date_to >= start_date_from)
);

create index if not exists commercial_requirements_org_idx
  on public.commercial_requirements (org_id, status, next_action_due_at);
create index if not exists commercial_requirements_project_idx
  on public.commercial_requirements (discovered_project_id)
  where discovered_project_id is not null;
create index if not exists commercial_requirements_lead_idx
  on public.commercial_requirements (job_lead_id)
  where job_lead_id is not null;

create table if not exists public.buyer_routes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  requirement_id uuid not null references public.commercial_requirements(id) on delete cascade,
  discovered_project_id uuid references public.discovered_projects(id) on delete set null,
  chain_node_id uuid references public.contractor_chain_nodes(id) on delete set null,
  buyer_contact_id uuid references public.buyer_contacts(id) on delete set null,
  route_type text not null
    check (route_type in ('direct_buyer','recruiter','framework','supplier_portal','referral','subcontractor','other')),
  route_status text not null default 'researching'
    check (route_status in ('unknown','researching','contact_identified','contacted','prequalification','confirmed','approved','blocked','rejected','dormant')),
  contracting_entity text,
  buyer_company text,
  buyer_contact_name text,
  buyer_contact_email text,
  portal_url text,
  evidence_url text,
  evidence_summary text,
  onboarding_requirements text,
  engagement_model text,
  owner_id uuid references auth.users(id) on delete set null,
  next_action text,
  next_action_due_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists buyer_routes_org_idx
  on public.buyer_routes (org_id, route_status, next_action_due_at);
create index if not exists buyer_routes_requirement_idx
  on public.buyer_routes (requirement_id);

create table if not exists public.commercial_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  requirement_id uuid references public.commercial_requirements(id) on delete cascade,
  buyer_route_id uuid references public.buyer_routes(id) on delete set null,
  project_package_id uuid references public.project_packages(id) on delete set null,
  outreach_draft_id uuid references public.outreach_drafts(id) on delete set null,
  submission_packet_send_id uuid references public.submission_packet_sends(id) on delete set null,
  action_type text not null
    check (action_type in ('email','call','linkedin','meeting','packet','proposal','prequalification','note','other')),
  status text not null default 'planned'
    check (status in ('draft','planned','completed','responded','no_response','cancelled')),
  channel text,
  sender_user_id uuid references auth.users(id) on delete set null,
  recipient_name text,
  recipient_email text,
  recipient_company text,
  subject text,
  ai_draft text,
  final_content text,
  occurred_at timestamptz,
  follow_up_at timestamptz,
  response_summary text,
  objection text,
  outcome text,
  next_action text,
  next_action_due_at timestamptz,
  human_confirmed_at timestamptz,
  human_confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists commercial_actions_org_idx
  on public.commercial_actions (org_id, status, follow_up_at);
create index if not exists commercial_actions_requirement_idx
  on public.commercial_actions (requirement_id, occurred_at desc);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_commercial_requirements_updated_at') then
    create trigger set_commercial_requirements_updated_at
      before update on public.commercial_requirements
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_buyer_routes_updated_at') then
    create trigger set_buyer_routes_updated_at
      before update on public.buyer_routes
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_commercial_actions_updated_at') then
    create trigger set_commercial_actions_updated_at
      before update on public.commercial_actions
      for each row execute function public.set_updated_at();
  end if;
end $$;

create or replace function public.enforce_qualified_requirement_truth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  missing text[] := '{}';
begin
  if new.status in ('qualified','proposal_ready','ordered') then
    if new.buyer_confirmed_at is null then missing := array_append(missing, 'buyer confirmation'); end if;
    if coalesce(trim(new.scope_summary), '') = '' then missing := array_append(missing, 'scope'); end if;
    if cardinality(new.roles) = 0 then missing := array_append(missing, 'roles'); end if;
    if coalesce(new.headcount_max, new.headcount_min, 0) <= 0 then missing := array_append(missing, 'headcount'); end if;
    if coalesce(trim(new.country), '') = '' then missing := array_append(missing, 'country'); end if;
    if new.start_date_from is null and coalesce(trim(new.start_window_text), '') = '' then missing := array_append(missing, 'start window'); end if;
    if new.duration_weeks is null and coalesce(trim(new.duration_text), '') = '' then missing := array_append(missing, 'duration'); end if;
    if new.engagement_model = 'unknown' then missing := array_append(missing, 'engagement model'); end if;
    if coalesce(trim(new.commercial_notes), '') = '' then missing := array_append(missing, 'rate or commercial logic'); end if;
    if new.owner_id is null then missing := array_append(missing, 'owner'); end if;
    if coalesce(trim(new.next_action), '') = '' or new.next_action_due_at is null then
      missing := array_append(missing, 'dated next action');
    end if;
    if not exists (
      select 1 from public.buyer_routes route
      where route.requirement_id = new.id
        and route.org_id = new.org_id
        and route.route_status in ('confirmed','approved','prequalification')
    ) then
      missing := array_append(missing, 'confirmed buyer or supplier route');
    end if;
    if cardinality(missing) > 0 then
      raise exception 'Requirement cannot be %; missing: %', new.status, array_to_string(missing, ', ');
    end if;
    if new.qualified_at is null then new.qualified_at := now(); end if;
    if new.qualified_by is null then new.qualified_by := new.updated_by; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_qualified_requirement_truth_trigger
  on public.commercial_requirements;
create trigger enforce_qualified_requirement_truth_trigger
before insert or update on public.commercial_requirements
for each row execute function public.enforce_qualified_requirement_truth();

create or replace function public.enforce_commercial_action_truth()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('completed','responded','no_response') then
    if new.occurred_at is null or new.human_confirmed_at is null or new.human_confirmed_by is null then
      raise exception 'A completed commercial action requires occurrence time and human confirmation';
    end if;
    if new.action_type in ('email','linkedin','packet','proposal','prequalification') then
      if coalesce(trim(new.recipient_name), trim(new.recipient_email), trim(new.recipient_company), '') = '' then
        raise exception 'An external commercial action requires a recipient';
      end if;
      if coalesce(trim(new.final_content), '') = '' then
        raise exception 'An external commercial action requires the final sent/submitted content or a precise record of it';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_commercial_action_truth_trigger
  on public.commercial_actions;
create trigger enforce_commercial_action_truth_trigger
before insert or update on public.commercial_actions
for each row execute function public.enforce_commercial_action_truth();

alter table public.commercial_requirements enable row level security;
alter table public.buyer_routes enable row level security;
alter table public.commercial_actions enable row level security;

drop policy if exists "org members can manage commercial_requirements" on public.commercial_requirements;
create policy "org members can manage commercial_requirements"
  on public.commercial_requirements for all
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

drop policy if exists "org members can manage buyer_routes" on public.buyer_routes;
create policy "org members can manage buyer_routes"
  on public.buyer_routes for all
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

drop policy if exists "org members can manage commercial_actions" on public.commercial_actions;
create policy "org members can manage commercial_actions"
  on public.commercial_actions for all
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

notify pgrst, 'reload schema';
