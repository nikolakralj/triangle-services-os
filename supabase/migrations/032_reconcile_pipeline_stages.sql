-- 032 — Reconcile pipeline_stages with the canonical list in src/lib/constants.ts
--
-- The board rendered TWENTY columns for one opportunity, with "Vendor
-- registration" appearing twice. Two stage sets had been seeded on top of each
-- other: an older nine-stage funnel (26 April) and a newer eleven-stage one
-- (31 August). Neither matched PIPELINE_STAGES in the application, and between
-- them they produced a pipeline that COULD NOT RECORD A WIN — the set actually
-- in use had no is_won and no is_lost stage, so an opportunity could never
-- reach a terminal state.
--
-- The application already defines the intended fourteen stages, so this is
-- reconciliation, not a product decision.
--
-- Safe to re-run: keyed upserts, and deletes are restricted to keys that are
-- not in the canonical set and carry no opportunities.

begin;

-- 1. The canonical fourteen. Upsert by (organization_id, key).
with canonical(key, name, sort_order, is_won, is_lost, is_default) as (
  values
    ('target_identified',   'Target identified',   1,  false, false, true),
    ('contact_found',       'Contact found',       2,  false, false, false),
    ('first_email_sent',    'First email sent',    3,  false, false, false),
    ('call_attempted',      'Call attempted',      4,  false, false, false),
    ('connected',           'Connected',           5,  false, false, false),
    ('need_confirmed',      'Need confirmed',      6,  false, false, false),
    ('documents_requested', 'Documents requested', 7,  false, false, false),
    ('vendor_registration', 'Vendor registration', 8,  false, false, false),
    ('rfq_received',        'RFQ received',        9,  false, false, false),
    ('offer_sent',          'Offer sent',          10, false, false, false),
    ('negotiation',         'Negotiation',         11, false, false, false),
    ('won',                 'Won',                 12, true,  false, false),
    ('lost',                'Lost',                13, false, true,  false),
    ('nurture',             'Nurture',             14, false, false, false)
)
update public.pipeline_stages s
   set name        = c.name,
       sort_order  = c.sort_order,
       is_won      = c.is_won,
       is_lost     = c.is_lost,
       is_default  = c.is_default,
       updated_at  = now()
  from canonical c
 where s.key = c.key;

-- 2. Any canonical stage this organization is missing.
insert into public.pipeline_stages (organization_id, key, name, sort_order, is_won, is_lost, is_default)
select o.id, c.key, c.name, c.sort_order, c.is_won, c.is_lost, c.is_default
  from public.organizations o
 cross join (
   values
     ('target_identified',   'Target identified',   1,  false, false, true),
     ('contact_found',       'Contact found',       2,  false, false, false),
     ('first_email_sent',    'First email sent',    3,  false, false, false),
     ('call_attempted',      'Call attempted',      4,  false, false, false),
     ('connected',           'Connected',           5,  false, false, false),
     ('need_confirmed',      'Need confirmed',      6,  false, false, false),
     ('documents_requested', 'Documents requested', 7,  false, false, false),
     ('vendor_registration', 'Vendor registration', 8,  false, false, false),
     ('rfq_received',        'RFQ received',        9,  false, false, false),
     ('offer_sent',          'Offer sent',          10, false, false, false),
     ('negotiation',         'Negotiation',         11, false, false, false),
     ('won',                 'Won',                 12, true,  false, false),
     ('lost',                'Lost',                13, false, true,  false),
     ('nurture',             'Nurture',             14, false, false, false)
 ) as c(key, name, sort_order, is_won, is_lost, is_default)
 where not exists (
   select 1 from public.pipeline_stages p
    where p.organization_id = o.id and p.key = c.key
 );

-- 3. Move anything parked on a stage that is about to disappear.
--    "Research" and the other duplicates were early-funnel, so the honest
--    landing place is the entry stage rather than anything further along.
update public.opportunities opp
   set stage_id = (
         select p.id from public.pipeline_stages p
          where p.organization_id = opp.organization_id
            and p.key = 'target_identified'
          limit 1
       )
 where opp.stage_id in (
   select id from public.pipeline_stages
    where key not in (
      'target_identified','contact_found','first_email_sent','call_attempted',
      'connected','need_confirmed','documents_requested','vendor_registration',
      'rfq_received','offer_sent','negotiation','won','lost','nurture'
    )
 );

-- 4. Remove the duplicates, now that nothing points at them.
delete from public.pipeline_stages
 where key not in (
   'target_identified','contact_found','first_email_sent','call_attempted',
   'connected','need_confirmed','documents_requested','vendor_registration',
   'rfq_received','offer_sent','negotiation','won','lost','nurture'
 )
   and not exists (
     select 1 from public.opportunities o where o.stage_id = pipeline_stages.id
   );

commit;

notify pgrst, 'reload schema';
