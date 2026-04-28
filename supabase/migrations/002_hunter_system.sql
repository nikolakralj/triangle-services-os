-- ============================================================
-- HUNTER SYSTEM: AI-powered project discovery and matching
-- Sector-aware architecture for industrial labor brokerage
-- ============================================================

-- ============================================================
-- SECTORS: Top-level industry verticals
-- Each sector has its own dashboard, owner, and config
-- ============================================================
create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  icon text default 'briefcase',
  color text default '#0ea5e9',
  is_active boolean not null default true,
  responsible_user_id uuid references auth.users(id),

  -- AI hunting config
  search_keywords text[] default array[]::text[],
  excluded_keywords text[] default array[]::text[],
  target_countries text[] default array[]::text[],

  -- Worker profile defaults for matching
  typical_roles text[] default array[]::text[],

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create trigger sectors_updated_at
before update on public.sectors
for each row execute procedure public.set_updated_at();

create index sectors_org_id_idx on public.sectors(organization_id);

-- ============================================================
-- REGULATORY FRAMEWORKS: Country + sector specific rules
-- e.g., Germany Data Center → A1 forms, ZollMeldung, Mindestlohn
-- ============================================================
create table public.regulatory_frameworks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sector_id uuid references public.sectors(id) on delete cascade,

  country_code text not null,
  country_name text not null,

  -- Posted Workers Directive (EU)
  pwd_status text check (pwd_status in ('compliant', 'requires_a1', 'requires_local_entity', 'restricted', 'unknown')),

  -- Required documents
  required_documents text[] default array[]::text[],

  -- Wage / payroll
  minimum_wage_eur numeric,
  minimum_wage_unit text default 'hour' check (minimum_wage_unit in ('hour', 'day', 'month')),
  social_security_notes text,

  -- Reporting
  notification_authority text,
  notification_lead_time_days int,
  notification_url text,

  -- Other
  language_requirements text,
  union_considerations text,
  health_safety_certs text[] default array[]::text[],

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sector_id, country_code)
);

create trigger regulatory_frameworks_updated_at
before update on public.regulatory_frameworks
for each row execute procedure public.set_updated_at();

create index regulatory_frameworks_org_idx on public.regulatory_frameworks(organization_id);
create index regulatory_frameworks_sector_idx on public.regulatory_frameworks(sector_id);
create index regulatory_frameworks_country_idx on public.regulatory_frameworks(country_code);

-- ============================================================
-- TRIGGER SOURCES: What we monitor for project signals
-- (RSS feeds, news sites, tender platforms, APIs)
-- ============================================================
create table public.trigger_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sector_id uuid references public.sectors(id) on delete cascade,

  name text not null,
  source_type text not null check (source_type in ('rss', 'web', 'api', 'manual', 'web_search')),
  url text,
  config jsonb default '{}'::jsonb,

  is_active boolean not null default true,
  last_run_at timestamptz,
  last_run_status text,
  last_run_message text,
  last_results_count int default 0,
  total_results_count int default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trigger_sources_updated_at
before update on public.trigger_sources
for each row execute procedure public.set_updated_at();

create index trigger_sources_org_idx on public.trigger_sources(organization_id);
create index trigger_sources_sector_idx on public.trigger_sources(sector_id);
create index trigger_sources_active_idx on public.trigger_sources(is_active) where is_active = true;

