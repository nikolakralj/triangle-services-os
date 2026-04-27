import { NextResponse } from "next/server";
import { activitySchema } from "@/lib/validation";
import {
  createServiceSupabaseClient,
  requireApiAccess,
} from "@/lib/supabase/server";

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  const parsed = activitySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const service = createServiceSupabaseClient();
  if (service && !access.demo) {
    const input = parsed.data;
    const { data, error } = await service
      .from("activities")
      .insert({
        organization_id: access.organizationId,
        activity_type: input.activityType,
        title: input.title,
        summary: input.summary ?? null,
        body: input.body ?? null,
        company_id: input.companyId ?? null,
        contact_id: input.contactId ?? null,
        opportunity_id: input.opportunityId ?? null,
        worker_id: input.workerId ?? null,
        metadata: input.metadata ?? {},
        created_by: access.userId,
      })
      .select("id")
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ activityId: data.id });
  }

  return NextResponse.json({
    activityId: "demo-activity",
    message: "Activity accepted in demo mode.",
  });
}
