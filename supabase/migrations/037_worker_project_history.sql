-- 037 — the projects a person has actually done
--
-- "Why you didn't put inside his profile all projects he did" — because
-- nothing read them and there was nowhere to put them. The CV reader took a
-- role, a skill list and some tickets, and dropped the part of the document
-- that does the selling.
--
-- Triangle's own CV is nine pages and most of it is this:
--
--   Customer  MMK Iskenderun (Turkey)
--   Project   Down Coiler (Hot Strip Mill) commissioning
--   Position  Automation Engineer
--             (Siemens S7 400 PLC — Step7, WinCC, Intouch)
--
-- A buyer does not buy "PLC commissioning" as a skill. They buy somebody who
-- has commissioned a down coiler at a steel plant, and they want to see where.
-- Skills say what a person claims; project history is the evidence for it.
--
-- Stored as jsonb rather than a table of its own. This is read from a CV and
-- printed onto a CV, never joined, aggregated or queried by column — a table
-- would buy nothing and cost a migration every time the shape moved.

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS work_history jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN workers.work_history IS
  'Projects this person worked on, newest first: [{customer, project, position, period, scope}]. Read from their CV.';

NOTIFY pgrst, 'reload schema';
