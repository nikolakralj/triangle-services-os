import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { getDiscoveredProjectById } from "@/lib/data/discovered-projects";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

const VALID_STATUSES = new Set([
  "new",
  "reviewing",
  "qualified",
  "pursuing",
  "won",
  "lost",
  "archived",
  "duplicate",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => ({}));
  const { status } = body as { status?: string };

  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `Invalid status. Valid: ${[...VALID_STATUSES].join(", ")}` },
      { status: 400 },
    );
  }

  // Verify project belongs to org
  const row = await getDiscoveredProjectById(id);
  if (!row || row.organization_id !== access.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  const { error } = await service
    .from("discovered_projects")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log activity
  await service.from("activities").insert({
    organization_id: access.organizationId,
    activity_type: "status_change",
    title: "Project status updated",
    summary: `Discovered project status changed to: ${status}`,
    created_by: access.userId,
  });

  return NextResponse.json({ ok: true, status });
}
