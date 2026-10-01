-- ============================================================
-- Migration 054: WhatsApp Cloud API pilot
-- ============================================================
-- Meta's free test number. Text only. Each message is stored once, keyed by
-- Meta's wamid. A draft has no wamid until a person approves and sends it.
-- Nothing in this table sends by itself.
--
-- Idempotent. CREATE TABLE IF NOT EXISTS does not add columns to a table
-- that already exists, so each column is also ADD COLUMN IF NOT EXISTS.
--
-- DO NOT APPLY THIS FROM A CODING AGENT.
-- Local development and Production share one database. Nikola applies it.
-- Until then the webhook answers 503 and files nothing.

create table if not exists public.whatsapp_messages (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null,
  wamid               text,
  direction           text not null,
  from_number         text not null,
  to_number           text not null,
  body                text,
  wa_timestamp        timestamptz not null default now(),
  status              text not null,
  person_id           uuid,
  mission_id          uuid,
  reply_to_wamid      text,
  template_name       text,
  agent_instance_id   uuid,
  draft_key           text,
  approved_by         uuid,
  approved_at         timestamptz,
  sent_at             timestamptz,
  send_attempted_at   timestamptz,
  woken_at            timestamptz,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.whatsapp_messages
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists org_id uuid,
  add column if not exists wamid text,
  add column if not exists direction text,
  add column if not exists from_number text,
  add column if not exists to_number text,
  add column if not exists body text,
  add column if not exists wa_timestamp timestamptz default now(),
  add column if not exists status text,
  add column if not exists person_id uuid,
  add column if not exists mission_id uuid,
  add column if not exists reply_to_wamid text,
  add column if not exists template_name text,
  add column if not exists agent_instance_id uuid,
  add column if not exists draft_key text,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists send_attempted_at timestamptz,
  add column if not exists woken_at timestamptz,
  add column if not exists error text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_messages_pkey'
      and conrelid = 'public.whatsapp_messages'::regclass
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_messages_org_id_fkey'
      and conrelid = 'public.whatsapp_messages'::regclass
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_org_id_fkey
      foreign key (org_id) references public.organizations(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_messages_person_id_fkey'
      and conrelid = 'public.whatsapp_messages'::regclass
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_person_id_fkey
      foreign key (person_id) references public.workers(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_messages_mission_id_fkey'
      and conrelid = 'public.whatsapp_messages'::regclass
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_mission_id_fkey
      foreign key (mission_id) references public.missions(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_messages_agent_instance_id_fkey'
      and conrelid = 'public.whatsapp_messages'::regclass
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_agent_instance_id_fkey
      foreign key (agent_instance_id) references public.agent_instances(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_messages_approved_by_fkey'
      and conrelid = 'public.whatsapp_messages'::regclass
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_approved_by_fkey
      foreign key (approved_by) references auth.users(id) on delete set null;
  end if;
end $$;

alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_direction_check;
alter table public.whatsapp_messages
  add constraint whatsapp_messages_direction_check
  check (direction in ('inbound', 'outbound'));

alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_status_check;
alter table public.whatsapp_messages
  add constraint whatsapp_messages_status_check
  check (status in ('received', 'draft', 'sent', 'delivered', 'read', 'failed'));

alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_wamid_check;
alter table public.whatsapp_messages
  add constraint whatsapp_messages_wamid_check
  check (wamid is null or length(btrim(wamid)) > 0);

create unique index if not exists whatsapp_messages_wamid_idx
  on public.whatsapp_messages (wamid)
  where wamid is not null;

create unique index if not exists whatsapp_messages_draft_key_idx
  on public.whatsapp_messages (org_id, draft_key)
  where draft_key is not null;

create index if not exists whatsapp_messages_person_idx
  on public.whatsapp_messages (org_id, person_id, wa_timestamp desc)
  where person_id is not null;

create index if not exists whatsapp_messages_mission_idx
  on public.whatsapp_messages (org_id, mission_id, wa_timestamp desc)
  where mission_id is not null;

create index if not exists whatsapp_messages_from_idx
  on public.whatsapp_messages (org_id, from_number, wa_timestamp desc);

create index if not exists whatsapp_messages_to_idx
  on public.whatsapp_messages (org_id, to_number, wa_timestamp desc);

alter table public.whatsapp_messages enable row level security;

drop policy if exists "org members can view whatsapp_messages" on public.whatsapp_messages;
create policy "org members can view whatsapp_messages"
  on public.whatsapp_messages for select
  using (public.is_org_member(org_id));

drop trigger if exists set_whatsapp_messages_updated_at on public.whatsapp_messages;
create trigger set_whatsapp_messages_updated_at
  before update on public.whatsapp_messages
  for each row execute function public.set_updated_at();

comment on table public.whatsapp_messages is
  'WhatsApp pilot. One row per Meta wamid. Drafts have no wamid until a person sends them. Writes go through the service client. Nothing here sends by itself.';

notify pgrst, 'reload schema';
