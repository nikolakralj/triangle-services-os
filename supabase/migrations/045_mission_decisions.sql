-- 045 — what the CEO decided, kept for the rest of the mission
--
-- "Ignore HVAC-only companies." "Germany first." "Prefer direct contractors."
-- The CEO says these once, inside a mission, and expects them to hold for the
-- rest of it. Until now they lived only in the conversation, and a step read
-- the last sixteen messages: by the twentieth instruction the first decisions
-- had scrolled away, and the only other choice was dragging the whole history
-- into every prompt.
--
-- Most of what a mission remembers is already in its records — the companies
-- filed, the people named, what is still missing, what was ruled out, how far
-- the finish line is. That is read from them every time and never copied.
-- What no record holds is the CEO's standing decisions, so those are kept
-- here: each in one short sentence, with the CEO's own words it was taken from.
--
-- An employee writes a decision down from an instruction; it cannot make one
-- up. The quote must be in the message it cites, or the row is refused. A
-- person can take a decision back, and put it back.

CREATE TABLE IF NOT EXISTS public.mission_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  kind text NOT NULL,
  -- "Exclude HVAC-only companies." — what later steps apply.
  text text NOT NULL,
  -- The CEO's own words it was taken from.
  quote text NOT NULL,
  source_step_id uuid REFERENCES public.agent_assignments(id) ON DELETE SET NULL,
  -- A decision goes when the words it came from go.
  source_message_id uuid REFERENCES public.assignment_messages(id) ON DELETE CASCADE,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_agent_instance_id uuid REFERENCES public.agent_instances(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  superseded_by uuid REFERENCES public.mission_decisions(id) ON DELETE SET NULL,
  removed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mission_decisions_kind_check CHECK (kind IN ('exclude', 'focus', 'prefer', 'limit', 'other')),
  CONSTRAINT mission_decisions_text_check CHECK (length(btrim(text)) BETWEEN 3 AND 240),
  CONSTRAINT mission_decisions_quote_check CHECK (length(btrim(quote)) BETWEEN 2 AND 500),
  CONSTRAINT mission_decisions_status_check CHECK (status IN ('active', 'superseded', 'removed')),
  -- Written down by an employee means taken from something a person said.
  CONSTRAINT mission_decisions_evidence_check CHECK (
    source_message_id IS NOT NULL OR recorded_by_agent_instance_id IS NULL
  ),
  CONSTRAINT mission_decisions_removed_check CHECK (status <> 'removed' OR removed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS mission_decisions_mission_idx
  ON public.mission_decisions (mission_id, created_at);

-- A retried step does not write the same decision down twice.
CREATE UNIQUE INDEX IF NOT EXISTS mission_decisions_message_text_key
  ON public.mission_decisions (source_message_id, lower(btrim(text)))
  WHERE source_message_id IS NOT NULL;

-- ── a decision is taken from a person's words, or not taken ─────────────────

CREATE OR REPLACE FUNCTION public.enforce_decision_quote()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  said text;
BEGIN
  IF NEW.source_message_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT m.body INTO said
  FROM public.assignment_messages m
  WHERE m.id = NEW.source_message_id
    AND m.org_id = NEW.org_id
    AND m.role = 'human';
  IF said IS NULL THEN
    RAISE EXCEPTION 'a decision must cite something a person said';
  END IF;
  IF position(
       lower(regexp_replace(btrim(NEW.quote), '\s+', ' ', 'g'))
       IN lower(regexp_replace(said, '\s+', ' ', 'g'))
     ) = 0 THEN
    RAISE EXCEPTION 'the quote is not in the message it cites';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mission_decisions_quote ON public.mission_decisions;
CREATE TRIGGER mission_decisions_quote
  BEFORE INSERT OR UPDATE OF quote, source_message_id, org_id ON public.mission_decisions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_decision_quote();

DROP TRIGGER IF EXISTS mission_decisions_org ON public.mission_decisions;
CREATE TRIGGER mission_decisions_org
  BEFORE INSERT OR UPDATE OF org_id, mission_id ON public.mission_decisions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mission_child_org();

DROP TRIGGER IF EXISTS set_mission_decisions_updated_at ON public.mission_decisions;
CREATE TRIGGER set_mission_decisions_updated_at
  BEFORE UPDATE ON public.mission_decisions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.mission_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view mission decisions" ON public.mission_decisions;
CREATE POLICY "org members can view mission decisions"
  ON public.mission_decisions FOR SELECT
  USING (is_org_member(org_id));

COMMENT ON TABLE public.mission_decisions IS
  'The CEO''s standing decisions inside a mission, each with the words it was taken from. The rest of a mission''s memory is read from its records.';

NOTIFY pgrst, 'reload schema';
