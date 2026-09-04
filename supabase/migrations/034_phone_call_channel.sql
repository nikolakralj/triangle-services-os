-- 034 — a phone call is a way of contacting someone
--
-- The outreach_channel enum knew about email and LinkedIn only. That was fine
-- while every route to a buyer was a mailbox. It stopped being fine the day
-- Scout came back from jsmgroup.com and tatasteeluk.com with two published
-- switchboard numbers and a written sentence to say on each — the best assets
-- in the database, and the one kind of contact the system could not record.
--
-- Without this, a CEO who picks up the phone and gets through has nowhere to
-- say so. The ledger stays empty, and the app goes on telling them to do the
-- thing they already did.
--
-- commercial_actions.action_type already allows 'call'; only the draft-side
-- enum was missing.

ALTER TYPE outreach_channel ADD VALUE IF NOT EXISTS 'phone_call';

NOTIFY pgrst, 'reload schema';
