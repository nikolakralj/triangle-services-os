-- 043 — the Mission: one objective, and every instruction given inside it
--
-- On 10 September the CEO described the unit of delegated work as it actually
-- happens. "Win EPC subcontracting opportunities in Germany" is one piece of
-- work. Inside it he says: find EPC contractors; now find the buyer at
-- Goldbeck; ignore HVAC-only companies; find phone numbers for the top ten;
-- which five should I call tomorrow? Those are seven instructions to one
-- worker about one objective — not seven jobs, and not seven tabs.
--
-- The app had no object for that. Every question typed into the Ask box became
-- its own assignment, answered from scratch: Scout's research run read the
-- brief and nothing else, so "find the person at Goldbeck" re-ran "find EPC
-- contractors" with no memory that Goldbeck had been found. After a day the
-- queue held a dozen near-identical questions and no body of work.
--
-- So:
--
--   missions               the objective, its title for the tab, its lead
--                          employee, and whether the CEO has closed it
--   agent_assignments      each instruction is one step, tied to its mission
--                          by mission_id — still a normal, auditable job
--   agent_findings         each sourced fact a step files, tied to the mission
--                          it was found in, and now allowed to be `applied`
--
-- The state a tab shows (queued, working, needs you, ready, done, blocked) is
-- deliberately NOT stored. It is read from the steps every time. A stored
-- status is a second answer to "what is Scout doing", and this codebase has
-- already shipped a badge that said 52 while its screen said nothing.
--
-- Records the agent writes itself
-- --------------------------------
-- The same day the CEO changed the approval rule: "You should approve actions,
-- not basic facts the system learned." A company Scout finds with a source is
-- a fact. Making the CEO press "Add to Companies" thirty-one times is the
-- transport work this product exists to remove — and it is why accepted
-- findings were the only way anything reached the Companies page.
--
-- So an employee working a mission creates the company and the person itself,
-- and says so on the row: found_by_agent_instance_id and found_in_mission_id,
-- with verified_at empty until a human confirms it. A finding it applies is
-- `applied` — not `accepted`, which has always meant a person accepted it.
--
-- What still needs a human is unchanged and still enforced where it already
-- was: contacting anyone (commercial_actions requires human confirmation),
-- changing commercial status, deleting, and committing money.

-- ── the mission ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- What the tab says: "EPC Germany". Short on purpose.
  title text NOT NULL,
  emoji text,
  -- What the worker is actually trying to achieve, in one sentence.
  objective text NOT NULL,
  -- Which surface the work fills. Research fills companies and people;
  -- recruiting fills candidates and partner firms. The shell is the same.
  kind text NOT NULL DEFAULT 'research',
  lead_agent_instance_id uuid REFERENCES public.agent_instances(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- When a human last opened it. "Ready" means finished since then.
  last_seen_at timestamptz,
  -- Closed by the CEO. The only state that is a decision rather than a fact
  -- about the work, so the only one stored.
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT missions_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 80),
  CONSTRAINT missions_objective_check CHECK (length(btrim(objective)) > 0),
  CONSTRAINT missions_kind_check CHECK (kind IN ('research', 'recruiting'))
);

CREATE INDEX IF NOT EXISTS missions_org_open_idx
  ON public.missions (org_id, updated_at DESC)
  WHERE closed_at IS NULL;

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view missions" ON public.missions;
CREATE POLICY "org members can view missions"
  ON public.missions FOR SELECT
  USING (is_org_member(org_id));
-- Writes go through route handlers that check the actor and the role, on the
-- service client — the same arrangement as agent_assignments.

DROP TRIGGER IF EXISTS set_missions_updated_at ON public.missions;
CREATE TRIGGER set_missions_updated_at
  BEFORE UPDATE ON public.missions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.missions IS
  'One delegated objective. Instructions are agent_assignments with this mission_id; its state is derived from them, never stored.';

-- ── steps and findings belong to a mission ──────────────────────────────────

ALTER TABLE public.agent_assignments
  ADD COLUMN IF NOT EXISTS mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agent_assignments_mission_idx
  ON public.agent_assignments (mission_id, created_at DESC)
  WHERE mission_id IS NOT NULL;

ALTER TABLE public.agent_findings
  ADD COLUMN IF NOT EXISTS mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agent_findings_mission_idx
  ON public.agent_findings (mission_id, finding_type, created_at DESC)
  WHERE mission_id IS NOT NULL;

-- `applied`: the employee wrote this fact onto a record itself, under the
-- mission rule. Distinct from `accepted`, which means a person accepted it,
-- and from `pending`, which is still somebody's decision. Readers that ask
-- for pending decisions are unaffected by construction.
ALTER TABLE public.agent_findings DROP CONSTRAINT IF EXISTS agent_findings_status_check;
ALTER TABLE public.agent_findings
  ADD CONSTRAINT agent_findings_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'applied'));

-- ── provenance on the records an employee may now create ────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS found_by_agent_instance_id uuid REFERENCES public.agent_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS found_in_mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS found_by_agent_instance_id uuid REFERENCES public.agent_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS found_in_mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- A verification is somebody's. An unattributed "verified" is exactly the
-- unfalsifiable claim the rest of this schema refuses.
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_verified_by_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_verified_by_check
  CHECK (verified_at IS NULL OR verified_by IS NOT NULL);

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_verified_by_check;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_verified_by_check
  CHECK (verified_at IS NULL OR verified_by IS NOT NULL);

COMMENT ON COLUMN public.companies.found_by_agent_instance_id IS
  'Set when an employee created this record itself. With verified_at empty, the row is agent-found and unverified.';
COMMENT ON COLUMN public.contacts.found_by_agent_instance_id IS
  'Set when an employee created this record itself. With verified_at empty, the row is agent-found and unverified.';

-- ── a conversation with a person found in a mission can be recorded ─────────
--
-- The contact log could only be written against a buyer contact (which needs
-- a project) or an inbound requisition. A person Scout found for a mission is
-- neither, so pressing "Sent" beside them had nowhere to go. The ledger's
-- human-confirmation guard applies to these rows exactly as to the others.

ALTER TABLE public.outreach_drafts
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.commercial_actions
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS outreach_drafts_contact_idx
  ON public.outreach_drafts (org_id, contact_id)
  WHERE contact_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
