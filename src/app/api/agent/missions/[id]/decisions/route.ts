import { NextResponse } from "next/server";
import { authorizeBotStep, pickUpBotStep, recordBotDecisions } from "@/lib/data/mission-bot";

// ---------------------------------------------------------------------------
// POST /api/agent/missions/:id/decisions — the CEO's standing decisions, as a
// bot read them from the instruction.
//
// { assignmentId, decisions: [{ kind, text, quote }], replaces: [decisionId] }.
// Each quote must be in the CEO's instruction word for word, or it is refused
// here and again by the database. The decisions then travel with every later
// step of the mission.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    assignmentId?: string;
    decisions?: unknown;
    replaces?: unknown;
  } | null;
  const auth = await authorizeBotStep(request, id, body?.assignmentId, { write: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await pickUpBotStep(auth.step);
  const result = await recordBotDecisions(auth.step, body ?? {});
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
