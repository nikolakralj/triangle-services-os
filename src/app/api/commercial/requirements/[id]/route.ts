import { NextResponse } from "next/server";
import { requirementPatchSchema } from "@/lib/commercial/validation";
import {
  createServiceSupabaseClient,
  requireApiAccess,
} from "@/lib/supabase/server";

const DECISION_STATUSES = new Set([
  "qualified",
  "disqualified",
  "proposal_ready",
  "ordered",
  "closed",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo || access.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = requirementPatchSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const isDecision = input.status && DECISION_STATUSES.has(input.status);
  if (
    (isDecision || input.buyerConfirmed !== undefined) &&
    !["admin", "partner"].includes(access.role)
  ) {
    return NextResponse.json(
      { error: "Only an admin or partner can confirm demand or make a qualification decision." },
      { status: 403 },
    );
  }

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }
  const { id } = await params;
  const { data: current } = await service
    .from("commercial_requirements")
    .select("id")
    .eq("id", id)
    .eq("org_id", access.organizationId)
    .maybeSingle();
  if (!current) {
    return NextResponse.json({ error: "Requirement not found." }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_by: access.userId };
  const mapping: Array<[keyof typeof input, string]> = [
    ["title", "title"],
    ["projectPackageId", "project_package_id"],
    ["scopeSummary", "scope_summary"],
    ["exclusions", "exclusions"],
    ["roles", "roles"],
    ["headcountMin", "headcount_min"],
    ["headcountMax", "headcount_max"],
    ["seniority", "seniority"],
    ["country", "country"],
    ["city", "city"],
    ["siteLocation", "site_location"],
    ["startDateFrom", "start_date_from"],
    ["startDateTo", "start_date_to"],
    ["startWindowText", "start_window_text"],
    ["durationWeeks", "duration_weeks"],
    ["durationText", "duration_text"],
    ["shiftPattern", "shift_pattern"],
    ["requiredSkills", "required_skills"],
    ["requiredDocuments", "required_documents"],
    ["engagementModel", "engagement_model"],
    ["budgetMin", "budget_min"],
    ["budgetMax", "budget_max"],
    ["currency", "currency"],
    ["rateUnit", "rate_unit"],
    ["paymentTermsDays", "payment_terms_days"],
    ["commercialNotes", "commercial_notes"],
    ["countryFeasibilityState", "country_feasibility_state"],
    ["supplierOnboardingState", "supplier_onboarding_state"],
    ["unknowns", "unknowns"],
    ["demandEvidenceUrl", "demand_evidence_url"],
    ["demandEvidenceSummary", "demand_evidence_summary"],
    ["demandEvidenceDate", "demand_evidence_date"],
    ["nextAction", "next_action"],
    ["nextActionDueAt", "next_action_due_at"],
    ["decisionReason", "decision_reason"],
    ["status", "status"],
  ];
  for (const [inputKey, column] of mapping) {
    if (input[inputKey] !== undefined) updates[column] = input[inputKey] ?? null;
  }
  if (input.buyerConfirmed !== undefined) {
    updates.buyer_confirmed_at = input.buyerConfirmed
      ? new Date().toISOString()
      : null;
    updates.buyer_confirmed_by = input.buyerConfirmed ? access.userId : null;
  }

  const { error } = await service
    .from("commercial_requirements")
    .update(updates)
    .eq("id", id)
    .eq("org_id", access.organizationId);
  if (error) {
    const qualificationError = error.message.includes("Requirement cannot be");
    return NextResponse.json(
      { error: error.message },
      { status: qualificationError ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
