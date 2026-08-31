import { NextResponse } from "next/server";
import { commercialActionPatchSchema } from "@/lib/commercial/validation";
import {
  createServiceSupabaseClient,
  requireApiAccess,
} from "@/lib/supabase/server";

const COMPLETED_STATUSES = new Set(["completed", "responded", "no_response"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.demo || access.role === "viewer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = commercialActionPatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", issues: parsed.error.flatten() }, { status: 400 });
  }
  const service = createServiceSupabaseClient();
  if (!service) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const { id } = await params;
  const { data: current } = await service
    .from("commercial_actions")
    .select("*")
    .eq("id", id)
    .eq("org_id", access.organizationId)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "Commercial action not found." }, { status: 404 });

  const input = parsed.data;
  const nextStatus = input.status ?? current.status;
  const completed = COMPLETED_STATUSES.has(nextStatus);
  if (completed && !["admin", "partner"].includes(access.role)) {
    return NextResponse.json({ error: "Only an admin or partner can confirm a completed action." }, { status: 403 });
  }
  if (input.buyerRouteId) {
    const { data: route } = await service
      .from("buyer_routes")
      .select("id")
      .eq("id", input.buyerRouteId)
      .eq("requirement_id", current.requirement_id)
      .eq("org_id", access.organizationId)
      .maybeSingle();
    if (!route) return NextResponse.json({ error: "Buyer route does not match this requirement." }, { status: 404 });
  }
  if (input.projectPackageId) {
    const { data: projectPackage } = await service
      .from("project_packages")
      .select("id")
      .eq("id", input.projectPackageId)
      .eq("org_id", access.organizationId)
      .maybeSingle();
    if (!projectPackage) return NextResponse.json({ error: "Package not found in this organization." }, { status: 404 });
  }
  const updates: Record<string, unknown> = { updated_by: access.userId };
  const mapping: Array<[keyof typeof input, string]> = [
    ["buyerRouteId", "buyer_route_id"], ["projectPackageId", "project_package_id"],
    ["actionType", "action_type"], ["status", "status"], ["channel", "channel"],
    ["recipientName", "recipient_name"], ["recipientEmail", "recipient_email"],
    ["recipientCompany", "recipient_company"], ["subject", "subject"],
    ["aiDraft", "ai_draft"], ["finalContent", "final_content"],
    ["occurredAt", "occurred_at"], ["followUpAt", "follow_up_at"],
    ["responseSummary", "response_summary"], ["objection", "objection"],
    ["outcome", "outcome"], ["nextAction", "next_action"],
    ["nextActionDueAt", "next_action_due_at"],
  ];
  for (const [key, column] of mapping) if (input[key] !== undefined) updates[column] = input[key] ?? null;
  if (input.status) {
    const now = new Date().toISOString();
    updates.occurred_at = completed ? input.occurredAt ?? current.occurred_at ?? now : current.occurred_at;
    updates.human_confirmed_at = completed ? current.human_confirmed_at ?? now : null;
    updates.human_confirmed_by = completed ? current.human_confirmed_by ?? access.userId : null;
  }

  const { error } = await service.from("commercial_actions").update(updates).eq("id", id).eq("org_id", access.organizationId);
  if (error) {
    const truthError = error.message.includes("commercial action requires");
    return NextResponse.json({ error: error.message }, { status: truthError ? 409 : 500 });
  }
  return NextResponse.json({ ok: true });
}
