import { NextResponse } from "next/server";
import { verifyMachineToken } from "@/lib/auth/machine";
import { parseActivityWindow } from "@/lib/data/agent-activity";
import { loadAgentActivity } from "@/lib/data/agent-activity-read";

// ---------------------------------------------------------------------------
// GET /api/agent/activity?since=<ISO>&until=<ISO>
//
// A morning summary for the field sender. Any active badge (Hanna's worker.propose,
// Scout's research.suggestion.create, or any other) reads what every bot in
// its own organisation did. No extra scope: a new read scope would leave the
// badges already in use unable to call this, and research.read would leave
// Hanna out.
//
// With no query, the window is the previous calendar day in Europe/Zagreb,
// from local midnight inclusive to the next midnight exclusive. since and
// until, when both are sent, are ISO-8601 datetimes and follow the same
// inclusive/exclusive rule. The window can cover at most 31 days.
//
// Read-only. The handler does not insert, update, or delete. Rows stay in
// the badge's organisation. Lists and free text are capped. WhatsApp `to`
// shows the last four digits. The badge check is verifyMachineToken, which
// stamps last_used_at the same way the other agent GETs do.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const machine = await verifyMachineToken(request);
  if (!machine) {
    return NextResponse.json(
      { error: "Machine credential required (tri_mc_… token)." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const parsed = parseActivityWindow(url.searchParams.get("since"), url.searchParams.get("until"));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await loadAgentActivity(machine.orgId, parsed.window);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      reader: { badge: machine.name, agentInstanceId: machine.agentInstanceId },
      ...result.body,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
