import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@/lib/supabase/server";
import { getMissionPulse } from "@/lib/data/missions";

// ---------------------------------------------------------------------------
// GET /api/missions/:id/pulse — is it still working, and what has it done?
//
// Polled every few seconds while a step runs, so the worker panel can show
// "Searched …", "Read …" as it happens. Deliberately small: the state, the
// current step's activity, and nothing the page already has.
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
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Unknown mission." }, { status: 404 });
  }
  const pulse = await getMissionPulse(access.organizationId, id);
  if (!pulse) return NextResponse.json({ error: "Unknown mission." }, { status: 404 });
  return NextResponse.json(pulse, { headers: { "Cache-Control": "no-store" } });
}
