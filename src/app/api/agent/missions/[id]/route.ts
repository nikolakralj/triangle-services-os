import { NextResponse } from "next/server";
import { authorizeBotStep, missionPayloadForStep, pickUpBotStep } from "@/lib/data/mission-bot";

// ---------------------------------------------------------------------------
// GET /api/agent/missions/:id?assignmentId=… — a bot reads its mission step.
//
// The objective, the instruction, the finish line, the CEO's decisions, what
// the mission already holds and what Triangle can supply. Reading it starts
// the step, so the mission shows the CEO it was picked up.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assignmentId = new URL(request.url).searchParams.get("assignmentId");
  const auth = await authorizeBotStep(request, id, assignmentId, { write: false });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await pickUpBotStep(auth.step);
  const payload = await missionPayloadForStep(auth.machine.orgId, id, auth.step.id);
  if (!payload) return NextResponse.json({ error: "The mission could not be read." }, { status: 404 });
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
