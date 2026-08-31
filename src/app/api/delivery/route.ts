import { NextResponse } from "next/server";
import { deliveryMutationSchema } from "@/lib/delivery/validation";
import {
  createServiceSupabaseClient,
  requireApiRole,
} from "@/lib/supabase/server";

const CONFIRMED_RESERVATION = new Set(["reserved", "confirmed"]);
const CONFIRMED_MOBILIZATION = new Set(["ready", "mobilized", "active", "completed"]);

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const access = await requireApiRole(request, ["admin", "partner"]);
  if (!access.ok) return errorResponse(access.error, access.status);
  if (access.demo) return errorResponse("Delivery records are not available in demo mode.", 403);

  const parsed = deliveryMutationSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const service = createServiceSupabaseClient();
  if (!service) return errorResponse("Database unavailable.", 503);
  const now = new Date().toISOString();

  if (input.operation === "create_order") {
    const { data: requirement } = await service
      .from("commercial_requirements")
      .select("id,status")
      .eq("id", input.requirementId)
      .eq("org_id", access.organizationId)
      .maybeSingle();
    if (!requirement) return errorResponse("Requirement not found.", 404);
    if (!new Set(["qualified", "proposal_ready", "ordered"]).has(requirement.status)) {
      return errorResponse("An order can only be created from a qualified requirement.", 409);
    }
    if (input.buyerRouteId) {
      const { data: route } = await service.from("buyer_routes").select("id").eq("id", input.buyerRouteId).eq("requirement_id", input.requirementId).eq("org_id", access.organizationId).maybeSingle();
      if (!route) return errorResponse("Buyer route not found for this requirement.", 404);
    }
    if (input.projectPackageId) {
      const { data: projectPackage } = await service.from("project_packages").select("id").eq("id", input.projectPackageId).eq("org_id", access.organizationId).maybeSingle();
      if (!projectPackage) return errorResponse("Package not found.", 404);
    }
    const rateTerms = Object.fromEntries(
      Object.entries({ bill_rate: input.billRate, cost_rate: input.costRate, rate_unit: input.rateUnit }).filter(([, value]) => value !== undefined),
    );
    const { data, error } = await service.from("commercial_orders").insert({
      org_id: access.organizationId,
      requirement_id: input.requirementId,
      buyer_route_id: input.buyerRouteId ?? null,
      project_package_id: input.projectPackageId ?? null,
      order_type: input.orderType,
      status: "draft",
      title: input.title,
      external_reference: input.externalReference ?? null,
      buyer_contracting_entity: input.buyerContractingEntity ?? null,
      supplier_legal_entity: input.supplierLegalEntity ?? null,
      scope_summary: input.scopeSummary ?? null,
      currency: input.currency,
      contract_value: input.contractValue ?? null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      payment_terms_days: input.paymentTermsDays ?? null,
      timesheet_frequency: input.timesheetFrequency ?? null,
      timesheet_approval_contact: input.timesheetApprovalContact ?? null,
      rate_terms: rateTerms,
      travel_responsibility: input.travelResponsibility ?? null,
      accommodation_responsibility: input.accommodationResponsibility ?? null,
      tools_ppe_responsibility: input.toolsPpeResponsibility ?? null,
      termination_terms: input.terminationTerms ?? null,
      replacement_terms: input.replacementTerms ?? null,
      liability_notes: input.liabilityNotes ?? null,
      legal_review_status: input.legalReviewStatus,
      owner_id: access.userId,
      next_action: input.nextAction ?? null,
      next_action_due_at: input.nextActionDueAt ?? null,
      created_by: access.userId,
      updated_by: access.userId,
    }).select("id").single();
    if (error) return errorResponse(error.message);
    return NextResponse.json({ orderId: data.id }, { status: 201 });
  }

  if (input.operation === "update_order") {
    const { data: current } = await service.from("commercial_orders").select("*").eq("id", input.orderId).eq("org_id", access.organizationId).maybeSingle();
    if (!current) return errorResponse("Order not found.", 404);
    const updates: Record<string, unknown> = { updated_by: access.userId };
    const mapping: Array<[keyof typeof input, string]> = [
      ["buyerRouteId", "buyer_route_id"], ["projectPackageId", "project_package_id"], ["orderType", "order_type"],
      ["title", "title"], ["externalReference", "external_reference"], ["buyerContractingEntity", "buyer_contracting_entity"],
      ["supplierLegalEntity", "supplier_legal_entity"], ["scopeSummary", "scope_summary"], ["currency", "currency"],
      ["contractValue", "contract_value"], ["startDate", "start_date"], ["endDate", "end_date"],
      ["paymentTermsDays", "payment_terms_days"], ["timesheetFrequency", "timesheet_frequency"],
      ["timesheetApprovalContact", "timesheet_approval_contact"], ["travelResponsibility", "travel_responsibility"],
      ["accommodationResponsibility", "accommodation_responsibility"], ["toolsPpeResponsibility", "tools_ppe_responsibility"],
      ["terminationTerms", "termination_terms"], ["replacementTerms", "replacement_terms"], ["liabilityNotes", "liability_notes"],
      ["legalReviewStatus", "legal_review_status"], ["nextAction", "next_action"], ["nextActionDueAt", "next_action_due_at"],
      ["status", "status"], ["signedAt", "signed_at"],
    ];
    for (const [key, column] of mapping) if (input[key] !== undefined) updates[column] = input[key] ?? null;
    if (input.billRate !== undefined || input.costRate !== undefined || input.rateUnit !== undefined) {
      updates.rate_terms = {
        ...(current.rate_terms ?? {}),
        ...(input.billRate !== undefined ? { bill_rate: input.billRate } : {}),
        ...(input.costRate !== undefined ? { cost_rate: input.costRate } : {}),
        ...(input.rateUnit !== undefined ? { rate_unit: input.rateUnit } : {}),
      };
    }
    if (input.humanApproved !== undefined) {
      updates.human_approved_at = input.humanApproved ? now : null;
      updates.human_approved_by = input.humanApproved ? access.userId : null;
    }
    const { error } = await service.from("commercial_orders").update(updates).eq("id", input.orderId).eq("org_id", access.organizationId);
    if (error) return errorResponse(error.message, error.message.includes("requires") ? 409 : 500);
    if (input.status === "active") {
      await service.from("commercial_requirements").update({ status: "ordered", updated_by: access.userId }).eq("id", current.requirement_id).eq("org_id", access.organizationId);
    }
    return NextResponse.json({ ok: true });
  }

  if (input.operation === "create_reservation") {
    const [{ data: order }, { data: worker }] = await Promise.all([
      service.from("commercial_orders").select("id,requirement_id,project_package_id").eq("id", input.orderId).eq("org_id", access.organizationId).maybeSingle(),
      service.from("workers").select("id").eq("id", input.workerId).eq("organization_id", access.organizationId).eq("status", "active").maybeSingle(),
    ]);
    if (!order || !worker) return errorResponse("Order or active worker not found.", 404);
    if (CONFIRMED_RESERVATION.has(input.status) && !input.confirmationSource) {
      return errorResponse("Reservation requires a human availability confirmation source.", 409);
    }
    const confirmed = CONFIRMED_RESERVATION.has(input.status);
    const { data, error } = await service.from("worker_reservations").insert({
      org_id: access.organizationId, requirement_id: order.requirement_id, order_id: order.id,
      project_package_id: order.project_package_id, worker_id: worker.id, status: input.status,
      start_date: input.startDate, end_date: input.endDate, confirmation_source: input.confirmationSource ?? null,
      availability_confirmed_at: confirmed ? now : null, availability_confirmed_by: confirmed ? access.userId : null,
      notes: input.notes ?? null, created_by: access.userId, updated_by: access.userId,
    }).select("id").single();
    if (error) return errorResponse(error.message, error.code === "23P01" ? 409 : 500);
    return NextResponse.json({ reservationId: data.id }, { status: 201 });
  }

  if (input.operation === "update_reservation") {
    const { data: current } = await service.from("worker_reservations").select("id").eq("id", input.reservationId).eq("org_id", access.organizationId).maybeSingle();
    if (!current) return errorResponse("Reservation not found.", 404);
    const confirmed = CONFIRMED_RESERVATION.has(input.status);
    if (confirmed && !input.confirmationSource) return errorResponse("Reservation requires a confirmation source.", 409);
    const { error } = await service.from("worker_reservations").update({
      status: input.status, confirmation_source: input.confirmationSource ?? null, notes: input.notes ?? null,
      availability_confirmed_at: confirmed ? now : null, availability_confirmed_by: confirmed ? access.userId : null,
      released_by: ["released", "cancelled"].includes(input.status) ? access.userId : null, updated_by: access.userId,
    }).eq("id", input.reservationId).eq("org_id", access.organizationId);
    if (error) return errorResponse(error.message, error.code === "23P01" ? 409 : 500);
    return NextResponse.json({ ok: true });
  }

  if (input.operation === "create_mobilization") {
    const { data: reservation } = await service.from("worker_reservations").select("id,worker_id,order_id").eq("id", input.reservationId).eq("order_id", input.orderId).eq("worker_id", input.workerId).eq("org_id", access.organizationId).maybeSingle();
    if (!reservation) return errorResponse("Matching reservation not found.", 404);
    const { data, error } = await service.from("mobilizations").insert({
      org_id: access.organizationId, order_id: input.orderId, reservation_id: input.reservationId, worker_id: input.workerId,
      status: "planned", planned_start_date: input.plannedStartDate, planned_end_date: input.plannedEndDate ?? null,
      site_location: input.siteLocation ?? null, site_contact: input.siteContact ?? null, supervisor_name: input.supervisorName ?? null,
      owner_id: access.userId, next_action: input.nextAction ?? null, next_action_due_at: input.nextActionDueAt ?? null,
      created_by: access.userId, updated_by: access.userId,
    }).select("id").single();
    if (error) return errorResponse(error.message, error.code === "23505" ? 409 : 500);
    return NextResponse.json({ mobilizationId: data.id }, { status: 201 });
  }

  if (input.operation === "update_mobilization") {
    const { data: current } = await service.from("mobilizations").select("id").eq("id", input.mobilizationId).eq("org_id", access.organizationId).maybeSingle();
    if (!current) return errorResponse("Mobilization not found.", 404);
    const confirmed = CONFIRMED_MOBILIZATION.has(input.status);
    const { error } = await service.from("mobilizations").update({
      status: input.status, blocker_summary: input.blockerSummary ?? null,
      actual_start_at: input.actualStartAt ?? undefined, actual_end_at: input.actualEndAt ?? undefined,
      next_action: input.nextAction ?? null, next_action_due_at: input.nextActionDueAt ?? null,
      human_confirmed_at: confirmed ? now : null, human_confirmed_by: confirmed ? access.userId : null,
      updated_by: access.userId,
    }).eq("id", input.mobilizationId).eq("org_id", access.organizationId);
    if (error) return errorResponse(error.message, error.message.includes("requires") || error.message.includes("checklist") ? 409 : 500);
    return NextResponse.json({ ok: true });
  }

  if (input.operation === "update_mobilization_checklist") {
    const { data: current } = await service.from("mobilization_checklist_items").select("id").eq("id", input.checklistItemId).eq("org_id", access.organizationId).maybeSingle();
    if (!current) return errorResponse("Checklist item not found.", 404);
    const done = ["ready", "not_required"].includes(input.status);
    const { error } = await service.from("mobilization_checklist_items").update({
      status: input.status, evidence_document_id: input.evidenceDocumentId ?? null, notes: input.notes ?? null,
      due_at: input.dueAt ?? null, completed_at: done ? now : null, completed_by: done ? access.userId : null,
    }).eq("id", input.checklistItemId).eq("org_id", access.organizationId);
    if (error) return errorResponse(error.message);
    return NextResponse.json({ ok: true });
  }

  if (input.operation === "create_timesheet") {
    const [{ data: order }, { data: worker }] = await Promise.all([
      service.from("commercial_orders").select("id").eq("id", input.orderId).eq("org_id", access.organizationId).maybeSingle(),
      service.from("workers").select("id").eq("id", input.workerId).eq("organization_id", access.organizationId).maybeSingle(),
    ]);
    if (!order || !worker) return errorResponse("Order or worker not found.", 404);
    if (input.mobilizationId) {
      const { data: mobilization } = await service.from("mobilizations").select("id").eq("id", input.mobilizationId).eq("order_id", input.orderId).eq("worker_id", input.workerId).eq("org_id", access.organizationId).maybeSingle();
      if (!mobilization) return errorResponse("Mobilization not found for this worker/order.", 404);
    }
    const approved = input.status === "client_approved";
    if (approved && (!input.clientApproverName || !input.clientApprovalEvidence)) return errorResponse("Client approval requires approver and evidence.", 409);
    const { data, error } = await service.from("timesheets").insert({
      org_id: access.organizationId, order_id: input.orderId, mobilization_id: input.mobilizationId ?? null,
      worker_id: input.workerId, period_start: input.periodStart, period_end: input.periodEnd,
      regular_hours: input.regularHours, overtime_hours: input.overtimeHours,
      bill_rate: input.billRate ?? null, cost_rate: input.costRate ?? null, currency: input.currency, status: input.status,
      submitted_at: input.status !== "draft" ? now : null, client_approved_at: approved ? now : null,
      client_approver_name: input.clientApproverName ?? null, client_approval_evidence: input.clientApprovalEvidence ?? null,
      notes: input.notes ?? null, created_by: access.userId, updated_by: access.userId,
    }).select("id").single();
    if (error) return errorResponse(error.message, error.code === "23505" || error.message.includes("requires") ? 409 : 500);
    return NextResponse.json({ timesheetId: data.id }, { status: 201 });
  }

  if (input.operation === "update_timesheet") {
    const { data: current } = await service.from("timesheets").select("id").eq("id", input.timesheetId).eq("org_id", access.organizationId).maybeSingle();
    if (!current) return errorResponse("Timesheet not found.", 404);
    const approved = input.status === "client_approved";
    if (approved && (!input.clientApproverName || !input.clientApprovalEvidence)) return errorResponse("Client approval requires approver and evidence.", 409);
    const { error } = await service.from("timesheets").update({
      status: input.status, submitted_at: input.status !== "draft" ? now : null,
      client_approved_at: approved ? now : null, client_approver_name: input.clientApproverName ?? null,
      client_approval_evidence: input.clientApprovalEvidence ?? null, rejection_reason: input.rejectionReason ?? null,
      notes: input.notes ?? null, updated_by: access.userId,
    }).eq("id", input.timesheetId).eq("org_id", access.organizationId);
    if (error) return errorResponse(error.message, error.message.includes("requires") ? 409 : 500);
    return NextResponse.json({ ok: true });
  }

  if (input.operation === "create_invoice") {
    const { data: order } = await service.from("commercial_orders").select("id,currency").eq("id", input.orderId).eq("org_id", access.organizationId).maybeSingle();
    if (!order) return errorResponse("Order not found.", 404);
    if (order.currency !== input.currency) return errorResponse("Invoice currency must match the order currency.", 409);
    if (input.status !== "draft" && (!input.issueDate || !input.dueDate)) return errorResponse("Issued invoice requires issue and due dates.", 409);
    if (input.timesheetIds.length > 0) {
      const { data: sheets } = await service.from("timesheets").select("id,status").eq("org_id", access.organizationId).eq("order_id", input.orderId).in("id", input.timesheetIds);
      if ((sheets?.length ?? 0) !== input.timesheetIds.length || (sheets ?? []).some((sheet) => sheet.status !== "client_approved")) {
        return errorResponse("Every linked timesheet must belong to the order and be client approved.", 409);
      }
    }
    const approved = input.status !== "draft";
    const { data: invoice, error } = await service.from("invoices").insert({
      org_id: access.organizationId, order_id: input.orderId, invoice_number: input.invoiceNumber, status: input.status,
      issue_date: input.issueDate ?? null, due_date: input.dueDate ?? null, currency: input.currency,
      net_amount: input.netAmount, tax_amount: input.taxAmount, total_amount: input.netAmount + input.taxAmount,
      sent_at: input.status === "sent" ? now : null, notes: input.notes ?? null,
      human_approved_at: approved ? now : null, human_approved_by: approved ? access.userId : null,
      created_by: access.userId, updated_by: access.userId,
    }).select("id").single();
    if (error) return errorResponse(error.message, error.code === "23505" || error.message.includes("requires") ? 409 : 500);
    if (input.timesheetIds.length > 0) {
      const { error: linkError } = await service.from("invoice_timesheets").insert(
        input.timesheetIds.map((timesheetId) => ({ invoice_id: invoice.id, timesheet_id: timesheetId, org_id: access.organizationId })),
      );
      if (linkError) {
        await service.from("invoices").delete().eq("id", invoice.id).eq("org_id", access.organizationId);
        return errorResponse(linkError.message);
      }
      if (input.status !== "draft") {
        await service.from("timesheets").update({ status: "invoiced", updated_by: access.userId }).in("id", input.timesheetIds).eq("org_id", access.organizationId);
      }
    }
    return NextResponse.json({ invoiceId: invoice.id }, { status: 201 });
  }

  if (input.operation === "update_invoice") {
    const { data: current } = await service.from("invoices").select("id").eq("id", input.invoiceId).eq("org_id", access.organizationId).maybeSingle();
    if (!current) return errorResponse("Invoice not found.", 404);
    const approved = input.status !== "draft" && input.status !== "void";
    const { error } = await service.from("invoices").update({
      status: input.status, issue_date: input.issueDate ?? undefined, due_date: input.dueDate ?? undefined,
      sent_at: ["sent", "overdue", "disputed"].includes(input.status) ? now : undefined,
      dispute_reason: input.disputeReason ?? null, notes: input.notes ?? null,
      human_approved_at: approved ? now : null, human_approved_by: approved ? access.userId : null,
      updated_by: access.userId,
    }).eq("id", input.invoiceId).eq("org_id", access.organizationId);
    if (error) return errorResponse(error.message, error.message.includes("requires") ? 409 : 500);
    return NextResponse.json({ ok: true });
  }

  if (input.operation === "record_payment") {
    const { data: invoice } = await service.from("invoices").select("id,total_amount,currency,status").eq("id", input.invoiceId).eq("org_id", access.organizationId).maybeSingle();
    if (!invoice) return errorResponse("Invoice not found.", 404);
    if (invoice.currency !== input.currency) return errorResponse("Payment currency must match invoice currency.", 409);
    if (["draft", "void"].includes(invoice.status)) return errorResponse("Cannot record payment against a draft or void invoice.", 409);
    const { data: existingPayments } = await service.from("payments").select("amount").eq("invoice_id", input.invoiceId).eq("org_id", access.organizationId);
    const paid = (existingPayments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0);
    if (paid + input.amount > Number(invoice.total_amount) + 0.01) return errorResponse("Payment exceeds the invoice outstanding amount.", 409);
    const { data, error } = await service.from("payments").insert({
      org_id: access.organizationId, invoice_id: input.invoiceId, payment_date: input.paymentDate,
      amount: input.amount, currency: input.currency, payment_reference: input.paymentReference ?? null,
      method: input.method ?? null, notes: input.notes ?? null, recorded_by: access.userId,
    }).select("id").single();
    if (error) return errorResponse(error.message);
    return NextResponse.json({ paymentId: data.id }, { status: 201 });
  }

  const { data: order } = await service.from("commercial_orders").select("id,currency").eq("id", input.orderId).eq("org_id", access.organizationId).maybeSingle();
  if (!order) return errorResponse("Order not found.", 404);
  if (order.currency !== input.currency) return errorResponse("Cost currency must match order currency for margin reporting.", 409);
  const { data, error } = await service.from("delivery_costs").insert({
    org_id: access.organizationId, order_id: input.orderId, mobilization_id: input.mobilizationId ?? null,
    worker_id: input.workerId ?? null, cost_type: input.costType, cost_state: input.costState,
    cost_date: input.costDate ?? null, amount: input.amount, currency: input.currency,
    description: input.description ?? null, created_by: access.userId, updated_by: access.userId,
  }).select("id").single();
  if (error) return errorResponse(error.message);
  return NextResponse.json({ costId: data.id }, { status: 201 });
}
