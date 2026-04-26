import { NextResponse } from "next/server";
import { stageUpdateSchema } from "@/lib/validation";
import { createServiceSupabaseClient, requireApiRole } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireApiRole(request, ["admin", "partner"]);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await context.params;
  const parsed = stageUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", issues: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceSupabaseClient();
  if (service && !access.demo) {
    const { error } = await service
      .from("opportunities")
      .update({ stage_id: parsed.data.stageId, updated_by: access.userId })
      .eq("id", id)
      .eq("organization_id", access.organizationId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await service.from("activities").insert({
      organization_id: access.organizationId,
      activity_type: "status_change",
      title: "Opportunity stage changed",
      summary: `Stage changed to ${parsed.data.stageId}.`,
      opportunity_id: id,
      created_by: access.userId,
    });
  }

  return NextResponse.json({ ok: true, opportunityId: id, stageId: parsed.data.stageId });
}
