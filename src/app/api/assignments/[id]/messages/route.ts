import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import {
  addHumanMessage,
  listAssignmentMessages,
} from "@/lib/data/assignment-threads";

// ---------------------------------------------------------------------------
// The human side of an assignment thread.
//
// GET  — read the conversation.
// POST — ask a follow-up.
//
// Session-only: machine credentials go through /api/agent/inbox instead, so a
// bot can never post here pretending to be a person.
// ---------------------------------------------------------------------------

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
  const messages = await listAssignmentMessages(id, access.organizationId);
  return NextResponse.json({ messages });
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

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = String(body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "Write something first." }, { status: 400 });
  }

  const result = await addHumanMessage({
    assignmentId: id,
    orgId: access.organizationId,
    userId: access.userId,
    body: message,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const messages = await listAssignmentMessages(id, access.organizationId);
  return NextResponse.json({ ok: true, reopened: result.reopened, messages });
}
