import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { listMissionTabs } from "@/lib/data/missions";

// ---------------------------------------------------------------------------
// GET /api/missions — the open missions, as the tab strip shows them.
//
// Read by the Ask box when it opens, so "add this to a mission" offers the
// missions that exist now rather than the ones that existed when the page
// loaded.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) return NextResponse.json({ tabs: [] });
  const tabs = await listMissionTabs(access.organizationId);
  return NextResponse.json({ tabs });
}
