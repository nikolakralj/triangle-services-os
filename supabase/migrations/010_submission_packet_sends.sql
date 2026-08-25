-- ============================================================
-- Migration 010: Submission Packet Sends — Sprint F tracking
-- ============================================================
-- Track every time a crew submission PDF is sent to a buyer:
-- who, when, channel, response status, and placement fee.

create table if not exists public.submission_packet_sends (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  package_id          uuid not null references public.project_packages(id) on delete cascade,
  contact_id          uuid references public.buyer_contacts(id) on delete set null,
  contact_name        text,
  contact_email       text,
  contact_company     text,
  sent_at             timestamptz not null default now(),
  channel             text not null default 'email'
                        check (channel in ('email', 'linkedin', 'whatsapp', 'other')),
  status              text not null default 'sent'
                        check (status in ('sent', 'replied_interested', 'replied_not_interested', 'negotiating', 'placed', 'ghosted')),
  notes               text,
  placement_fee_eur   numeric(12, 2),
  replied_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists packet_sends_package_idx on public.submission_packet_sends (package_id);
create index if not exists packet_sends_org_idx     on public.submission_packet_sends (org_id);
create index if not exists packet_sends_status_idx  on public.submission_packet_sends (status);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_submission_packet_sends_updated_at') then
    create trigger set_submission_packet_sends_updated_at
      before update on public.submission_packet_sends
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.submission_packet_sends enable row level security;

create policy "org members can manage packet sends"
  on public.submission_packet_sends for all
  using (org_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid() and status = 'active'
  ));

notify pgrst, 'reload schema';
