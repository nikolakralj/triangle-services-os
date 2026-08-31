import { NextResponse } from "next/server";
import { requirementInputSchema } from "@/lib/commercial/validation";
import {
  createServiceSupabaseClient,
  requireApiAccess,
} from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json(
      { error: "Requirements are not available in demo mode." },
      { status: 403 },
    );
  }
  if (access.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = requirementInputSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const input = parsed.data;
  let sourceType = input.source;
  let sourceId: string | null = null;
  if (input.source.includes(":")) {
    [sourceType, sourceId] = input.source.split(":", 2);
  }
  if (
    !["manual", "supply_first", "referral", "job_lead", "discovered_project", "opportunity"].includes(
      sourceType,
    ) ||
    (["job_lead", "discovered_project", "opportunity"].includes(sourceType) &&
      (!sourceId || !UUID_RE.test(sourceId)))
  ) {
    return NextResponse.json({ error: "Invalid source record." }, { status: 400 });
  }

  const sourceConfig = {
    job_lead: { table: "job_leads", orgColumn: "org_id", targetColumn: "job_lead_id" },
    discovered_project: {
      table: "discovered_projects",
      orgColumn: "organization_id",
      targetColumn: "discovered_project_id",
    },
    opportunity: {
      table: "opportunities",
      orgColumn: "organization_id",
      targetColumn: "opportunity_id",
    },
  }[sourceType];

  const sourceFields: Record<string, string | null> = {};
  if (sourceConfig && sourceId) {
    const { data: sourceRecord } = await service
      .from(sourceConfig.table)
      .select("id")
      .eq("id", sourceId)
      .eq(sourceConfig.orgColumn, access.organizationId)
      .maybeSingle();
    if (!sourceRecord) {
      return NextResponse.json(
        { error: "Source record not found in this organization." },
        { status: 404 },
      );
    }
    sourceFields[sourceConfig.targetColumn] = sourceId;

    const { data: existing } = await service
      .from("commercial_requirements")
      .select("id")
      .eq("org_id", access.organizationId)
      .eq(sourceConfig.targetColumn, sourceId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "This source already has a commercial requirement.", requirementId: existing.id },
        { status: 409 },
      );
    }
  }

  if (input.projectPackageId) {
    const { data: projectPackage } = await service
      .from("project_packages")
      .select("id")
      .eq("id", input.projectPackageId)
      .eq("org_id", access.organizationId)
      .maybeSingle();
    if (!projectPackage) {
      return NextResponse.json({ error: "Package not found." }, { status: 404 });
    }
  }

  const { data, error } = await service
    .from("commercial_requirements")
    .insert({
      org_id: access.organizationId,
      source_type: sourceType,
      ...sourceFields,
      project_package_id: input.projectPackageId ?? null,
      title: input.title,
      status: "draft",
      scope_summary: input.scopeSummary ?? null,
      exclusions: input.exclusions ?? null,
      roles: input.roles,
      headcount_min: input.headcountMin ?? null,
      headcount_max: input.headcountMax ?? null,
      seniority: input.seniority ?? null,
      country: input.country ?? null,
      city: input.city ?? null,
      site_location: input.siteLocation ?? null,
      start_date_from: input.startDateFrom ?? null,
      start_date_to: input.startDateTo ?? null,
      start_window_text: input.startWindowText ?? null,
      duration_weeks: input.durationWeeks ?? null,
      duration_text: input.durationText ?? null,
      shift_pattern: input.shiftPattern ?? null,
      required_skills: input.requiredSkills,
      required_documents: input.requiredDocuments,
      engagement_model: input.engagementModel,
      budget_min: input.budgetMin ?? null,
      budget_max: input.budgetMax ?? null,
      currency: input.currency,
      rate_unit: input.rateUnit ?? null,
      payment_terms_days: input.paymentTermsDays ?? null,
      commercial_notes: input.commercialNotes ?? null,
      country_feasibility_state: input.countryFeasibilityState,
      supplier_onboarding_state: input.supplierOnboardingState,
      unknowns: input.unknowns,
      demand_evidence_url: input.demandEvidenceUrl ?? null,
      demand_evidence_summary: input.demandEvidenceSummary ?? null,
      demand_evidence_date: input.demandEvidenceDate ?? null,
      owner_id: access.userId,
      next_action: input.nextAction ?? null,
      next_action_due_at: input.nextActionDueAt ?? null,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ requirementId: data.id }, { status: 201 });
}
