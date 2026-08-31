import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createServiceSupabaseClient,
  requireApiRole,
} from "@/lib/supabase/server";

const patchSchema = z.object({
  status: z.enum(["missing", "draft", "uploaded", "approved", "expired"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiRole(request, ["admin", "partner"]);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json(
      { error: "Checklist updates are not available in demo mode." },
      { status: 403 },
    );
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid checklist status." }, { status: 400 });
  }

  const { id } = await params;
  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const { data: current } = await service
    .from("document_checklist_items")
    .select("id,linked_document_id")
    .eq("id", id)
    .eq("organization_id", access.organizationId)
    .maybeSingle();

  if (!current) {
    return NextResponse.json({ error: "Checklist item not found." }, { status: 404 });
  }
  if (
    ["uploaded", "approved"].includes(parsed.data.status) &&
    !current.linked_document_id
  ) {
    return NextResponse.json(
      { error: "Upload and link a document before approving this item." },
      { status: 409 },
    );
  }

  const { error } = await service
    .from("document_checklist_items")
    .update({
      status: parsed.data.status,
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", access.organizationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: parsed.data.status });
}
