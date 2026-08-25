import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import {
  matchWorkersToPackage,
  saveWorkerMatches,
  listPackageMatches,
  updateMatchStatus,
} from "@/lib/data/worker-matching";

// ---------------------------------------------------------------------------
// POST /api/packages/[id]/match
// Run match engine, persist results, return { count, matches }
// ---------------------------------------------------------------------------
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id: packageId } = await params;

  if (access.demo) {
    return NextResponse.json({ count: 0, matches: [], message: "Match engine not available in demo mode." });
  }

  const matches = await matchWorkersToPackage(packageId, access.organizationId);
  await saveWorkerMatches(packageId, access.organizationId, matches);

  return NextResponse.json({ count: matches.length, matches });
}

// ---------------------------------------------------------------------------
// GET /api/packages/[id]/match
// Return persisted matches enriched with worker info
// ---------------------------------------------------------------------------
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id: packageId } = await params;

  if (access.demo) {
    return NextResponse.json({ matches: [] });
  }

  const matches = await listPackageMatches(packageId, access.organizationId);
  return NextResponse.json({ matches });
}

// ---------------------------------------------------------------------------
// PATCH /api/packages/[id]/match
// Body: { matchId: string, status: string, notes?: string }
// Update status (and optionally notes) for a specific match row
// ---------------------------------------------------------------------------
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  await params; // resolve dynamic param

  if (access.demo) {
    return NextResponse.json({ ok: true, message: "Status update accepted in demo mode." });
  }

  let body: { matchId?: string; status?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { matchId, status, notes } = body;

  if (!matchId || typeof matchId !== "string") {
    return NextResponse.json({ error: "matchId is required." }, { status: 400 });
  }

  const validStatuses = ["shortlisted", "submitted", "rejected", "placed"];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${validStatuses.join(", ")}.` },
      { status: 400 },
    );
  }

  const ok = await updateMatchStatus(matchId, access.organizationId, status, notes);
  if (!ok) {
    return NextResponse.json({ error: "Failed to update match status." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matchId, status });
}
