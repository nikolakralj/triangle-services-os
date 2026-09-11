import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  missionModel,
  missionProvider,
  missionProviderOptions,
  missionTimeout,
} from "@/lib/ai/mission-models";
import { setCriteriaTargets } from "@/lib/data/mission-plan";
import { metricLabel } from "@/lib/data/mission-progress";
import {
  countDecisionsFromMessage,
  normaliseQuote,
  recordDecision,
  supersedeDecisions,
} from "@/lib/data/mission-memory";
import type {
  MissionCriterion,
  MissionDecision,
  MissionKind,
  MissionMetric,
} from "@/lib/data/mission-shared";

// ---------------------------------------------------------------------------
// Writing down what the CEO decided.
//
// "Ignore HVAC-only companies" is said once and meant for the rest of the
// mission. Before a step works, its employee reads the instruction for
// standing decisions like that one and writes each down with the CEO's own
// words — so it still applies twenty instructions later, when the message has
// long left the conversation a step reads.
//
// Recording is the employee's to do, and a person's to undo: every decision
// shows on the mission page with Take back. The employee cannot make one up —
// a quote that is not in the message is dropped here and refused by the
// database. A number the CEO gives for a count ("make it 30 companies") moves
// that criterion, as the person's.
// ---------------------------------------------------------------------------

const extractionSchema = z.object({
  decisions: z
    .array(
      z.object({
        kind: z.enum(["exclude", "focus", "prefer", "limit", "other"]),
        scope: z.enum(["mission", "this_step"]),
        text: z.string().max(200),
        quote: z.string().max(300),
      }),
    )
    .max(8),
  replaces: z.array(z.string()).max(10),
  targets: z
    .array(z.object({ metric: z.string(), target: z.number().int(), quote: z.string().max(300) }))
    .max(5),
});

const SYSTEM = `You keep the record of a CEO's standing decisions inside one piece of delegated work — a mission — so the employee doing it still applies them after the conversation has moved on.

From the CEO's NEWEST MESSAGE return:

decisions: every choice the message makes about what counts or what comes first, each labelled with its scope.
- scope "mission": it holds for the rest of the mission until the CEO changes it — what to exclude or rule out ("ignore HVAC-only companies"), which country, trade or kind of company comes first ("Germany first", "electrical contractors before mechanical"), what to prefer ("prefer direct contractors"), limits the results must keep to ("only companies with their own site crews"). When THE EMPLOYEE LAST ASKED THE CEO a question, the CEO's answer to it is always scope "mission".
- scope "this_step": what to do right now — "find the buyer at Goldbeck", "do not look for new companies", "just tell me who to call", "check their websites", or anything said about this step or this time. A way of working has scope "mission" only when the CEO says it holds from now on ("from now on, stop looking for new companies").
A question is not a decision at all; leave it out.

One decision per thing decided: "ignore HVAC-only companies and staffing agencies" is two decisions, "Exclude HVAC-only companies." and "Exclude staffing agencies.", with the same quote. A decision's text must carry everything its quote decides.

Never restate the objective. For each decision: kind (exclude, focus, prefer, limit or other); scope; text, one short imperative sentence in English, such as "Exclude HVAC-only companies."; quote, the exact words from the CEO's message it comes from, copied character for character in the message's own language.

replaces: the ids of decisions in force that the newest message reverses or replaces. When the message puts a new decision in place of an old one ("Austria first, not Germany"), return only the new decision and list the old one here. Only when it takes a decision back without putting anything in its place ("forget the Germany focus") return that as a decision too, such as "Germany is no longer the focus."

targets: when the message sets a number for one of the mission's counts ("make it 30 companies"), the count's metric, the number and the exact quote.

Most messages hold no decision. Then return three empty lists.`;

export interface NotedDecisions {
  added: MissionDecision[];
  replaced: MissionDecision[];
  moved: Array<{ metric: MissionMetric; target: number }>;
}

