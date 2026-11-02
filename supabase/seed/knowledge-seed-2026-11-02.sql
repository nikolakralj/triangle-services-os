-- NOT A MIGRATION. Nothing in this repository applies this file.
-- supabase/seed.sql is the file the Supabase CLI runs. This one is not.
-- Do not apply it from a coding agent. Nikola runs it by hand after migration
-- 057_knowledge_items.sql.
--
-- Six filtering decisions Nikola gave by voice on 2 November 2026, inserted
-- as status 'proposed'. Re-running is safe: a row with the same source_ref
-- for that organization is left as it is.
--
-- The organization is the oldest row named Triangle Services. No id is
-- hardcoded.
--
-- Role keys checked in code on 2 Nov 2026:
--   hr                  hire preset for Hanna (src/lib/data/agent-scopes.ts).
--                       A badge named triangle_hr is stored as role_key hr,
--                       because hiring strips the triangle_ prefix.
--   inbox_coordinator   Bob's role_key (migration 023, and the preferred
--                       role in src/lib/data/event-outbox.ts).
-- triangle_hr, resourcing, inbox_courier and commercial_ops are aliases the
-- routers also accept. They are not the keys stored for the current
-- employees, so they are not in applies_to_roles.
-- Rules 1 to 3 name those two roles. Rules 4 to 6 leave applies_to_roles
-- empty, which means every employee: they are "do not contact" decisions.
--
-- worker_id stays null unless exactly one workers.full_name matches. Rules
-- 4 and 6 name several people, so they are never linked. Rule 5 links
-- Teodor only when one worker row matches Luposoru or Lupusoru.

do $$
declare
  org_count int;
begin
  select count(*) into org_count
  from public.organizations
  where name = 'Triangle Services';
  if org_count = 0 then
    raise exception 'No organization named Triangle Services. Nothing was inserted.';
  elsif org_count > 1 then
    raise notice 'More than one organization named Triangle Services. Using the oldest.';
  end if;
end $$;

with org as (
  select id
  from public.organizations
  where name = 'Triangle Services'
  order by created_at
  limit 1
),
rows as (
  select *
  from (values
    (
      'house_rule'::text,
      'candidate-filtering'::text,
      'Never discuss rates with a candidate'::text,
      'Never discuss or show rates/prices with any candidate. Rates are only discussed between Nikola and Ralph.'::text,
      array['hr', 'inbox_coordinator']::text[],
      'nikola-voice-2026-11-02:rule-1'::text,
      'Never discuss or show rates/prices with any candidate. Rates are only discussed between Nikola and Ralph.'::text,
      null::text
    ),
    (
      'house_rule',
      'candidate-filtering',
      'First contact must not mention costs',
      'First-contact messages to candidates must not mention costs (accommodation, car, fuel, flights). Those are discussed during negotiations only.',
      array['hr', 'inbox_coordinator']::text[],
      'nikola-voice-2026-11-02:rule-2',
      'First-contact messages to candidates must not mention costs (accommodation, car, fuel, flights). Those are discussed during negotiations only.',
      null
    ),
    (
      'process',
      'candidate-filtering',
      'Approved first-contact template',
      $body$The approved first-contact template is candidate_outreach_template.txt: greeting "Postovani [Name],", USA and Europe projects, no rate numbers, no cost details, vague pay wording at most, signature Nikola Kralj Partner and Ralph Loesekamm CEO.

Predmet: Ugovorni angazman - elektro i automatizacija, SAD i Europa

Postovani [Name],

ja sam Nikola Kralj, partner u tvrtki Triangle Services, s uredima u Bugarskoj i odnedavno u Hrvatskoj. Za projekte u SAD-u i Europi trazimo strucnjake za elektro i automatizaciju na ugovornoj osnovi, na senior/lead i mid-level razini.

Biste li bili otvoreni za ugovorni angazman? Rado cu Vam poslati detalje ili se mozemo kratko cuti telefonom.

S postovanjem,

Nikola Kralj
Partner, Triangle Services
+385 97 762 9726

Ralph Loesekamm
CEO, Triangle Services
+49 175 2040989
$body$,
      array['hr', 'inbox_coordinator']::text[],
      'nikola-voice-2026-11-02:rule-3',
      'The approved first-contact template is candidate_outreach_template.txt (/workspace/offers/candidate_outreach_template.txt): greeting "Postovani [Name],", USA and Europe projects, no rate numbers, no cost details, vague pay wording at most, signature Nikola Kralj Partner and Ralph Loesekamm CEO.',
      null
    ),
    (
      'worker_note',
      'candidate-filtering',
      'SysTech group: only Domagoj Marijanovic is a fit',
      'From the former SysTech (Danieli Systec) Automation group, only Domagoj Marijanovic is a fit to contact. The others are top project managers and company owners and should not be contacted.',
      '{}'::text[],
      'nikola-voice-2026-11-02:rule-4',
      'From the former SysTech (Danieli Systec) Automation group, only Domagoj Marijanovic is a fit to contact. The others are top project managers and company owners and should not be contacted.',
      null
    ),
    (
      'worker_note',
      'candidate-filtering',
      'Skip Teodor Luposoru',
      'Teodor Luposoru (employed at ILLIG Packaging Solutions, 26+ years experience) is skipped: not a good fit for this contract role.',
      '{}'::text[],
      'nikola-voice-2026-11-02:rule-5',
      'Teodor Luposoru (employed at ILLIG Packaging Solutions, 26+ years experience) is skipped: not a good fit for this contract role.',
      'teodor'
    ),
    (
      'worker_note',
      'candidate-filtering',
      'Leave out Svrznjak, Togea, Popa, Nilic, Stroe and Novakovic',
      'Of the 26 candidates, the six weak fits to leave out are Svrznjak and Togea (company owners), Popa and Nilic (senior managers), Ionel Stroe (about 42 years experience), and Novakovic (in Abu Dhabi).',
      '{}'::text[],
      'nikola-voice-2026-11-02:rule-6',
      'Of the 26 candidates, the six weak fits to leave out are Svrznjak and Togea (company owners), Popa and Nilic (senior managers), Ionel Stroe (about 42 years experience), and Novakovic (in Abu Dhabi).',
      null
    )
  ) as v(category, topic, title, body, applies_to_roles, source_ref, quote, worker_match)
)
insert into public.knowledge_items (
  org_id,
  category,
  topic,
  title,
  body,
  applies_to_roles,
  worker_id,
  source_kind,
  source_ref,
  quote,
  said_by,
  said_on,
  status
)
select
  org.id,
  rows.category,
  rows.topic,
  rows.title,
  rows.body,
  rows.applies_to_roles,
  case
    when rows.worker_match = 'teodor' then (
      select case when count(*) = 1 then min(worker.id) else null end
      from public.workers worker
      where worker.organization_id = org.id
        and lower(btrim(worker.full_name)) in ('teodor luposoru', 'teodor lupusoru')
    )
    else null
  end,
  'voice',
  rows.source_ref,
  rows.quote,
  'Nikola',
  date '2026-11-02',
  'proposed'
from org
cross join rows
where not exists (
  select 1
  from public.knowledge_items existing
  where existing.org_id = org.id
    and existing.source_ref = rows.source_ref
);
