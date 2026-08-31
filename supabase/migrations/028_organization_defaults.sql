-- ============================================================
-- Migration 028: Seed operating defaults for every organization
-- ============================================================
-- A new tenant must not depend on the Triangle-only seed.sql file. This
-- trigger creates the minimum pipeline and vendor-readiness checklist needed
-- for the application to work immediately after organization creation.

create or replace function public.seed_organization_operating_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pipeline_stages (
    organization_id, key, name, description, sort_order, color,
    is_default, is_won, is_lost
  )
  values
    (new.id, 'target_identified', 'Target identified', 'Company or opportunity has been identified.', 1, 'slate', true, false, false),
    (new.id, 'contact_found', 'Contact found', 'Useful person or department identified.', 2, 'sky', true, false, false),
    (new.id, 'first_email_sent', 'First email sent', 'Initial outreach sent manually.', 3, 'blue', true, false, false),
    (new.id, 'call_attempted', 'Call attempted', 'Phone outreach attempted.', 4, 'cyan', true, false, false),
    (new.id, 'connected', 'Connected', 'Conversation started.', 5, 'teal', true, false, false),
    (new.id, 'need_confirmed', 'Need confirmed', 'A specific buyer requirement is confirmed.', 6, 'emerald', true, false, false),
    (new.id, 'documents_requested', 'Documents requested', 'Company or worker documents are being exchanged.', 7, 'amber', true, false, false),
    (new.id, 'vendor_registration', 'Vendor registration', 'Supplier onboarding or approval is active.', 8, 'orange', true, false, false),
    (new.id, 'rfq_received', 'RFQ received', 'The buyer requested pricing or a formal offer.', 9, 'purple', true, false, false),
    (new.id, 'offer_sent', 'Offer sent', 'A commercial proposal was sent.', 10, 'indigo', true, false, false),
    (new.id, 'negotiation', 'Negotiation', 'Scope, pricing, timing, or delivery terms are active.', 11, 'fuchsia', true, false, false),
    (new.id, 'won', 'Won', 'A real agreement or placement was confirmed.', 12, 'green', true, true, false),
    (new.id, 'lost', 'Lost', 'Closed without an active next step.', 13, 'rose', true, false, true),
    (new.id, 'nurture', 'Nurture', 'A dated longer-term relationship follow-up exists.', 14, 'stone', true, false, false)
  on conflict (organization_id, key) do nothing;

  insert into public.document_checklist_items (
    organization_id, title, category, status
  )
  values
    (new.id, 'Company registration', 'Company documents', 'missing'),
    (new.id, 'VAT number', 'Company documents', 'missing'),
    (new.id, 'Insurance certificate', 'Company documents', 'missing'),
    (new.id, 'Bank details', 'Company documents', 'missing'),
    (new.id, 'Safety policy', 'Compliance / Safety', 'missing'),
    (new.id, 'Basic HSE manual', 'Compliance / Safety', 'missing'),
    (new.id, 'Incident reporting procedure', 'Compliance / Safety', 'missing'),
    (new.id, 'Worker onboarding checklist', 'Compliance / Safety', 'missing'),
    (new.id, 'Sample timesheet', 'Worker documents', 'missing'),
    (new.id, 'Sample daily report', 'Worker documents', 'missing'),
    (new.id, 'Sample crew CV format', 'Worker documents', 'missing'),
    (new.id, 'List of available roles', 'Sales documents', 'missing'),
    (new.id, 'Reference project sheet', 'Sales documents', 'missing'),
    (new.id, 'Anti-corruption statement', 'Sales documents', 'missing'),
    (new.id, 'GDPR/privacy statement', 'Sales documents', 'missing'),
    (new.id, 'Subcontractor agreement template', 'Sales documents', 'missing'),
    (new.id, 'Worker document checklist', 'Sales documents', 'missing'),
    (new.id, 'A1/posting process description', 'Project documents', 'missing'),
    (new.id, 'Accommodation/transport process', 'Project documents', 'missing'),
    (new.id, 'Rate card or pricing model', 'Sales documents', 'missing'),
    (new.id, 'Capability statement', 'Sales documents', 'missing')
  on conflict (organization_id, title) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_organization_operating_defaults_trigger
  on public.organizations;

