import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { deleteWorkerDocument } from "@/lib/data/worker-documents";

// ---------------------------------------------------------------------------
// DELETE /api/workers/[id]/documents/[docId]  — delete a worker document
// ---------------------------------------------------------------------------

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { docId } = await params;

  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  const ok = await deleteWorkerDocument(docId, access.organizationId);
  if (!ok) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  return NextResponse.json({ success: true });
}
