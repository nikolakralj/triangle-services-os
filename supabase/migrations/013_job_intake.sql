-- ============================================================
-- Migration 013: Job Intake (agency email → structured leads)
-- ============================================================
-- Front door for inbound agency/recruiter mail. Three tables:
--   mail_accounts  — the mailboxes we read (Nikola, Ralph, office)
--   inbound_emails — one row per ingested message + classification
--   job_leads      — structured opportunity extracted from an email
--
-- Privacy rule enforced by design: non-business mail keeps its
-- classification verdict but NOT its body (see inbound_emails.body_text
-- being nullable and the ingestion layer discarding it).

-- ── mail_accounts ────────────────────────────────────────────────────────────
create table if not exists public.mail_accounts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  email_address  text not null,
  display_name   text,
  -- how we read it: 'imap' today, 'gmail_api' once Workspace/OAuth is in place
  provider       text not null default 'imap'
                   check (provider in ('imap', 'gmail_api')),
  -- env var name holding the app password / token. NEVER store the secret itself.
  credential_ref text,
  -- optional: only ingest mail carrying this provider-side label/folder
  watch_label    text,
  owner_user_id  uuid references auth.users(id) on delete set null,
  status         text not null default 'active'
                   check (status in ('active', 'paused', 'error')),
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, email_address)
);

create index if not exists mail_accounts_org_idx on public.mail_accounts (org_id);

-- ── inbound_emails ───────────────────────────────────────────────────────────
create table if not exists public.inbound_emails (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  mail_account_id  uuid references public.mail_accounts(id) on delete set null,
  -- provider ids, used for dedup / idempotent ingestion
  provider_message_id text not null,
  provider_thread_id  text,
  sender_email     text,
  sender_name      text,
  recipient_email  text,
  subject          text,
  sent_at          timestamptz,
  -- cleaned plaintext. NULL for anything classified as non-business (discarded).
  body_text        text,
  -- classification verdict
  classification   text not null default 'unclassified'
                     check (classification in (
                       'unclassified','job_opportunity','job_board','newsletter',
                       'finance','application_receipt','personal','other'
                     )),
  classification_confidence smallint
                     check (classification_confidence between 0 and 100),
  classification_reason text,
  body_discarded   boolean not null default false,
  processed_at     timestamptz,
  created_at       timestamptz not null default now(),
  unique (org_id, provider_message_id)
);

create index if not exists inbound_emails_org_idx     on public.inbound_emails (org_id);
create index if not exists inbound_emails_class_idx   on public.inbound_emails (classification);
create index if not exists inbound_emails_sent_idx    on public.inbound_emails (sent_at desc);
create index if not exists inbound_emails_thread_idx  on public.inbound_emails (provider_thread_id);

-- ── job_leads ────────────────────────────────────────────────────────────────
create table if not exists public.job_leads (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  inbound_email_id  uuid references public.inbound_emails(id) on delete set null,

  -- who sent it
  agency_name       text,
  contact_name      text,
  contact_email     text,
  client_company    text,

  -- what the work is
  role_title        text not null,
  country           text,
  city              text,
  sector            text,
  technologies      text[] not null default '{}',
  duration_months   integer,
  start_date_text   text,
  rate_text         text,
  headcount_text    text,
  work_mode         text,

  -- the Triangle question: can we place a crew here?
  team_potential    smallint check (team_potential between 0 and 100),
  team_rationale    text,

  -- what the recruiter explicitly asked us for (cv, phone, ...)
  requested_documents text[] not null default '{}',
  -- commercial facts the email did NOT state — what the reply should ask for
  missing_fields    text[] not null default '{}',

  status            text not null default 'new'
                      check (status in ('new','reviewing','replied','qualified','rejected','archived')),
  -- set when a lead is promoted into the Hunter pipeline
  discovered_project_id uuid references public.discovered_projects(id) on delete set null,
  -- dedup: leads judged to be the same opportunity point at the first one
  duplicate_of_id   uuid references public.job_leads(id) on delete set null,

  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists job_leads_org_idx     on public.job_leads (org_id);
create index if not exists job_leads_status_idx  on public.job_leads (status);
create index if not exists job_leads_score_idx   on public.job_leads (team_potential desc);
create index if not exists job_leads_created_idx on public.job_leads (created_at desc);

-- ── updated_at triggers ──────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_mail_accounts_updated_at') then
    create trigger set_mail_accounts_updated_at
      before update on public.mail_accounts
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_job_leads_updated_at') then
    create trigger set_job_leads_updated_at
      before update on public.job_leads
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- ── RLS: active org members can read/write their org's rows ──────────────────
alter table public.mail_accounts  enable row level security;
alter table public.inbound_emails enable row level security;
alter table public.job_leads      enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['mail_accounts','inbound_emails','job_leads'] loop
    execute format('drop policy if exists "org members can view %1$s"   on public.%1$I', t);
    execute format('drop policy if exists "org members can insert %1$s" on public.%1$I', t);
    execute format('drop policy if exists "org members can update %1$s" on public.%1$I', t);
    execute format('drop policy if exists "org members can delete %1$s" on public.%1$I', t);

    execute format($f$
      create policy "org members can view %1$s" on public.%1$I for select
      using (org_id in (select organization_id from public.organization_members
                        where user_id = auth.uid() and status = 'active'))
    $f$, t);
    execute format($f$
      create policy "org members can insert %1$s" on public.%1$I for insert
      with check (org_id in (select organization_id from public.organization_members
                             where user_id = auth.uid() and status = 'active'))
    $f$, t);
    execute format($f$
      create policy "org members can update %1$s" on public.%1$I for update
      using (org_id in (select organization_id from public.organization_members
                        where user_id = auth.uid() and status = 'active'))
    $f$, t);
    execute format($f$
      create policy "org members can delete %1$s" on public.%1$I for delete
      using (org_id in (select organization_id from public.organization_members
                        where user_id = auth.uid() and status = 'active'))
    $f$, t);
  end loop;
end $$;

notify pgrst, 'reload schema';
