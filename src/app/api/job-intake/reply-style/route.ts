import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import {
  getReplyStyleMemory,
  upsertReplyStyleMemory,
} from "@/lib/data/job-intake";

// ---------------------------------------------------------------------------
// GET /api/job-intake/reply-style — read how the organization wants replies written
// PUT /api/job-intake/reply-style — replace that plain-English memory
//
// This affects draft generation only. It never sends email.
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ replyStyle: { body: "", updatedAt: null } });
  }

  const replyStyle = await getReplyStyleMemory(access.organizationId);
  return NextResponse.json({
    replyStyle: replyStyle ?? { body: "", updatedAt: null },
  });
}

export async function PUT(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json(
      { error: "Reply style is read-only in demo mode." },
      { status: 403 },
    );
  }
  if (access.role !== "admin" && access.role !== "partner") {
    return NextResponse.json(
      { error: "Only an admin or partner can change the reply style." },
      { status: 403 },
    );
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

  const replyStyle = await upsertReplyStyleMemory({
    orgId: access.organizationId,
    body: payload.body,
    userId: access.userId,
  });

  if (!replyStyle) {
    return NextResponse.json(
      { error: "Could not save the reply style." },
      { status: 500 },
    );
  }
  return NextResponse.json({ replyStyle });
}