-- ============================================================
-- DISCOVERED PROJECTS: Raw intelligence from hunting
-- AI-classified, scored, ready to promote to opportunities
-- ============================================================
create table public.discovered_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sector_id uuid references public.sectors(id),

  -- Core identification
  project_name text not null,
  client_company text,
  general_contractor text,

  -- Location
  country text,
  country_code text,
  region text,
  city text,
  latitude numeric,
  longitude numeric,

  -- Project specifics
  project_type text,
  capacity text,
  estimated_value_eur numeric,

  -- Phase tracking (CRITICAL for timing crew offers)
  phase text check (phase in (
    'announced', 'permits_filed', 'permits_approved', 'groundbreaking',
    'foundation', 'shell', 'fit_out', 'mep_install', 'commissioning',
    'operational', 'unknown'
  )),
  phase_confidence int check (phase_confidence between 0 and 100),

  -- Timing
  estimated_start_date date,
  estimated_completion_date date,
  peak_workforce_month date,

  -- Crew estimates (AI-generated)
  estimated_crew_size int,
  crew_breakdown jsonb default '{}'::jsonb,

  -- Source provenance
  source_url text,
  source_type text,
  source_text text,
  source_date date,
  trigger_source_id uuid references public.trigger_sources(id),

  -- AI analysis
  ai_summary text,
  ai_opportunity_score int check (ai_opportunity_score between 0 and 100),
  ai_match_score int check (ai_match_score between 0 and 100),
  ai_match_reasoning text,
  ai_next_actions text[] default array[]::text[],
  ai_extracted_at timestamptz,
  ai_model text,

  -- Workflow status
  status text not null default 'new' check (status in (
    'new', 'reviewing', 'qualified', 'pursuing', 'won', 'lost', 'archived', 'duplicate'
  )),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,

  -- Promotion to opportunity
  promoted_to_opportunity_id uuid references public.opportunities(id),
  promoted_at timestamptz,
  promoted_by uuid references auth.users(id),

  -- Dedupe
  fingerprint text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger discovered_projects_updated_at
before update on public.discovered_projects
for each row execute procedure public.set_updated_at();

create index discovered_projects_org_idx on public.discovered_projects(organization_id);
create index discovered_projects_sector_idx on public.discovered_projects(sector_id);
create index discovered_projects_status_idx on public.discovered_projects(status);
create index discovered_projects_country_idx on public.discovered_projects(country_code);
create index discovered_projects_phase_idx on public.discovered_projects(phase);
create index discovered_projects_score_idx on public.discovered_projects(ai_opportunity_score desc);
create index discovered_projects_fingerprint_idx on public.discovered_projects(fingerprint);

-- ============================================================
-- HUNT RUNS: Audit log of every hunting execution
-- ============================================================
create table public.hunt_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sector_id uuid references public.sectors(id),
  trigger_source_id uuid references public.trigger_sources(id),

  triggered_by text not null check (triggered_by in ('manual', 'cron', 'api')),
  triggered_by_user_id uuid references auth.users(id),

  status text not null default 'running' check (status in ('running', 'success', 'failed', 'partial')),

  -- Stats
  sources_queried int default 0,
  raw_results_count int default 0,
  ai_classified_count int default 0,
  duplicates_filtered int default 0,
  new_projects_inserted int default 0,
  ai_tokens_used int default 0,
  ai_cost_usd numeric,

  -- Timing
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms int,

  error_message text,
  log_summary text,

  created_at timestamptz not null default now()
);

create index hunt_runs_org_idx on public.hunt_runs(organization_id);
create index hunt_runs_sector_idx on public.hunt_runs(sector_id);
create index hunt_runs_started_idx on public.hunt_runs(started_at desc);

-- ============================================================
-- ROW LEVEL SECURITY (multi-tenancy)
-- ============================================================
alter table public.sectors enable row level security;
alter table public.regulatory_frameworks enable row level security;
alter table public.trigger_sources enable row level security;
alter table public.discovered_projects enable row level security;
alter table public.hunt_runs enable row level security;

-- Sectors policies
create policy "members can read sectors" on public.sectors
for select using (public.is_org_member(organization_id));

create policy "admin partner can write sectors" on public.sectors
for insert with check (public.current_user_role(organization_id) in ('admin','partner'));

create policy "admin partner can update sectors" on public.sectors
for update using (public.current_user_role(organization_id) in ('admin','partner'))
with check (public.current_user_role(organization_id) in ('admin','partner'));

create policy "admin can delete sectors" on public.sectors
for delete using (public.current_user_role(organization_id) = 'admin');

-- Regulatory frameworks policies
create policy "members can read regulatory" on public.regulatory_frameworks
for select using (public.is_org_member(organization_id));

create policy "admin partner can write regulatory" on public.regulatory_frameworks
for insert with check (public.current_user_role(organization_id) in ('admin','partner'));

create policy "admin partner can update regulatory" on public.regulatory_frameworks
for update using (public.current_user_role(organization_id) in ('admin','partner'))
with check (public.current_user_role(organization_id) in ('admin','partner'));

