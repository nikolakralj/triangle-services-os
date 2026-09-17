-- DEV-018 data fix — engineering noise out of the live company
--
-- DO NOT APPLY until Nikola says yes. This writes the live shared database.
-- Local and production share one database. Preview first, then apply.
--
-- Found on Preview 76c42d4, 16 September 2026:
--
--   1. Bob's In progress on Today holds a test task: "DEV-004 smoke: draft a
--      short next step for this thread; do not send." (f878723e…).
--   2. Scout's finished step in mission "HVAC EPC EU" (5a0d52be…) carries
--      questionForCeo "Promote Eng Preview c57ec57 to Production, or hold on
--      live outbox c27187b?", so the mission shows in Needs you with a deploy
--      question. The step's real result (12 EU HVAC buyers) is kept.
--
-- Does not:
--   - touch "how many plc engineers do they need" (a real Ask Bob question)
--   - delete any row, finding, company or contact
--   - change badges, wake-ups or sending
--
-- How to run, after reading the preview:
--   1. Run the Preview select. Expect exactly two rows with the titles above.
--   2. Run the two updates.
--   3. Run the Confirm select: the smoke task is cancelled, and the HVAC step
--      has no question_for_ceo while its headline is unchanged.
--
-- 17 September live note: some agent_assignments.result_summary rows are
-- plain text ("Draft…"), not JSON. Casting the whole table with ::jsonb
-- fails. Preview/confirm below only jsonb-cast rows that look like JSON.
-- If a listed id is already completed, the cancel update is a no-op. Apply
-- 2 still requires a JSON result_summary on the HVAC row. If that row is
-- already clear of questionForCeo, skip Apply 2.

-- Preview — read this before updating.
select
  id,
  status,
  title,
  case
    when result_summary ~ '^\s*[\[{]'
      then result_summary::jsonb ->> 'questionForCeo'
  end as question_for_ceo,
  case
    when result_summary ~ '^\s*[\[{]'
      then result_summary::jsonb -> 'brief' ->> 'headline'
  end as headline
from public.agent_assignments
where id in (
  'f878723e-7718-4720-8e8c-eef335cfeda1',
  '5a0d52be-cc2b-4cac-9e9d-fc52d4f5233b'
);

-- Apply 1 — cancel the smoke test, only while it is still open.
update public.agent_assignments
set status = 'cancelled'
where id = 'f878723e-7718-4720-8e8c-eef335cfeda1'
  and title like 'DEV-004 smoke:%'
  and status in ('queued', 'active', 'waiting_review');

-- Apply 2 — clear only the engineering question from Scout's HVAC step.
-- Skip rows whose result_summary is not JSON.
update public.agent_assignments
set result_summary = (result_summary::jsonb - 'questionForCeo')::text
where id = '5a0d52be-cc2b-4cac-9e9d-fc52d4f5233b'
  and result_summary ~ '^\s*[\[{]'
  and result_summary::jsonb ->> 'questionForCeo' like 'Promote Eng Preview%';

-- Confirm.
select
  id,
  status,
  title,
  case
    when result_summary ~ '^\s*[\[{]'
      then result_summary::jsonb ->> 'questionForCeo'
  end as question_for_ceo,
  case
    when result_summary ~ '^\s*[\[{]'
      then result_summary::jsonb -> 'brief' ->> 'headline'
  end as headline
from public.agent_assignments
where id in (
  'f878723e-7718-4720-8e8c-eef335cfeda1',
  '5a0d52be-cc2b-4cac-9e9d-fc52d4f5233b'
);
