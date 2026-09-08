-- 041 — a finding may only be one of three things
--
-- On 8 September the CEO opened a Scout result and read:
--
--   "Hold until the missing commercial proof is found · 60% sure · 3 sources"
--
-- and said, correctly, that for that he can open Chrome. The finding named no
-- person, refused nothing, and asked nobody for anything. It was a well-formed,
-- permitted, completely useless result.
--
-- The cause is in the schema, not the prompt. `verdict` was
-- ("pursue" | "hold" | "no_go") and "hold" required NO evidence whatsoever. A
-- model that is unsure will always pick the option with no burden of proof, and
-- rewriting the brief does not change that — I rewrote it twice and it kept
-- filing holds, because filing a hold was legal.
--
-- So the states get renamed to what they must contain, and each one now has to
-- pay for itself before the row is allowed to exist:
--
--   reachable          a named person + a published way in + the words to say
--   one_thing_missing  EXACTLY ONE named fact + who goes and gets it
--   dead               the reason, so it is never shown again
--
-- "Hold until the missing commercial proof is found" satisfies none of them.
-- It is not reachable (no person), not dead (nothing refused), and not
-- one_thing_missing ("commercial proof" is not a named fact and there is no
-- owner). It can no longer be written.
--
-- Enforced here rather than in TypeScript because there are two Scouts — the
-- in-app executor and the provider bot through the agent API — plus Hanna, Bob,
-- and whoever is hired next. A rule in one code path is a rule the other paths
-- do not have. This is the same reason the other sixty-six guards live in
-- Postgres.
--
-- Existing rows keep a NULL state. The trigger fires only at the moment work is
-- claimed finished, so history stays readable and un-rewritten, and no legacy
-- row is retro-labelled with a verdict nobody actually reached. There is
-- deliberately no fourth "legacy" or "unknown" value: a state the app is
-- allowed to write without evidence is the hedge coming back under a new name.

-- ── the state, on both places a finding can land ────────────────────────────

ALTER TABLE public.agent_assignments
  ADD COLUMN IF NOT EXISTS finding_state text
    CHECK (finding_state IS NULL
           OR finding_state IN ('reachable', 'one_thing_missing', 'dead'));

ALTER TABLE public.agent_findings
  ADD COLUMN IF NOT EXISTS finding_state text
    CHECK (finding_state IS NULL
           OR finding_state IN ('reachable', 'one_thing_missing', 'dead'));

COMMENT ON COLUMN public.agent_assignments.finding_state IS
  'What a finished research job actually produced. Enforced by enforce_assignment_finding_contract at the moment of completion.';
COMMENT ON COLUMN public.agent_findings.finding_state IS
  'What this proposal actually is. Enforced by enforce_finding_contract on insert.';

-- ── the contract on a finished assignment ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_assignment_finding_contract()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  report        jsonb;
  buyer         jsonb;
  act           jsonb;
  case_type     text;
  missing_count int;
  owner_text    text;
BEGIN
  -- Only the transition into "completed" is governed. A later touch of an old
  -- row must not be re-judged against a contract that did not exist when the
  -- work was done.
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  case_type := COALESCE(NEW.constraints->>'case_type', 'open_research');

  -- Research is what this governs. Hanna reading a CV and Bob fetching mail are
  -- not commercial findings and have nothing to be reachable about.
  IF case_type NOT IN ('open_research', 'company_qualification', 'contact_reachability') THEN
    RETURN NEW;
  END IF;

  IF NEW.finding_state IS NULL THEN
    RAISE EXCEPTION
      'A finished research job has to land somewhere: reachable, one_thing_missing, or dead. "%" landed nowhere, which is exactly how "hold until the missing commercial proof is found" got filed.',
      NEW.title;
  END IF;

  BEGIN
    report := NEW.result_summary::jsonb;
  EXCEPTION WHEN others THEN
    report := NULL;
  END;

  IF report IS NULL OR jsonb_typeof(report) <> 'object' THEN
    RAISE EXCEPTION
      'The report on "%" is not a structured case report, so its "%" claim cannot be checked. A paragraph and three links is not a finding.',
      NEW.title, NEW.finding_state;
  END IF;

  IF NEW.finding_state = 'reachable' THEN
    buyer := report->'buyerPath';
    act   := report->'nextCommercialAction';

    -- Two report shapes reach this point and both are legitimate.
    --
    -- A case report carries the person in buyerPath.decisionMaker. A
    -- reachability report does not name the person at all, because the person
    -- is already a row in buyer_contacts and the job was to find their door —
    -- there the channel is channels[].value and the words are howToOpen.
    --
    -- One contract, checked against whichever shape arrived. Requiring the
    -- case-report fields of a reachability report would refuse every genuine
    -- reachability success, which is the opposite of the point.
    IF jsonb_typeof(report->'channels') = 'array' THEN
      IF COALESCE(jsonb_array_length(report->'channels'), 0) = 0
         OR COALESCE(NULLIF(btrim(report->'channels'->0->>'value'), ''), '') = '' THEN
        RAISE EXCEPTION
          'reachable needs a published channel. "%" reports no way in, which is UNREACHABLE — file it as dead with the reason.',
          NEW.title;
      END IF;
      IF COALESCE(NULLIF(btrim(report->>'howToOpen'), ''), '') = '' THEN
        RAISE EXCEPTION
          'reachable needs the words to say. "%" found a number and no sentence to say when someone answers.',
          NEW.title;
      END IF;
      RETURN NEW;
    END IF;

    IF COALESCE(NULLIF(btrim(buyer->>'decisionMaker'), ''), '') = '' THEN
      RAISE EXCEPTION
        'reachable needs a named person. "%" has a company and nobody to ask for — a switchboard with no name produces no meetings.',
        NEW.title;
    END IF;

    IF COALESCE(NULLIF(btrim(buyer->>'publicDoor'), ''), '') = ''
       AND COALESCE(NULLIF(btrim(act->>'channel'), ''), '') = '' THEN
      RAISE EXCEPTION
        'reachable needs a published way in. "%" names % and gives no phone, address or page to reach them on.',
        NEW.title, buyer->>'decisionMaker';
    END IF;

    IF COALESCE(NULLIF(btrim(act->>'action'), ''), '') = '' THEN
      RAISE EXCEPTION
        'reachable needs the words to say. "%" leaves the CEO to write the approach himself, which is the job being handed back.',
        NEW.title;
    END IF;

  ELSIF NEW.finding_state = 'one_thing_missing' THEN
    missing_count := COALESCE(jsonb_array_length(report->'unknowns'), 0);

    IF missing_count <> 1 THEN
      RAISE EXCEPTION
        'one_thing_missing means exactly one named fact, not %. "%" is research still in progress; finish it or refuse it, but do not file it.',
        missing_count, NEW.title;
    END IF;

    owner_text := COALESCE(NULLIF(btrim(report->>'missingOwner'), ''), '');
    IF owner_text = '' THEN
      RAISE EXCEPTION
        'one_thing_missing needs somebody to go and get it. "%" states what is unknown and asks no one for it, which is homework handed to the CEO.',
        NEW.title;
    END IF;

  ELSIF NEW.finding_state = 'dead' THEN
    -- notFoundReason is the reachability report's word for the same thing: a
    -- sourced absence. "No direct line is published for this person" is a
    -- complete, useful, honest result and must not be refused for using the
    -- other report's field name.
    IF COALESCE(NULLIF(btrim(report->>'deadReason'), ''), '') = ''
       AND COALESCE(NULLIF(btrim(report->>'notFoundReason'), ''), '') = '' THEN
      RAISE EXCEPTION
        'dead needs its reason recorded, or the same weak lead comes back next week. "%" refuses without saying why.',
        NEW.title;
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS enforce_finding_contract ON public.agent_assignments;
CREATE TRIGGER enforce_finding_contract
  BEFORE INSERT OR UPDATE ON public.agent_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_assignment_finding_contract();