create policy "admin can delete regulatory" on public.regulatory_frameworks
for delete using (public.current_user_role(organization_id) = 'admin');

-- Trigger sources policies
create policy "members can read trigger_sources" on public.trigger_sources
for select using (public.is_org_member(organization_id));

create policy "admin partner can write trigger_sources" on public.trigger_sources
for insert with check (public.current_user_role(organization_id) in ('admin','partner'));

create policy "admin partner can update trigger_sources" on public.trigger_sources
for update using (public.current_user_role(organization_id) in ('admin','partner'))
with check (public.current_user_role(organization_id) in ('admin','partner'));

create policy "admin can delete trigger_sources" on public.trigger_sources
for delete using (public.current_user_role(organization_id) = 'admin');

-- Discovered projects policies
create policy "members can read discovered_projects" on public.discovered_projects
for select using (public.is_org_member(organization_id));

create policy "admin partner researcher can write discovered_projects" on public.discovered_projects
for insert with check (public.current_user_role(organization_id) in ('admin','partner','researcher'));

create policy "admin partner can update discovered_projects" on public.discovered_projects
for update using (public.current_user_role(organization_id) in ('admin','partner'))
with check (public.current_user_role(organization_id) in ('admin','partner'));

create policy "admin can delete discovered_projects" on public.discovered_projects
for delete using (public.current_user_role(organization_id) = 'admin');

-- Hunt runs policies
create policy "members can read hunt_runs" on public.hunt_runs
for select using (public.is_org_member(organization_id));

create policy "admin partner researcher can write hunt_runs" on public.hunt_runs
for insert with check (public.current_user_role(organization_id) in ('admin','partner','researcher'));

create policy "admin partner can update hunt_runs" on public.hunt_runs
for update using (public.current_user_role(organization_id) in ('admin','partner'))
with check (public.current_user_role(organization_id) in ('admin','partner'));

-- ============================================================
-- SEED DATA: Default sectors for industrial labor brokerage
-- (only inserted if organization has no sectors yet)
-- ============================================================
do $$
declare
  org_record record;
  data_centers_id uuid;
  automotive_id uuid;
  hvac_id uuid;
  steel_id uuid;
