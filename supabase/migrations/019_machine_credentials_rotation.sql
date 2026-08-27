-- ============================================================
-- Migration 019: Allow credential rotation
-- ============================================================
-- Rotating a credential means: revoke the old row (keeping it as audit
-- history — who used what, and when) and issue a new one under the SAME
-- name, so the bot's config stays recognisable.
--
-- The original unique(org_id, name) constraint ignored status, so the
-- name stayed blocked forever after a revoke and every rotation failed
-- with a 409 duplicate-key error.
--
-- A partial unique index fixes this: only ONE ACTIVE credential per
-- name, while any number of revoked rows may remain.

alter table public.machine_credentials
  drop constraint if exists machine_credentials_org_id_name_key;

drop index if exists machine_credentials_active_name_idx;

create unique index machine_credentials_active_name_idx
  on public.machine_credentials (org_id, name)
  where status = 'active';

notify pgrst, 'reload schema';
