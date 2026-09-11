-- 044 — a mission's finish line, and its route there
--
-- On 10 September the CEO set the measure for delegated work: how few
-- instructions he has to give before a mission comes back ready for a
-- decision. The Germany mission needed five. A worker cannot finish on its own
-- until something says what finished means, and a screen cannot say how far
-- along a mission is without somewhere to count from.
--
--   mission_criteria     when it is finished — "20 companies still in play",
--                        "15 buyers named". A metric and a target, never a
--                        progress number: how far along it is gets counted
--                        from the records every time it is shown, the same way
--                        its state is.
--   mission_plan_steps   how it gets there — "Name the buyer at each", each
--                        step tied to the fact that says it is done, and to
--                        the pass that does it (discover, research, verify,
--                        qualify, rank, prepare, match), so a pass can later
--                        run — or be handed to another employee — on its own
--                        without changing the mission.
--
-- What the CEO reads beside a criterion comes from its metric, in code, not
-- from a model: a criterion must say exactly what is counted.

-- ── when it is finished ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mission_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  metric text NOT NULL,
  target integer NOT NULL,
  position smallint NOT NULL DEFAULT 0,
  -- The worker proposes the finish line; the CEO may move it. A human change
  -- says whose it was.
  set_by text NOT NULL DEFAULT 'agent',
  set_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mission_criteria_metric_check CHECK (metric IN (
    'companies_found', 'companies_in_play', 'named_buyers', 'contact_routes',
    'project_evidence', 'reachable',
    'candidates_named', 'candidates_available', 'partners_confirmed'
  )),
  CONSTRAINT mission_criteria_target_check CHECK (target BETWEEN 1 AND 500),
  CONSTRAINT mission_criteria_set_by_check CHECK (set_by IN ('agent', 'human')),
  CONSTRAINT mission_criteria_human_check CHECK (set_by = 'agent' OR set_by_user_id IS NOT NULL),
  CONSTRAINT mission_criteria_mission_metric_key UNIQUE (mission_id, metric)
);

-- ── how it gets there ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mission_plan_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  position smallint NOT NULL,
  pass text NOT NULL,
  title text NOT NULL,
  -- The fact that says this step is done. Its target is the mission's
  -- criterion for that fact, so moving the finish line moves the plan with it.
  metric text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mission_plan_steps_pass_check CHECK (pass IN (
    'discover', 'research', 'verify', 'qualify', 'rank', 'prepare', 'match'
  )),
  CONSTRAINT mission_plan_steps_metric_check CHECK (metric IN (
    'companies_found', 'companies_in_play', 'named_buyers', 'contact_routes',
    'project_evidence', 'reachable',
    'candidates_named', 'candidates_available', 'partners_confirmed'
  )),
  CONSTRAINT mission_plan_steps_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT mission_plan_steps_position_check CHECK (position BETWEEN 1 AND 12),
  CONSTRAINT mission_plan_steps_mission_position_key UNIQUE (mission_id, position)
);

-- ── both belong to their mission's organization ─────────────────────────────
--
-- Written by route handlers and the executor on the service client, which
-- RLS does not check. The organization is checked here instead.

CREATE OR REPLACE FUNCTION public.enforce_mission_child_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.missions m WHERE m.id = NEW.mission_id AND m.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'mission % does not belong to organization %', NEW.mission_id, NEW.org_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mission_criteria_org ON public.mission_criteria;
CREATE TRIGGER mission_criteria_org
  BEFORE INSERT OR UPDATE OF org_id, mission_id ON public.mission_criteria
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mission_child_org();

DROP TRIGGER IF EXISTS mission_plan_steps_org ON public.mission_plan_steps;
CREATE TRIGGER mission_plan_steps_org
  BEFORE INSERT OR UPDATE OF org_id, mission_id ON public.mission_plan_steps
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mission_child_org();

DROP TRIGGER IF EXISTS set_mission_criteria_updated_at ON public.mission_criteria;
CREATE TRIGGER set_mission_criteria_updated_at
  BEFORE UPDATE ON public.mission_criteria
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.mission_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_plan_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view mission criteria" ON public.mission_criteria;
CREATE POLICY "org members can view mission criteria"
  ON public.mission_criteria FOR SELECT
  USING (is_org_member(org_id));

DROP POLICY IF EXISTS "org members can view mission plan steps" ON public.mission_plan_steps;
CREATE POLICY "org members can view mission plan steps"
  ON public.mission_plan_steps FOR SELECT
  USING (is_org_member(org_id));

-- ── one plan per mission, whoever gets there first ──────────────────────────
--
-- A step that starts planning and a CEO pressing "Plan it now" can overlap.
-- Two half-plans interleaved would be worse than either, so the whole plan is
-- written in one transaction under a lock on the mission, and only when the
-- mission has none. Returns whether this call wrote it.

CREATE OR REPLACE FUNCTION public.save_mission_plan(
  p_org_id uuid,
  p_mission_id uuid,
  p_criteria jsonb,
  p_plan jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM 1 FROM public.missions WHERE id = p_mission_id AND org_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mission % not found in organization %', p_mission_id, p_org_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.mission_criteria WHERE mission_id = p_mission_id) THEN
    RETURN false;
  END IF;

  INSERT INTO public.mission_criteria (org_id, mission_id, metric, target, position, set_by)
  SELECT p_org_id, p_mission_id, c.value->>'metric', (c.value->>'target')::integer, (c.ordinality - 1)::smallint, 'agent'
  FROM jsonb_array_elements(p_criteria) WITH ORDINALITY AS c(value, ordinality);

  INSERT INTO public.mission_plan_steps (org_id, mission_id, position, pass, title, metric)
  SELECT p_org_id, p_mission_id, s.ordinality::smallint, s.value->>'pass', s.value->>'title', s.value->>'metric'
  FROM jsonb_array_elements(p_plan) WITH ORDINALITY AS s(value, ordinality);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.save_mission_plan(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_mission_plan(uuid, uuid, jsonb, jsonb) TO service_role;

COMMENT ON TABLE public.mission_criteria IS
  'When a mission is finished: a metric and a target. Progress is counted from the records, never stored.';
COMMENT ON TABLE public.mission_plan_steps IS
  'How a mission gets there: ordered steps, each tied to a pass and to the metric that says it is done.';

-- ── the contact ledger is read by person since 043 ──────────────────────────

CREATE INDEX IF NOT EXISTS commercial_actions_contact_idx
  ON public.commercial_actions (contact_id)
  WHERE contact_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
