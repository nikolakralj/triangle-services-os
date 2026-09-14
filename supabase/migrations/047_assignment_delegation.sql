-- 047 — work passed between employees, kept as a graph Triangle holds
--
-- Scout finds a buyer whose value depends on whether Triangle can field a
-- crew; the crew is Hanna's to confirm. Bob is asked for twelve PCS7 engineers
-- and needs Hanna for the people and Scout for the project behind the ask.
-- Grok's Bots can message each other, but those messages are not a record:
-- no structured result, a handful of run logs, nothing Triangle can retry or
-- show the CEO. So when one employee asks another for work, the request is an
-- assignment here, hanging off the work it came from.
--
-- A graph, never a pipeline. Any employee may ask any other; one piece of work
-- may branch into several running at once; nothing in the schema knows who
-- Scout, Hanna or Bob are, so a sixth employee needs no migration.
--
-- A child is always created after its parent and its parent never changes, so
-- a request can never end up asking itself.

ALTER TABLE public.agent_assignments
  ADD COLUMN IF NOT EXISTS parent_assignment_id uuid
    REFERENCES public.agent_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_by_agent_instance_id uuid
    REFERENCES public.agent_instances(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.agent_assignments.parent_assignment_id IS
  'The work this assignment was asked for from. Null for work a person gave.';
COMMENT ON COLUMN public.agent_assignments.requested_by_agent_instance_id IS
  'The employee who asked for this work. Null when a person asked.';

CREATE INDEX IF NOT EXISTS agent_assignments_parent_idx
  ON public.agent_assignments (parent_assignment_id)
  WHERE parent_assignment_id IS NOT NULL;

-- An employee's request always hangs off the work it came from.
ALTER TABLE public.agent_assignments
  DROP CONSTRAINT IF EXISTS agent_assignments_requested_needs_parent;
ALTER TABLE public.agent_assignments
  ADD CONSTRAINT agent_assignments_requested_needs_parent
  CHECK (requested_by_agent_instance_id IS NULL OR parent_assignment_id IS NOT NULL);

ALTER TABLE public.agent_assignments
  DROP CONSTRAINT IF EXISTS agent_assignments_not_own_parent;
ALTER TABLE public.agent_assignments
  ADD CONSTRAINT agent_assignments_not_own_parent
  CHECK (parent_assignment_id IS NULL OR parent_assignment_id <> id);

-- ── a request stays inside the organization and the mission it came from ───

CREATE OR REPLACE FUNCTION public.enforce_assignment_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  parent record;
  requester_org uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.parent_assignment_id IS DISTINCT FROM OLD.parent_assignment_id THEN
    RAISE EXCEPTION 'Where a piece of work came from does not change after it is created.';
  END IF;

  IF NEW.parent_assignment_id IS NOT NULL THEN
    SELECT org_id, mission_id INTO parent
      FROM public.agent_assignments
      WHERE id = NEW.parent_assignment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The work this was asked for from does not exist.';
    END IF;
    IF parent.org_id <> NEW.org_id THEN
      RAISE EXCEPTION 'Work can only be asked for inside one organization.';
    END IF;
    IF parent.mission_id IS NOT NULL
       AND NEW.mission_id IS DISTINCT FROM parent.mission_id THEN
      RAISE EXCEPTION 'Work asked for inside a mission stays in that mission.';
    END IF;
  END IF;

  IF NEW.requested_by_agent_instance_id IS NOT NULL THEN
    SELECT org_id INTO requester_org
      FROM public.agent_instances
      WHERE id = NEW.requested_by_agent_instance_id;
    IF requester_org IS NULL OR requester_org <> NEW.org_id THEN
      RAISE EXCEPTION 'The employee asking must belong to the same organization.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_assignments_parent ON public.agent_assignments;
CREATE TRIGGER agent_assignments_parent
  BEFORE INSERT OR UPDATE OF parent_assignment_id, requested_by_agent_instance_id, org_id, mission_id
  ON public.agent_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_assignment_parent();

NOTIFY pgrst, 'reload schema';
