-- ============================================================
-- Migration 012: Required documents per package
-- ============================================================
-- Each package can declare the documents its workers must have on file
-- (e.g. A1, ID, CSCS). Stored as cert-type values matching CERT_TYPES.
-- When empty, the app falls back to a country/role-derived default
-- template at read time.

alter table public.project_packages
  add column if not exists required_documents text[] not null default '{}';

-- Reload schema for PostgREST
notify pgrst, 'reload schema';
