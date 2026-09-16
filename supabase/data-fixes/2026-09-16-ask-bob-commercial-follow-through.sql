-- DEV-015 data fix — Ask Bob rows need case_type commercial_follow_through
--
-- DO NOT APPLY until Nikola says yes. This writes the live shared database.
-- Local and production share one database. Preview first, then apply.
--
-- Root cause: migration 041 COALESCE(constraints->>'case_type', 'open_research')
-- treats a missing case_type as a research finding. Ask Bob from Today stored
-- source today_ask_bob and no case_type, so Bob's POST {assignmentId, result}
-- 409s: "A finished research job has to land somewhere: reachable,
-- one_thing_missing, or dead."
--
-- New Ask Bob writes case_type commercial_follow_through in code. This patch
-- backfills open (and recently completed) today_ask_bob rows that still lack it.
--
-- Does not:
--   - change Scout / Hanna research credentials
--   - enable sending
--   - rewrite mission_step, open_research, or event_outbox rows
--
-- How to run, after reading the preview:
--   1. Run the Preview select.
--   2. Confirm every row is source today_ask_bob and case_type is null/blank.
--   3. Run the Update.
--   4. Run the Confirm select — those rows should show commercial_follow_through.

-- Preview — read this before updating.
select
  id,
  title,
  status,
  constraints->>'source' as source,
  constraints->>'case_type' as case_type,
  created_at
from public.agent_assignments
where constraints->>'source' = 'today_ask_bob'
  and (
    constraints->>'case_type' is null
    or btrim(constraints->>'case_type') = ''
  )
order by created_at desc;

-- Apply — only Ask Bob rows that still have no case_type.
update public.agent_assignments
set constraints = constraints || '{"case_type":"commercial_follow_through"}'::jsonb
where constraints->>'source' = 'today_ask_bob'
  and (
    constraints->>'case_type' is null
    or btrim(constraints->>'case_type') = ''
  );

-- Confirm.
select
  id,
  title,
  status,
  constraints->>'source' as source,
  constraints->>'case_type' as case_type
from public.agent_assignments
where constraints->>'source' = 'today_ask_bob'
order by created_at desc;