create trigger seed_organization_operating_defaults_trigger
after insert on public.organizations
for each row execute function public.seed_organization_operating_defaults();

-- Backfill existing organizations idempotently by invoking the same logic via
-- explicit inserts. Existing custom rows win because of the unique keys.
insert into public.pipeline_stages (
  organization_id, key, name, description, sort_order, color,
  is_default, is_won, is_lost
)
select organization.id, stage.key, stage.name, stage.description,
       stage.sort_order, stage.color, true, stage.is_won, stage.is_lost
from public.organizations organization
cross join (
  values
    ('target_identified', 'Target identified', 'Company or opportunity has been identified.', 1, 'slate', false, false),
    ('contact_found', 'Contact found', 'Useful person or department identified.', 2, 'sky', false, false),
    ('first_email_sent', 'First email sent', 'Initial outreach sent manually.', 3, 'blue', false, false),
    ('call_attempted', 'Call attempted', 'Phone outreach attempted.', 4, 'cyan', false, false),
    ('connected', 'Connected', 'Conversation started.', 5, 'teal', false, false),
    ('need_confirmed', 'Need confirmed', 'A specific buyer requirement is confirmed.', 6, 'emerald', false, false),
    ('documents_requested', 'Documents requested', 'Company or worker documents are being exchanged.', 7, 'amber', false, false),
    ('vendor_registration', 'Vendor registration', 'Supplier onboarding or approval is active.', 8, 'orange', false, false),
    ('rfq_received', 'RFQ received', 'The buyer requested pricing or a formal offer.', 9, 'purple', false, false),
    ('offer_sent', 'Offer sent', 'A commercial proposal was sent.', 10, 'indigo', false, false),
    ('negotiation', 'Negotiation', 'Scope, pricing, timing, or delivery terms are active.', 11, 'fuchsia', false, false),
    ('won', 'Won', 'A real agreement or placement was confirmed.', 12, 'green', true, false),
    ('lost', 'Lost', 'Closed without an active next step.', 13, 'rose', false, true),
    ('nurture', 'Nurture', 'A dated longer-term relationship follow-up exists.', 14, 'stone', false, false)
) as stage(key, name, description, sort_order, color, is_won, is_lost)
on conflict (organization_id, key) do nothing;

insert into public.document_checklist_items (
  organization_id, title, category, status
)
select organization.id, checklist.title, checklist.category, 'missing'
from public.organizations organization
cross join (
  values
    ('Company registration', 'Company documents'),
    ('VAT number', 'Company documents'),
    ('Insurance certificate', 'Company documents'),
    ('Bank details', 'Company documents'),
    ('Safety policy', 'Compliance / Safety'),
    ('Basic HSE manual', 'Compliance / Safety'),
    ('Incident reporting procedure', 'Compliance / Safety'),
    ('Worker onboarding checklist', 'Compliance / Safety'),
    ('Sample timesheet', 'Worker documents'),
    ('Sample daily report', 'Worker documents'),
    ('Sample crew CV format', 'Worker documents'),
    ('List of available roles', 'Sales documents'),
    ('Reference project sheet', 'Sales documents'),
    ('Anti-corruption statement', 'Sales documents'),
    ('GDPR/privacy statement', 'Sales documents'),
    ('Subcontractor agreement template', 'Sales documents'),
    ('Worker document checklist', 'Sales documents'),
    ('A1/posting process description', 'Project documents'),
    ('Accommodation/transport process', 'Project documents'),
    ('Rate card or pricing model', 'Sales documents'),
    ('Capability statement', 'Sales documents')
) as checklist(title, category)
on conflict (organization_id, title) do nothing;

notify pgrst, 'reload schema';
