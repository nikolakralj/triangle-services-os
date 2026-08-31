-- ============================================================
-- Migration 030: Order, reservation, mobilization, delivery, cash, margin
-- ============================================================

create extension if not exists btree_gist;

create table if not exists public.commercial_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  requirement_id uuid not null references public.commercial_requirements(id) on delete restrict,
  buyer_route_id uuid references public.buyer_routes(id) on delete set null,
  project_package_id uuid references public.project_packages(id) on delete set null,
  order_type text not null
    check (order_type in ('nda','msa','framework','sow','job_order','purchase_order','rate_card','placement_order','other')),
  status text not null default 'draft'
    check (status in ('draft','under_review','signed','active','completed','terminated','cancelled')),
  title text not null,
  external_reference text,
  buyer_contracting_entity text,
  supplier_legal_entity text,
  scope_summary text,
  document_id uuid references public.documents(id) on delete set null,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  contract_value numeric(14,2) check (contract_value is null or contract_value >= 0),
  start_date date,
  end_date date,
  payment_terms_days integer check (payment_terms_days is null or payment_terms_days >= 0),
  timesheet_frequency text,
  timesheet_approval_contact text,
  rate_terms jsonb not null default '{}'::jsonb,
  travel_responsibility text,
  accommodation_responsibility text,
  tools_ppe_responsibility text,
  termination_terms text,
  replacement_terms text,
  liability_notes text,
  legal_review_status text not null default 'not_reviewed'
    check (legal_review_status in ('not_reviewed','review_needed','in_review','approved','rejected')),
  signed_at timestamptz,
  activated_at timestamptz,
  human_approved_at timestamptz,
  human_approved_by uuid references auth.users(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,
  next_action text,
  next_action_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists commercial_orders_org_idx
  on public.commercial_orders (org_id, status, next_action_due_at);
create index if not exists commercial_orders_requirement_idx
  on public.commercial_orders (requirement_id);

create table if not exists public.worker_reservations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  requirement_id uuid not null references public.commercial_requirements(id) on delete cascade,
  order_id uuid references public.commercial_orders(id) on delete cascade,
  project_package_id uuid references public.project_packages(id) on delete set null,
  worker_id uuid not null references public.workers(id) on delete restrict,
  status text not null default 'hold'
    check (status in ('hold','reserved','confirmed','released','cancelled')),
  start_date date not null,
  end_date date not null,
  confirmation_source text,
  availability_confirmed_at timestamptz,
  availability_confirmed_by uuid references auth.users(id) on delete set null,
  notes text,
  released_at timestamptz,
  released_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check (end_date >= start_date)
);

create index if not exists worker_reservations_org_idx
  on public.worker_reservations (org_id, status, start_date);
create index if not exists worker_reservations_worker_idx
  on public.worker_reservations (worker_id, start_date, end_date);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'worker_reservations_no_active_overlap'
      and conrelid = 'public.worker_reservations'::regclass
  ) then
    alter table public.worker_reservations
      add constraint worker_reservations_no_active_overlap
      exclude using gist (
        worker_id with =,
        daterange(start_date, end_date, '[]') with &&
      ) where (status in ('hold','reserved','confirmed'));
  end if;
end $$;

create table if not exists public.mobilizations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.commercial_orders(id) on delete cascade,
  reservation_id uuid references public.worker_reservations(id) on delete set null,
  worker_id uuid not null references public.workers(id) on delete restrict,
  status text not null default 'planned'
    check (status in ('planned','blocked','ready','mobilized','active','completed','cancelled')),
  planned_start_date date not null,
  planned_end_date date,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  site_location text,
  site_contact text,
  supervisor_name text,
  blocker_summary text,
  owner_id uuid references auth.users(id) on delete set null,
  next_action text,
  next_action_due_at timestamptz,
  human_confirmed_at timestamptz,
  human_confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (order_id, worker_id),
  check (planned_end_date is null or planned_end_date >= planned_start_date)
);

