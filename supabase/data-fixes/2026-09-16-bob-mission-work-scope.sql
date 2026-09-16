-- DEV-004 data fix — add mission.work to Bob / inbox_coordinator badges
--
-- DO NOT APPLY until Nikola says yes. This writes the live shared database.
-- Local and production share one database. Preview first, then apply.
--
-- Code already treats Bob as bot-owned and lists mission.work on his hire
-- preset. Live badges still only have job_intake.ingest, so Ask Bob keeps
-- failing honestly until this runs.
--
-- Does not:
--   - mint a new token or touch Scout / Hanna research credentials
--   - enable sending
--   - invent a wake URL (Nikola still sets BOT_WAKE_URL_INBOX_COORDINATOR
--     and BOT_WAKE_KEY_INBOX_COORDINATOR in Vercel if the Grok routine exists)
--
-- How to run, after reading the preview:
--   1. Run the Preview select.
--   2. Confirm every row is Bob / inbox_coordinator (or inbox_courier /
--      commercial_ops) and not Scout or Hanna.
--   3. Run the Update.
--   4. Run the Confirm select — every Bob badge should list mission.work.
--
-- Idempotent: rows that already have mission.work are left unchanged.

-- Preview — read this before updating.
select
  mc.org_id,
  mc.id as credential_id,
  mc.name as badge_name,
  mc.display_name as badge_display,
  mc.scopes,
  ('mission.work' = any (mc.scopes)) as already_has_mission_work,
  ai.id as employee_id,
  ai.role_key,
  ai.display_name as employee_name,
  ai.status as employee_status
from public.machine_credentials mc
join public.agent_instances ai
  on ai.id = mc.agent_instance_id
 and ai.org_id = mc.org_id
where mc.status = 'active'
  and ai.status = 'active'
  and (
    ai.role_key in ('inbox_coordinator', 'inbox_courier', 'commercial_ops')
    or lower(btrim(ai.display_name)) = 'bob'
    or lower(btrim(coalesce(mc.display_name, ''))) = 'bob'
  )
order by mc.org_id, mc.name;

-- Apply — only badges matched above, and only if mission.work is missing.
update public.machine_credentials mc
set scopes = mc.scopes || array['mission.work']::text[]
from public.agent_instances ai
where ai.id = mc.agent_instance_id
  and ai.org_id = mc.org_id
  and mc.status = 'active'
  and ai.status = 'active'
  and not ('mission.work' = any (mc.scopes))
  and (
    ai.role_key in ('inbox_coordinator', 'inbox_courier', 'commercial_ops')
    or lower(btrim(ai.display_name)) = 'bob'
    or lower(btrim(coalesce(mc.display_name, ''))) = 'bob'
  );

-- Confirm.
select
  mc.org_id,
  mc.name as badge_name,
  mc.scopes,
  ('mission.work' = any (mc.scopes)) as has_mission_work,
  ai.role_key,
  ai.display_name as employee_name
from public.machine_credentials mc
join public.agent_instances ai
  on ai.id = mc.agent_instance_id
 and ai.org_id = mc.org_id
where mc.status = 'active'
  and ai.status = 'active'
  and (
    ai.role_key in ('inbox_coordinator', 'inbox_courier', 'commercial_ops')
    or lower(btrim(ai.display_name)) = 'bob'
    or lower(btrim(coalesce(mc.display_name, ''))) = 'bob'
  )
order by mc.org_id, mc.name;
