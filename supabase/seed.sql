insert into public.organizations (id, name, legal_name, country, website)
values (
  '00000000-0000-0000-0000-000000000001',
  'Triangle Services',
  'Triangle Services',
  'Croatia',
  null
)
on conflict (id) do update set name = excluded.name;

insert into public.pipeline_stages (id, organization_id, key, name, description, sort_order, color, is_default, is_won, is_lost)
values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','target_identified','Target identified','Company or opportunity has been identified.',1,'slate',true,false,false),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','contact_found','Contact found','Useful person or department identified.',2,'sky',true,false,false),
('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','first_email_sent','First email sent','Initial outreach sent manually.',3,'blue',true,false,false),
('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','call_attempted','Call attempted','Phone outreach attempted.',4,'cyan',true,false,false),
('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','connected','Connected','Conversation started.',5,'teal',true,false,false),
('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001','need_confirmed','Need confirmed','Potential manpower, subcontracting, vendor or project need.',6,'emerald',true,false,false),
('10000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001','documents_requested','Documents requested','Company or vendor documents are being exchanged.',7,'amber',true,false,false),
('10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000001','vendor_registration','Vendor registration','Supplier onboarding or approval is active.',8,'orange',true,false,false),
('10000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000001','rfq_received','RFQ received','Client requested pricing or formal offer.',9,'purple',true,false,false),
('10000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','offer_sent','Offer sent','Commercial proposal sent.',10,'indigo',true,false,false),
('10000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','negotiation','Negotiation','Commercial, scope or availability details are active.',11,'fuchsia',true,false,false),
('10000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001','won','Won','Approved client, supplier relationship or project.',12,'green',true,true,false),
('10000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000001','lost','Lost','Closed without active next step.',13,'rose',true,false,true),
('10000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000001','nurture','Nurture','Longer-term relationship follow-up.',14,'stone',true,false,false)
on conflict (organization_id, key) do update set name = excluded.name, sort_order = excluded.sort_order;

insert into public.document_checklist_items (organization_id, title, category, status)
values
('00000000-0000-0000-0000-000000000001','Company registration','Company documents','missing'),
('00000000-0000-0000-0000-000000000001','VAT number','Company documents','missing'),
('00000000-0000-0000-0000-000000000001','Insurance certificate','Company documents','missing'),
('00000000-0000-0000-0000-000000000001','Bank details','Company documents','missing'),
('00000000-0000-0000-0000-000000000001','Safety policy','Compliance / Safety','draft'),
('00000000-0000-0000-0000-000000000001','Basic HSE manual','Compliance / Safety','draft'),
('00000000-0000-0000-0000-000000000001','Incident reporting procedure','Compliance / Safety','missing'),
('00000000-0000-0000-0000-000000000001','Worker onboarding checklist','Compliance / Safety','missing'),
('00000000-0000-0000-0000-000000000001','Sample timesheet','Worker documents','missing'),
('00000000-0000-0000-0000-000000000001','Sample daily report','Worker documents','missing'),
('00000000-0000-0000-0000-000000000001','Sample crew CV format','Worker documents','missing'),
('00000000-0000-0000-0000-000000000001','List of available roles','Sales documents','missing'),
('00000000-0000-0000-0000-000000000001','Reference project sheet','Sales documents','missing'),
('00000000-0000-0000-0000-000000000001','Anti-corruption statement','Sales documents','draft'),
('00000000-0000-0000-0000-000000000001','GDPR/privacy statement','Sales documents','draft'),
('00000000-0000-0000-0000-000000000001','Subcontractor agreement template','Sales documents','missing'),
('00000000-0000-0000-0000-000000000001','Worker document checklist','Sales documents','missing'),
('00000000-0000-0000-0000-000000000001','A1/posting process description','Project documents','missing'),
('00000000-0000-0000-0000-000000000001','Accommodation/transport process','Project documents','missing'),
('00000000-0000-0000-0000-000000000001','Rate card or pricing model','Sales documents','missing'),
('00000000-0000-0000-0000-000000000001','Capability statement','Sales documents','missing')
on conflict (organization_id, title) do nothing;

