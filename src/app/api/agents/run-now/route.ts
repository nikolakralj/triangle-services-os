import { NextResponse } from "next/server";
import { runNextScoutAssignment } from "@/lib/ai/scout-executor";
import { requireApiAccess } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST /api/agents/run-now — leftover of the in-app Scout executor.
//
// 15 September 2026: Scout is bot-owned. Triangle stores the work and wakes
// the Grok bot. This endpoint no longer claims Scout jobs or spends OpenAI.
// The Ask / Workforce create paths wake the bot themselves.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo || access.role === "viewer") {
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
  if (result.status === "refused") {
    return NextResponse.json({ status: "refused", message: result.reason });
  }
  if (result.status === "failed") {
    return NextResponse.json({ status: "failed", message: result.error });
  }
  return NextResponse.json({
    status: "completed",
    assignmentId: result.assignmentId,
    message: result.headline,
  });
}
