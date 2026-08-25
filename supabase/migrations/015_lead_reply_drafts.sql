-- ============================================================
-- Migration 015: Lead reply drafts
-- ============================================================
-- AI-drafted replies to inbound agency mail.
--
-- Distinct from outreach_drafts, which is cold outbound tied to a
-- discovered_project. A lead reply goes back into an existing email
-- thread and has no project behind it (yet).
--
-- Same hard rule as outreach: drafts are NEVER auto-sent. The user
-- reads, edits, copies, sends from their own mail client, then marks
-- the draft as sent. Nothing in this codebase sends mail.

create table if not exists public.lead_reply_drafts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  job_lead_id  uuid not null references public.job_leads(id) on delete cascade,
  subject      text not null,
  body         text not null,
  -- what this draft is asking for, so the UI can explain itself
  asks         text[] not null default '{}',
  language     text not null default 'en',
  status       text not null default 'draft'
                 check (status in ('draft','sent','archived')),
  sent_at      timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists lead_reply_drafts_lead_idx   on public.lead_reply_drafts (job_lead_id);
create index if not exists lead_reply_drafts_org_idx    on public.lead_reply_drafts (org_id);
create index if not exists lead_reply_drafts_status_idx on public.lead_reply_drafts (status);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_lead_reply_drafts_updated_at') then
    create trigger set_lead_reply_drafts_updated_at before update on public.lead_reply_drafts
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.lead_reply_drafts enable row level security;

drop policy if exists "org members can view lead_reply_drafts"   on public.lead_reply_drafts;
drop policy if exists "org members can insert lead_reply_drafts" on public.lead_reply_drafts;
drop policy if exists "org members can update lead_reply_drafts" on public.lead_reply_drafts;
drop policy if exists "org members can delete lead_reply_drafts" on public.lead_reply_drafts;

create policy "org members can view lead_reply_drafts" on public.lead_reply_drafts for select
  using (org_id in (select organization_id from public.organization_members where user_id = auth.uid() and status = 'active'));
create policy "org members can insert lead_reply_drafts" on public.lead_reply_drafts for insert
  with check (org_id in (select organization_id from public.organization_members where user_id = auth.uid() and status = 'active'));
create policy "org members can update lead_reply_drafts" on public.lead_reply_drafts for update
  using (org_id in (select organization_id from public.organization_members where user_id = auth.uid() and status = 'active'));
create policy "org members can delete lead_reply_drafts" on public.lead_reply_drafts for delete
  using (org_id in (select organization_id from public.organization_members where user_id = auth.uid() and status = 'active'));

notify pgrst, 'reload schema';
