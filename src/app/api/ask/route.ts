import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import { answerAboutTalent } from "@/lib/ai/talent-answer";
import { nameMission } from "@/lib/ai/mission-namer";
import { runMissionQueue } from "@/lib/ai/mission-executor";
import { listWorkforce } from "@/lib/data/workforce";
import { addMissionInstruction, missionLeadRuntime, startMission } from "@/lib/data/missions";
import { employeeMissionRuntime, wakeEmployee, type MissionRuntime } from "@/lib/data/bot-runtime";
import { getOrganizationOperatingProfile } from "@/lib/data/organization-profile";
import { missionProvider } from "@/lib/ai/mission-models";

// ---------------------------------------------------------------------------
// POST /api/ask — the one box.
//
// Two kinds of thing come through it, and they are honestly different:
//
//   a quick question about the company's own people
//        answered now, inline, by the employee who reads the pool. There is
//        nothing to delegate; the answer is in the database.
//
//   work
//        a MISSION. "Find EPC contractors in Germany" is not a question with
//        an answer, it is an objective with a body of work behind it, and
//        the next seven things the CEO says about it belong to it. So the
//        box starts one (or adds the instruction to the mission it was asked
//        from), sends the CEO straight to it, and the worker runs after the
//        response — the CEO watches the mission fill instead of watching a
//        spinner for forty seconds.
//
// This replaces one assignment per question. After two days the queue held a
// dozen near-identical research questions, each answered from scratch,
// because a follow-up had nowhere to go but a new job.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * A quick question about our own pool, or work?
 *
 * Kept as a small readable rule for the one case where speed matters — "who
 * is available" should answer in seconds, not after a naming call. Anything
 * that is not clearly about the pool becomes a mission, and the namer decides
 * whether that mission is market research or recruiting.
 */
function isPoolQuestion(text: string): boolean {
  const ours =
    /\b(our|ours|we have|bench|roster|pool|worker|workers|crew|cv|cvs|available|availability|visa|passport|nationality|certificate|ticket|a1|who can|anybody|anyone|somebody)\b/i.test(
      text,
    );
  const work =
    /\b(find|search|look for|prepare|contractor|contractors|epc|gc|tender|tenders|project|projects|buyer|buyers|company|companies|market|subcontract|subcontractor|who buys|reach|research)\b/i.test(
      text,
    );
  return ours && !work;
}

/**
 * Hand a new step to whoever does the mission's work: Triangle's own runner,
 * or the lead's bot on its own platform, which is woken and then left to it.
 */
async function handOff(
  orgId: string,
  missionId: string,
  step: { stepId: string; runtime: MissionRuntime; agentInstanceId: string },
): Promise<void> {
  try {
    if (step.runtime === "bot") {
      await wakeEmployee({
        orgId,
        agentInstanceId: step.agentInstanceId,
        stepId: step.stepId,
        missionId,
        event: "mission_step",
      });
    } else {
      await runMissionQueue(orgId, missionId);
    }
  } catch (err) {
    console.error("mission step:", err);
  }
}

function aiNotConfigured() {
  return NextResponse.json({ error: "AI is not configured on this deployment." }, { status: 503 });
}

const bodySchema = z.object({
  question: z.string().trim().min(2).max(8_000),
  missionId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const refused = refuseUnlessHuman(access, "canWrite", "ask the team for work");
  if (refused) return refused;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Write what you need first." }, { status: 400 });
  }
  const { question, missionId } = parsed.data;
  const orgId = access.organizationId;

  // ── the next instruction inside a mission ────────────────────────────────
  // Short is fine here: "electrical first" answers the question Scout asked.
  if (missionId) {
    // A mission its lead's bot runs needs no AI inside Triangle at all.
    if ((await missionLeadRuntime(orgId, missionId)) !== "bot" && !missionProvider()) {
      return aiNotConfigured();
    }
    const added = await addMissionInstruction({
      orgId,
      userId: access.userId,
      missionId,
      text: question,
    });
    if ("error" in added) {
      return NextResponse.json({ error: added.error }, { status: 400 });
    }
    after(() => handOff(orgId, missionId, added));
    return NextResponse.json(
      { kind: "mission", missionId, stepId: added.stepId, runtime: added.runtime },
      { status: 201 },
    );
  }

  if (question.length < 8) {
    return NextResponse.json({ error: "Ask a fuller question." }, { status: 400 });
  }

  // ── a quick question about the pool: answered now ────────────────────────
  if (isPoolQuestion(question)) {
    // Names, CVs, nationalities and availability. A role that cannot see
    // workers on the Talent Pool page must not read them out of a question.
    const noPool = refuseUnlessHuman(access, "canSeeWorkers", "ask about the company's people");
    if (noPool) return noPool;
    if (!missionProvider()) return aiNotConfigured();

    const result = await answerAboutTalent(orgId, question);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      by: "Hanna",
      emoji: "👤",
      kind: "talent",
      answer: result.answer,
      people: result.people,
      partners: result.partners,
      blockers: result.blockers,
      missing: result.missing,
    });
  }

  // ── work: a mission ──────────────────────────────────────────────────────
  const profile = await getOrganizationOperatingProfile(orgId);
  const naming = await nameMission(question, {
    name: profile?.name || "the company",
    companyProfile: profile?.companyProfile || null,
  });
  if (naming.kind === "recruiting") {
    const noPool = refuseUnlessHuman(access, "canSeeWorkers", "start work on the company's people");
    if (noPool) return noPool;
  }

  const roster = await listWorkforce(orgId);
  const lead =
    naming.kind === "recruiting"
      ? roster.find((e) => (e.roleKey === "hr" || e.roleKey === "triangle_hr") && e.status === "active")
      : roster.find((e) => e.roleKey === "project_researcher" && e.status === "active");
  if (!lead) {
    return NextResponse.json(
      {
        error:
          naming.kind === "recruiting"
            ? "Nobody on the workforce reads the talent pool right now."
            : "No active researcher on the workforce to lead this.",
      },
      { status: 400 },
    );
  }

  // A lead whose missions run on its bot needs no AI inside Triangle.
  if ((await employeeMissionRuntime(orgId, lead.id)) !== "bot" && !missionProvider()) {
    return aiNotConfigured();
  }

  const started = await startMission({
    orgId,
    userId: access.userId,
    text: question,
    naming,
    leadAgentInstanceId: lead.id,
  });
  if ("error" in started) {
    return NextResponse.json({ error: started.error }, { status: 500 });
  }

  after(() =>
    handOff(orgId, started.missionId, {
      stepId: started.stepId,
      runtime: started.runtime,
      agentInstanceId: lead.id,
    }),
  );

  return NextResponse.json(
    {
      kind: "mission",
      missionId: started.missionId,
      stepId: started.stepId,
      title: naming.title,
      emoji: naming.emoji,
      lead: lead.displayName,
    },
    { status: 201 },
  );
}
