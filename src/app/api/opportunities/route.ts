import { NextResponse } from "next/server";
import { requireApiRole, createServiceSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const access = await requireApiRole(request, ["admin", "partner"]);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  const body = await request.json();
  const { title, companyId, stageId, country, estimatedValue } = body;

  if (!title || !companyId) {
    return NextResponse.json(
      { error: "Title and company are required" },
      { status: 400 },
    );
  }

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 500 },
    );
  }

  const { data, error } = await service
    .from("opportunities")
    .insert({
      title,
      company_id: companyId,
      stage_id: stageId,
      country: country || "Unknown",
      estimated_value: estimatedValue,
      organization_id: access.organizationId,
      created_by: access.userId,
      status: "open",
    })
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log activity
  await service.from("activities").insert({
    organization_id: access.organizationId,
    activity_type: "status_change",
    title: "Opportunity created",
    summary: `New opportunity: ${title}`,
    opportunity_id: data?.id,
    created_by: access.userId,
  });

  return NextResponse.json(
    { ok: true, opportunity: data },
    { status: 201 },
  );
}
