-- ============================================================
-- Migration 003: Contractor chain nodes
-- ============================================================
-- Maps the chain of companies between a discovered project and
-- the actual labor buyer. This is the "missing middle" module.
-- ============================================================

create type public.chain_knowledge_level as enum (
  'known',
  'inferred',
  'unknown'
);

create type public.chain_role as enum (
  'owner',
  'developer',
  'epc',
  'gc',
  'mep',
  'electrical',
  'intermediary',
  'other'
);

create table public.contractor_chain_nodes (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  discovered_project_id uuid not null references public.discovered_projects(id) on delete cascade,
  -- The role this company plays in the delivery chain
  role                public.chain_role not null,
  -- Display label (can override default role name)
  label               text not null,
  -- Company name (free text — may not be in the companies table yet)
  company_name        text,
  -- Optional FK if the company has been linked to a CRM company record
  company_id          uuid references public.companies(id) on delete set null,
  -- How confident are we this company is in this role?
  level               public.chain_knowledge_level not null default 'unknown',
  confidence          smallint check (confidence between 0 and 100),
  -- Reason for the assignment (source text, reasoning, etc.)
  rationale           text,
  -- Free-form research notes
  notes               text,
  -- Sort order within a project's chain
  sort_order          smallint not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null
);

-- Indexes
create index contractor_chain_nodes_project_idx
  on public.contractor_chain_nodes (discovered_project_id);

create index contractor_chain_nodes_org_idx
  on public.contractor_chain_nodes (organization_id);

create index contractor_chain_nodes_company_idx
  on public.contractor_chain_nodes (company_id)
  where company_id is not null;

-- RLS
alter table public.contractor_chain_nodes enable row level security;

create policy "org members can view contractor chain nodes"
  on public.contractor_chain_nodes for select
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and status = 'active'
    )
  );

create policy "org members can insert contractor chain nodes"
  on public.contractor_chain_nodes for insert
  with check (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and status = 'active'
    )
  );

create policy "org members can update contractor chain nodes"
  on public.contractor_chain_nodes for update
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and status = 'active'
    )
  );

create policy "org members can delete contractor chain nodes"
  on public.contractor_chain_nodes for delete
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and status = 'active'
    )
  );

-- ============================================================
-- Buyer contacts table
-- Maps people to roles within the contractor chain
-- ============================================================

create table public.buyer_contacts (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  discovered_project_id   uuid not null references public.discovered_projects(id) on delete cascade,
  chain_node_id           uuid references public.contractor_chain_nodes(id) on delete set null,
  -- CRM contact if matched
  contact_id              uuid references public.contacts(id) on delete set null,
  -- Free-text if not yet in CRM
  full_name               text,
  job_title               text,
  company_name            text,
  email                   text,
  linkedin_url            text,
  -- Role in the buying decision
  buyer_role              text, -- e.g. 'procurement', 'project director', 'subcontract manager'
  priority                smallint default 0 check (priority between 0 and 100),
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid references auth.users(id) on delete set null
);

create index buyer_contacts_project_idx
  on public.buyer_contacts (discovered_project_id);

create index buyer_contacts_org_idx
  on public.buyer_contacts (organization_id);

alter table public.buyer_contacts enable row level security;

create policy "org members can view buyer contacts"
  on public.buyer_contacts for select
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and status = 'active'
    )
  );

create policy "org members can insert buyer contacts"
  on public.buyer_contacts for insert
  with check (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and status = 'active'
    )
  );

create policy "org members can update buyer contacts"
  on public.buyer_contacts for update
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and status = 'active'
    )
  );

create policy "org members can delete buyer contacts"
  on public.buyer_contacts for delete
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and status = 'active'
    )
  );
