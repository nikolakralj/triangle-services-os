import { NextResponse } from "next/server";
import { authorizeBotStep, logBotActivity, pickUpBotStep } from "@/lib/data/mission-bot";

// ---------------------------------------------------------------------------
// POST /api/agent/missions/:id/activity — what a bot did, while it does it.
//
// { assignmentId, events: [{ kind: "searched", text: "Searched …" }] }. The
// CEO asked for activity, not thinking: searches run, pages read, what was
// found or not found. They appear on the mission as they arrive.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { assignmentId?: string; events?: unknown } | null;
  const auth = await authorizeBotStep(request, id, body?.assignmentId, { write: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await pickUpBotStep(auth.step);
  const result = await logBotActivity(auth.step, body?.events);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
