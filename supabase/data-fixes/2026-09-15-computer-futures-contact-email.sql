-- DEV-005 data fix 1 of 2 — Computer Futures forwarded-mail contact
--
-- DO NOT APPLY until Nikola says yes. This writes the live shared database.
--
-- Live lead 44a1f9f9-3a57-43b7-963e-bc17e2d77982 currently stores
-- nikola.kralj@triangle-services.com because intake used the envelope sender
-- on a forwarded recruiter email. The recruiter is Veronika Igić
-- <v.igic@computerfutures.at>.
--
-- How to run, after reading the preview:
--   1. Run the SELECT.
--   2. If the row is that Computer Futures requisition with Triangle's own
--      address (or empty), run the UPDATE.
--   3. Confirm contact_email is v.igic@computerfutures.at.
--
-- New forwards are handled in code (contactEmail on ExtractedLead). This
-- script only repairs the one live row already stored.

-- Preview — read this before updating.
select
  id,
  agency_name,
  contact_name,
  contact_email,
  role_title,
  country,
  created_at
from public.job_leads
where id = '44a1f9f9-3a57-43b7-963e-bc17e2d77982';

-- Apply.
update public.job_leads
set
  contact_email = 'v.igic@computerfutures.at',
  contact_name = case
    when contact_name is null
      or btrim(contact_name) = ''
      or contact_name ilike '%triangle%'
      or contact_email ilike '%@triangle-services.com'
    then 'Veronika Igić'
    else contact_name
  end,
  agency_name = coalesce(nullif(btrim(agency_name), ''), 'Computer Futures'),
  updated_at = now()
where id = '44a1f9f9-3a57-43b7-963e-bc17e2d77982'
  and contact_email is distinct from 'v.igic@computerfutures.at';

-- Confirm.
select id, agency_name, contact_name, contact_email
from public.job_leads
where id = '44a1f9f9-3a57-43b7-963e-bc17e2d77982';
