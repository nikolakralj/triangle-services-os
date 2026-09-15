import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { activity, appendMissionActivity } from "@/lib/data/mission-runs";
import { employeeRuntimeOf, type MissionRuntime } from "@/lib/data/bot-runtime";

// ---------------------------------------------------------------------------
// One employee asking another for work — through Triangle, never around it.
//
// Scout finds a buyer and needs to know whether Triangle can field the crew;
// Bob is asked for twelve PCS7 engineers and needs Hanna for the people and
// Scout for the project. Bots can message each other on their own platform,
// but a message is not a record: Triangle cannot retry it, show it to the CEO,
// or tell the asker the answer came back. So a request is an assignment that
// hangs off the work it came from (migration 047), and the answer wakes the
// asker when it is done.
//
// A graph, never a pipeline. Nothing here knows who Scout, Hanna or Bob are:
// any active employee may ask any other that can take requests, several
// requests may run at once, and a new employee is a new row, not new code.
// Two limits keep a graph from turning into a storm: how deep a chain of
// requests may go, and how many one piece of work may have open at once.
// ---------------------------------------------------------------------------

const MAX_DEPTH = 5;
const MAX_OPEN_REQUESTS = 8;
const OPEN_STATUSES = ["queued", "active", "waiting_review"];

type Svc = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;

/** The piece of work a request is made from. */
export interface RequestingStep {
  id: string;
  orgId: string;
  missionId: string;
  agentInstanceId: string;
}

export interface Colleague {
  name: string;
  roleKey: string;
  owns: string | null;
  runsOn: MissionRuntime;
  canTakeRequests: boolean;
  whyNot?: string;
}

export interface RequestedWork {
  assignmentId: string;
  title: string;
  askedOf: string;
  status: string;
  headline: string | null;
  reply: string | null;
  completedAt: string | null;
}

function clip(text: string | null | undefined, max: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

interface EmployeeRow {
  id: string;
  display_name: string;
  role_key: string;
  description: string | null;
  status: string;
  config: Record<string, unknown> | null;
}

async function activeEmployees(svc: Svc, orgId: string): Promise<EmployeeRow[]> {
  const { data } = await svc
    .from("agent_instances")
    .select("id, display_name, role_key, description, status, config")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("created_at");
  return (data ?? []) as EmployeeRow[];
}

function runtimeOf(row: EmployeeRow): MissionRuntime {
  return employeeRuntimeOf(row.role_key, row.config);
}

function asColleague(row: EmployeeRow): Colleague {
  const runsOn = runtimeOf(row);
  return {
    name: row.display_name,
    roleKey: row.role_key,
    owns: row.description,
    runsOn,
    canTakeRequests: runsOn === "bot",
    ...(runsOn === "bot"
      ? {}
      : { whyNot: "Works inside Triangle, which cannot take requests from colleagues yet." }),
  };
}

/** Everyone an employee could ask, and whether they can take a request today. */
export async function listColleagues(orgId: string, selfId: string): Promise<Colleague[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  return (await activeEmployees(svc, orgId)).filter((e) => e.id !== selfId).map(asColleague);
}

/** What this piece of work asked colleagues for, and what came back. */
export async function listRequestedWork(orgId: string, parentId: string): Promise<RequestedWork[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data } = await svc
    .from("agent_assignments")
    .select("id, title, status, result_summary, completed_at, agent_instance_id")
    .eq("org_id", orgId)
    .eq("parent_assignment_id", parentId)
    .order("created_at");
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];
  const names = new Map(
    (await activeEmployees(svc, orgId)).map((e) => [e.id, e.display_name] as const),
  );
  return rows.map((r) => {
    let headline: string | null = null;
    let reply: string | null = null;
    const summary = typeof r.result_summary === "string" ? r.result_summary : null;
    if (summary) {
      try {
        const record = JSON.parse(summary) as { brief?: { headline?: string }; reply?: string };
        headline = record.brief?.headline ?? null;
        reply = record.reply ?? null;
      } catch {
        reply = summary;
      }
    }
    return {
      assignmentId: String(r.id),
      title: String(r.title ?? ""),
      askedOf: names.get(String(r.agent_instance_id)) ?? "a former employee",
      status: String(r.status ?? ""),
      headline,
      reply: reply ? clip(reply, 1_500) : null,
      completedAt: (r.completed_at as string | null) ?? null,
    };
  });
}

async function depthOf(svc: Svc, orgId: string, assignmentId: string): Promise<number> {
  let depth = 0;
  let current: string | null = assignmentId;
  while (current && depth <= MAX_DEPTH) {
    const id: string = current;
    const row = await svc
      .from("agent_assignments")
      .select("parent_assignment_id")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    const parent: string | null = (row.data?.parent_assignment_id as string | null | undefined) ?? null;
    current = parent;
    if (parent) depth += 1;
  }
  return depth;
}

