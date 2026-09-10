import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { parseActivity, type ActivityEvent, type ActivityKind } from "@/lib/data/mission-shared";

// ---------------------------------------------------------------------------
// A mission step's run, and what the worker did during it.
//
// The CEO asked for ACTIVITY, not THINKING: "Searched Goldbeck procurement",
// "Found supplier portal", "Could not find direct email". Operational events,
// auditable, without a transcript of the model's reasoning.
//
// Each run is one agent_runs row, written when the step starts rather than
// only when it ends, so a step that is still working can show what it has
// done so far. The events come from what actually happened — the searches the
// provider executed and the rows that were filed — not from a list the model
// writes about itself.
//
// The budget counts agent_runs rows started today, so a run written at start
// is counted exactly once, as before.
// ---------------------------------------------------------------------------

const MAX_EVENTS = 80;

export function activity(kind: ActivityKind, text: string): ActivityEvent {
  return { at: new Date().toISOString(), kind, text: text.replace(/\s+/g, " ").slice(0, 240) };
}

export async function startMissionRun(params: {
  orgId: string;
  missionId: string;
  assignmentId: string;
  agentInstanceId: string;
  agentName: string;
  provider: string | null;
  model: string | null;
  first: ActivityEvent;
}): Promise<string | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data, error } = await svc
    .from("agent_runs")
    .insert({
      org_id: params.orgId,
      agent_name: params.agentName,
      source: "mission",
      summary: {
        missionId: params.missionId,
        assignmentId: params.assignmentId,
        status: "running",
      },
      agent_instance_id: params.agentInstanceId,
      assignment_id: params.assignmentId,
      provider: params.provider,
      model: params.model,
      status: "running",
      started_at: new Date().toISOString(),
      metadata: { mission_id: params.missionId, activity: [params.first] },
    })
    .select("id")
    .single();
  if (error || !data) {
    // Activity is the audit trail, not the work. A run that cannot be logged
    // still runs; the screen says less about it.
    console.error("startMissionRun:", error?.message);
    return null;
  }
  return data.id as string;
}

// One write at a time per run. The step callback fires once per model step,
// and two appends reading the same list would each drop the other's events.
const chains = new Map<string, Promise<void>>();

export function appendMissionActivity(
  runId: string | null,
  events: ActivityEvent[],
): Promise<void> {
  if (!runId || events.length === 0) return Promise.resolve();
  const next = (chains.get(runId) ?? Promise.resolve())
    .then(() => writeEvents(runId, events, null))
    .catch((err) => console.error("appendMissionActivity:", err));
  chains.set(runId, next);
  return next;
}

export async function finishMissionRun(
  runId: string | null,
  params: {
    status: "completed" | "failed";
    events: ActivityEvent[];
    inputTokens?: number | null;
    outputTokens?: number | null;
    error?: string | null;
    summary?: Record<string, unknown>;
  },
): Promise<void> {
  if (!runId) return;
  await (chains.get(runId) ?? Promise.resolve());
  chains.delete(runId);
  try {
    await writeEvents(runId, params.events, params);
  } catch (err) {
    console.error("finishMissionRun:", err);
  }
}

async function writeEvents(
  runId: string,
  events: ActivityEvent[],
  finish: Parameters<typeof finishMissionRun>[1] | null,
): Promise<void> {
  const svc = createServiceSupabaseClient();
  if (!svc) return;
  const { data } = await svc
    .from("agent_runs")
    .select("metadata, summary")
    .eq("id", runId)
    .maybeSingle();
  const metadata = (data?.metadata as Record<string, unknown> | null) ?? {};
  const list = [...parseActivity(metadata), ...events].slice(-MAX_EVENTS);

  const update: Record<string, unknown> = { metadata: { ...metadata, activity: list } };
  if (finish) {
    update.status = finish.status;
    update.finished_at = new Date().toISOString();
    update.error = finish.error ?? null;
    if (typeof finish.inputTokens === "number") update.input_tokens = finish.inputTokens;
    if (typeof finish.outputTokens === "number") update.output_tokens = finish.outputTokens;
    update.summary = {
      ...((data?.summary as Record<string, unknown> | null) ?? {}),
      ...(finish.summary ?? {}),
      status: finish.status,
    };
  }
  await svc.from("agent_runs").update(update).eq("id", runId);
}

/**
 * The searches and pages a model step actually touched, as activity.
 *
 * OpenAI's web search is executed by the provider, so the queries arrive as
 * tool results on the step rather than as calls this code made. Read
 * defensively: the shape is the provider's, and an event that cannot be read
 * is simply not shown.
 */
export function searchActivityOf(step: unknown): ActivityEvent[] {
  const content = (step as { content?: unknown })?.content;
  if (!Array.isArray(content)) return [];
  const out: ActivityEvent[] = [];
  const seen = new Set<string>();

  for (const part of content) {
    const p = part as {
      type?: string;
      toolName?: string;
      output?: unknown;
      input?: unknown;
      result?: unknown;
    };
    if (p?.toolName !== "web_search") continue;
    if (p.type !== "tool-result" && p.type !== "tool-call") continue;
    const payload = (p.output ?? p.result ?? p.input) as
      | { action?: Record<string, unknown> }
      | undefined;
    const action = payload?.action;
    if (!action || typeof action !== "object") continue;

    let line: ActivityEvent | null = null;
    if (action.type === "search") {
      const queries = Array.isArray(action.queries)
        ? action.queries.map(String)
        : typeof action.query === "string"
          ? [action.query]
          : [];
      if (queries.length > 0) {
        line = activity("searched", `Searched “${queries.slice(0, 2).join("” · “")}”`);
      }
    } else if (action.type === "openPage" && typeof action.url === "string") {
      line = activity("opened", `Read ${shortUrl(action.url)}`);
    } else if (action.type === "findInPage" && typeof action.url === "string") {
      line = activity(
        "looked",
        `Looked for “${String(action.pattern ?? "").slice(0, 60)}” on ${shortUrl(action.url)}`,
      );
    }
    if (line && !seen.has(line.text)) {
      seen.add(line.text);
      out.push(line);
    }
  }
  return out;
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${u.hostname.replace(/^www\./, "")}${path.length > 40 ? `${path.slice(0, 40)}…` : path}`;
  } catch {
    return url.slice(0, 60);
  }
}
