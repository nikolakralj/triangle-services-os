-- ============================================================
-- Migration 020: Job Intake reply style memory
-- ============================================================
-- Keeps the scoring rules and reply-writing memory separate while reusing
-- the same one-row-per-org settings table. The reply style is injected only
-- into draft generation; it does not affect classification or scores.

alter table public.job_intake_rules
  add column if not exists reply_style text not null default '';

comment on column public.job_intake_rules.reply_style is
  'Plain-English guidance for how Triangle replies to recruiter leads.';

notify pgrst, 'reload schema';
