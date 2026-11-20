-- ============================================================
-- Migration 058: candidate CV fields on workers
-- ============================================================
-- Years, initials, a LinkedIn profile, and the two Drive CV files Hanna
-- files with a person. The Talent Pool page reads them. Accepting a worker
-- finding writes them. Nothing here creates a person.
--
-- Idempotent. CREATE UNIQUE INDEX will fail if one organisation already has
-- two workers with the same email or the same LinkedIn URL. That is the
-- point of the index. Do not delete those rows from this file — fix the
-- duplicates by hand and run the migration again.
--
-- DO NOT APPLY THIS FROM A CODING AGENT.
-- Local development and Production share one database. Nikola applies it.
--
-- Roll back, in this order:
--   drop index if exists public.workers_org_linkedin_lower_uidx;
--   drop index if exists public.workers_org_email_lower_uidx;
--   alter table public.workers drop constraint if exists workers_initials_check;
--   alter table public.workers drop constraint if exists workers_years_experience_check;
--   alter table public.workers drop constraint if exists workers_linkedin_url_check;
--   alter table public.workers
--     drop column if exists initials,
--     drop column if exists years_experience,
--     drop column if exists linkedin_url,
--     drop column if exists original_cv_drive_file_id,
--     drop column if exists triangle_cv_drive_file_id;
--   notify pgrst, 'reload schema';

alter table public.workers
  add column if not exists initials text,
  add column if not exists years_experience integer,
  add column if not exists linkedin_url text,
  add column if not exists original_cv_drive_file_id text,
  add column if not exists triangle_cv_drive_file_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workers_initials_check'
      and conrelid = 'public.workers'::regclass
  ) then
    alter table public.workers
      add constraint workers_initials_check
      check (initials is null or char_length(btrim(initials)) between 1 and 40);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'workers_years_experience_check'
      and conrelid = 'public.workers'::regclass
  ) then
    alter table public.workers
      add constraint workers_years_experience_check
      check (years_experience is null or years_experience between 0 and 60);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'workers_linkedin_url_check'
      and conrelid = 'public.workers'::regclass
  ) then
    alter table public.workers
      add constraint workers_linkedin_url_check
      check (
        linkedin_url is null
        or linkedin_url ~* '^https?://([^/]*\.)?linkedin\.com/'
      );
  end if;
end $$;

comment on column public.workers.initials is
  'How this person is referred to before a name is released. Null means nothing was stored; the page may still derive initials from the name.';

comment on column public.workers.years_experience is
  'Whole years of relevant experience from a CV or a candidate import. Null means not recorded.';

comment on column public.workers.linkedin_url is
  'This person''s LinkedIn profile as an https link. Stored from a CV or an import, not fetched by Triangle.';

comment on column public.workers.original_cv_drive_file_id is
  'Google Drive file id of the CV as it arrived. A file, not a folder. The page links to https://drive.google.com/file/d/{id}/view.';

comment on column public.workers.triangle_cv_drive_file_id is
  'Google Drive file id of the Triangle-formatted CV. A file, not a folder. The page links to https://drive.google.com/file/d/{id}/view.';

create unique index if not exists workers_org_linkedin_lower_uidx
  on public.workers (organization_id, lower(linkedin_url))
  where linkedin_url is not null and btrim(linkedin_url) <> '';

create unique index if not exists workers_org_email_lower_uidx
  on public.workers (organization_id, lower(btrim(email)))
  where email is not null and btrim(email) <> '';

notify pgrst, 'reload schema';
