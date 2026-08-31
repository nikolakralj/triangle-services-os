-- ============================================================
-- Migration 031: Commercial/delivery permissions and integrity
-- ============================================================

-- A timesheet is billable once. Voiding an invoice releases its links below.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoice_timesheets_one_invoice_per_timesheet'
      and conrelid = 'public.invoice_timesheets'::regclass
  ) then
    alter table public.invoice_timesheets
      add constraint invoice_timesheets_one_invoice_per_timesheet unique (timesheet_id);
  end if;
end $$;

create or replace function public.enforce_commercial_delivery_org_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  case tg_table_name
    when 'commercial_requirements' then
      if new.job_lead_id is not null and not exists (
        select 1 from public.job_leads item
        where item.id = new.job_lead_id and item.org_id = new.org_id
      ) then raise exception 'Job lead belongs to another organization'; end if;
      if new.discovered_project_id is not null and not exists (
        select 1 from public.discovered_projects item
        where item.id = new.discovered_project_id and item.organization_id = new.org_id
      ) then raise exception 'Discovered project belongs to another organization'; end if;
      if new.opportunity_id is not null and not exists (
        select 1 from public.opportunities item
        where item.id = new.opportunity_id and item.organization_id = new.org_id
      ) then raise exception 'Opportunity belongs to another organization'; end if;
      if new.project_package_id is not null and not exists (
        select 1 from public.project_packages item
        where item.id = new.project_package_id and item.org_id = new.org_id
      ) then raise exception 'Project package belongs to another organization'; end if;

    when 'buyer_routes' then
      if not exists (
        select 1 from public.commercial_requirements item
        where item.id = new.requirement_id and item.org_id = new.org_id
      ) then raise exception 'Requirement belongs to another organization'; end if;
      if new.discovered_project_id is not null and not exists (
        select 1 from public.discovered_projects item
        where item.id = new.discovered_project_id and item.organization_id = new.org_id
      ) then raise exception 'Discovered project belongs to another organization'; end if;
      if new.chain_node_id is not null and not exists (
        select 1 from public.contractor_chain_nodes item
        where item.id = new.chain_node_id and item.organization_id = new.org_id
      ) then raise exception 'Contractor-chain node belongs to another organization'; end if;
      if new.buyer_contact_id is not null and not exists (
        select 1 from public.buyer_contacts item
        where item.id = new.buyer_contact_id and item.organization_id = new.org_id
      ) then raise exception 'Buyer contact belongs to another organization'; end if;

    when 'commercial_actions' then
      if new.requirement_id is not null and not exists (
        select 1 from public.commercial_requirements item
        where item.id = new.requirement_id and item.org_id = new.org_id
      ) then raise exception 'Requirement belongs to another organization'; end if;
      if new.buyer_route_id is not null and not exists (
        select 1 from public.buyer_routes item
        where item.id = new.buyer_route_id and item.org_id = new.org_id
          and (new.requirement_id is null or item.requirement_id = new.requirement_id)
      ) then raise exception 'Buyer route does not match this requirement and organization'; end if;
      if new.project_package_id is not null and not exists (
        select 1 from public.project_packages item
        where item.id = new.project_package_id and item.org_id = new.org_id
      ) then raise exception 'Project package belongs to another organization'; end if;
      if new.outreach_draft_id is not null and not exists (
        select 1 from public.outreach_drafts item
        where item.id = new.outreach_draft_id and item.org_id = new.org_id
      ) then raise exception 'Outreach draft belongs to another organization'; end if;
      if new.submission_packet_send_id is not null and not exists (
        select 1 from public.submission_packet_sends item
        where item.id = new.submission_packet_send_id and item.org_id = new.org_id
      ) then raise exception 'Packet send belongs to another organization'; end if;

    when 'commercial_orders' then
      if not exists (
        select 1 from public.commercial_requirements item
        where item.id = new.requirement_id and item.org_id = new.org_id
      ) then raise exception 'Requirement belongs to another organization'; end if;
      if new.buyer_route_id is not null and not exists (
        select 1 from public.buyer_routes item
        where item.id = new.buyer_route_id and item.org_id = new.org_id
          and item.requirement_id = new.requirement_id
      ) then raise exception 'Buyer route does not match this requirement and organization'; end if;
      if new.project_package_id is not null and not exists (
        select 1 from public.project_packages item
        where item.id = new.project_package_id and item.org_id = new.org_id
      ) then raise exception 'Project package belongs to another organization'; end if;
      if new.document_id is not null and not exists (
        select 1 from public.documents item
        where item.id = new.document_id and item.organization_id = new.org_id
      ) then raise exception 'Order document belongs to another organization'; end if;

    when 'worker_reservations' then
      if not exists (
        select 1 from public.commercial_requirements item
        where item.id = new.requirement_id and item.org_id = new.org_id
      ) then raise exception 'Requirement belongs to another organization'; end if;
      if new.order_id is not null and not exists (
        select 1 from public.commercial_orders item
        where item.id = new.order_id and item.org_id = new.org_id
          and item.requirement_id = new.requirement_id
      ) then raise exception 'Order does not match this requirement and organization'; end if;
      if new.project_package_id is not null and not exists (
        select 1 from public.project_packages item
        where item.id = new.project_package_id and item.org_id = new.org_id
      ) then raise exception 'Project package belongs to another organization'; end if;
      if not exists (
        select 1 from public.workers item
        where item.id = new.worker_id and item.organization_id = new.org_id
      ) then raise exception 'Worker belongs to another organization'; end if;

    when 'mobilizations' then
      if not exists (
        select 1 from public.commercial_orders item
        where item.id = new.order_id and item.org_id = new.org_id
      ) then raise exception 'Order belongs to another organization'; end if;
      if not exists (
        select 1 from public.workers item
        where item.id = new.worker_id and item.organization_id = new.org_id
      ) then raise exception 'Worker belongs to another organization'; end if;
      if new.reservation_id is not null and not exists (
        select 1 from public.worker_reservations item
        where item.id = new.reservation_id and item.org_id = new.org_id
          and item.order_id = new.order_id and item.worker_id = new.worker_id
      ) then raise exception 'Reservation does not match this worker, order, and organization'; end if;

    when 'mobilization_checklist_items' then
      if not exists (
        select 1 from public.mobilizations item
        where item.id = new.mobilization_id and item.org_id = new.org_id
      ) then raise exception 'Mobilization belongs to another organization'; end if;
      if new.evidence_document_id is not null and not exists (
        select 1 from public.documents item
        where item.id = new.evidence_document_id and item.organization_id = new.org_id
      ) then raise exception 'Checklist evidence belongs to another organization'; end if;

    when 'timesheets' then
      if not exists (
        select 1 from public.commercial_orders item
        where item.id = new.order_id and item.org_id = new.org_id
      ) then raise exception 'Order belongs to another organization'; end if;
      if not exists (
        select 1 from public.workers item
        where item.id = new.worker_id and item.organization_id = new.org_id
      ) then raise exception 'Worker belongs to another organization'; end if;
      if new.mobilization_id is not null and not exists (
        select 1 from public.mobilizations item
        where item.id = new.mobilization_id and item.org_id = new.org_id
          and item.order_id = new.order_id and item.worker_id = new.worker_id
      ) then raise exception 'Mobilization does not match this worker, order, and organization'; end if;
      if new.document_id is not null and not exists (
        select 1 from public.documents item
        where item.id = new.document_id and item.organization_id = new.org_id
      ) then raise exception 'Timesheet document belongs to another organization'; end if;

    when 'invoices' then
      if not exists (
        select 1 from public.commercial_orders item
        where item.id = new.order_id and item.org_id = new.org_id
      ) then raise exception 'Order belongs to another organization'; end if;
      if new.document_id is not null and not exists (
        select 1 from public.documents item
        where item.id = new.document_id and item.organization_id = new.org_id
      ) then raise exception 'Invoice document belongs to another organization'; end if;

    when 'invoice_timesheets' then
      if not exists (
        select 1 from public.invoices invoice
        join public.timesheets timesheet on timesheet.id = new.timesheet_id
        where invoice.id = new.invoice_id
          and invoice.org_id = new.org_id
          and timesheet.org_id = new.org_id
          and invoice.order_id = timesheet.order_id
      ) then raise exception 'Invoice and timesheet must share an order and organization'; end if;

    when 'payments' then
      if not exists (
        select 1 from public.invoices item
        where item.id = new.invoice_id and item.org_id = new.org_id
      ) then raise exception 'Invoice belongs to another organization'; end if;

    when 'delivery_costs' then
      if not exists (
        select 1 from public.commercial_orders item
        where item.id = new.order_id and item.org_id = new.org_id
      ) then raise exception 'Order belongs to another organization'; end if;
      if new.mobilization_id is not null and not exists (
        select 1 from public.mobilizations item
        where item.id = new.mobilization_id and item.org_id = new.org_id
          and item.order_id = new.order_id
      ) then raise exception 'Mobilization does not match this order and organization'; end if;
      if new.worker_id is not null and not exists (
        select 1 from public.workers item
        where item.id = new.worker_id and item.organization_id = new.org_id
      ) then raise exception 'Worker belongs to another organization'; end if;
      if new.evidence_document_id is not null and not exists (
        select 1 from public.documents item
        where item.id = new.evidence_document_id and item.organization_id = new.org_id
      ) then raise exception 'Cost evidence belongs to another organization'; end if;
  end case;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'commercial_requirements','buyer_routes','commercial_actions',
    'commercial_orders','worker_reservations','mobilizations',
    'mobilization_checklist_items','timesheets','invoices',
    'invoice_timesheets','payments','delivery_costs'
  ] loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'enforce_' || table_name || '_org_consistency', table_name
    );
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.enforce_commercial_delivery_org_consistency()',
      'enforce_' || table_name || '_org_consistency', table_name
    );
  end loop;
