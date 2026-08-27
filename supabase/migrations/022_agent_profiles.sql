-- ============================================================
-- Migration 022: Agent profiles
-- ============================================================
-- Feedback from Nikola on the first Agents page: "too technical".
-- Agents are presented as team members, not credentials. The technical
-- name (triangle_bob_nikola) stays the identity for tokens and the
-- inbox API; these columns are the face the humans see.

alter table public.machine_credentials
  add column if not exists display_name text,
  add column if not exists role_title   text,
  add column if not exists emoji        text,
  add column if not exists description  text;

update public.machine_credentials
set display_name = coalesce(display_name, 'Bob'),
    role_title   = coalesce(role_title, 'Email Intake Assistant'),
    emoji        = coalesce(emoji, '📥'),
    description  = coalesce(description,
      'Reads recruiter mail each morning and files new job opportunities for scoring.')
where name = 'triangle_bob_nikola';

notify pgrst, 'reload schema';
