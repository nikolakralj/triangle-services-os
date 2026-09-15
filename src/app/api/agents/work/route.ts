import { NextResponse } from "next/server";
import { runNextScoutAssignment } from "@/lib/ai/scout-executor";
import { requireApiAccess } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST /api/agents/work — leftover of the in-app Scout pulse.
//
// 15 September 2026: Scout is bot-owned. This no longer claims Scout jobs or
// spends OpenAI. Kept so an open tab does not 404; it returns idle.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ status: "idle" });
  }
  if (access.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await runNextScoutAssignment(access.organizationId);
  if (result.status === "idle") {
    return NextResponse.json({
      status: "idle",
      message:
        "Scout work is owned by the Scout bot. Triangle stores it and wakes the bot; this runtime does not run it.",
    });
  }
  return NextResponse.json(result);
}