end $$;

create or replace function public.enforce_order_truth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('signed','active','completed') then
    if new.signed_at is null or new.human_approved_at is null or new.human_approved_by is null then
      raise exception 'A signed/active order requires signed time and human approval';
    end if;
    if coalesce(trim(new.external_reference), '') = ''
       or coalesce(trim(new.buyer_contracting_entity), '') = ''
       or coalesce(trim(new.supplier_legal_entity), '') = '' then
      raise exception 'A signed/active order requires reference and both contracting entities';
    end if;
    if new.start_date is null or new.payment_terms_days is null
       or jsonb_object_length(new.rate_terms) = 0 then
      raise exception 'A signed/active order requires start date, payment terms, and rate terms';
    end if;
    if not exists (
      select 1 from public.commercial_requirements requirement
      where requirement.id = new.requirement_id
        and requirement.org_id = new.org_id
        and requirement.status in ('qualified','proposal_ready','ordered')
    ) then raise exception 'A signed/active order requires a qualified commercial requirement'; end if;
    if new.buyer_route_id is null or not exists (
      select 1 from public.buyer_routes route
      where route.id = new.buyer_route_id
        and route.requirement_id = new.requirement_id
        and route.org_id = new.org_id
        and route.route_status in ('prequalification','confirmed','approved')
    ) then raise exception 'A signed/active order requires its confirmed buyer or supplier route'; end if;
    if new.status = 'active' and new.activated_at is null then new.activated_at := now(); end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_timesheet_truth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('submitted','client_approved','invoiced') then
    if new.submitted_at is null then new.submitted_at := now(); end if;
    if not exists (
      select 1 from public.commercial_orders orders
      where orders.id = new.order_id and orders.org_id = new.org_id
        and orders.status in ('active','completed','terminated')
    ) then raise exception 'Submitted time requires an active or completed order'; end if;
    if new.mobilization_id is null or not exists (
      select 1 from public.mobilizations item
      where item.id = new.mobilization_id and item.org_id = new.org_id
        and item.order_id = new.order_id and item.worker_id = new.worker_id
        and item.status in ('mobilized','active','completed')
    ) then raise exception 'Submitted time requires a mobilized worker on this order'; end if;
  end if;
  if new.status in ('client_approved','invoiced') and (
    new.client_approved_at is null
    or coalesce(trim(new.client_approver_name), '') = ''
    or coalesce(trim(new.client_approval_evidence), '') = ''
  ) then raise exception 'Client-approved timesheet requires approver, time, and approval evidence'; end if;
  return new;
