import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import {
  loadMissionBrief,
  markMissionSeen,
  retryMissionStep,
  setMissionClosed,
} from "@/lib/data/missions";
import { setCriteriaTargets } from "@/lib/data/mission-plan";
import { setDecisionActive } from "@/lib/data/mission-memory";
import { getOrganizationOperatingProfile } from "@/lib/data/organization-profile";
import { runMissionQueue } from "@/lib/ai/mission-executor";
import { ensureMissionPlan } from "@/lib/ai/mission-planner";

// ---------------------------------------------------------------------------
// PATCH /api/missions/:id — what a person does to a mission itself.
//
//   close     take the tab away; the work and its records stay
//   reopen    bring it back
//   seen      the CEO has looked, so "ready" becomes "done"
//   retry     put a stopped step back to work without retyping it
//   plan      give a mission without one a finish line and a route now,
//             instead of with its next instruction
//   criteria  move the finish line: { targets: { named_buyers: 10 } }
//   remove_decision, restore_decision
//             take one of the CEO's decisions out of force, or put it back:
//             { decisionId }
//
// Instructions go through POST /api/ask with a missionId, the same door as
// everything else anybody asks for.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  action: z.enum(["close", "reopen", "seen", "retry", "plan", "criteria", "remove_decision", "restore_decision"]),
  targets: z.record(z.string(), z.number()).optional(),
  decisionId: z.string().uuid().optional(),
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
    return NextResponse.json(
      { error: "Say what to do: close, reopen, seen, retry, plan, criteria, remove_decision or restore_decision." },
      { status: 400 },
    );
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

  if (action === "plan") {
    const brief = await loadMissionBrief(access.organizationId, id);
    if (!brief) return NextResponse.json({ error: "That mission does not exist." }, { status: 404 });
    const profile = await getOrganizationOperatingProfile(access.organizationId);
    const planned = await ensureMissionPlan({
      orgId: access.organizationId,
      missionId: id,
      kind: brief.kind,
      objective: brief.objective,
      instructions: brief.instructions,
      org: { name: profile?.name || "the company", companyProfile: profile?.companyProfile || null },
    });
    if (!planned.wrote) {
      return planned.criteria.length > 0
        ? NextResponse.json({ error: "This mission already has a finish line." }, { status: 409 })
        : NextResponse.json({ error: "Could not set a finish line." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, criteria: planned.criteria.length, steps: planned.plan.length });
  }

  if (action === "criteria") {
    const result = await setCriteriaTargets({
      orgId: access.organizationId,
      missionId: id,
      userId: access.userId,
      targets: parsed.data.targets ?? {},
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, changed: result.changed });
  }

  if (action === "remove_decision" || action === "restore_decision") {
    const decisionId = parsed.data.decisionId;
    if (!decisionId) return NextResponse.json({ error: "Say which decision." }, { status: 400 });
    const result = await setDecisionActive({
      orgId: access.organizationId,
      missionId: id,
      decisionId,
      userId: access.userId,
      active: action === "restore_decision",
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

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