/** Lower case, letters and digits only: "Exclude HVAC-only companies." ≈ "exclude hvac only companies". */
function sameDecision(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const THIS_STEP = /\b(this step|in this step|for this step|this time|in diesem schritt|diesmal)\b/i;
/** "Do not look for new companies" — about the step it was said in, unless the CEO made it last. */
const NO_NEW_SEARCH =
  /\b(do not|don't|dont|no need to)\s+(look|search|research|go looking)\s+(for\s+)?(any\s+)?(new|more|other|further|additional)\b/i;
const LASTING = /\b(from now on|any ?more|no more|never|always|for the rest|until i say)\b/i;

/**
 * A question, words tied to this step, or an order not to search this time is
 * not a standing decision. The instructions say so too; this part does not
 * depend on the model listening. Kept to what is unambiguous: "Germany only
 * for now" still holds for the mission, so "for now" is not on the list, and
 * "don't look for staffing agencies" is an exclusion, not a pause.
 */
function aboutThisStep(quote: string, text: string): boolean {
  if (quote.trim().endsWith("?")) return true;
  if (THIS_STEP.test(quote) || THIS_STEP.test(text)) return true;
  return (NO_NEW_SEARCH.test(quote) || NO_NEW_SEARCH.test(text)) && !LASTING.test(quote);
}

export async function noteInstructionDecisions(params: {
  orgId: string;
  missionId: string;
  stepId: string;
  agentInstanceId: string;
  kind: MissionKind;
  objective: string;
  instruction: string;
  /** The message the instruction arrived in — the evidence every decision cites. */
  messageId: string | null;
  authorUserId: string | null;
  lastQuestion: string | null;
  inForce: readonly MissionDecision[];
  criteria: readonly MissionCriterion[];
}): Promise<NotedDecisions> {
  const none: NotedDecisions = { added: [], replaced: [], moved: [] };
  if (!missionProvider() || !params.messageId) return none;
  // A retried step already wrote down what its instruction decided — and a
  // database that cannot keep decisions is not worth a model call.
  const already = await countDecisionsFromMessage(params.orgId, params.messageId);
  if (already === null || already > 0) return none;

  const prompt = [
    `OBJECTIVE (already recorded; never a decision): ${params.objective}`,
    "",
    "DECISIONS IN FORCE:",
    ...(params.inForce.length > 0 ? params.inForce.map((d) => `- [${d.id}] ${d.text}`) : ["- none"]),
    "",
    `COUNTS THE CEO MAY SET A NUMBER FOR: ${
      params.criteria.length > 0
        ? params.criteria.map((c) => `${c.metric} (now ${metricLabel(c.metric, c.target)})`).join("; ")
        : "none"
    }`,
    "",
    `THE EMPLOYEE LAST ASKED THE CEO: ${params.lastQuestion ?? "nothing"}`,
    "",
    "THE CEO'S NEWEST MESSAGE:",
    params.instruction.slice(0, 4_000),
  ].join("\n");

  let extracted: z.infer<typeof extractionSchema> | undefined;
  try {
    const result = await generateText({
      model: missionModel("memory"),
      system: SYSTEM,
      prompt,
      output: Output.object({ schema: extractionSchema }),
      timeout: missionTimeout("memory"),
      providerOptions: missionProviderOptions("memory"),
    });
    extracted = result.output;
  } catch (err) {
    console.error("noteInstructionDecisions:", err instanceof Error ? err.message : err);
    return none;
  }
  if (!extracted) return none;

  const said = normaliseQuote(params.instruction);
  const seen = new Set(params.inForce.map((d) => sameDecision(d.text)));
  const added: MissionDecision[] = [];
  for (const d of extracted.decisions) {
    if (d.scope !== "mission") continue;
    const text = d.text.replace(/\s+/g, " ").trim();
    const quote = d.quote.replace(/\s+/g, " ").trim();
    if (text.length < 3 || quote.length < 2) continue;
    // From the CEO's words, or not at all.
    if (!said.includes(normaliseQuote(quote))) continue;
    if (aboutThisStep(quote, text)) continue;
    const key = sameDecision(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const row = await recordDecision({
      orgId: params.orgId,
      missionId: params.missionId,
      stepId: params.stepId,
      messageId: params.messageId,
      decidedBy: params.authorUserId,
      agentInstanceId: params.agentInstanceId,
      kind: d.kind,
      text,
      quote,
    });
    if (row) added.push(row);
  }

  // A decision is replaced only by one written down now.
  const inForceIds = new Set(params.inForce.map((d) => d.id));
  const replaceIds = [...new Set(extracted.replaces)].filter((id) => inForceIds.has(id));
  const replaced =
    added.length > 0 && replaceIds.length > 0
      ? await supersedeDecisions({
          orgId: params.orgId,
          missionId: params.missionId,
          ids: replaceIds,
          by: added[0].id,
        })
      : [];

  // A number the CEO gave moves the finish line — as the CEO's, so it needs
  // the person who said it.
  const moved: NotedDecisions["moved"] = [];
  if (params.authorUserId) {
    const current = new Map(params.criteria.map((c) => [c.metric as string, c.target]));
    const targets: Record<string, number> = {};
    for (const t of extracted.targets) {
      const was = current.get(t.metric);
      if (was === undefined || was === t.target) continue;
      if (!Number.isInteger(t.target) || t.target < 1 || t.target > 500) continue;
      if (!said.includes(normaliseQuote(t.quote))) continue;
      targets[t.metric] = t.target;
    }
    if (Object.keys(targets).length > 0) {
      const result = await setCriteriaTargets({
        orgId: params.orgId,
        missionId: params.missionId,
        userId: params.authorUserId,
        targets,
      });
      if (!("error" in result)) {
        for (const [metric, target] of Object.entries(targets)) {
          moved.push({ metric: metric as MissionMetric, target });
        }
      }
    }
  }

  return { added, replaced, moved };
}
