import { NextResponse } from "next/server";
import { buyerRoutePatchSchema } from "@/lib/commercial/validation";
import {
  createServiceSupabaseClient,
  requireApiAccess,
} from "@/lib/supabase/server";

const HUMAN_STATUSES = new Set([
  "contacted",
  "prequalification",
  "confirmed",
  "approved",
  "blocked",
  "rejected",
  "dormant",
]);
const CONFIRMED_STATUSES = new Set(["prequalification", "confirmed", "approved"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.demo || access.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = buyerRoutePatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", issues: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceSupabaseClient();
  if (!service) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const { id } = await params;
  const { data: current } = await service
    .from("buyer_routes")
    .select("*")
    .eq("id", id)
    .eq("org_id", access.organizationId)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "Buyer route not found." }, { status: 404 });

  const input = parsed.data;
  const nextStatus = input.routeStatus ?? current.route_status;
  if (HUMAN_STATUSES.has(nextStatus) && !["admin", "partner"].includes(access.role)) {
    return NextResponse.json({ error: "Only an admin or partner can record this route state." }, { status: 403 });
  }
  const evidenceSummary = input.evidenceSummary ?? current.evidence_summary;
  const nextAction = input.nextAction ?? current.next_action;
  const nextActionDueAt = input.nextActionDueAt ?? current.next_action_due_at;
  if (CONFIRMED_STATUSES.has(nextStatus) && (!evidenceSummary || !nextAction || !nextActionDueAt)) {
    return NextResponse.json({ error: "A confirmed route requires evidence and a dated next action." }, { status: 409 });
  }

  const updates: Record<string, unknown> = { updated_by: access.userId };
  const mapping: Array<[keyof typeof input, string]> = [
    ["chainNodeId", "chain_node_id"], ["buyerContactId", "buyer_contact_id"],
    ["routeType", "route_type"], ["routeStatus", "route_status"],
    ["contractingEntity", "contracting_entity"], ["buyerCompany", "buyer_company"],
    ["buyerContactName", "buyer_contact_name"], ["buyerContactEmail", "buyer_contact_email"],
    ["portalUrl", "portal_url"], ["evidenceUrl", "evidence_url"],
    ["evidenceSummary", "evidence_summary"], ["onboardingRequirements", "onboarding_requirements"],
    ["engagementModel", "engagement_model"], ["nextAction", "next_action"],
    ["nextActionDueAt", "next_action_due_at"],
  ];
  for (const [key, column] of mapping) if (input[key] !== undefined) updates[column] = input[key] ?? null;
  if (input.routeStatus) {
    updates.confirmed_at = CONFIRMED_STATUSES.has(nextStatus) ? current.confirmed_at ?? new Date().toISOString() : null;
    updates.confirmed_by = CONFIRMED_STATUSES.has(nextStatus) ? current.confirmed_by ?? access.userId : null;
  }

  const { error } = await service.from("buyer_routes").update(updates).eq("id", id).eq("org_id", access.organizationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
