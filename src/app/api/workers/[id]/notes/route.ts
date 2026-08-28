import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import {
  addWorkerNote,
  listWorkerNotes,
  NOTE_KINDS,
  type WorkerNoteKind,
} from "@/lib/data/worker-notes";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  return NextResponse.json({ notes: await listWorkerNotes(id, access.organizationId) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  const { id } = await params;

  let body: { body?: string; kind?: string; occurredOn?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const kind = (
    NOTE_KINDS.includes(body.kind as WorkerNoteKind) ? body.kind : "note"
  ) as WorkerNoteKind;

  const result = await addWorkerNote({
    workerId: id,
    orgId: access.organizationId,
    userId: access.userId,
    kind,
    body: String(body.body ?? ""),
    occurredOn: body.occurredOn ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    notes: await listWorkerNotes(id, access.organizationId),
  });
}
