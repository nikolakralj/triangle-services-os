import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { getProjectNote, upsertProjectNote } from "@/lib/data/project-notes";

// ---------------------------------------------------------------------------
// GET /api/projects/[id]/notes
// Return the project's freeform note (or an empty note if none exists).
// ---------------------------------------------------------------------------
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id: projectId } = await params;

  if (access.demo) {
    return NextResponse.json({ note: { body: "", updatedAt: null, updatedBy: null } });
  }

  const note = await getProjectNote(projectId, access.organizationId);
  return NextResponse.json({
    note: note ?? { body: "", updatedAt: null, updatedBy: null },
  });
}

// ---------------------------------------------------------------------------
// PUT /api/projects/[id]/notes
// Body: { body: string }
// Create or replace the project's note.
// ---------------------------------------------------------------------------
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id: projectId } = await params;

  if (access.demo) {
    return NextResponse.json({
      note: { body: "", updatedAt: null, updatedBy: null },
      message: "Notes are read-only in demo mode.",
    });
  }

  let payload: { body?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof payload.body !== "string") {
    return NextResponse.json({ error: "body must be a string." }, { status: 400 });
  }

  const note = await upsertProjectNote({
    projectId,
    orgId: access.organizationId,
    body: payload.body,
    userId: access.userId,
  });

  if (!note) {
    return NextResponse.json({ error: "Failed to save note." }, { status: 500 });
  }

  return NextResponse.json({ note });
}
