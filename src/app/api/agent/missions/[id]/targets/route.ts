import { NextResponse } from "next/server";
import { authorizeBotStep, fileBotTargets, pickUpBotStep } from "@/lib/data/mission-bot";

// ---------------------------------------------------------------------------
// POST /api/agent/missions/:id/targets — a bot files what it found.
//
// { assignmentId, targets: [...] } — the companies, each with its person, door,
// words and sources, in one of the three states. Filed exactly as an in-app
// step files them: onto Companies and People, agent-found and unverified, a
// held company onto its own record. The answer says, per target, what landed
// and what was refused, and why.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { assignmentId?: string; targets?: unknown } | null;
  const auth = await authorizeBotStep(request, id, body?.assignmentId, { write: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await pickUpBotStep(auth.step);
  const result = await fileBotTargets(auth.step, body?.targets);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
