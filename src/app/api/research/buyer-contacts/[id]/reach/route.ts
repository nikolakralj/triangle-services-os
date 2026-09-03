import { NextResponse } from "next/server";
import { queueReachabilityJob } from "@/lib/data/reachability";
import { requireApiAccess } from "@/lib/supabase/server";

/**
 * POST /api/research/buyer-contacts/[id]/reach
 *
 * Put an employee on finding a way to reach this person. One click, no form:
 * the CEO decides that this contact is worth reaching, and a worker goes and
 * looks. Nothing is contacted — the job explicitly forbids it.
 *
 * Body: { runtime?: "bot" | "in_app" }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Demo mode is read-only" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    runtime?: "bot" | "in_app";
  };

  const result = await queueReachabilityJob({
    buyerContactId: id,
    orgId: access.organizationId,
    userId: access.userId ?? null,
    runtime: body.runtime,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, assignmentId: result.assignmentId });
}
