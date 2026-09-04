import { NextResponse } from "next/server";
import { runNextScoutAssignment } from "@/lib/ai/scout-executor";
import { safeEqual } from "@/lib/job-intake/credentials";

// ---------------------------------------------------------------------------
// The employees work when nobody is watching.
//
// Until now, queued work only ran while a manager had Triangle open in a
// visible tab — AgentWorkPulse said as much in its own comment: "a durable
// cloud scheduler is the next runtime layer". Close the tab and the company
// stopped. That is the opposite of an AI workforce; it is a human driving a
// machine that pretends to drive itself.
//
// Called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. It claims
// and runs queued assignments the same way the in-app pulse does, so there is
// one execution path and one set of database claims rather than two that can
// disagree.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Bounded on purpose. Each run costs an OpenAI call, and an unbounded loop on
 * a schedule is how a quiet weekend turns into a bill nobody authorised.
 */
const MAX_PER_INVOCATION = Number(process.env.AGENT_CRON_BATCH ?? 3);

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : null;
  // Constant-time compare so the token cannot be recovered by timing.
  if (!secret || !token || !safeEqual(token, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = process.env.CRON_ORGANIZATION_ID ?? "";
  if (!orgId) {
    return NextResponse.json(
      { error: "CRON_ORGANIZATION_ID must be set for scheduled agent work." },
      { status: 500 },
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 503 },
    );
  }

  const ran: Array<{ status: string; assignmentId?: string }> = [];
  for (let i = 0; i < MAX_PER_INVOCATION; i++) {
    const result = await runNextScoutAssignment(orgId);
    if (result.status === "idle") break;
    ran.push({
      status: result.status,
      assignmentId: "assignmentId" in result ? result.assignmentId : undefined,
    });
    // A failing employee should not burn the whole batch retrying behind it.
    if (result.status === "failed") break;
  }

  return NextResponse.json({
    ok: true,
    ran: ran.length,
    results: ran,
  });
}

// Vercel Cron issues GET. Same work, same guard.
export async function GET(request: Request) {
  return POST(request);
}
