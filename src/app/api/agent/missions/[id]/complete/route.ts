import { NextResponse } from "next/server";
import { authorizeBotStep, completeBotStep } from "@/lib/data/mission-bot";

// ---------------------------------------------------------------------------
// POST /api/agent/missions/:id/complete — a bot finishes its mission step.
//
// { assignmentId, reply, brief: { headline, summary, recommended },
//   questionForCeo, suggestedNext: [{ label, instruction }] }
// or { assignmentId, failed: true, reason }.
//
// What was filed is counted from the step's findings, not taken from the
// report. The reply lands in the mission's conversation, the brief on its
// overview, and the finish line is recounted.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as ({ assignmentId?: string } & Record<string, unknown>) | null;
  const auth = await authorizeBotStep(request, id, body?.assignmentId, { write: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result = await completeBotStep(auth.step, body ?? {});
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