end;
$$;

create or replace function public.enforce_payment_truth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_org uuid;
  invoice_currency text;
  invoice_status text;
  invoice_total numeric;
  paid_other numeric;
begin
  select org_id, currency, status, total_amount
    into invoice_org, invoice_currency, invoice_status, invoice_total
  from public.invoices
  where id = new.invoice_id
  for update;

  if invoice_org is null or invoice_org <> new.org_id then
    raise exception 'Invoice belongs to another organization';
  end if;
  if invoice_currency <> new.currency then
    raise exception 'Payment currency must match invoice currency';
  end if;
  if invoice_status not in ('sent','part_paid','paid','overdue','disputed') then
    raise exception 'Payment requires a sent invoice';
  end if;

  select coalesce(sum(amount), 0)
    into paid_other
  from public.payments
  where invoice_id = new.invoice_id
    and id <> new.id;

  if paid_other + new.amount > invoice_total + 0.01 then
    raise exception 'Payment exceeds the invoice outstanding amount';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_payment_truth_trigger on public.payments;
create trigger enforce_payment_truth_trigger
before insert or update on public.payments
for each row execute function public.enforce_payment_truth();

create or replace function public.refresh_invoice_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invoice uuid;
  paid_total numeric;
  invoice_total numeric;
begin
  target_invoice := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  select coalesce(sum(amount), 0) into paid_total
  from public.payments where invoice_id = target_invoice;
  select total_amount into invoice_total
  from public.invoices where id = target_invoice;

  update public.invoices
  set status = case
      when paid_total >= invoice_total and invoice_total > 0 then 'paid'
      when paid_total > 0 then 'part_paid'
      when status in ('paid','part_paid') then 'sent'
      else status
    end,
    updated_at = now()
  where id = target_invoice and status not in ('void','disputed');

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.release_void_invoice_timesheets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'void' and old.status <> 'void' then
    update public.timesheets
      set status = 'client_approved', updated_at = now()
    where id in (
      select link.timesheet_id
      from public.invoice_timesheets link
      where link.invoice_id = new.id
    );
    delete from public.invoice_timesheets where invoice_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists release_void_invoice_timesheets_trigger on public.invoices;