begin
  for org_record in select id from public.organizations loop

    -- Skip if org already has sectors
    if exists (select 1 from public.sectors where organization_id = org_record.id) then
      continue;
    end if;

    -- Data Centers (primary focus)
    insert into public.sectors (
      organization_id, slug, name, description, icon, color, is_active,
      search_keywords, target_countries, typical_roles
    ) values (
      org_record.id, 'data-centers', 'Data Centers',
      'Hyperscale and colocation data center construction. Cable pulling, MEP installation, commissioning.',
      'server', '#0ea5e9', true,
      array['data center', 'hyperscale', 'colocation', 'fab', 'cable pulling', 'MEP install', 'commissioning'],
      array['DE','IE','NL','FR','SE','DK','PL','IT','ES','GB','NO','FI','BE','AT','CH'],
      array['cable puller', 'electrician', 'commissioning technician', 'MEP technician', 'fiber installer']
    ) returning id into data_centers_id;

    -- Automotive (EV plants, battery factories)
    insert into public.sectors (
      organization_id, slug, name, description, icon, color, is_active,
      search_keywords, target_countries, typical_roles
    ) values (
      org_record.id, 'automotive', 'Automotive & EV',
      'EV plants, battery gigafactories, automotive assembly. Erection, electrical, HVAC.',
      'factory', '#f97316', false,
      array['EV plant', 'gigafactory', 'battery factory', 'automotive plant', 'assembly line'],
      array['DE','HU','CZ','SK','PL','RO','FR','IT','ES','SE'],
      array['electrician', 'mechanical fitter', 'erector', 'welder', 'HVAC technician']
    ) returning id into automotive_id;

    -- HVAC commissioning
    insert into public.sectors (
      organization_id, slug, name, description, icon, color, is_active,
      search_keywords, target_countries, typical_roles
    ) values (
      org_record.id, 'hvac', 'HVAC & Commissioning',
      'Industrial HVAC installation and commissioning. Process cooling, chillers, AHU.',
      'wind', '#14b8a6', false,
      array['HVAC commissioning', 'chiller install', 'AHU install', 'process cooling', 'data hall cooling'],
      array['DE','NL','IE','FR','GB','PL','CZ','AT'],
      array['HVAC technician', 'commissioning engineer', 'pipefitter']
    );

    -- Steel & Heavy Industry
    insert into public.sectors (
      organization_id, slug, name, description, icon, color, is_active,
      search_keywords, target_countries, typical_roles
    ) values (
      org_record.id, 'steel-heavy-industry', 'Steel & Heavy Industry',
      'Steel mills, refineries, heavy industrial erection.',
      'hammer', '#64748b', false,
      array['steel mill', 'refinery', 'erection', 'heavy industrial', 'plant turnaround'],
      array['DE','PL','CZ','SK','RO','IT','ES','BE','NL','FR'],
      array['ironworker', 'welder', 'rigger', 'erector', 'pipefitter']
    );

    -- Seed default trigger sources for Data Centers
    insert into public.trigger_sources (organization_id, sector_id, name, source_type, url, config, is_active) values
      (org_record.id, data_centers_id, 'Web Search: New EU data centers', 'web_search', null,
       '{"queries": ["new data center construction Europe 2026", "hyperscale data center groundbreaking", "data center permit approved Germany Ireland Netherlands"]}'::jsonb, true),
      (org_record.id, data_centers_id, 'Data Center Dynamics News', 'web', 'https://www.datacenterdynamics.com/en/news/',
       '{}'::jsonb, true),
      (org_record.id, data_centers_id, 'TED EU Public Tenders', 'api', 'https://ted.europa.eu/api/v3.0/notices/search',
       '{"cpv_codes": ["45213311", "45213312", "45213313"], "keywords": ["data center", "data centre"]}'::jsonb, false);

    -- Seed regulatory frameworks for Data Centers in key EU countries
    insert into public.regulatory_frameworks (
      organization_id, sector_id, country_code, country_name,
      pwd_status, required_documents, minimum_wage_eur, minimum_wage_unit,
      notification_authority, notification_lead_time_days,
      language_requirements, notes
    ) values
      (org_record.id, data_centers_id, 'DE', 'Germany',
       'requires_a1', array['A1 form', 'ZollMeldung registration', 'Mindestlohn compliance proof', 'Health insurance EHIC'],
       12.82, 'hour',
       'Bundeszollverwaltung (Customs)', 1,
       'German strongly preferred for site comms; English at managerial level',
       'Mindestlohn applies. Posting must be reported via Meldeportal-Mindestlohn before work starts. Construction sector additional collective agreements (Bau-Tarifvertrag).'),

      (org_record.id, data_centers_id, 'IE', 'Ireland',
       'requires_a1', array['A1 form', 'PPS number', 'Construction Skills Certification (CSCS/SOLAS)', 'Safe Pass card'],
       12.70, 'hour',
       'Workplace Relations Commission', 0,
       'English required',
       'Safe Pass mandatory for all site workers. CSCS/SOLAS certification per trade. Strong data center hub: Dublin, Cork.'),

      (org_record.id, data_centers_id, 'NL', 'Netherlands',
       'requires_a1', array['A1 form', 'WagwEU notification', 'BSN number', 'VCA safety certificate'],
       13.27, 'hour',
       'SZW (Inspectorate)', 1,
       'Dutch or English',
       'WagwEU (Posting Workers Act) notification mandatory before start. VCA safety cert standard requirement.'),

      (org_record.id, data_centers_id, 'FR', 'France',
       'requires_a1', array['A1 form', 'SIPSI declaration', 'BTP card', 'Certificate of representation'],
       11.65, 'hour',
       'Direccte / SIPSI portal', 1,
       'French required for site comms',
       'SIPSI declaration mandatory. BTP card required for construction. URSSAF compliance.'),

      (org_record.id, data_centers_id, 'PL', 'Poland',
       'compliant', array['A1 form (if posting from another EU country)', 'PESEL number', 'Health & safety briefing'],
       4.62, 'hour',
       'PIP (Labour Inspectorate)', 0,
       'Polish for site, English at managerial level',
       'Lower wage country; often a SOURCE of workers rather than destination. Watch for new data center hubs in Warsaw and Krakow.');

  end loop;
end $$;
