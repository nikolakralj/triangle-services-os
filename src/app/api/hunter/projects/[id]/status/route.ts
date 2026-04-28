import { NextResponse } from "next/server";
import { requireApiAccess, createServiceSupabaseClient } from "@/lib/supabase/server";

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

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  // Update scoped to both id AND org — no separate lookup needed
  const { data, error } = await service
    .from("discovered_projects")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", access.organizationId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, status });
}
