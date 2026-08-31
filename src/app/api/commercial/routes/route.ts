import { NextResponse } from "next/server";
import { buyerRouteInputSchema } from "@/lib/commercial/validation";
import {
  createServiceSupabaseClient,
  requireApiAccess,
} from "@/lib/supabase/server";

const HUMAN_ROUTE_STATUSES = new Set([
  "contacted",
  "prequalification",
  "confirmed",
  "approved",
  "blocked",
  "rejected",
  "dormant",
]);
const CONFIRMED_ROUTE_STATUSES = new Set([
  "prequalification",
  "confirmed",
  "approved",
]);

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo || access.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = buyerRouteInputSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;
  if (
    HUMAN_ROUTE_STATUSES.has(input.routeStatus) &&
    !["admin", "partner"].includes(access.role)
  ) {
    return NextResponse.json(
      { error: "Only an admin or partner can record contacted or confirmed route states." },
      { status: 403 },
    );
  }
  if (
    CONFIRMED_ROUTE_STATUSES.has(input.routeStatus) &&
    (!input.evidenceSummary || !input.nextAction || !input.nextActionDueAt)
  ) {
    return NextResponse.json(
      { error: "A confirmed route requires evidence and a dated next action." },
      { status: 409 },
    );
  }

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }
  const { data: requirement } = await service
    .from("commercial_requirements")
    .select("id,discovered_project_id")
    .eq("id", input.requirementId)
    .eq("org_id", access.organizationId)
    .maybeSingle();
  if (!requirement) {
    return NextResponse.json({ error: "Requirement not found." }, { status: 404 });
  }

  if (input.chainNodeId) {
    const { data: node } = await service
      .from("contractor_chain_nodes")
      .select("id")
      .eq("id", input.chainNodeId)
      .eq("organization_id", access.organizationId)
      .maybeSingle();
    if (!node) return NextResponse.json({ error: "Chain node not found." }, { status: 404 });
  }
  if (input.buyerContactId) {
    const { data: contact } = await service
      .from("buyer_contacts")
      .select("id")
      .eq("id", input.buyerContactId)
      .eq("organization_id", access.organizationId)
      .maybeSingle();
    if (!contact) return NextResponse.json({ error: "Buyer contact not found." }, { status: 404 });
  }

  const isConfirmed = CONFIRMED_ROUTE_STATUSES.has(input.routeStatus);
  const { data, error } = await service
    .from("buyer_routes")
    .insert({
      org_id: access.organizationId,
      requirement_id: input.requirementId,
      discovered_project_id: requirement.discovered_project_id,
      chain_node_id: input.chainNodeId ?? null,
      buyer_contact_id: input.buyerContactId ?? null,
      route_type: input.routeType,
      route_status: input.routeStatus,
      contracting_entity: input.contractingEntity ?? null,
      buyer_company: input.buyerCompany ?? null,
      buyer_contact_name: input.buyerContactName ?? null,
      buyer_contact_email: input.buyerContactEmail ?? null,
      portal_url: input.portalUrl ?? null,
      evidence_url: input.evidenceUrl ?? null,
      evidence_summary: input.evidenceSummary ?? null,
      onboarding_requirements: input.onboardingRequirements ?? null,
      engagement_model: input.engagementModel ?? null,
      owner_id: access.userId,
      next_action: input.nextAction ?? null,
      next_action_due_at: input.nextActionDueAt ?? null,
      confirmed_at: isConfirmed ? new Date().toISOString() : null,
      confirmed_by: isConfirmed ? access.userId : null,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ routeId: data.id }, { status: 201 });
}
