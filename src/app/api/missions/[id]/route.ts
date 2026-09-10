import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import {
  markMissionSeen,
  retryMissionStep,
  setMissionClosed,
} from "@/lib/data/missions";
import { runMissionQueue } from "@/lib/ai/mission-executor";

// ---------------------------------------------------------------------------
// PATCH /api/missions/:id — what a person does to a mission itself.
//
//   close    take the tab away; the work and its records stay
//   reopen   bring it back
//   seen     the CEO has looked, so "ready" becomes "done"
//   retry    put a stopped step back to work without retyping it
//
// Instructions go through POST /api/ask with a missionId, the same door as
// everything else anybody asks for.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  action: z.enum(["close", "reopen", "seen", "retry"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Unknown mission." }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Say what to do: close, reopen, seen or retry." }, { status: 400 });
  }
  const { action } = parsed.data;

  // Having looked is not a write anybody needs permission for, but it is only
  // recorded for a person — a machine key has not seen anything.
  if (action === "seen") {
    if (access.actor === "human" && !access.demo) {
      await markMissionSeen(access.organizationId, id);
    }
    return NextResponse.json({ ok: true });
  }

  const refused = refuseUnlessHuman(access, "canWrite", `${action} a mission`);
  if (refused) return refused;

  if (action === "retry") {
    const result = await retryMissionStep({ orgId: access.organizationId, missionId: id });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    const orgId = access.organizationId;
    after(async () => {
      try {
        await runMissionQueue(orgId, id);
      } catch (err) {
        console.error("mission retry:", err);
      }
    });
    return NextResponse.json({ ok: true, stepId: result.stepId });
  }

  const ok = await setMissionClosed({
    orgId: access.organizationId,
    missionId: id,
    userId: access.userId,
    closed: action === "close",
  });
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "That mission does not exist." }, { status: 404 });
}
