-- ============================================================
-- Migration 051: personal mailbox vs shared space (DEV-020)
-- ============================================================
-- Each person sees mail that arrived in their own connected inbox. A lead
-- stays private to that mailbox's owner until they put it in the common
-- shared space. Colleagues and automatic Bob wakes do not see it until then.
--
-- Sending is unchanged (DEV-013): opt-in per mailbox, owner only, default
-- off. This migration does not enable sending and does not send.
--
-- Existing leads were org-visible. The first apply stamps them into the
-- shared space so live follow-ups do not vanish. Re-applying after personal
-- leads exist does not stamp those — only a first apply (no shared row yet,
-- and no 051_backfill_done marker) backfills. The marker is a column comment
-- so deleting every shared row later cannot republish private leads.
-- New inserts leave shared_at null.

alter table public.job_leads
  add column if not exists shared_at timestamptz,
  add column if not exists shared_by uuid references auth.users(id) on delete set null;

comment on column public.job_leads.shared_by is
  'The person who shared it. Null for the first-apply backfill of the previous org-wide pipeline.';

do $$
declare
  marker text;
begin
  marker := col_description(
    'public.job_leads'::regclass,
    (
      select attnum from pg_attribute
      where attrelid = 'public.job_leads'::regclass
        and attname = 'shared_at'
        and not attisdropped
    )
  );
  if marker is not null and position('051_backfill_done' in marker) > 0 then
    return;
  end if;
  if exists (select 1 from public.job_leads)
     and not exists (select 1 from public.job_leads where shared_at is not null)
  then
    update public.job_leads
      set shared_at = created_at
      where shared_at is null;
  end if;
end $$;

comment on column public.job_leads.shared_at is
  'When a person put this lead into the org shared space. Null = still personal to the mailbox owner. 051_backfill_done';

create index if not exists job_leads_shared_idx
  on public.job_leads (org_id, shared_at);

notify pgrst, 'reload schema';
