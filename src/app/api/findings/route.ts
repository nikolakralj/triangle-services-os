import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { acceptFinding, rejectFinding } from "@/lib/data/findings";

// ---------------------------------------------------------------------------
// PATCH /api/findings — a human accepts or rejects an agent's finding.
//
// Accepting promotes it into a real domain record (a project today), which
// is the moment a discovery enters the business. Deliberately session-only:
// no machine credential can reach this, so an agent can never approve itself.
// ---------------------------------------------------------------------------

export async function PATCH(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  let body: { findingId?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const findingId = String(body.findingId ?? "").trim();
  const action = String(body.action ?? "").trim();
  if (!findingId || !["accept", "reject"].includes(action)) {
    return NextResponse.json(
      { error: "findingId and action (accept|reject) are required." },
      { status: 400 },
    );
  }

  if (action === "reject") {
    const ok = await rejectFinding({
      findingId,
      orgId: access.organizationId,
      userId: access.userId,
    });
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json(
          { error: "Could not reject — it may already be reviewed." },
          { status: 400 },
        );
  }

  const result = await acceptFinding({
    findingId,
    orgId: access.organizationId,
    userId: access.userId,
  });
  if (!result) {
    return NextResponse.json(
      { error: "Could not accept — it may already be reviewed, or the payload is incomplete." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, ...result });
}