create trigger release_void_invoice_timesheets_trigger
after update of status on public.invoices
for each row execute function public.release_void_invoice_timesheets();

create or replace function public.sync_requirement_ordered_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('signed','active','completed')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.commercial_requirements
      set status = 'ordered', updated_by = new.updated_by, updated_at = now()
    where id = new.requirement_id and org_id = new.org_id and status <> 'ordered';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_requirement_ordered_state_trigger on public.commercial_orders;
create trigger sync_requirement_ordered_state_trigger
after insert or update on public.commercial_orders
for each row execute function public.sync_requirement_ordered_state();

-- Replace broad "all members can manage" policies with role-aware policies.
drop policy if exists "org members can manage commercial_requirements" on public.commercial_requirements;
drop policy if exists "members can read commercial_requirements" on public.commercial_requirements;
drop policy if exists "operators can insert commercial_requirements" on public.commercial_requirements;
drop policy if exists "operators can update commercial_requirements" on public.commercial_requirements;
drop policy if exists "admins can delete commercial_requirements" on public.commercial_requirements;
create policy "members can read commercial_requirements" on public.commercial_requirements
  for select using (public.is_org_member(org_id));
create policy "operators can insert commercial_requirements" on public.commercial_requirements
  for insert with check (
    public.current_user_role(org_id) in ('admin','partner')
    or (
      public.current_user_role(org_id) = 'researcher'
      and status in ('draft','needs_information')
      and buyer_confirmed_at is null and qualified_at is null and qualified_by is null
    )
  );
