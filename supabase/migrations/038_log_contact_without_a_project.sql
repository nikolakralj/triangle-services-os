-- 038 — a conversation does not need a project to have happened
--
-- outreach_drafts.project_id was NOT NULL, so an attempt could only be
-- recorded against a discovered project. That is wrong for most of the
-- conversations this company actually has:
--
--   * replying to Oliver Hall at g2 Recruitment about a live requisition
--   * building a relationship with Hays before any specific job exists
--   * a call to a contractor's procurement desk about future crew supply
--
-- None of those have a discovered project behind them, and inventing one so
-- the record fits the schema would put a fake project in the pipeline to hold
-- a real phone call. The company's own history — two million euro of Siemens
-- Mobility work through Hays — began as exactly this kind of conversation.
--
-- job_lead_id ties an attempt to the inbound requisition it answers, so a
-- reply to a recruiter is filed against the thing being replied to rather
-- than floating free.

ALTER TABLE outreach_drafts
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE outreach_drafts
  ADD COLUMN IF NOT EXISTS job_lead_id uuid REFERENCES job_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS outreach_drafts_job_lead_idx
  ON outreach_drafts (org_id, job_lead_id)
  WHERE job_lead_id IS NOT NULL;

COMMENT ON COLUMN outreach_drafts.project_id IS
  'The discovered project this concerns, when there is one. Null for agency and relationship conversations that precede any project.';
COMMENT ON COLUMN outreach_drafts.job_lead_id IS
  'The inbound requisition this answers, when it answers one.';

NOTIFY pgrst, 'reload schema';