create index if not exists mobilizations_org_idx
  on public.mobilizations (org_id, status, planned_start_date);

create table if not exists public.mobilization_checklist_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  mobilization_id uuid not null references public.mobilizations(id) on delete cascade,
  requirement_key text not null,
  label text not null,
  status text not null default 'missing'
    check (status in ('missing','in_progress','ready','not_required','blocked')),
  evidence_document_id uuid references public.documents(id) on delete set null,
  notes text,
  responsible_user_id uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mobilization_id, requirement_key)
);

create index if not exists mobilization_checklist_org_idx
  on public.mobilization_checklist_items (org_id, status, due_at);

create table if not exists public.timesheets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.commercial_orders(id) on delete cascade,
  mobilization_id uuid references public.mobilizations(id) on delete set null,
  worker_id uuid not null references public.workers(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  regular_hours numeric(9,2) not null default 0 check (regular_hours >= 0),
  overtime_hours numeric(9,2) not null default 0 check (overtime_hours >= 0),
  bill_rate numeric(12,2) check (bill_rate is null or bill_rate >= 0),
  cost_rate numeric(12,2) check (cost_rate is null or cost_rate >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft'
    check (status in ('draft','submitted','client_approved','rejected','invoiced')),
  submitted_at timestamptz,
  client_approved_at timestamptz,
  client_approver_name text,
  client_approval_evidence text,
  document_id uuid references public.documents(id) on delete set null,
  rejection_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (worker_id, order_id, period_start, period_end),
  check (period_end >= period_start)
);

create index if not exists timesheets_org_idx
  on public.timesheets (org_id, status, period_end);
create index if not exists timesheets_order_idx
  on public.timesheets (order_id, period_start);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.commercial_orders(id) on delete restrict,
  invoice_number text not null,
  status text not null default 'draft'
    check (status in ('draft','issued','sent','part_paid','paid','overdue','disputed','void')),
  issue_date date,
  due_date date,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  net_amount numeric(14,2) not null default 0 check (net_amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  sent_at timestamptz,
  client_accepted_at timestamptz,
  dispute_reason text,
  document_id uuid references public.documents(id) on delete set null,
  notes text,
  human_approved_at timestamptz,
  human_approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (org_id, invoice_number),
  check (due_date is null or issue_date is null or due_date >= issue_date),
  check (total_amount = net_amount + tax_amount)
);

create index if not exists invoices_org_idx
  on public.invoices (org_id, status, due_date);
create index if not exists invoices_order_idx on public.invoices (order_id);

create table if not exists public.invoice_timesheets (
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  timesheet_id uuid not null references public.timesheets(id) on delete restrict,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (invoice_id, timesheet_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  payment_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  payment_reference text,
  method text,
  notes text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists payments_org_idx on public.payments (org_id, payment_date);
create index if not exists payments_invoice_idx on public.payments (invoice_id);

create table if not exists public.delivery_costs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.commercial_orders(id) on delete cascade,
  mobilization_id uuid references public.mobilizations(id) on delete set null,
  worker_id uuid references public.workers(id) on delete set null,
  cost_type text not null
    check (cost_type in ('labor','payroll_tax','travel','accommodation','per_diem','ppe_tools','training','insurance','admin','financing','other')),
  cost_state text not null default 'forecast'
    check (cost_state in ('forecast','committed','actual')),
  cost_date date,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  description text,
  evidence_document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists delivery_costs_org_idx
  on public.delivery_costs (org_id, cost_state, cost_date);
create index if not exists delivery_costs_order_idx on public.delivery_costs (order_id);

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
    ) then
      raise exception 'A signed/active order requires a qualified commercial requirement';
    end if;
    if new.status = 'active' and new.activated_at is null then new.activated_at := now(); end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_order_truth_trigger on public.commercial_orders;
create trigger enforce_order_truth_trigger
before insert or update on public.commercial_orders
for each row execute function public.enforce_order_truth();

create or replace function public.enforce_reservation_truth()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('reserved','confirmed') and (
    new.availability_confirmed_at is null
    or new.availability_confirmed_by is null
    or coalesce(trim(new.confirmation_source), '') = ''
  ) then
    raise exception 'Reserved/confirmed worker requires dated human availability confirmation and source';
  end if;
  if new.status in ('released','cancelled') and new.released_at is null then
    new.released_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_reservation_truth_trigger on public.worker_reservations;
create trigger enforce_reservation_truth_trigger
before insert or update on public.worker_reservations
for each row execute function public.enforce_reservation_truth();

create or replace function public.seed_mobilization_checklist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.mobilization_checklist_items (org_id, mobilization_id, requirement_key, label)
  values
    (new.org_id, new.id, 'engagement_contract', 'Worker engagement/contract confirmed'),
    (new.org_id, new.id, 'identity', 'Identity/passport checked'),
    (new.org_id, new.id, 'posting_a1', 'Posting/A1 requirement resolved'),
    (new.org_id, new.id, 'work_permit', 'Work permit/right-to-work resolved'),
    (new.org_id, new.id, 'insurance', 'Insurance requirement resolved'),
    (new.org_id, new.id, 'medical', 'Medical requirement resolved'),
    (new.org_id, new.id, 'safety_training', 'Safety/training requirements complete'),
    (new.org_id, new.id, 'site_induction', 'Site induction/access arranged'),
    (new.org_id, new.id, 'ppe_tools', 'PPE and tools arranged'),
    (new.org_id, new.id, 'travel', 'Travel arranged'),
    (new.org_id, new.id, 'accommodation', 'Accommodation arranged'),
    (new.org_id, new.id, 'timesheet_process', 'Timesheet/approval process confirmed')
  on conflict (mobilization_id, requirement_key) do nothing;
  return new;
end;
$$;

drop trigger if exists seed_mobilization_checklist_trigger on public.mobilizations;
create trigger seed_mobilization_checklist_trigger
after insert on public.mobilizations
for each row execute function public.seed_mobilization_checklist();

create or replace function public.enforce_mobilization_truth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('ready','mobilized','active','completed') then
    if new.human_confirmed_at is null or new.human_confirmed_by is null then
      raise exception 'Ready/mobilized state requires human confirmation';
    end if;
    if not exists (
      select 1 from public.commercial_orders orders
      where orders.id = new.order_id and orders.org_id = new.org_id
        and orders.status in ('signed','active','completed')
    ) then
      raise exception 'Mobilization requires a signed or active order';
    end if;
    if new.reservation_id is null or not exists (
      select 1 from public.worker_reservations reservation
      where reservation.id = new.reservation_id and reservation.org_id = new.org_id
        and reservation.status in ('reserved','confirmed')
    ) then
      raise exception 'Mobilization requires an active human-confirmed reservation';
    end if;
    if exists (
      select 1 from public.mobilization_checklist_items item
      where item.mobilization_id = new.id
        and item.status in ('missing','in_progress','blocked')
    ) then
      raise exception 'Mobilization checklist still contains missing, in-progress, or blocked items';
    end if;
    if new.status in ('mobilized','active') and new.actual_start_at is null then
      new.actual_start_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_mobilization_truth_trigger on public.mobilizations;
create trigger enforce_mobilization_truth_trigger
before update on public.mobilizations
for each row execute function public.enforce_mobilization_truth();

create or replace function public.enforce_timesheet_truth()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('submitted','client_approved','invoiced') and new.submitted_at is null then
    new.submitted_at := now();
  end if;
  if new.status in ('client_approved','invoiced') and (
    new.client_approved_at is null
    or coalesce(trim(new.client_approver_name), '') = ''
    or coalesce(trim(new.client_approval_evidence), '') = ''
  ) then
    raise exception 'Client-approved timesheet requires approver, time, and approval evidence';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_timesheet_truth_trigger on public.timesheets;
create trigger enforce_timesheet_truth_trigger
before insert or update on public.timesheets
for each row execute function public.enforce_timesheet_truth();

create or replace function public.enforce_invoice_truth()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('issued','sent','part_paid','paid','overdue','disputed') then
    if new.issue_date is null or new.due_date is null
       or new.human_approved_at is null or new.human_approved_by is null then
      raise exception 'Issued invoice requires dates and human approval';
    end if;
  end if;
  if new.status in ('sent','part_paid','paid','overdue','disputed') and new.sent_at is null then
    raise exception 'Sent/payment invoice state requires sent time';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_invoice_truth_trigger on public.invoices;
create trigger enforce_invoice_truth_trigger
before insert or update on public.invoices
for each row execute function public.enforce_invoice_truth();

create or replace function public.refresh_invoice_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  paid_total numeric;
  invoice_total numeric;
begin
  select coalesce(sum(amount), 0) into paid_total from public.payments where invoice_id = target_invoice;
  select total_amount into invoice_total from public.invoices where id = target_invoice;
  update public.invoices
    set status = case
      when paid_total >= invoice_total and invoice_total > 0 then 'paid'
      when paid_total > 0 then 'part_paid'
      else status
    end,
    updated_at = now()
  where id = target_invoice and status not in ('void','disputed');
  return coalesce(new, old);
end;
$$;

drop trigger if exists refresh_invoice_payment_status_trigger on public.payments;
create trigger refresh_invoice_payment_status_trigger
after insert or update or delete on public.payments
for each row execute function public.refresh_invoice_payment_status();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'commercial_orders','worker_reservations','mobilizations',
    'mobilization_checklist_items','timesheets','invoices','delivery_costs'
  ] loop
    if not exists (
      select 1 from pg_trigger
      where tgname = 'set_' || table_name || '_updated_at'
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        'set_' || table_name || '_updated_at', table_name
      );
    end if;
  end loop;
end $$;

create or replace view public.order_financial_summary
with (security_invoker = true)
as
select
  orders.id as order_id,
  orders.org_id,
  orders.currency,
  coalesce((select sum(invoice.net_amount) from public.invoices invoice
            where invoice.order_id = orders.id and invoice.status <> 'void'), 0) as net_invoiced,
  coalesce((select sum(payment.amount) from public.payments payment
            join public.invoices invoice on invoice.id = payment.invoice_id
            where invoice.order_id = orders.id and payment.currency = orders.currency), 0) as cash_received,
  coalesce((select sum(cost.amount) from public.delivery_costs cost
            where cost.order_id = orders.id and cost.cost_state = 'forecast'
              and cost.currency = orders.currency), 0) as forecast_cost,
  coalesce((select sum(cost.amount) from public.delivery_costs cost
            where cost.order_id = orders.id and cost.cost_state in ('committed','actual')
              and cost.currency = orders.currency), 0) as committed_actual_cost,
  coalesce((select sum(invoice.net_amount) from public.invoices invoice
            where invoice.order_id = orders.id and invoice.status <> 'void'), 0)
    - coalesce((select sum(cost.amount) from public.delivery_costs cost
                where cost.order_id = orders.id and cost.cost_state in ('committed','actual')
                  and cost.currency = orders.currency), 0) as invoiced_contribution,
  coalesce((select sum(payment.amount) from public.payments payment
            join public.invoices invoice on invoice.id = payment.invoice_id
            where invoice.order_id = orders.id and payment.currency = orders.currency), 0)
    - coalesce((select sum(cost.amount) from public.delivery_costs cost
                where cost.order_id = orders.id and cost.cost_state = 'actual'
                  and cost.currency = orders.currency), 0) as cash_contribution
from public.commercial_orders orders;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'commercial_orders','worker_reservations','mobilizations',
    'mobilization_checklist_items','timesheets','invoices',
    'invoice_timesheets','payments','delivery_costs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', 'org members can manage ' || table_name, table_name);
    execute format(
      'create policy %I on public.%I for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))',
      'org members can manage ' || table_name, table_name
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
