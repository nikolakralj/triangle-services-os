-- ============================================================
-- Migration 008: Outreach Drafts (Sprint D — Outreach Agent)
-- ============================================================
-- Stores AI-drafted outreach messages tied to a buyer contact and (optionally)
-- a specific project package. Multiple channels per contact are normal:
--   - LinkedIn connection note (≤300 chars, soft intro)
--   - LinkedIn DM (sent after acceptance, longer, includes the offer)
--   - Email cold (full pitch with subject + body)
--   - Email follow-up (sent if no reply after 5-10 days)
--
-- Drafts are NEVER auto-sent. The user reviews, optionally edits, copies to
-- clipboard, sends manually, then marks the draft as sent.

do $$ begin
  create type public.outreach_channel as enum (
    'linkedin_connect',
    'linkedin_message',
    'email_cold',
    'email_followup'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.outreach_status as enum (
    'draft',
    'sent',
    'replied',
    'no_reply',
    'archived'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.outreach_drafts (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  project_id          uuid not null references public.discovered_projects(id) on delete cascade,
  -- The buyer this draft is addressed to. Optional only because buyer_contacts
  -- references a final-table row (after acceptance); for early drafts the
  -- agent may target a pending buyer_contact suggestion via buyer_suggestion_id.
  buyer_contact_id        uuid references public.buyer_contacts(id) on delete set null,
  buyer_suggestion_id     uuid references public.research_suggestions(id) on delete set null,
  -- The package being pitched (optional — generic outreach has no package)
  project_package_id      uuid references public.project_packages(id) on delete set null,
  -- The draft itself
  channel             public.outreach_channel not null,
  subject             text,                   -- email only; null for LinkedIn
  body                text not null,
  -- Variant grouping: drafts generated together share variant_group_id so the
  -- UI can show alternatives ("3 LinkedIn note variants — pick one")
  variant_group_id    uuid,
  variant_label       text,                   -- e.g. "Curious", "Direct", "Warm"
  -- Status / tracking
  status              public.outreach_status not null default 'draft',
  sent_at             timestamptz,
  replied_at          timestamptz,
  reply_summary       text,
  -- Provenance
  created_by_agent    text,
  created_by_user_id  uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists outreach_drafts_project_idx
  on public.outreach_drafts (project_id);
create index if not exists outreach_drafts_org_idx
  on public.outreach_drafts (org_id);
create index if not exists outreach_drafts_buyer_idx
  on public.outreach_drafts (buyer_contact_id)
  where buyer_contact_id is not null;
create index if not exists outreach_drafts_status_idx
  on public.outreach_drafts (status);
create index if not exists outreach_drafts_variant_group_idx
  on public.outreach_drafts (variant_group_id)
  where variant_group_id is not null;

-- Standard updated_at trigger
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_outreach_drafts_updated_at') then
    create trigger set_outreach_drafts_updated_at
      before update on public.outreach_drafts
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- RLS
alter table public.outreach_drafts enable row level security;

drop policy if exists "org members can view outreach_drafts"   on public.outreach_drafts;
drop policy if exists "org members can insert outreach_drafts" on public.outreach_drafts;
drop policy if exists "org members can update outreach_drafts" on public.outreach_drafts;
drop policy if exists "org members can delete outreach_drafts" on public.outreach_drafts;

create policy "org members can view outreach_drafts"
  on public.outreach_drafts for select
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can insert outreach_drafts"
  on public.outreach_drafts for insert
  with check (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can update outreach_drafts"
  on public.outreach_drafts for update
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

create policy "org members can delete outreach_drafts"
  on public.outreach_drafts for delete
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

notify pgrst, 'reload schema';