insert into public.companies (
  id, organization_id, name, legal_name, company_type, company_status, country, city,
  website, website_domain, source_url, sectors, target_countries, priority, lead_score,
  lead_score_reason, description, current_projects, pain_points, next_action_at
)
values
('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','AlpenTech MEP GmbH','AlpenTech MEP GmbH','mep_contractor','contact_found','Austria','Vienna','https://alpentech-mep.example','alpentech-mep.example','https://example.com/projects/vienna-dc',array['Data center','MEP','Electrical installation'],array['Austria','Germany'],'high',21,'Active in Austria data-center MEP work.','MEP contractor with Austrian references.','Vienna region data-center package.','Peak-load electrical installation crews.',now() + interval '3 days'),
('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','NordRail Systems AG','NordRail Systems AG','rail_oem','contacted','Germany','Munich','https://nordrail.example','nordrail.example','https://example.com/rail-retrofit-contract',array['Rail / rolling stock','Electrical installation','Commissioning'],array['Germany','Austria'],'critical',23,'Rail retrofit work maps directly to Triangle capability.','Rolling-stock modernization supplier.','Fleet retrofit program.','Reliable retrofit crews and supervision.',now() + interval '1 day')
on conflict (id) do nothing;

insert into public.contacts (id, organization_id, company_id, full_name, job_title, role_category, email, language, country, priority, next_action_at)
values
('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Martin Weber','Electrical Project Manager','project_manager','martin.weber@example.com','German','Austria','high',now() + interval '3 days'),
('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','Anna Schuster','Head of Subcontracting','subcontracting','anna.schuster@example.com','German','Germany','critical',now() + interval '1 day')
on conflict (id) do nothing;

insert into public.opportunities (id, organization_id, company_id, primary_contact_id, stage_id, title, opportunity_type, sector, country, estimated_value, currency, probability, estimated_crew_size, expected_start_date, expected_duration_weeks, scope_summary, client_need, next_step, next_action_at)
values
('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000006','Vienna data-center electrical crew support','data_center_electrical','Data center','Austria',185000,'EUR',45,8,'2026-06-03',14,'Supervised electrical installation crew for cable tray, cabling support and site reporting.','Reliable peak-load crew with documentation discipline.','Send capability summary and ask for vendor registration process.',now() + interval '3 days'),
('40000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','Rail retrofit electrical team intro','rail_retrofit_crew','Rail / rolling stock','Germany',240000,'EUR',25,6,'2026-07-15',20,'Rail retrofit team introduction.','Reliable retrofit crew and electrical supervision.','Follow up with short German capability note.',now() + interval '1 day')
on conflict (id) do nothing;

insert into public.workers (id, organization_id, full_name, role, worker_type, country, city, languages, skills, certificates, industries, availability_status, available_from, preferred_countries, daily_rate_expectation, reliability_score, quality_score, safety_score, has_a1_possible, has_own_tools, has_car, status)
values
('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Ivan Horvat','electrical_supervisor','freelancer','Croatia','Zagreb',array['Croatian','English','German'],array['Site supervision','Cable tray','Daily reporting'],array['VCA','A1 possible'],array['Data center','Industrial construction'],'available_soon','2026-05-10',array['Austria','Germany'],320,5,5,4,true,true,true,'active')
on conflict (id) do nothing;

insert into public.tasks (id, organization_id, title, related_entity_type, related_entity_id, priority, status, due_date)
values
('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Follow up with NordRail after first email','opportunity','40000000-0000-0000-0000-000000000002','critical','open','2026-04-25'),
('60000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Prepare vendor document checklist','company','20000000-0000-0000-0000-000000000001','high','in_progress','2026-04-26')
on conflict (id) do nothing;
