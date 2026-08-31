-- ============================================================
-- Migration 027: Organization operating profile
-- ============================================================
-- Productization boundary: AI-generated commercial work must use the active
-- tenant's identity and positioning, never Triangle-specific constants.

alter table public.organizations
  add column if not exists operating_model text not null default 'crew_supplier',
  add column if not exists offer_mode text not null default 'both',
  add column if not exists company_profile text not null default '',
  add column if not exists reply_signoff text not null default '',
  add column if not exists default_currency text not null default 'EUR',
  add column if not exists timezone text not null default 'UTC',
  add column if not exists profile_updated_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_operating_model_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_operating_model_check
      check (operating_model in (
        'crew_supplier',
        'contract_staffing_agency',
        'recruitment_agency',
        'independent_recruiter'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_offer_mode_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_offer_mode_check
      check (offer_mode in ('teams', 'individuals', 'both'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_default_currency_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_default_currency_check
      check (default_currency ~ '^[A-Z]{3}$');
  end if;
end $$;

-- Preserve the current Triangle behavior when this migration reaches the
-- existing tenant. New tenants deliberately begin with an empty profile and
-- must configure it before AI drafts commercial communication.
update public.organizations
set operating_model = 'crew_supplier',
    offer_mode = 'both',
    company_profile = case
      when company_profile = '' then
        'Triangle Services is an automation and industrial services company operating from Bulgaria and Croatia. We supply teams of specialist contractors — PLC/PCS7/TIA Portal programmers, commissioning and electrical engineers, supervisors — to industrial projects across Europe and the USA. We can contract through our EU company and handle posting, A1 certificates and compliance for our people.'
      else company_profile
    end,
    reply_signoff = case
      when reply_signoff = '' then E'Nikola Kralj\nTriangle Services'
      else reply_signoff
    end,
    timezone = 'Europe/Zagreb'
where lower(name) = 'triangle services';

comment on column public.organizations.operating_model is
  'The tenant business model used to adapt commercial AI workflows.';
comment on column public.organizations.offer_mode is
  'Whether the tenant offers teams, individuals, or both.';
comment on column public.organizations.company_profile is
  'Human-approved positioning supplied to commercial AI prompts.';
comment on column public.organizations.reply_signoff is
  'Exact human-approved sign-off used in drafted communication.';
comment on column public.organizations.profile_updated_by is
  'Human who most recently approved the organization operating profile.';

notify pgrst, 'reload schema';
