import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { countMetric, metricLabel } from "@/lib/data/mission-progress";
import type { MissionHoldings } from "@/lib/data/missions";
import type {
  DecisionKind,
  MissionCriterion,
  MissionDecision,
  MissionProgress,
} from "@/lib/data/mission-shared";

// ---------------------------------------------------------------------------
// A mission's memory.
//
// "Do not solve Mission memory by putting 300 chat messages into the prompt
// forever." A long mission is read as its state — the objective, the finish
// line, what the CEO decided, what is known, what is still open, what comes
// next — plus its records and only the recent conversation.
//
// Almost all of that is already in the database and is read from it every
// time: the facts, the open questions and the next work come from the
// companies filed, what they are missing, and the plan. Only the CEO's
// standing decisions are in no record, so they are kept (migration 045), each
// with the words it was taken from.
// ---------------------------------------------------------------------------

const DECISION_FIELDS = "id, kind, text, quote, status, created_at, recorded_by_agent_instance_id";
const KINDS = new Set<string>(["exclude", "focus", "prefer", "limit", "other"]);

/** How many ruled-out companies and open questions the state spells out. */
const RULED_OUT_LINES = 12;
const OPEN_QUESTION_LINES = 8;

function toDecision(row: Record<string, unknown>): MissionDecision {
  const status: MissionDecision["status"] =
    row.status === "superseded" ? "superseded" : row.status === "removed" ? "removed" : "active";
  return {
    id: row.id as string,
    kind: (KINDS.has(row.kind as string) ? row.kind : "other") as DecisionKind,
    text: row.text as string,
    quote: row.quote as string,
    status,
    decidedAt: row.created_at as string,
    recordedByAgent: Boolean(row.recorded_by_agent_instance_id),
  };
}

/** The same folding the database applies before it looks for a quote in a message. */
export function normaliseQuote(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Every decision the mission has recorded, oldest first — none on a database without 045. */
export async function loadMissionDecisions(orgId: string, missionId: string): Promise<MissionDecision[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data, error } = await svc
    .from("mission_decisions")
    .select(DECISION_FIELDS)
    .eq("org_id", orgId)
    .eq("mission_id", missionId)
    .order("created_at")
    .limit(100);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(toDecision);
}

/**
 * How many decisions were already written down from one message. Null when
 * decisions cannot be kept at all, so nobody pays to read them out.
 */
export async function countDecisionsFromMessage(orgId: string, messageId: string): Promise<number | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { count, error } = await svc
    .from("mission_decisions")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("source_message_id", messageId);
  return error ? null : (count ?? 0);
}

/** Write one decision down. The database refuses a quote that is not in the message. */
export async function recordDecision(params: {
  orgId: string;
  missionId: string;
  stepId: string;
  messageId: string;
  decidedBy: string | null;
  agentInstanceId: string;
  kind: DecisionKind;
  text: string;
  quote: string;
}): Promise<MissionDecision | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data, error } = await svc
    .from("mission_decisions")
    .insert({
      org_id: params.orgId,
      mission_id: params.missionId,
      kind: params.kind,
      text: params.text.slice(0, 240),
      quote: params.quote.slice(0, 500),
      source_step_id: params.stepId,
      source_message_id: params.messageId,
      decided_by: params.decidedBy,
      recorded_by_agent_instance_id: params.agentInstanceId,
    })
    .select(DECISION_FIELDS)
    .single();
  if (error || !data) {
    console.error("recordDecision:", error?.message);
    return null;
  }
  return toDecision(data as Record<string, unknown>);
}

/** Decisions a newer one replaced. Returns the ones that were still in force. */
export async function supersedeDecisions(params: {
  orgId: string;
  missionId: string;
  ids: string[];
  by: string;
}): Promise<MissionDecision[]> {
  const svc = createServiceSupabaseClient();
  if (!svc || params.ids.length === 0) return [];
  const { data, error } = await svc
    .from("mission_decisions")
    .update({ status: "superseded", superseded_by: params.by })
    .eq("org_id", params.orgId)
    .eq("mission_id", params.missionId)
    .eq("status", "active")
    .in("id", params.ids)
    .select(DECISION_FIELDS);
  if (error) {
    console.error("supersedeDecisions:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(toDecision);
}

/** A person takes a decision back, or puts it back. */
export async function setDecisionActive(params: {
  orgId: string;
  missionId: string;
  decisionId: string;
  userId: string;
  active: boolean;
}): Promise<{ ok: true } | { error: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { error: "Database unavailable." };
  const table = svc.from("mission_decisions");
  const { data, error } = params.active
    ? await table
        .update({ status: "active", superseded_by: null, removed_by: null, removed_at: null })
        .eq("id", params.decisionId)
        .eq("mission_id", params.missionId)
        .eq("org_id", params.orgId)
        .in("status", ["removed", "superseded"])
        .select("id")
    : await table
        .update({ status: "removed", removed_by: params.userId, removed_at: new Date().toISOString() })
        .eq("id", params.decisionId)
        .eq("mission_id", params.missionId)
        .eq("org_id", params.orgId)
        .eq("status", "active")
        .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: params.active ? "That decision is already in force." : "That decision is not in force." };
  }
  return { ok: true };
}

