-- 039 — what an employee may spend in a day
--
-- Slice 5 of the execution roadmap asks for continuation that is "explicit,
-- idempotent, budgeted, and observable". Three of the four were done. Nothing
-- was budgeted.
--
-- agent_runs has recorded input_tokens, output_tokens and estimated_cost since
-- it was built, and not one line of code has ever read them. An unattended
-- runner on a schedule with no ceiling is how a quiet weekend becomes a bill
-- nobody authorised, and the only thing standing between here and that is a
-- batch size constant in one route.
--
-- Two ceilings per employee, because they fail differently. A loop that claims
-- the same job repeatedly burns runs while costing little; one enormous
-- document burns cost in a single run. Either alone would miss the other.
--
-- Deliberately per employee and per day, not per organisation and per month.
-- A monthly cap tells you at the end of the month; a daily one stops it on the
-- day, and naming the employee says which one to look at.

ALTER TABLE agent_instances
  ADD COLUMN IF NOT EXISTS daily_run_budget integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS daily_cost_budget numeric(10, 2) NOT NULL DEFAULT 5.00;

COMMENT ON COLUMN agent_instances.daily_run_budget IS
  'Unattended runs this employee may make per calendar day (UTC). 0 stops them entirely.';
COMMENT ON COLUMN agent_instances.daily_cost_budget IS
  'Estimated spend in EUR this employee may incur per calendar day (UTC). 0 stops them entirely.';

-- Reading today's spend for one employee is on the hot path of every claim.
CREATE INDEX IF NOT EXISTS agent_runs_instance_day_idx
  ON agent_runs (org_id, agent_instance_id, started_at DESC);

NOTIFY pgrst, 'reload schema';
