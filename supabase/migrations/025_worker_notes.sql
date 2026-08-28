-- ---------------------------------------------------------------------------
-- 025 — Worker memory
--
-- A worker had one flat `notes` column: a single text box that the last person
-- to type in it overwrote. Everything the business actually knows about a
-- person — "refused night shifts", "client asked for him again at BASF",
-- "A1 expires in March" — either fought for that one box or was never written
-- down at all.
--
-- Projects already have memory. People are the asset this company rents out,
-- so they need it more.
--
-- Dated entries, not a blob, because the value is being able to say WHEN.
-- A human resourcing manager forgets; this is the part that does not.
-- ---------------------------------------------------------------------------

create table if not exists public.worker_notes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  worker_id   uuid not null references public.workers(id) on delete cascade,
  -- What kind of thing this is, so the profile can group and the matching
  -- engine can eventually weigh feedback differently from a logistics note.
  kind        text not null default 'note'
                check (kind in ('note','feedback','availability','issue','commercial','document')),
  body        text not null check (length(btrim(body)) > 0),
  -- When it happened, which is not always when it was typed.
  occurred_on date not null default (now() at time zone 'utc')::date,
  author_id   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists worker_notes_worker_idx
  on public.worker_notes (worker_id, occurred_on desc, created_at desc);
create index if not exists worker_notes_org_idx on public.worker_notes (org_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_worker_notes_updated_at') then
    create trigger set_worker_notes_updated_at
      before update on public.worker_notes
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.worker_notes enable row level security;

drop policy if exists "org members can view worker_notes" on public.worker_notes;
create policy "org members can view worker_notes"
  on public.worker_notes for select
  using (
    org_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and status = 'active'
    )
  );

drop policy if exists "org members can write worker_notes" on public.worker_notes;
create policy "org members can write worker_notes"
  on public.worker_notes for insert
  with check (
    org_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and status = 'active'
    )
  );

notify pgrst, 'reload schema';
