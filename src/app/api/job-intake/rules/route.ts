import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { getIntakeRules, upsertIntakeRules } from "@/lib/data/job-intake";

// ---------------------------------------------------------------------------
// GET /api/job-intake/rules  — read the org's own scoring rules
// PUT /api/job-intake/rules  — replace them
//
// These are injected into the classification prompt on every email, so the
// team can change what the agent looks for without a code change.
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ rules: { body: "", updatedAt: null } });
  }

  const rules = await getIntakeRules(access.organizationId);
  return NextResponse.json({ rules: rules ?? { body: "", updatedAt: null } });
}

export async function PUT(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json(
      { error: "Rules are read-only in demo mode." },
      { status: 403 },
    );
  }
  if (access.role !== "admin" && access.role !== "partner") {
    return NextResponse.json(
      { error: "Only an admin or partner can change the scoring rules." },
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

  const rules = await upsertIntakeRules({
    orgId: access.organizationId,
    body: payload.body,
    userId: access.userId,
  });

  if (!rules) {
    return NextResponse.json({ error: "Could not save the rules." }, { status: 500 });
  }
  return NextResponse.json({ rules });
}
