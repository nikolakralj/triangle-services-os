-- 042 — a person's decision on a finished report, recorded rather than implied
--
-- The Today screen offers three buttons on a report an employee brought back:
-- File the refusal, Discard, Send Scout back. A source review on 10 September
-- found that for a REPORT (as opposed to a finding) none of them recorded the
-- decision:
--
--   File the refusal  returned {ok:true, filed:true} and wrote nothing, so the
--                     report was back on the screen after a reload.
--   Discard           overwrote the employee's own finding_state with 'dead'
--                     and threw away the reason the CEO had been made to type.
--   Send Scout back   left the report untouched, so it kept offering the
--                     button, and a second press created a second job.
--
-- A button that claims an outcome it did not record is the exact failure this
-- product exists to refuse, three times over on one screen.
--
-- A finding already has status + reviewed_by/at. A report had nowhere to put
-- a human decision, so this adds one — kept deliberately SEPARATE from
-- finding_state. That column is what the employee claimed, and migration 041
-- checks it. These columns are what a person decided about the claim.
-- Overwriting one with the other erased the difference between "Scout says
-- this is dead" and "Nikola read it and agrees".

alter table public.agent_assignments
  add column if not exists review_outcome text,
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

comment on column public.agent_assignments.review_outcome is
  'What a person decided about this finished report: acknowledged, discarded, or sent_back. Separate from finding_state, which is the employee''s own claim.';

alter table public.agent_assignments
  drop constraint if exists agent_assignments_review_outcome_check;
alter table public.agent_assignments
  add constraint agent_assignments_review_outcome_check
  check (review_outcome is null
         or review_outcome in ('acknowledged', 'discarded', 'sent_back'));

-- A decision happened at a time. reviewed_by is written by the application
-- on every decision but is not required here, because the person's account
-- may later be deleted and the decision should outlive it.
alter table public.agent_assignments
  drop constraint if exists agent_assignments_review_when_check;
alter table public.agent_assignments
  add constraint agent_assignments_review_when_check
  check (review_outcome is null or reviewed_at is not null);

-- A discard without its reason is how the same weak lead comes back next week,
-- which is the precise thing the button exists to prevent.
alter table public.agent_assignments
  drop constraint if exists agent_assignments_discard_reason_check;
alter table public.agent_assignments
  add constraint agent_assignments_discard_reason_check
  check (review_outcome is distinct from 'discarded'
         or coalesce(btrim(review_note), '') <> '');

-- What the Today screen reads: finished reports nobody has decided on yet.
create index if not exists agent_assignments_undecided_idx
  on public.agent_assignments (org_id, completed_at desc)
  where status = 'completed' and review_outcome is null;

-- Follow-up work names the item it was sent for, so that item can say
-- "Scout is fetching it" instead of offering the button a second time.
create index if not exists agent_assignments_parent_idx
  on public.agent_assignments ((constraints->>'parent_id'))
  where constraints ? 'parent_id';

notify pgrst, 'reload schema';
