import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Agent Console data layer.
//
// The console is how Nikola and Ralph steer external agents WITHOUT opening
// the bot platform's own app: instructions written here are fetched by each
// agent at the start of its run (GET /api/agent/inbox), and every run —
// bot-fed or IMAP fallback — leaves a row in agent_runs.
//
// Deliberately a message queue, not a chat: bot platforms cannot receive a
// pushed message from us, but they can poll an inbox each run. The database
// stays the meeting point, per the shared constitution.
// ---------------------------------------------------------------------------

export interface AgentInfo {
  name: string;
  scopes: string[];
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface AgentTask {
  id: string;
  agentName: string;
  instruction: string;
  status: "pending" | "done" | "cancelled";
  result: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AgentRun {
  agentName: string;
  source: string;
  summary: Record<string, unknown>;
  createdAt: string;
}

/** Roster = active machine credentials. One credential, one agent identity. */
export async function listAgents(orgId: string): Promise<AgentInfo[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data } = await svc
    .from("machine_credentials")
    .select("name, scopes, status, last_used_at, created_at")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("created_at");
  return (data ?? []).map((r) => ({
    name: r.name as string,
    scopes: Array.isArray(r.scopes) ? (r.scopes as string[]) : [],
    status: r.status as string,
    lastUsedAt: (r.last_used_at as string) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function listAgentTasks(
  orgId: string,
  opts: { limit?: number } = {},
): Promise<AgentTask[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data } = await svc
    .from("agent_tasks")
    .select("id, agent_name, instruction, status, result, created_at, completed_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    agentName: r.agent_name as string,
    instruction: r.instruction as string,
    status: r.status as AgentTask["status"],
    result: (r.result as string) ?? null,
    createdAt: r.created_at as string,
    completedAt: (r.completed_at as string) ?? null,
  }));
}

export async function createAgentTask(params: {
  orgId: string;
  agentName: string;
  instruction: string;
  userId: string | null;
}): Promise<AgentTask | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data, error } = await svc
    .from("agent_tasks")
    .insert({
      org_id: params.orgId,
      agent_name: params.agentName,
      instruction: params.instruction.slice(0, 4000),
      created_by: params.userId,
    })
    .select("id, agent_name, instruction, status, result, created_at, completed_at")
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id as string,
    agentName: data.agent_name as string,
    instruction: data.instruction as string,
    status: data.status as AgentTask["status"],
    result: (data.result as string) ?? null,
    createdAt: data.created_at as string,
    completedAt: (data.completed_at as string) ?? null,
  };
}

export async function cancelAgentTask(
  taskId: string,
  orgId: string,
): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;
  const { error } = await svc
    .from("agent_tasks")
    .update({ status: "cancelled" })
    .eq("id", taskId)
    .eq("org_id", orgId)
    .eq("status", "pending");
  return !error;
}

/** Pending tasks for ONE agent — what GET /api/agent/inbox returns to a bot. */
export async function listPendingTasksForAgent(
  orgId: string,
  agentName: string,
): Promise<AgentTask[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data } = await svc
    .from("agent_tasks")
    .select("id, agent_name, instruction, status, result, created_at, completed_at")
    .eq("org_id", orgId)
    .eq("agent_name", agentName)
    .eq("status", "pending")
    .order("created_at");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    agentName: r.agent_name as string,
    instruction: r.instruction as string,
    status: r.status as AgentTask["status"],
    result: (r.result as string) ?? null,
    createdAt: r.created_at as string,
    completedAt: (r.completed_at as string) ?? null,
  }));
}

/** An agent reporting one of ITS OWN tasks done. Identity comes from the token. */
export async function completeAgentTask(params: {
  taskId: string;
  orgId: string;
  agentName: string;
  result: string;
}): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;
  const { data, error } = await svc
    .from("agent_tasks")
    .update({
      status: "done",
      result: params.result.slice(0, 4000),
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.taskId)
    .eq("org_id", params.orgId)
    .eq("agent_name", params.agentName)
    .eq("status", "pending")
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

export async function listAgentRuns(
  orgId: string,
  opts: { limit?: number } = {},
): Promise<AgentRun[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data } = await svc
    .from("agent_runs")
    .select("agent_name, source, summary, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 25);
  return (data ?? []).map((r) => ({
    agentName: r.agent_name as string,
    source: r.source as string,
    summary: (r.summary as Record<string, unknown>) ?? {},
    createdAt: r.created_at as string,
  }));
}

/** Best-effort run logging — never throws, never blocks the caller. */
export async function logAgentRun(params: {
  orgId: string;
  agentName: string;
  source: string;
  summary: Record<string, unknown>;
}): Promise<void> {
  try {
    const svc = createServiceSupabaseClient();
    if (!svc) return;
    await svc.from("agent_runs").insert({
      org_id: params.orgId,
      agent_name: params.agentName,
      source: params.source,
      summary: params.summary,
    });
  } catch {
    // Logging must never break the run it is logging.
  }
}
