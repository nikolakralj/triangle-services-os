import { NextResponse } from "next/server";
import { recordRefusal } from "@/lib/data/refusals";
import { commercialActionInputSchema } from "@/lib/commercial/validation";
import {
  createServiceSupabaseClient,
  requireApiAccess,
} from "@/lib/supabase/server";

const COMPLETED_STATUSES = new Set(["completed", "responded", "no_response"]);

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo || access.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = commercialActionInputSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const completed = COMPLETED_STATUSES.has(input.status);
  if (completed && !["admin", "partner"].includes(access.role)) {
    return NextResponse.json(
      { error: "Only an admin or partner can confirm a completed external action." },
      { status: 403 },
    );
  }

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }
  const { data: requirement } = await service
    .from("commercial_requirements")
    .select("id")
    .eq("id", input.requirementId)
    .eq("org_id", access.organizationId)
    .maybeSingle();
  if (!requirement) {
    return NextResponse.json({ error: "Requirement not found." }, { status: 404 });
  }
  if (input.buyerRouteId) {
    const { data: route } = await service
      .from("buyer_routes")
      .select("id")
      .eq("id", input.buyerRouteId)
      .eq("requirement_id", input.requirementId)
      .eq("org_id", access.organizationId)
      .maybeSingle();
    if (!route) return NextResponse.json({ error: "Buyer route not found." }, { status: 404 });
  }
  if (input.projectPackageId) {
    const { data: projectPackage } = await service
      .from("project_packages")
      .select("id")
      .eq("id", input.projectPackageId)
      .eq("org_id", access.organizationId)
      .maybeSingle();
    if (!projectPackage) {
      return NextResponse.json({ error: "Package not found in this organization." }, { status: 404 });
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await service
    .from("commercial_actions")
    .insert({
      org_id: access.organizationId,
      requirement_id: input.requirementId,
      buyer_route_id: input.buyerRouteId ?? null,
      project_package_id: input.projectPackageId ?? null,
      action_type: input.actionType,
      status: input.status,
      channel: input.channel ?? null,
      sender_user_id: access.userId,
      recipient_name: input.recipientName ?? null,
      recipient_email: input.recipientEmail ?? null,
      recipient_company: input.recipientCompany ?? null,
      subject: input.subject ?? null,
      ai_draft: input.aiDraft ?? null,
      final_content: input.finalContent ?? null,
      occurred_at: input.occurredAt ?? (completed ? now : null),
      follow_up_at: input.followUpAt ?? null,
      response_summary: input.responseSummary ?? null,
      objection: input.objection ?? null,
      outcome: input.outcome ?? null,
      next_action: input.nextAction ?? null,
      next_action_due_at: input.nextActionDueAt ?? null,
      human_confirmed_at: completed ? now : null,
      human_confirmed_by: completed ? access.userId : null,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .single();

  if (error) {
    const truthError = error.message.includes("commercial action requires");
    // The refusal is the informative part. Recorded before the response so the
    // attempt survives even though its transaction did not.
    await recordRefusal({
      orgId: access.organizationId,
      surface: "Record a commercial action",
      reason: error.message,
      userId: access.userId ?? null,
      entityType: "commercial_action",
    });
    return NextResponse.json(
      { error: error.message },
      { status: truthError ? 409 : 500 },
    );
  }
  return NextResponse.json({ actionId: data.id }, { status: 201 });
}