create policy "operators can update commercial_requirements" on public.commercial_requirements
  for update using (public.current_user_role(org_id) in ('admin','partner','researcher'))
  with check (
    public.current_user_role(org_id) in ('admin','partner')
    or (
      public.current_user_role(org_id) = 'researcher'
      and status in ('draft','needs_information')
      and buyer_confirmed_at is null and qualified_at is null and qualified_by is null
    )
  );
create policy "admins can delete commercial_requirements" on public.commercial_requirements
  for delete using (public.current_user_role(org_id) = 'admin');

drop policy if exists "org members can manage buyer_routes" on public.buyer_routes;
drop policy if exists "members can read buyer_routes" on public.buyer_routes;
drop policy if exists "operators can insert buyer_routes" on public.buyer_routes;
drop policy if exists "operators can update buyer_routes" on public.buyer_routes;
drop policy if exists "admins can delete buyer_routes" on public.buyer_routes;
create policy "members can read buyer_routes" on public.buyer_routes
  for select using (public.is_org_member(org_id));
create policy "operators can insert buyer_routes" on public.buyer_routes
  for insert with check (
    public.current_user_role(org_id) in ('admin','partner')
    or (
      public.current_user_role(org_id) = 'researcher'
      and route_status in ('unknown','researching','contact_identified')
      and confirmed_at is null and confirmed_by is null
    )
  );
create policy "operators can update buyer_routes" on public.buyer_routes
  for update using (public.current_user_role(org_id) in ('admin','partner','researcher'))
  with check (
    public.current_user_role(org_id) in ('admin','partner')
    or (
      public.current_user_role(org_id) = 'researcher'
      and route_status in ('unknown','researching','contact_identified')
      and confirmed_at is null and confirmed_by is null
    )
  );
create policy "admins can delete buyer_routes" on public.buyer_routes
  for delete using (public.current_user_role(org_id) = 'admin');

drop policy if exists "org members can manage commercial_actions" on public.commercial_actions;
drop policy if exists "members can read commercial_actions" on public.commercial_actions;
drop policy if exists "operators can insert commercial_actions" on public.commercial_actions;
drop policy if exists "operators can update commercial_actions" on public.commercial_actions;
drop policy if exists "admins can delete commercial_actions" on public.commercial_actions;
create policy "members can read commercial_actions" on public.commercial_actions
  for select using (public.is_org_member(org_id));
create policy "operators can insert commercial_actions" on public.commercial_actions
  for insert with check (
    public.current_user_role(org_id) in ('admin','partner')
    or (
      public.current_user_role(org_id) = 'researcher'
      and status in ('draft','planned','cancelled')
      and human_confirmed_at is null and human_confirmed_by is null
    )
  );
create policy "operators can update commercial_actions" on public.commercial_actions
  for update using (public.current_user_role(org_id) in ('admin','partner','researcher'))
  with check (
    public.current_user_role(org_id) in ('admin','partner')
    or (
      public.current_user_role(org_id) = 'researcher'
      and status in ('draft','planned','cancelled')
      and human_confirmed_at is null and human_confirmed_by is null
    )
  );
create policy "admins can delete commercial_actions" on public.commercial_actions
  for delete using (public.current_user_role(org_id) = 'admin');

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'commercial_orders','worker_reservations','mobilizations',
    'mobilization_checklist_items','timesheets','invoices',
    'invoice_timesheets','payments','delivery_costs'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'org members can manage ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'members can read ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'admin partner can insert ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'admin partner can update ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'admins can delete ' || table_name, table_name);
    execute format(
      'create policy %I on public.%I for select using (public.is_org_member(org_id))',
      'members can read ' || table_name, table_name
    );
    execute format(
      'create policy %I on public.%I for insert with check (public.current_user_role(org_id) in (''admin'',''partner''))',
      'admin partner can insert ' || table_name, table_name
    );
    execute format(
      'create policy %I on public.%I for update using (public.current_user_role(org_id) in (''admin'',''partner'')) with check (public.current_user_role(org_id) in (''admin'',''partner''))',
      'admin partner can update ' || table_name, table_name
    );
    execute format(
      'create policy %I on public.%I for delete using (public.current_user_role(org_id) = ''admin'')',
      'admins can delete ' || table_name, table_name
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
