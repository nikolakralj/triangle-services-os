import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  missionModel,
  missionProvider,
  missionProviderOptions,
  missionTimeout,
} from "@/lib/ai/mission-models";
import {
  defaultPlan,
  RECRUITING_METRICS,
  RECRUITING_PASSES,
  RESEARCH_METRICS,
  RESEARCH_PASSES,
  settlePlan,
  type SettledPlan,
} from "@/lib/data/mission-progress";
import { loadMissionPlan, saveMissionPlan, type MissionPlanRows } from "@/lib/data/mission-plan";
import type { MissionKind } from "@/lib/data/mission-shared";

// ---------------------------------------------------------------------------
// Before the work: when is it finished, and how does it get there.
//
// "Germany needed five instructions to produce the finished result. Make it
// need one." A worker that is only ever told the next instruction stops after
// it. So the first thing a mission's employee does is propose a finish line —
// "20 companies still in play, 15 buyers named, 5 people ready to reach" —
// and a route of passes to get there. The CEO can move the finish line; the
// counting stays with the records.
//
// Planning must never block the work. If the call fails, the mission gets the
// plain default for its kind.
// ---------------------------------------------------------------------------

export interface PlanningInput {
  kind: MissionKind;
  objective: string;
  /** What the CEO has said about the mission, oldest first. */
  instructions: string[];
  org: { name: string; companyProfile: string | null };
}

// One schema per kind: a research plan may only name research metrics and
// passes, a recruiting plan only its own.
const researchSchema = z.object({
  criteria: z.array(z.object({ metric: z.enum(RESEARCH_METRICS), target: z.number().int() })).max(5),
  plan: z
    .array(z.object({ pass: z.enum(RESEARCH_PASSES), title: z.string().max(80), metric: z.enum(RESEARCH_METRICS) }))
    .max(7),
});

const recruitingSchema = z.object({
  criteria: z.array(z.object({ metric: z.enum(RECRUITING_METRICS), target: z.number().int() })).max(5),
  plan: z
    .array(z.object({ pass: z.enum(RECRUITING_PASSES), title: z.string().max(80), metric: z.enum(RECRUITING_METRICS) }))
    .max(7),
});

function promptFor(input: PlanningInput): string {
  return [
    `OBJECTIVE: ${input.objective}`,
    "",
    "WHAT THE CEO HAS SAID ABOUT IT (oldest first):",
    ...input.instructions.slice(-6).map((t) => `- ${t.replace(/\s+/g, " ").trim().slice(0, 600)}`),
  ].join("\n");
}

const METRIC_GUIDE: Record<MissionKind, string> = {
  research: `Metrics:
- companies_found: companies found, including ones later ruled out
- companies_in_play: companies that fit and are still in play
- named_buyers: of those, with the person who buys the labour named
- contact_routes: of those, with a published way in to that person
- project_evidence: companies tied to a specific, named current project
- reachable: people ready to reach — the name, a published door and the words to say
Passes: discover (find companies), qualify (keep what fits, tie companies to projects), research (find the person and the door), prepare (the words).
When the CEO gives no numbers, a finished mission is typically 20 companies in play, 15 buyers named, 12 with a way in, 10 tied to a project and 5 people ready to reach.`,
  recruiting: `Metrics:
- candidates_named: people from the company's own pool named for the job
- candidates_available: of them, available now or soon
- partners_confirmed: partner firms whose capacity a person confirmed recently
Passes: match (name people and partner firms), qualify (check availability).
Name partner firms only when the job needs more people than the company's own pool is likely to hold.`,
};

function systemPrompt(input: PlanningInput): string {
  const profile = input.org.companyProfile
    ? ` What the company does: ${input.org.companyProfile.slice(0, 400)}`
    : "";
  return `You plan a piece of work the CEO of ${input.org.name} has delegated to an employee, before the employee starts.${profile}

Return a finish line and a route.

criteria: two to five conditions that together mean the work is finished — each a metric from the list below and a whole-number target. Take numbers from what the CEO wrote ("the top ten" is 10, "8 engineers" is 8). A narrower count never exceeds the count it narrows.

plan: two to seven steps in order, each with the pass that does it, a short title specific to this objective (at most 60 characters — "Find EPC contractors building data centres in Bavaria", not "Discover companies"), and the metric that shows the step is done.

${METRIC_GUIDE[input.kind]}`;
}

export async function draftMissionPlan(input: PlanningInput): Promise<SettledPlan> {
  const fallback = defaultPlan(input.kind);
  if (!missionProvider()) return fallback;
  try {
    const call = {
      model: missionModel("plan"),
      system: systemPrompt(input),
      prompt: promptFor(input),
      timeout: missionTimeout("plan"),
      providerOptions: missionProviderOptions("plan"),
    };
    const draft =
      input.kind === "recruiting"
        ? (await generateText({ ...call, output: Output.object({ schema: recruitingSchema }) })).output
        : (await generateText({ ...call, output: Output.object({ schema: researchSchema }) })).output;
    return (draft && settlePlan(input.kind, draft)) || fallback;
  } catch (err) {
    console.error("draftMissionPlan:", err instanceof Error ? err.message : err);
    return fallback;
  }
}

/**
 * Give the mission a finish line and a route when it has none.
 *
 * Returns the plan the mission has afterwards — this call's, or the one that
 * got there first — and whether this call wrote it.
 */
export async function ensureMissionPlan(
  params: { orgId: string; missionId: string } & PlanningInput,
): Promise<MissionPlanRows & { wrote: boolean }> {
  const existing = await loadMissionPlan(params.orgId, params.missionId);
  if (existing.criteria.length > 0) return { ...existing, wrote: false };

  const drafted = await draftMissionPlan(params);
  const wrote = await saveMissionPlan({ orgId: params.orgId, missionId: params.missionId, plan: drafted });
  const stored = await loadMissionPlan(params.orgId, params.missionId);
  return { ...stored, wrote };
}