async function openRunOf(svc: Svc, orgId: string, assignmentId: string): Promise<string | null> {
  const { data } = await svc
    .from("agent_runs")
    .select("id")
    .eq("org_id", orgId)
    .eq("assignment_id", assignmentId)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

const requestSchema = z.object({
  to: z.string().trim().min(1).max(120),
  title: z.string().trim().min(3).max(120),
  objective: z.string().trim().min(10).max(2_000),
  expectedOutput: z.string().trim().max(1_000).nullish(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

export type RequestResult =
  | {
      ok: true;
      assignmentId: string;
      askedOf: string;
      alreadyAsked: boolean;
      wake: { agentInstanceId: string; stepId: string; missionId: string } | null;
    }
  | { error: string; status: number };

/** Ask a colleague for work, as a child of the step asking. */
export async function requestWork(step: RequestingStep, raw: unknown): Promise<RequestResult> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { error: "Database unavailable.", status: 503 };

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: `The request is incomplete: ${parsed.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; ")}`,
      status: 400,
    };
  }
  const input = parsed.data;

  const everyone = await activeEmployees(svc, step.orgId);
  const wanted = input.to.toLowerCase();
  const target = everyone.find(
    (e) =>
      e.id === input.to ||
      e.role_key.toLowerCase() === wanted ||
      e.display_name.toLowerCase() === wanted,
  );
  if (!target) {
    const names = everyone.filter((e) => e.id !== step.agentInstanceId).map((e) => e.display_name);
    return {
      error: `Nobody called "${input.to}" works here. You can ask: ${names.join(", ") || "nobody yet"}.`,
      status: 404,
    };
  }
  if (target.id === step.agentInstanceId) {
    return { error: "That is you — do the work yourself.", status: 400 };
  }
  const colleague = asColleague(target);
  if (!colleague.canTakeRequests) {
    return { error: `${colleague.name} ${colleague.whyNot?.toLowerCase() ?? "cannot take requests yet."}`, status: 409 };
  }

  if ((await depthOf(svc, step.orgId, step.id)) + 1 > MAX_DEPTH) {
    return {
      error: `This work is already ${MAX_DEPTH} requests deep. Finish it with what you have, or ask the CEO.`,
      status: 409,
    };
  }
  const { count: openCount } = await svc
    .from("agent_assignments")
    .select("id", { count: "exact", head: true })
    .eq("org_id", step.orgId)
    .eq("parent_assignment_id", step.id)
    .in("status", OPEN_STATUSES);
  if ((openCount ?? 0) >= MAX_OPEN_REQUESTS) {
    return {
      error: `This work already has ${MAX_OPEN_REQUESTS} requests open. Use what comes back before asking for more.`,
      status: 409,
    };
  }

  // The same request retried is the same request.
  const fingerprint = createHash("sha256")
    .update(`${target.id}|${input.title.toLowerCase()}|${input.objective}`)
    .digest("hex")
    .slice(0, 24);
  const idempotencyKey = `request:${step.id}:${fingerprint}`;
  const { data: existing } = await svc
    .from("agent_assignments")
    .select("id")
    .eq("org_id", step.orgId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing?.id) {
    return {
      ok: true,
      assignmentId: existing.id as string,
      askedOf: colleague.name,
      alreadyAsked: true,
      wake: null,
    };
  }

  const { data: created, error } = await svc
    .from("agent_assignments")
    .insert({
      org_id: step.orgId,
      agent_instance_id: target.id,
      title: input.title,
      objective: input.objective,
      expected_output: input.expectedOutput ?? null,
      status: "queued",
      priority: input.priority,
      mission_id: step.missionId,
      parent_assignment_id: step.id,
      requested_by_agent_instance_id: step.agentInstanceId,
      constraints: { case_type: "mission_step", execution_mode: "bot", requested: true },
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();
  if (error || !created) {
    return { error: "The request could not be recorded.", status: 500 };
  }

  await appendMissionActivity(await openRunOf(svc, step.orgId, step.id), [
    activity("delegated", `Asked ${colleague.name}: ${clip(input.title, 100)}`),
  ]);

  return {
    ok: true,
    assignmentId: created.id as string,
    askedOf: colleague.name,
    alreadyAsked: false,
    wake: { agentInstanceId: target.id, stepId: created.id as string, missionId: step.missionId },
  };
}

/**
 * A request finished — tell the work that asked for it. Its activity says
 * what came back, and its employee is woken to use it, if that work is still
 * open. Returns who to wake; the caller wakes after responding.
 */
export async function reportBack(
  orgId: string,
  childId: string,
  outcome: { headline: string | null; failedReason?: string | null },
): Promise<{ agentInstanceId: string; stepId: string; missionId: string } | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data: child } = await svc
    .from("agent_assignments")
    .select("title, parent_assignment_id, agent_instance_id")
    .eq("id", childId)
    .eq("org_id", orgId)
    .maybeSingle();
  const parentId = (child?.parent_assignment_id as string | null | undefined) ?? null;
  if (!child || !parentId) return null;

  const { data: parent } = await svc
    .from("agent_assignments")
    .select("id, status, agent_instance_id, mission_id, constraints")
    .eq("id", parentId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!parent) return null;

  const { data: who } = await svc
    .from("agent_instances")
    .select("display_name")
    .eq("id", child.agent_instance_id as string)
    .maybeSingle();
  const name = (who?.display_name as string | undefined) ?? "A colleague";
  const title = clip(child.title as string, 80);
  const line = outcome.failedReason
    ? `${name} could not do “${title}”: ${clip(outcome.failedReason, 140)}`
    : `${name} finished “${title}”${outcome.headline ? ` — ${clip(outcome.headline, 140)}` : ""}`;
  await appendMissionActivity(await openRunOf(svc, orgId, parentId), [activity("returned", line)]);

  const constraints = (parent.constraints as Record<string, unknown> | null) ?? {};
  const stillOpen = OPEN_STATUSES.includes(parent.status as string);
  if (!stillOpen || constraints.execution_mode !== "bot" || !parent.mission_id) return null;
  return {
    agentInstanceId: parent.agent_instance_id as string,
    stepId: parent.id as string,
    missionId: parent.mission_id as string,
  };
}