// ── the state a worker reads ────────────────────────────────────────────────

function clip(text: string | null | undefined, max: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * The mission's memory, as a worker reads it before the conversation.
 *
 * Decisions come first because they outlast the messages they were given in:
 * the ones written down from instructions, a finish line the CEO moved, and
 * every company the CEO ruled out. Facts, open questions and next work are
 * read from the records and the plan, so they cannot go stale.
 */
export function describeMissionState(input: {
  holdings: MissionHoldings;
  decisions: readonly MissionDecision[];
  criteria: readonly MissionCriterion[];
  progress: MissionProgress | null;
  lastQuestion: string | null;
}): string {
  const { holdings } = input;
  const facts = { companies: holdings.companies, candidates: [], partners: [] };
  const live = holdings.companies.filter((c) => !c.notForUs);
  const ruledOut = holdings.companies.filter((c) => c.notForUs);
  const missing = live.filter((c) => c.state === "one_thing_missing");
  const unread = missing.filter((c) => !c.reachChecked);

  const decided = [
    ...input.decisions.map((d) => `- ${d.text} (the CEO's words: “${clip(d.quote, 140)}”)`),
    ...input.criteria
      .filter((c) => c.setBy === "human")
      .map((c) => `- The finish line the CEO set: ${metricLabel(c.metric, c.target)}.`),
    ...ruledOut
      .slice(0, RULED_OUT_LINES)
      .map((c) => `- Not for us: ${c.name} — ${clip(c.notForUs?.reason, 140)}`),
    ruledOut.length > RULED_OUT_LINES
      ? `- …and ${ruledOut.length - RULED_OUT_LINES} more companies the CEO ruled out`
      : null,
  ].filter((line): line is string => Boolean(line));

  const known = [
    `${holdings.counts.researched} ${holdings.counts.researched === 1 ? "company" : "companies"} on file`,
    `${holdings.counts.qualified} still in play`,
    `${countMetric("named_buyers", facts)} with the buyer named`,
    `${holdings.counts.callable} reachable`,
    `${holdings.companies.filter((c) => c.lastAttempt).length} already contacted`,
    `${holdings.counts.dead} not worth chasing`,
    `${holdings.counts.notForUs} ruled out by the CEO`,
    `${holdings.people.length} ${holdings.people.length === 1 ? "person" : "people"}`,
  ].join(" · ");

  const questions = [
    input.lastQuestion
      ? `- You asked the CEO: “${clip(input.lastQuestion, 220)}” — the latest instruction may answer it.`
      : null,
    ...missing
      .slice(0, OPEN_QUESTION_LINES)
      .map((c) => `- ${c.name}: ${clip(c.missing?.fact ?? "one thing missing", 140)} (${c.missing?.owner ?? "Scout"})`),
    missing.length > OPEN_QUESTION_LINES
      ? `- …and ${missing.length - OPEN_QUESTION_LINES} more companies missing one thing`
      : null,
  ].filter((line): line is string => Boolean(line));

  const current = input.progress?.current ?? null;
  const next = [
    input.progress?.met
      ? "- The finish line is reached. Say so in `reply`; look for more only if the instruction asks."
      : null,
    current ? `- Plan: ${current.title} — ${current.actual} of ${current.target}` : null,
    unread.length > 0
      ? `- ${unread.length} held ${unread.length === 1 ? "company is" : "companies are"} still missing a person or a door, with ${unread.length === 1 ? "its" : "their"} own site not yet read`
      : null,
  ].filter((line): line is string => Boolean(line));

  return [
    "MISSION STATE — the mission's memory, kept from its records and the CEO's decisions. It outranks anything older in the conversation.",
    "",
    "CEO DECISIONS IN FORCE (apply every one to everything you return):",
    ...(decided.length > 0 ? decided : ["- none recorded"]),
    "",
    `KNOWN FACTS: ${known}.`,
    "",
    "OPEN QUESTIONS:",
    ...(questions.length > 0 ? questions : ["- none"]),
    "",
    "NEXT WORK:",
    ...(next.length > 0 ? next : ["- what the latest instruction asks"]),
  ].join("\n");
}
