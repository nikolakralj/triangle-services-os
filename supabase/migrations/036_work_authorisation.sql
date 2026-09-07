-- 036 — where a person is actually allowed to work
--
-- Asked for two electrical supervisors for a steel job in the USA, Hanna
-- answered honestly that she could not: work authorisation, visas and the
-- country a ticket is valid in were not in this database at all. For anything
-- outside the EU that is not a detail, it is the whole answer — a supervisor
-- who cannot legally stand on the site is not a candidate.
--
-- Three columns, not a compliance module.
--
--   nationality        the passport. For an EU/EEA/Swiss national this alone
--                      settles the right to work across the EU, so it does far
--                      more work than a list of countries would.
--   work_authorisation anywhere else they are cleared to work — 'UK', 'US',
--                      'CA'. Only what somebody has actually established.
--   visa_notes         the qualifying sentence: which visa, expiring when,
--                      sponsorship needed or not.
--
-- Deliberately not modelled as visa records with types and expiry dates. That
-- is a compliance product, and nobody here is going to keep it up to date; a
-- sentence a human wrote and can read back is worth more than a form with
-- stale fields in it. Existing has_passport and has_a1_possible stay as they
-- are.

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS work_authorisation text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visa_notes text;

COMMENT ON COLUMN workers.nationality IS
  'Passport nationality. An EU/EEA/CH nationality carries the right to work across the EU without a visa.';
COMMENT ON COLUMN workers.work_authorisation IS
  'Countries outside their nationality where the right to work has been established. Empty means nobody has checked, not that they cannot.';
COMMENT ON COLUMN workers.visa_notes IS
  'The qualifying detail in a sentence: which visa, expiring when, sponsorship needed.';

NOTIFY pgrst, 'reload schema';
