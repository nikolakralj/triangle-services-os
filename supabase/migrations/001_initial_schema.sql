create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  country text,
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  display_name text,
  avatar_url text,
  phone text,
  timezone text default 'Europe/Zagreb',
  default_organization_id uuid references public.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','partner','researcher','viewer')),
  status text not null check (status in ('invited','active','disabled')),
  invited_email text,
  invited_by uuid references auth.users(id),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.current_user_role(org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.organization_members
  where organization_id = org_id
    and user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;

create or replace function public.get_my_org_membership()
returns table (
  organization_id uuid,
  role text
)
language sql
stable
security definer
set search_path = public
as $$
  select om.organization_id, om.role
  from public.organization_members om
  where om.user_id = auth.uid()
    and om.status = 'active'
  order by om.joined_at nulls last, om.created_at
  limit 1;
$$;

revoke all on function public.get_my_org_membership() from public;
revoke all on function public.get_my_org_membership() from anon;
grant execute on function public.get_my_org_membership() to authenticated;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  legal_name text,
  company_type text,
  company_status text default 'target' check (company_status in ('research','target','contact_found','contacted','replied','meeting','vendor_registration','rfq','offer_sent','won','lost','not_relevant','do_not_contact')),
  country text,
  region text,
  city text,
  address text,
  website text,
  website_domain text,
  linkedin_url text,
  source_url text,
  source_description text,
  sectors text[] default '{}',
  target_countries text[] default '{}',
  priority text default 'medium' check (priority in ('low','medium','high','critical')),
  lead_score integer default 0,
  lead_score_reason text,
  owner_id uuid references auth.users(id),
  description text,
  current_projects text,
  pain_points text,
  notes text,
  gdpr_notes text,
  data_source text,
  research_status text default 'not_reviewed' check (research_status in ('not_reviewed','reviewed','approved_for_outreach','rejected')),
  do_not_contact boolean default false,
  last_contact_at timestamptz,
  next_action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index companies_organization_id_idx on public.companies(organization_id);
create index companies_name_idx on public.companies(name);
create index companies_website_domain_idx on public.companies(website_domain);
create index companies_company_type_idx on public.companies(company_type);
create index companies_country_idx on public.companies(country);
create index companies_company_status_idx on public.companies(company_status);
create index companies_lead_score_idx on public.companies(lead_score);
create index companies_owner_id_idx on public.companies(owner_id);
create index companies_next_action_at_idx on public.companies(next_action_at);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  first_name text,
  last_name text,
  full_name text not null,
  job_title text,
  role_category text,
  email text,
  phone text,
  mobile text,
  linkedin_url text,
  language text,
  country text,
  city text,
  source_url text,
  source_description text,
  data_source text,
  gdpr_lawful_basis text default 'b2b_legitimate_interest',
  gdpr_notes text,
  opt_out boolean default false,
  do_not_contact boolean default false,
  relationship_strength integer default 0 check (relationship_strength between 0 and 5),
  priority text default 'medium' check (priority in ('low','medium','high','critical')),
  owner_id uuid references auth.users(id),
  last_contact_at timestamptz,
  next_action_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index contacts_organization_id_idx on public.contacts(organization_id);
create index contacts_company_id_idx on public.contacts(company_id);
create index contacts_email_idx on public.contacts(email);
create index contacts_full_name_idx on public.contacts(full_name);
create index contacts_role_category_idx on public.contacts(role_category);
create index contacts_owner_id_idx on public.contacts(owner_id);
create index contacts_next_action_at_idx on public.contacts(next_action_at);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  sort_order integer not null,
  color text,
  is_default boolean default false,
  is_won boolean default false,
  is_lost boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  primary_contact_id uuid references public.contacts(id) on delete set null,
  stage_id uuid references public.pipeline_stages(id),
  title text not null,
  opportunity_type text,
  sector text,
  country text,
  city text,
  site_location text,
  estimated_value numeric,
  estimated_monthly_value numeric,
  currency text default 'EUR',
  probability integer default 0,
  estimated_crew_size integer,
  estimated_supervisors integer,
  expected_start_date date,
  expected_end_date date,
  expected_duration_weeks integer,
  scope_summary text,
  client_need text,
  pain_points text,
  required_documents text,
  language_requirements text,
  certification_requirements text,
  pricing_notes text,
  risk_notes text,
  next_step text,
  owner_id uuid references auth.users(id),
  next_action_at timestamptz,
  status text default 'open' check (status in ('open','won','lost','paused','nurture')),
  lost_reason text,
  won_at timestamptz,
  lost_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index opportunities_organization_id_idx on public.opportunities(organization_id);
create index opportunities_company_id_idx on public.opportunities(company_id);
create index opportunities_primary_contact_id_idx on public.opportunities(primary_contact_id);
create index opportunities_stage_id_idx on public.opportunities(stage_id);
create index opportunities_owner_id_idx on public.opportunities(owner_id);
create index opportunities_status_idx on public.opportunities(status);
create index opportunities_next_action_at_idx on public.opportunities(next_action_at);
create index opportunities_expected_start_date_idx on public.opportunities(expected_start_date);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references auth.users(id),
  created_by uuid references auth.users(id),
  related_entity_type text check (related_entity_type in ('company','contact','opportunity','worker','document','none')),
  related_entity_id uuid,
  priority text default 'medium' check (priority in ('low','medium','high','critical')),
  status text default 'open' check (status in ('open','in_progress','done','cancelled')),
  due_date date,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table public.workers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  role text,
  worker_type text,
  email text,
  phone text,
  country text,
  city text,
  languages text[] default '{}',
  skills text[] default '{}',
  certificates text[] default '{}',
  industries text[] default '{}',
  availability_status text default 'unknown' check (availability_status in ('available','available_soon','busy','unknown','do_not_use')),
  available_from date,
  preferred_countries text[] default '{}',
  hourly_rate_expectation numeric,
  daily_rate_expectation numeric,
  currency text default 'EUR',
  reliability_score integer default 0,
  quality_score integer default 0,
  safety_score integer default 0,
  has_passport boolean,
  has_a1_possible boolean,
  has_own_tools boolean,
  has_car boolean,
  notes text,
  status text default 'active' check (status in ('active','inactive','blacklisted','candidate')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  document_category text not null,
  linked_entity_type text,
  linked_entity_id uuid,
  storage_bucket text not null default 'documents',
  storage_path text not null,
  file_name text not null,
  file_extension text,
  mime_type text,
  file_size bigint,
  version integer default 1,
  is_current_version boolean default true,
  visibility text default 'internal' check (visibility in ('internal','admin_only','partner_only','researcher_allowed')),
  sensitivity text default 'normal' check (sensitivity in ('normal','confidential','highly_confidential','personal_data','financial','legal')),
  expiry_date date,
  review_date date,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  content_markdown text,
  language text default 'en',
  version integer default 1,
  status text default 'draft' check (status in ('draft','review_needed','approved','archived')),
  generated_by_ai boolean default false,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create table public.document_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  category text not null,
  status text default 'missing' check (status in ('missing','draft','uploaded','approved','expired')),
  owner_id uuid references auth.users(id),
  linked_document_id uuid references public.documents(id) on delete set null,
  review_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, title)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  activity_type text not null,
  title text,
  summary text,
  body text,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  worker_id uuid references public.workers(id) on delete set null,
  occurred_at timestamptz default now(),
  created_by uuid references auth.users(id),
  metadata jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  generation_type text not null,
  input_snapshot jsonb not null,
  prompt text,
  output_text text,
  output_json jsonb,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  document_template_id uuid references public.document_templates(id) on delete set null,
  model text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_type text not null,
  source_name text,
  source_query text,
  source_url text,
  status text default 'pending' check (status in ('pending','processing','completed','failed','cancelled')),
  total_rows integer default 0,
  processed_rows integer default 0,
  created_records integer default 0,
  updated_records integer default 0,
  duplicate_records integer default 0,
  failed_rows integer default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_batch_id uuid references public.import_batches(id) on delete cascade,
  row_number integer,
  raw_data jsonb not null,
  normalized_data jsonb,
  status text default 'pending' check (status in ('pending','created','updated','duplicate','failed','skipped')),
  error_message text,
  created_company_id uuid references public.companies(id),
  created_contact_id uuid references public.contacts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_organization_id_idx on public.tasks(organization_id);
create index documents_organization_id_idx on public.documents(organization_id);
create index workers_organization_id_idx on public.workers(organization_id);
create index activities_organization_id_idx on public.activities(organization_id);
create index ai_generations_organization_id_idx on public.ai_generations(organization_id);
create index import_batches_organization_id_idx on public.import_batches(organization_id);
create index import_rows_organization_id_idx on public.import_rows(organization_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations','profiles','organization_members','companies','contacts','pipeline_stages',
    'opportunities','tasks','workers','documents','document_templates','document_checklist_items',
    'activities','import_batches','import_rows'
  ]
  loop
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end;
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.tasks enable row level security;
alter table public.workers enable row level security;
alter table public.documents enable row level security;
alter table public.document_templates enable row level security;
alter table public.document_checklist_items enable row level security;
alter table public.activities enable row level security;
alter table public.ai_generations enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;

create policy "members can read organizations" on public.organizations
for select using (public.is_org_member(id));

create policy "users can read own profile" on public.profiles
for select using (id = auth.uid() or public.is_org_member(default_organization_id));

create policy "users can update own profile" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

create policy "members can read organization members" on public.organization_members
for select using (public.is_org_member(organization_id));

create policy "admins can manage organization members" on public.organization_members
for all using (public.current_user_role(organization_id) = 'admin')
with check (public.current_user_role(organization_id) = 'admin');

do $$
declare
  t text;
begin
  foreach t in array array[
    'pipeline_stages','opportunities','workers','document_templates','document_checklist_items',
    'activities','ai_generations','import_batches','import_rows'
  ]
  loop
    execute format('create policy "members can read %I" on public.%I for select using (public.is_org_member(organization_id))', t, t);
    execute format('create policy "admin partner can write %I" on public.%I for insert with check (public.current_user_role(organization_id) in (''admin'',''partner''))', t, t);
    execute format('create policy "admin partner can update %I" on public.%I for update using (public.current_user_role(organization_id) in (''admin'',''partner'')) with check (public.current_user_role(organization_id) in (''admin'',''partner''))', t, t);
    execute format('create policy "admin can delete %I" on public.%I for delete using (public.current_user_role(organization_id) = ''admin'')', t, t);
  end loop;
end;
$$;

create policy "members can read companies" on public.companies
for select using (public.is_org_member(organization_id));

create policy "admin partner researcher can write companies" on public.companies
for insert with check (public.current_user_role(organization_id) in ('admin','partner','researcher'));

create policy "admin partner researcher can update companies" on public.companies
for update using (public.current_user_role(organization_id) in ('admin','partner','researcher'))
with check (public.current_user_role(organization_id) in ('admin','partner','researcher'));

create policy "admin can delete companies" on public.companies
for delete using (public.current_user_role(organization_id) = 'admin');

create policy "members can read contacts" on public.contacts
for select using (public.is_org_member(organization_id));

create policy "admin partner researcher can write contacts" on public.contacts
for insert with check (public.current_user_role(organization_id) in ('admin','partner','researcher'));

create policy "admin partner researcher can update contacts" on public.contacts
for update using (public.current_user_role(organization_id) in ('admin','partner','researcher'))
with check (public.current_user_role(organization_id) in ('admin','partner','researcher'));

create policy "admin can delete contacts" on public.contacts
for delete using (public.current_user_role(organization_id) = 'admin');

create policy "members can read tasks" on public.tasks
for select using (
  public.is_org_member(organization_id)
  and (
    public.current_user_role(organization_id) in ('admin','partner','viewer')
    or assigned_to = auth.uid()
    or created_by = auth.uid()
  )
);

create policy "admin partner researcher can write tasks" on public.tasks
for insert with check (public.current_user_role(organization_id) in ('admin','partner','researcher'));

create policy "admin partner researcher can update tasks" on public.tasks
for update using (public.current_user_role(organization_id) in ('admin','partner','researcher') or assigned_to = auth.uid())
with check (public.current_user_role(organization_id) in ('admin','partner','researcher') or assigned_to = auth.uid());

create policy "document role read access" on public.documents
for select using (
  public.is_org_member(organization_id)
  and (
    public.current_user_role(organization_id) in ('admin','partner')
    or (
      public.current_user_role(organization_id) = 'researcher'
      and visibility in ('internal','researcher_allowed')
      and sensitivity = 'normal'
    )
    or (
      public.current_user_role(organization_id) = 'viewer'
      and visibility = 'researcher_allowed'
      and sensitivity = 'normal'
    )
  )
);

create policy "admin partner can write documents" on public.documents
for insert with check (public.current_user_role(organization_id) in ('admin','partner'));

create policy "admin partner can update documents" on public.documents
for update using (public.current_user_role(organization_id) in ('admin','partner'))
with check (public.current_user_role(organization_id) in ('admin','partner'));

create policy "admin can delete documents" on public.documents
for delete using (public.current_user_role(organization_id) = 'admin');

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = false;

create policy "members can read permitted document objects" on storage.objects
for select using (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.documents d
    where d.storage_bucket = bucket_id
      and d.storage_path = name
      and public.is_org_member(d.organization_id)
      and (
        public.current_user_role(d.organization_id) in ('admin','partner')
        or (
          public.current_user_role(d.organization_id) = 'researcher'
          and d.visibility in ('internal','researcher_allowed')
          and d.sensitivity = 'normal'
        )
        or (
          public.current_user_role(d.organization_id) = 'viewer'
          and d.visibility = 'researcher_allowed'
          and d.sensitivity = 'normal'
        )
      )
  )
);

create policy "admin partner can upload document objects" on storage.objects
for insert with check (
  bucket_id = 'documents'
  and public.current_user_role((storage.foldername(name))[1]::uuid) in ('admin','partner')
);

create policy "admin partner can update document objects" on storage.objects
for update using (
  bucket_id = 'documents'
  and public.current_user_role((storage.foldername(name))[1]::uuid) in ('admin','partner')
);

create policy "admin can delete document objects" on storage.objects
for delete using (
  bucket_id = 'documents'
  and public.current_user_role((storage.foldername(name))[1]::uuid) = 'admin'
);
