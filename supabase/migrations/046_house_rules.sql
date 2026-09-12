-- 046 — how an employee works, in the CEO's words
--
-- A mission decision holds for one mission: "Ignore HVAC-only companies" was
-- about Austria. What the CEO says about how an employee works — always ask
-- for headcount first, never write to an Austrian in English, one named person
-- per company or say why there is none — is not about one mission, and until
-- now it had nowhere to live. It lived in the file pasted into the bot's own
-- platform, plus whatever that bot remembered. Both drift: the file was edited
-- here on 12 September and the bot's copy was stale the same hour.
--
-- So the rules live here, and every run reads them: the wake-up payload, the
-- inbox, and Triangle's own worker alike. That is what makes them survive a
-- model swap — the instructions belong to the employee, not to whatever brain
-- is doing the work this month.
--
-- Append-only. Each save is a version with the person who made it, because
-- "why does it write like this now" is a question about a change, and the
-- answer is worthless if the previous words are gone. Saving the same words
-- again is not a change.
--
-- Rules are instructions, never a boundary: what an employee may actually do
-- is still enforced by scopes, the finding contract and the API. A sentence in
-- a textarea has never stopped anything.

CREATE TABLE IF NOT EXISTS public.agent_house_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_instance_id uuid NOT NULL REFERENCES public.agent_instances(id) ON DELETE CASCADE,
  -- Plain English, the way the CEO would tell a colleague. Empty means the
  -- rules were cleared, which is itself a version worth keeping.
  body text NOT NULL,
  version integer NOT NULL,
  set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_house_rules_body_check CHECK (length(body) <= 4000),
  CONSTRAINT agent_house_rules_version_check CHECK (version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_house_rules_version_key
  ON public.agent_house_rules (agent_instance_id, version);

CREATE INDEX IF NOT EXISTS agent_house_rules_current_idx
  ON public.agent_house_rules (org_id, agent_instance_id, version DESC);

-- ── the rules and the employee belong to the same organization ──────────────

CREATE OR REPLACE FUNCTION public.enforce_house_rules_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  owner_org uuid;
BEGIN
  SELECT org_id INTO owner_org
    FROM public.agent_instances
    WHERE id = NEW.agent_instance_id;
  IF owner_org IS NULL THEN
    RAISE EXCEPTION 'House rules were written for an employee that does not exist.';
  END IF;
  IF owner_org <> NEW.org_id THEN
    RAISE EXCEPTION 'House rules must belong to the same organization as the employee.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_house_rules_org ON public.agent_house_rules;
CREATE TRIGGER agent_house_rules_org
  BEFORE INSERT OR UPDATE OF org_id, agent_instance_id ON public.agent_house_rules
  FOR EACH ROW EXECUTE FUNCTION public.enforce_house_rules_org();

-- ── saving is one call, so two browser tabs cannot claim one version ───────

CREATE OR REPLACE FUNCTION public.save_house_rules(
  p_org_id uuid,
  p_agent_instance_id uuid,
  p_body text,
  p_user_id uuid
)
RETURNS public.agent_house_rules
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_row public.agent_house_rules;
  saved public.agent_house_rules;
BEGIN
  PERFORM 1
    FROM public.agent_instances
    WHERE id = p_agent_instance_id AND org_id = p_org_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such employee in this organization.';
  END IF;

  SELECT * INTO current_row
    FROM public.agent_house_rules
    WHERE agent_instance_id = p_agent_instance_id
    ORDER BY version DESC
    LIMIT 1;

  -- The same words again: keep the version that is already on file, so the
  -- history reads as changes and not as saves.
  IF current_row.id IS NOT NULL AND btrim(current_row.body) = btrim(p_body) THEN
    RETURN current_row;
  END IF;

  INSERT INTO public.agent_house_rules (org_id, agent_instance_id, body, version, set_by)
  VALUES (
    p_org_id,
    p_agent_instance_id,
    p_body,
    COALESCE(current_row.version, 0) + 1,
    p_user_id
  )
  RETURNING * INTO saved;

  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_house_rules(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_house_rules(uuid, uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.save_house_rules(uuid, uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_house_rules(uuid, uuid, text, uuid) TO service_role;

ALTER TABLE public.agent_house_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view house rules" ON public.agent_house_rules;
CREATE POLICY "org members can view house rules"
  ON public.agent_house_rules FOR SELECT
  USING (is_org_member(org_id));

COMMENT ON TABLE public.agent_house_rules IS
  'How an employee works, in the CEO''s own words: standing instructions carried into every run, versioned. Instructions, not permissions — what an employee may do is enforced by scopes and the API.';

NOTIFY pgrst, 'reload schema';
