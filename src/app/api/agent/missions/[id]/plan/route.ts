import { NextResponse } from "next/server";
import { authorizeBotStep, pickUpBotStep, setBotPlan } from "@/lib/data/mission-bot";

// ---------------------------------------------------------------------------
// POST /api/agent/missions/:id/plan — a finish line and route for a mission
// that has none.
//
// { assignmentId, criteria: [{ metric, target }], plan: [{ pass, title, metric }] }.
// Kept to what Triangle can count; a narrower count never exceeds the one it
// narrows. Once set, only the CEO moves it.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    assignmentId?: string;
    criteria?: unknown;
    plan?: unknown;
  } | null;
  const auth = await authorizeBotStep(request, id, body?.assignmentId, { write: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await pickUpBotStep(auth.step);
  const result = await setBotPlan(auth.step, body ?? {});
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: "status" in result ? result.status : 400 });
  }
  return NextResponse.json(result);
}