-- ── the contract on a filed finding ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_finding_contract()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  p jsonb := COALESCE(NEW.payload, '{}'::jsonb);
BEGIN
  -- A CV reading and a recommendation are not commercial findings. Hanna's
  -- worker rows and the play cards have no buyer to be reachable about.
  IF NEW.finding_type NOT IN ('project', 'company', 'contact', 'contact_channel') THEN
    RETURN NEW;
  END IF;

  IF NEW.finding_state IS NULL THEN
    RAISE EXCEPTION
      'A % finding has to say what it is: reachable, one_thing_missing, or dead. Filing one with no state is how the queue filled with rows nobody can act on.',
      NEW.finding_type;
  END IF;

  IF NEW.finding_state = 'reachable' THEN
    -- A name, in whichever field this finding type uses for it.
    IF COALESCE(
         NULLIF(btrim(p->>'full_name'), ''),
         NULLIF(btrim(p->>'name'), ''),
         NULLIF(btrim(p->>'decision_maker'), ''),
         NULLIF(btrim(p->>'labour_buyer'), ''),
         ''
       ) = '' THEN
      RAISE EXCEPTION
        'reachable needs a named person, and this % finding has none. A company with no human to ask for is unreachable — file it as such.',
        NEW.finding_type;
    END IF;

    IF COALESCE(
         NULLIF(btrim(p->>'value'), ''),
         NULLIF(btrim(p->>'phone'), ''),
         NULLIF(btrim(p->>'email'), ''),
         NULLIF(btrim(p->>'nu_page'), ''),
         NULLIF(btrim(p->>'impressum_url'), ''),
         ''
       ) = '' THEN
      RAISE EXCEPTION
        'reachable needs a published channel. This % finding names somebody with no way to reach them.',
        NEW.finding_type;
    END IF;

  ELSIF NEW.finding_state = 'one_thing_missing' THEN
    IF COALESCE(NULLIF(btrim(p->>'missing'), ''), '') = ''
       OR COALESCE(NULLIF(btrim(p->>'missing_owner'), ''), '') = '' THEN
      RAISE EXCEPTION
        'one_thing_missing needs the one fact named in "missing" and somebody named in "missing_owner". Without both it is homework, not a finding.';
    END IF;

  ELSIF NEW.finding_state = 'dead' THEN
    IF COALESCE(NULLIF(btrim(p->>'dead_reason'), ''), '') = '' THEN
      RAISE EXCEPTION
        'dead needs "dead_reason" recorded, so this lead is never presented again.';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS enforce_finding_contract ON public.agent_findings;
CREATE TRIGGER enforce_finding_contract
  BEFORE INSERT ON public.agent_findings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_finding_contract();

-- Reading the queue by state is the whole point of the new screen.
CREATE INDEX IF NOT EXISTS agent_findings_state_idx
  ON public.agent_findings (org_id, finding_state, status, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_assignments_state_idx
  ON public.agent_assignments (org_id, finding_state, completed_at DESC);

NOTIFY pgrst, 'reload schema';
