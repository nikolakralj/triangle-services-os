import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type CommercialOrderRow = {
  id: string;
  org_id: string;
  requirement_id: string;
  buyer_route_id: string | null;
  project_package_id: string | null;
  order_type: string;
  status: string;
  title: string;
  external_reference: string | null;
  buyer_contracting_entity: string | null;
  supplier_legal_entity: string | null;
  scope_summary: string | null;
  document_id: string | null;
  currency: string;
  contract_value: number | null;
  start_date: string | null;
  end_date: string | null;
  payment_terms_days: number | null;
  timesheet_frequency: string | null;
  timesheet_approval_contact: string | null;
  rate_terms: Record<string, unknown>;
  travel_responsibility: string | null;
  accommodation_responsibility: string | null;
  tools_ppe_responsibility: string | null;
  termination_terms: string | null;
  replacement_terms: string | null;
  liability_notes: string | null;
  legal_review_status: string;
  signed_at: string | null;
  activated_at: string | null;
  human_approved_at: string | null;
  human_approved_by: string | null;
  owner_id: string | null;
  next_action: string | null;
  next_action_due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderFinancialSummary = {
  order_id: string;
  org_id: string;
  currency: string;
  net_invoiced: number;
  cash_received: number;
  forecast_cost: number;
  committed_actual_cost: number;
  invoiced_contribution: number;
  cash_contribution: number;
};

export type ReservationRow = {
  id: string;
  org_id: string;
  requirement_id: string;
  order_id: string | null;
  project_package_id: string | null;
  worker_id: string;
  status: string;
  start_date: string;
  end_date: string;
  confirmation_source: string | null;
  availability_confirmed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  workerName?: string;
};

export type MobilizationRow = {
  id: string;
  org_id: string;
  order_id: string;
  reservation_id: string | null;
  worker_id: string;
  status: string;
  planned_start_date: string;
  planned_end_date: string | null;
  actual_start_at: string | null;
  actual_end_at: string | null;
  site_location: string | null;
  site_contact: string | null;
  supervisor_name: string | null;
  blocker_summary: string | null;
  next_action: string | null;
  next_action_due_at: string | null;
  human_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  workerName?: string;
};

export type MobilizationChecklistRow = {
  id: string;
  org_id: string;
  mobilization_id: string;
  requirement_key: string;
  label: string;
  status: string;
  evidence_document_id: string | null;
  notes: string | null;
  responsible_user_id: string | null;
  due_at: string | null;
  completed_at: string | null;
};

export type TimesheetRow = {
  id: string;
  org_id: string;
  order_id: string;
  mobilization_id: string | null;
  worker_id: string;
  period_start: string;
  period_end: string;
  regular_hours: number;
  overtime_hours: number;
  bill_rate: number | null;
  cost_rate: number | null;
  currency: string;
  status: string;
  submitted_at: string | null;
  client_approved_at: string | null;
  client_approver_name: string | null;
  client_approval_evidence: string | null;
  document_id: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  workerName?: string;
};

export type InvoiceRow = {
  id: string;
  org_id: string;
  order_id: string;
  invoice_number: string;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  net_amount: number;
  tax_amount: number;
  total_amount: number;
  sent_at: string | null;
  client_accepted_at: string | null;
  dispute_reason: string | null;
  document_id: string | null;
  notes: string | null;
  human_approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentRow = {
  id: string;
  org_id: string;
  invoice_id: string;
  payment_date: string;
  amount: number;
  currency: string;
  payment_reference: string | null;
  method: string | null;
  notes: string | null;
  created_at: string;
};

export type DeliveryCostRow = {
  id: string;
  org_id: string;
  order_id: string;
  mobilization_id: string | null;
  worker_id: string | null;
  cost_type: string;
  cost_state: string;
  cost_date: string | null;
  amount: number;
  currency: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  workerName?: string;
};

export type OrderListItem = CommercialOrderRow & {
  requirementTitle: string;
  financial: OrderFinancialSummary;
  reservationCount: number;
  mobilizationCount: number;
  approvedTimesheetCount: number;
  invoiceCount: number;
};

export type DeliveryWorkspace = {
  order: CommercialOrderRow;
  requirementTitle: string;
  financial: OrderFinancialSummary;
  reservations: ReservationRow[];
  mobilizations: MobilizationRow[];
  checklist: MobilizationChecklistRow[];
  timesheets: TimesheetRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  costs: DeliveryCostRow[];
  workers: Array<{ id: string; full_name: string; role: string; availability_status: string }>;
};

export type OrderCreationOption = {
  id: string;
  title: string;
  currency: string;
  projectPackageId: string | null;
  routes: Array<{ id: string; label: string; status: string }>;
};

function zeroFinancial(order: CommercialOrderRow): OrderFinancialSummary {
  return {
    order_id: order.id,
    org_id: order.org_id,
    currency: order.currency,
    net_invoiced: 0,
    cash_received: 0,
    forecast_cost: 0,
    committed_actual_cost: 0,
    invoiced_contribution: 0,
    cash_contribution: 0,
  };
}

export async function listDeliveryOrders(orgId: string): Promise<OrderListItem[]> {
  const service = createServiceSupabaseClient();
  if (!service) return [];
  const [ordersResult, requirementsResult, financialResult, reservationsResult, mobilizationsResult, timesheetsResult, invoicesResult] =
    await Promise.all([
      service.from("commercial_orders").select("*").eq("org_id", orgId).order("updated_at", { ascending: false }),
      service.from("commercial_requirements").select("id,title").eq("org_id", orgId),
      service.from("order_financial_summary").select("*").eq("org_id", orgId),
      service.from("worker_reservations").select("order_id").eq("org_id", orgId),
      service.from("mobilizations").select("order_id").eq("org_id", orgId),
      service.from("timesheets").select("order_id,status").eq("org_id", orgId),
      service.from("invoices").select("order_id").eq("org_id", orgId),
    ]);
  if (ordersResult.error) {
    console.error("listDeliveryOrders error", ordersResult.error);
    return [];
  }
  const orders = (ordersResult.data ?? []) as CommercialOrderRow[];
  const requirementNames = new Map((requirementsResult.data ?? []).map((item) => [item.id, item.title]));
  const financials = new Map(
    ((financialResult.data ?? []) as OrderFinancialSummary[]).map((item) => [item.order_id, item]),
  );
  return orders.map((order) => ({
    ...order,
    requirementTitle: requirementNames.get(order.requirement_id) ?? "Unknown requirement",
    financial: financials.get(order.id) ?? zeroFinancial(order),
    reservationCount: (reservationsResult.data ?? []).filter((item) => item.order_id === order.id).length,
    mobilizationCount: (mobilizationsResult.data ?? []).filter((item) => item.order_id === order.id).length,
    approvedTimesheetCount: (timesheetsResult.data ?? []).filter(
      (item) => item.order_id === order.id && ["client_approved", "invoiced"].includes(item.status),
    ).length,
    invoiceCount: (invoicesResult.data ?? []).filter((item) => item.order_id === order.id).length,
  }));
}

export async function listOrderCreationOptions(
  orgId: string,
): Promise<OrderCreationOption[]> {
  const service = createServiceSupabaseClient();
  if (!service) return [];
  const [requirementsResult, routesResult] = await Promise.all([
    service
      .from("commercial_requirements")
      .select("id,title,currency,project_package_id,status")
      .eq("org_id", orgId)
      .in("status", ["qualified", "proposal_ready", "ordered"])
      .order("updated_at", { ascending: false }),
    service
      .from("buyer_routes")
      .select("id,requirement_id,buyer_company,contracting_entity,route_type,route_status")
      .eq("org_id", orgId)
      .in("route_status", ["prequalification", "confirmed", "approved"]),
  ]);
  return (requirementsResult.data ?? []).map((requirement) => ({
    id: requirement.id,
    title: requirement.title,
    currency: requirement.currency,
    projectPackageId: requirement.project_package_id,
    routes: (routesResult.data ?? [])
      .filter((route) => route.requirement_id === requirement.id)
      .map((route) => ({
        id: route.id,
        label:
          route.buyer_company ||
          route.contracting_entity ||
          route.route_type,
        status: route.route_status,
      })),
  }));
}

export async function getDeliveryWorkspace(orderId: string, orgId: string): Promise<DeliveryWorkspace | null> {
  const service = createServiceSupabaseClient();
  if (!service) return null;
  const { data: order } = await service.from("commercial_orders").select("*").eq("id", orderId).eq("org_id", orgId).maybeSingle();
  if (!order) return null;
  const typedOrder = order as CommercialOrderRow;
  const [requirementResult, financialResult, reservationsResult, mobilizationsResult, timesheetsResult, invoicesResult, costsResult, workersResult] =
    await Promise.all([
      service.from("commercial_requirements").select("title").eq("id", typedOrder.requirement_id).eq("org_id", orgId).maybeSingle(),
      service.from("order_financial_summary").select("*").eq("order_id", orderId).eq("org_id", orgId).maybeSingle(),
      service.from("worker_reservations").select("*").eq("order_id", orderId).eq("org_id", orgId).order("start_date"),
      service.from("mobilizations").select("*").eq("order_id", orderId).eq("org_id", orgId).order("planned_start_date"),
      service.from("timesheets").select("*").eq("order_id", orderId).eq("org_id", orgId).order("period_start", { ascending: false }),
      service.from("invoices").select("*").eq("order_id", orderId).eq("org_id", orgId).order("issue_date", { ascending: false }),
      service.from("delivery_costs").select("*").eq("order_id", orderId).eq("org_id", orgId).order("cost_date", { ascending: false }),
      service.from("workers").select("id,full_name,role,availability_status").eq("organization_id", orgId).eq("status", "active").order("full_name"),
    ]);

  const reservations = (reservationsResult.data ?? []) as ReservationRow[];
  const mobilizations = (mobilizationsResult.data ?? []) as MobilizationRow[];
  const timesheets = (timesheetsResult.data ?? []) as TimesheetRow[];
  const costs = (costsResult.data ?? []) as DeliveryCostRow[];
  const workerNames = new Map((workersResult.data ?? []).map((worker) => [worker.id, worker.full_name]));
  const mobilizationIds = mobilizations.map((item) => item.id);
  const invoiceIds = (invoicesResult.data ?? []).map((item) => item.id);
  const [checklistResult, paymentsResult] = await Promise.all([
    mobilizationIds.length > 0
      ? service.from("mobilization_checklist_items").select("*").eq("org_id", orgId).in("mobilization_id", mobilizationIds).order("label")
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length > 0
      ? service.from("payments").select("*").eq("org_id", orgId).in("invoice_id", invoiceIds).order("payment_date", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  return {
    order: typedOrder,
    requirementTitle: requirementResult.data?.title ?? "Unknown requirement",
    financial: (financialResult.data as OrderFinancialSummary | null) ?? zeroFinancial(typedOrder),
    reservations: reservations.map((item) => ({ ...item, workerName: workerNames.get(item.worker_id) })),
    mobilizations: mobilizations.map((item) => ({ ...item, workerName: workerNames.get(item.worker_id) })),
    checklist: (checklistResult.data ?? []) as MobilizationChecklistRow[],
    timesheets: timesheets.map((item) => ({ ...item, workerName: workerNames.get(item.worker_id) })),
    invoices: (invoicesResult.data ?? []) as InvoiceRow[],
    payments: (paymentsResult.data ?? []) as PaymentRow[],
    costs: costs.map((item) => ({ ...item, workerName: item.worker_id ? workerNames.get(item.worker_id) : undefined })),
    workers: workersResult.data ?? [],
  };
}
