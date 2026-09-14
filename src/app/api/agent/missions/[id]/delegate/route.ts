import { after, NextResponse } from "next/server";
import { authorizeBotStep, pickUpBotStep } from "@/lib/data/mission-bot";
import { requestWork } from "@/lib/data/delegation";
import { wakeEmployee } from "@/lib/data/bot-runtime";

// ---------------------------------------------------------------------------
// POST /api/agent/missions/:id/delegate — ask a colleague for work.
//
// { assignmentId, to, title, objective, expectedOutput?, priority? }
//
// `to` is a colleague's name or role, as listed in `colleagues` on the
// mission. The request becomes an assignment under the step asking, in the
// same mission, and the colleague is woken. When it finishes, the step that
// asked sees the answer in `requestedWork` and its employee is woken again.
// Several requests may run at once; retrying the same request returns it.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as ({ assignmentId?: string } & Record<string, unknown>) | null;
  const auth = await authorizeBotStep(request, id, body?.assignmentId, { write: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await pickUpBotStep(auth.step);
  const result = await requestWork(auth.step, body ?? {});
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const { wake, ...answer } = result;
  if (wake) {
    const orgId = auth.step.orgId;
    after(async () => {
      try {
        await wakeEmployee({ orgId, ...wake, event: "requested" });
      } catch (err) {
        console.error("request wake:", err);
      }
    });
  }
  return NextResponse.json(answer, { status: answer.alreadyAsked ? 200 : 201 });
}
