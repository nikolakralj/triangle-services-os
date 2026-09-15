import { NextResponse } from "next/server";
import { authorizeBotStep, fileBotPool, pickUpBotStep } from "@/lib/data/mission-bot";

// ---------------------------------------------------------------------------
// POST /api/agent/missions/:id/pool — Hanna proposes people into the pool path.
//
// { assignmentId, proposals: [...] }
//
// Each item is either a candidate (workerId already in the pool, findingId of
// a pending CV, or fields for a person to accept) or an availability update
// (proposed status a person accepts, and/or check words a person sends).
// Hanna cannot create a worker, cannot accept one, and cannot mark anyone
// available. Triangle sends nothing.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { assignmentId?: string; proposals?: unknown } | null;
  const auth = await authorizeBotStep(request, id, body?.assignmentId, { write: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await pickUpBotStep(auth.step);
  const result = await fileBotPool(auth.step, body?.proposals);
  if ("error" in result) {
    const status = result.error.includes("worker.propose")
      ? 403
      : result.error.includes("unavailable")
        ? 503
        : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result);
}
