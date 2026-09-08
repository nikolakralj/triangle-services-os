-- 040 — supply is people AND firms
--
-- Every rule in this system says supply means individual people. AGENTS.md
-- defines the supply-first workflow as "human-confirmed available people ->
-- sellable package". The Phase 0 exit gate asks for a package "backed by
-- human-confirmed available people". Scout's house rules, written on 8
-- September, tell him to read "who Triangle can actually put on a site this
-- month" and refuse any trade that is not on the bench.
--
-- Triangle has two people on the bench.
--
-- So that rule, as written, refuses almost everything — and it is not even
-- wrong about the individuals. It is wrong about the company. A crew of eight
-- electricians for six weeks is not assembled from a bench of two; it comes
-- from a partner firm that already employs eight electricians. That is how
-- this industry actually fills a package, and until this table exists the
-- system cannot represent it at all, which means Scout will keep saying no to
-- work Triangle could deliver.
--
-- Deliberately NOT a row in `workers` with worker_type = 'company'. A firm has
-- no passport, no nationality, no CV to generate, and no personal reliability
-- score; everything downstream of `workers` assumes a human, and a company
-- sitting in that table would quietly produce a Triangle CV for a legal
-- entity. Deliberately NOT a flag on `companies` either: company_status there
-- is a demand funnel (research -> target -> contacted -> won), and a firm can
-- be both a buyer and a supplier at the same time. The link is optional and
-- one-way.
--
-- The column that matters most is confirmed_at. A firm that said "we have
-- twelve electricians" in March is not supply in September; it is a memory.
-- Hanna already applies a 14-day shelf life to a person's availability, and
-- the same rule has to hold here or this table becomes a list of firms who
-- once claimed capacity.

create table if not exists public.supply_partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Optional. A partner met on a site does not have to be in the demand CRM,
  -- and a company already in there does not become a partner by being linked.
  company_id uuid references public.companies(id) on delete set null,

  name text not null,
  legal_name text,
  country text,
  city text,

  -- Who answers the phone there. A partner with no named person is the same
  -- dead end as a buyer with no named person.
  contact_name text,
  contact_email text,
  contact_phone text,

  -- What they actually do, in the same vocabulary as workers.skills so the two
  -- sides of the pool can be read together.
  trades text[] not null default '{}',
  industries text[] not null default '{}',
  languages text[] not null default '{}',
  certificates text[] not null default '{}',

  -- How many heads they can field at once. Null means nobody has asked yet,
  -- which is different from zero.
  crew_size integer check (crew_size is null or crew_size >= 0),

  -- Where they can legally put those people. Posting a crew across a border is
  -- the firm's problem, not Triangle's, but whether they can do it decides
  -- whether the package is real. A1 certificates, local entity, licences.
  can_post_to text[] not null default '{}',
  posting_notes text,

  availability_status text not null default 'unknown'
    check (availability_status in ('available','available_soon','busy','unknown','do_not_use')),
  available_from date,

  -- When a human last heard the capacity claim from the partner, and who heard
  -- it. Null means it has never been confirmed and must not be sold.
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_note text,

  rate_notes text,
  notes text,

  status text not null default 'candidate'
    check (status in ('candidate','active','inactive','do_not_use')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

comment on table public.supply_partners is
  'Firms that can put a crew on site under Triangle contract. The other half of the talent pool; workers holds the individuals.';
comment on column public.supply_partners.confirmed_at is
  'When a human last confirmed this capacity with the partner. Null or stale means it is not sellable supply.';
comment on column public.supply_partners.crew_size is
  'Heads they can field at once. Null means nobody has asked, which is not zero.';

create index if not exists supply_partners_org_idx
  on public.supply_partners (organization_id, status, availability_status);
create index if not exists supply_partners_trades_idx
  on public.supply_partners using gin (trades);
create index if not exists supply_partners_company_idx
  on public.supply_partners (company_id);

alter table public.supply_partners enable row level security;

drop policy if exists supply_partners_select on public.supply_partners;
create policy supply_partners_select on public.supply_partners
  for select using (public.is_org_member(organization_id));

drop policy if exists supply_partners_write on public.supply_partners;
create policy supply_partners_write on public.supply_partners
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

notify pgrst, 'reload schema';
