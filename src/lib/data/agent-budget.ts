import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { recordRefusal } from "@/lib/data/refusals";

// ---------------------------------------------------------------------------
// What an employee may do today, and what it may spend doing it.
//
// Roadmap slice 5 asks for continuation that is explicit, idempotent,
// budgeted and observable. This is the budgeted part, and the list below is
// the explicit part.
//
// The ceiling is per employee and per day. A monthly organisation-wide cap
// tells you at the end of the month; a daily one stops it on the day, and
// naming the employee says which one to look at. Two ceilings rather than one,
// because they fail differently: a loop claiming the same job burns runs while
// costing almost nothing, and a single enormous document burns cost in one
// run.
// ---------------------------------------------------------------------------

/**
 * Everything an employee may do unattended, in full.
 *
 * This is the whole list. Anything not on it needs a human, and "the CEO gave
 * me a broad objective" does not add to it — the constitution's rule that
 * silence is not permission is only enforceable if the permitted set is
 * written down somewhere an agent can read.
 *
 * It is sent to agents in their inbox response rather than only living in a
 * brief, because a rule an agent has to remember from onboarding is a rule it
 * will eventually not remember.
 */
export const SAFE_STEPS: readonly string[] = [
  "Read any Triangle record your credential's scopes expose.",
  "Search the public web, and read pages, documents and filings you find.",
  "Re-read a source you have already used, to check it still says what you quoted.",
  "File a finding or proposal with its source URL and the quoted line.",
  "Correct a proposal you filed earlier, while it is still pending.",
  "Post a message on your own assignment thread — an answer, a partial result, or a question.",
  "Report an assignment finished, or failed with an honest reason.",
  "Hand work to another Triangle employee whose role covers it, through an assignment.",
  "Say you cannot do something, and why.",
];

/**
 * Everything that needs a human, stated as plainly as the list above.
 *
 * Not exhaustive by construction — the rule is that anything absent from
 * SAFE_STEPS needs asking — but these are the ones agents actually reach for.
 */
export const NEEDS_A_HUMAN: readonly string[] = [
  "Contacting anyone outside Triangle, by any channel, for any reason.",
  "Sending, replying to, forwarding, deleting or archiving mail.",
  "Turning a proposal into a final record. A human accepts.",
  "Making a worker placeable, or claiming their availability.",
  "Sharing a CV, certificate, name or contact detail outside Triangle.",
  "Committing a rate, a date, a headcount or anything else Triangle would be held to.",
  "Registering, signing, purchasing, or accepting terms anywhere.",
];

export interface BudgetState {
  runsToday: number;
  runBudget: number;
  costToday: number;
  costBudget: number;
  /** False when either ceiling is reached. */
  canRun: boolean;
  /** One sentence, for an agent or a person. */
  summary: string;
}

/** UTC midnight. A budget needs one unambiguous day boundary, not a local one. */
function startOfDay(): string {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  ).toISOString();
}

export async function getBudget(
  orgId: string,
  agentInstanceId: string,
): Promise<BudgetState> {
  const svc = createServiceSupabaseClient();
  // No database means no evidence of spend. Refusing to run is the safe
  // reading of that, not permission to run unmetered.
  if (!svc) {
    return {
      runsToday: 0,
      runBudget: 0,
      costToday: 0,
      costBudget: 0,
      canRun: false,
      summary: "No database connection, so today's spend cannot be checked.",
    };
  }

  const [instance, runs] = await Promise.all([
    svc
      .from("agent_instances")
      .select("display_name, daily_run_budget, daily_cost_budget")
      .eq("id", agentInstanceId)
      .eq("org_id", orgId)
      .maybeSingle(),
    svc
      .from("agent_runs")
      .select("estimated_cost")
      .eq("org_id", orgId)
      .eq("agent_instance_id", agentInstanceId)
      .gte("started_at", startOfDay()),
  ]);

  const runBudget = Number(instance.data?.daily_run_budget ?? 0);
  const costBudget = Number(instance.data?.daily_cost_budget ?? 0);
  const rows = runs.data ?? [];
  const runsToday = rows.length;
  const costToday = rows.reduce((sum, r) => sum + Number(r.estimated_cost ?? 0), 0);

  const outOfRuns = runsToday >= runBudget;
  const outOfCost = costToday >= costBudget;
  const who = (instance.data?.display_name as string) ?? "This employee";

  return {
    runsToday,
    runBudget,
    costToday,
    costBudget,
    canRun: !outOfRuns && !outOfCost,
    summary: outOfRuns
      ? `${who} has used all ${runBudget} runs allowed today. The budget resets at midnight UTC.`
      : outOfCost
        ? `${who} has spent €${costToday.toFixed(2)} of a €${costBudget.toFixed(2)} daily budget. It resets at midnight UTC.`
        : `${runsToday} of ${runBudget} runs and €${costToday.toFixed(2)} of €${costBudget.toFixed(2)} used today.`,
  };
}

/**
 * Check the ceiling before starting work, and write down the refusal.
 *
 * Recorded rather than silent: an employee that quietly stops looks identical
 * to one that has nothing to do, and the difference matters on a Monday
 * morning when nothing happened over the weekend.
 */
export async function withinBudget(
  orgId: string,
  agentInstanceId: string,
): Promise<BudgetState> {
  const state = await getBudget(orgId, agentInstanceId);
  if (!state.canRun) {
    await recordRefusal({
      orgId,
      surface: "Unattended agent run",
      reason: state.summary,
      entityType: "agent_instance",
      entityId: agentInstanceId,
      kind: "boundary",
      details: {
        runsToday: state.runsToday,
        runBudget: state.runBudget,
        costToday: state.costToday,
        costBudget: state.costBudget,
      },
    });
  }
  return state;
}
