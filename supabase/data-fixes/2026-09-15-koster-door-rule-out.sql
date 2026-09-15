-- DEV-005 data fix 2 of 2 — Köster department phone is not a sourced door
--
-- DO NOT APPLY until Nikola says yes. This writes the live shared database.
--
-- On 15 September the source check found +49 541 998-1400 on none of the
-- three cited koester-bau.de pages, but the door is still stored as reachable.
-- Acceptance: rule it out so it stops presenting as a good reachable door.
--
-- What this does, matching markNotForUs / Today filters:
--   * contacts.do_not_contact = true for that department number
--   * companies.do_not_contact = true for the koester-bau.de company (or the
--     company that owns the number)
--   * agent_findings.status = rejected with the source-check reason
--
-- How to run:
--   1. Run only the PREVIEW queries. Expect the Köster company, the 998-1400
--      contact, and the reachable finding(s).
--   2. If those are the right rows, run the APPLY transaction.
--   3. Confirm Today no longer offers that number, and the mission shows
--      Köster as ruled out.

-- ========== PREVIEW ==========

select id, name, website, website_domain, company_status, do_not_contact
from public.companies
where coalesce(website_domain, '') ilike '%koester-bau%'
   or coalesce(website, '') ilike '%koester-bau%'
   or name ~* 'k(ö|oe|o)ster';

select
  c.id,
  c.full_name,
  c.job_title,
  c.phone,
  c.mobile,
  c.do_not_contact,
  c.company_id,
  co.name as company_name
from public.contacts c
left join public.companies co on co.id = c.company_id
where regexp_replace(coalesce(c.phone, '') || coalesce(c.mobile, ''), '[^0-9]', '', 'g')
        like '%5419981400%';

select
  f.id,
  f.mission_id,
  f.finding_type,
  f.finding_state,
  f.status,
  f.promoted_entity_id,
  f.source_url,
  f.payload->>'value' as channel_value,
  f.payload->>'company_name' as company_name
from public.agent_findings f
where f.finding_type in ('company', 'contact')
  and (
    regexp_replace(coalesce(f.payload->>'value', ''), '[^0-9]', '', 'g') like '%5419981400%'
    or coalesce(f.source_url, '') ilike '%koester-bau%'
    or coalesce(f.payload->>'company_name', '') ~* 'k(ö|oe|o)ster'
  );

-- ========== APPLY ==========
-- Stop here unless the preview is the Köster door.

begin;

update public.contacts c
set
  do_not_contact = true,
  notes = left(
    concat_ws(
      E'\n',
      nullif(btrim(coalesce(c.notes, '')), ''),
      'Not for us (' || to_char(timezone('utc', now()), 'YYYY-MM-DD')
        || '): Department phone +49 541 998-1400 does not appear on the cited koester-bau.de pages (source check, 15 September 2026). Ruled out so it stops presenting as a reachable door.'
    ),
    8000
  ),
  updated_at = now()
where regexp_replace(coalesce(c.phone, '') || coalesce(c.mobile, ''), '[^0-9]', '', 'g')
        like '%5419981400%';

update public.companies co
set
  do_not_contact = true,
  notes = left(
    concat_ws(
      E'\n',
      nullif(btrim(coalesce(co.notes, '')), ''),
      'Not for us (' || to_char(timezone('utc', now()), 'YYYY-MM-DD')
        || '): Department phone +49 541 998-1400 does not appear on the cited koester-bau.de pages (source check, 15 September 2026). Ruled out so it stops presenting as a reachable door.'
    ),
    8000
  ),
  updated_at = now()
where coalesce(co.website_domain, '') ilike '%koester-bau%'
   or coalesce(co.website, '') ilike '%koester-bau%'
   or co.id in (
        select c.company_id from public.contacts c
        where c.company_id is not null
          and regexp_replace(coalesce(c.phone, '') || coalesce(c.mobile, ''), '[^0-9]', '', 'g')
                like '%5419981400%'
      );

update public.agent_findings f
set
  status = 'rejected',
  reviewed_at = now(),
  payload = coalesce(f.payload, '{}'::jsonb) || jsonb_build_object(
    'rejected_reason',
    'Department phone +49 541 998-1400 does not appear on the cited koester-bau.de pages (source check, 15 September 2026). Ruled out so it stops presenting as a reachable door.'
  )
where f.status is distinct from 'rejected'
  and f.finding_type in ('company', 'contact')
  and (
    regexp_replace(coalesce(f.payload->>'value', ''), '[^0-9]', '', 'g') like '%5419981400%'
    or f.promoted_entity_id in (
      select c.id from public.contacts c
      where regexp_replace(coalesce(c.phone, '') || coalesce(c.mobile, ''), '[^0-9]', '', 'g')
              like '%5419981400%'
    )
    or f.promoted_entity_id in (
      select co.id from public.companies co
      where coalesce(co.website_domain, '') ilike '%koester-bau%'
         or coalesce(co.website, '') ilike '%koester-bau%'
         or co.id in (
              select c.company_id from public.contacts c
              where c.company_id is not null
                and regexp_replace(coalesce(c.phone, '') || coalesce(c.mobile, ''), '[^0-9]', '', 'g')
                      like '%5419981400%'
            )
    )
    or coalesce(f.payload->>'company_id', '') in (
      select co.id::text from public.companies co
      where coalesce(co.website_domain, '') ilike '%koester-bau%'
         or coalesce(co.website, '') ilike '%koester-bau%'
    )
  );

commit;

-- Confirm
select id, name, do_not_contact
from public.companies
where coalesce(website_domain, '') ilike '%koester-bau%'
   or coalesce(website, '') ilike '%koester-bau%';

select id, full_name, phone, do_not_contact
from public.contacts
where regexp_replace(coalesce(phone, '') || coalesce(mobile, ''), '[^0-9]', '', 'g')
        like '%5419981400%';

select id, finding_type, finding_state, status, payload->>'rejected_reason' as reason
from public.agent_findings
where payload->>'rejected_reason' ilike '%998-1400%';
