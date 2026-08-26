-- ============================================================
-- Migration 018: Scoped machine credentials
-- ============================================================
-- Replaces the single admin MCP_API_KEY with per-bot tokens that can
-- only do what their scopes allow (blast-radius containment):
--
--   triangle_bob_nikola  → job_intake.ingest
--   triangle_bob_ralph   → job_intake.ingest
--   triangle_scout       → research.suggestion.create, ...
--
-- Only the SHA-256 hash of a token is stored; the plaintext is shown
-- once by scripts/create-machine-credential.mjs and never persisted.
-- The legacy MCP_API_KEY env var still authenticates as admin for
-- human/dev use, but bots should never receive it.

create table if not exists public.machine_credentials (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  name         text not null,
  token_hash   text not null unique,
  scopes       text[] not null default '{}',
  status       text not null default 'active' check (status in ('active','revoked')),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  unique (org_id, name)
);

create index if not exists machine_credentials_org_idx on public.machine_credentials (org_id);

alter table public.machine_credentials enable row level security;

drop policy if exists "admins can view machine_credentials" on public.machine_credentials;
create policy "admins can view machine_credentials" on public.machine_credentials for select
  using (org_id in (select organization_id from public.organization_members
                    where user_id = auth.uid() and status = 'active' and role = 'admin'));
-- Inserts/updates go through the service client only; no user-facing write policies.

notify pgrst, 'reload schema';
