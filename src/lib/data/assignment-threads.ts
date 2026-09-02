import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// The conversation attached to an assignment.
//
// An assignment used to be a one-shot brief: objective in, result out. Ask
// Scout for projects in Austria and there was nowhere to put "which of those
// are near Linz?" — only a new assignment that knew nothing about the first.
//
// Bot platforms poll; you cannot push to them. So a follow-up is not delivered
// when you write it, it is delivered when the agent next checks its inbox.
// `delivered_at` records that honestly instead of pretending the agent has
// already seen it.
// ---------------------------------------------------------------------------

export interface AssignmentMessage {
  id: string;
  role: "human" | "agent";
  body: string;
  authorName: string | null;
  createdAt: string;
  /** Null on a human message the agent has not fetched yet. */
  deliveredAt: string | null;
}

export async function listAssignmentMessages(
  assignmentId: string,
  orgId: string,
): Promise<AssignmentMessage[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const { data } = await svc
    .from("assignment_messages")
    .select("id, role, body, created_at, delivered_at, author_user_id, agent_instance_id")
    .eq("assignment_id", assignmentId)
    .eq("org_id", orgId)
    .order("created_at");

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Put a name on each side of the conversation. Humans come from the
  // membership list, agents from their employee record.
  const userIds = Array.from(
    new Set(rows.map((r) => r.author_user_id).filter(Boolean) as string[]),
  );
  const agentIds = Array.from(
    new Set(rows.map((r) => r.agent_instance_id).filter(Boolean) as string[]),
  );

  const names = new Map<string, string>();
  if (userIds.length > 0) {
    // organization_members has no email column — only the address someone was
    // invited at, which is blank for anyone created directly. The auth admin
    // list is the real source, and it is presentation only: the thread still
    // reads fine if this call fails.
    try {
      const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 100 });
      for (const u of data?.users ?? []) {
        if (userIds.includes(u.id)) names.set(u.id, u.email ?? "member");
      }
    } catch {
      // Names are a nicety; the conversation is the point.
    }
  }
  if (agentIds.length > 0) {
    const { data: agents } = await svc
      .from("agent_instances")
      .select("id, display_name, emoji")
      .in("id", agentIds);
    for (const a of agents ?? []) {
      const emoji = (a.emoji as string) || "";
      names.set(a.id as string, `${emoji} ${a.display_name as string}`.trim());
    }
  }

  return rows.map((r) => ({
    id: r.id as string,
    role: r.role as "human" | "agent",
    body: r.body as string,
    authorName:
      names.get((r.author_user_id ?? r.agent_instance_id) as string) ?? null,
    createdAt: r.created_at as string,
    deliveredAt: (r.delivered_at as string) ?? null,
  }));
}

/**
 * A human adds a message to the thread.
 *
 * If the assignment was already finished, this reopens it — otherwise the
 * follow-up would sit in a thread the agent never looks at again, which is
 * exactly the dead end this feature exists to remove.
 */
export async function addHumanMessage(params: {
  assignmentId: string;
  orgId: string;
  userId: string | null;
  body: string;
}): Promise<{ ok: boolean; reopened: boolean; error?: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, reopened: false, error: "Database unavailable" };

  const body = params.body.trim().slice(0, 8000);
  if (!body) return { ok: false, reopened: false, error: "Message is empty." };

  const { data: assignment } = await svc
    .from("agent_assignments")
    .select("id, status, constraints")
    .eq("id", params.assignmentId)
    .eq("org_id", params.orgId)
    .maybeSingle();

  if (!assignment) {
    return { ok: false, reopened: false, error: "Assignment not found." };
  }
  if (assignment.status === "cancelled") {
    return {
      ok: false,
      reopened: false,
      error: "This assignment was cancelled. Start a new one.",
    };
  }

  const { error } = await svc.from("assignment_messages").insert({
    org_id: params.orgId,
    assignment_id: params.assignmentId,
    role: "human",
    body,
    author_user_id: params.userId,
  });
  if (error) return { ok: false, reopened: false, error: error.message };

  const finished = ["completed", "failed"].includes(assignment.status as string);
  if (finished) {
    const constraints =
      (assignment.constraints as Record<string, unknown> | null) ?? {};
    await svc
      .from("agent_assignments")
      .update({
        // In-app workers are push-capable: the next workforce pulse claims
        // the reopened job. External provider bots still use their existing
        // active/polling contract.
        status: constraints.execution_mode === "in_app" ? "queued" : "active",
        completed_at: null,
      })
      .eq("id", params.assignmentId)
      .eq("org_id", params.orgId);
  }

  return { ok: true, reopened: finished };
}

/**
 * An agent answers in the thread without closing the assignment.
 *
 * Distinct from completing it: a bot that has a partial answer, or a question
 * of its own, should be able to say so and keep the job open. Reporting a
 * final result still goes through completeAssignment.
 */
export async function addAgentMessage(params: {
  assignmentId: string;
  orgId: string;
  agentInstanceId: string;
  body: string;
}): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;

  const body = params.body.trim().slice(0, 8000);
  if (!body) return false;

  // The badge must own the assignment — an agent cannot post into someone
  // else's thread.
  const { data: assignment } = await svc
    .from("agent_assignments")
    .select("id")
    .eq("id", params.assignmentId)
    .eq("org_id", params.orgId)
    .eq("agent_instance_id", params.agentInstanceId)
    .maybeSingle();
  if (!assignment) return false;

  const { error } = await svc.from("assignment_messages").insert({
    org_id: params.orgId,
    assignment_id: params.assignmentId,
    role: "agent",
    body,
    agent_instance_id: params.agentInstanceId,
  });
  return !error;
}

/**
 * The thread as a bot should receive it, and a record that it did.
 *
 * Returns the whole conversation for context plus the human messages that are
 * new since last poll, then stamps those delivered. Marking on read can lose a
 * nudge if the bot crashes mid-run, but the full thread is always returned, so
 * nothing is actually unrecoverable.
 */
export async function takeThreadForBot(
  assignmentIds: string[],
  orgId: string,
): Promise<Map<string, { thread: Array<{ from: string; text: string; at: string }>; newQuestions: string[] }>> {
  const out = new Map<
    string,
    { thread: Array<{ from: string; text: string; at: string }>; newQuestions: string[] }
  >();
  const svc = createServiceSupabaseClient();
  if (!svc || assignmentIds.length === 0) return out;

  const { data } = await svc
    .from("assignment_messages")
    .select("id, assignment_id, role, body, created_at, delivered_at")
    .in("assignment_id", assignmentIds)
    .eq("org_id", orgId)
    .order("created_at");

  const rows = data ?? [];
  const undelivered: string[] = [];

  for (const r of rows) {
    const key = r.assignment_id as string;
    if (!out.has(key)) out.set(key, { thread: [], newQuestions: [] });
    const entry = out.get(key)!;
    entry.thread.push({
      from: r.role as string,
      text: r.body as string,
      at: r.created_at as string,
    });
    if (r.role === "human" && !r.delivered_at) {
      entry.newQuestions.push(r.body as string);
      undelivered.push(r.id as string);
    }
  }

  if (undelivered.length > 0) {
    await svc
      .from("assignment_messages")
      .update({ delivered_at: new Date().toISOString() })
      .in("id", undelivered);
  }

  return out;
}

/** How many messages each assignment carries, for list views. */
export async function countMessagesByAssignment(
  assignmentIds: string[],
  orgId: string,
): Promise<Map<string, { total: number; awaitingAgent: number }>> {
  const out = new Map<string, { total: number; awaitingAgent: number }>();
  const svc = createServiceSupabaseClient();
  if (!svc || assignmentIds.length === 0) return out;

  const { data } = await svc
    .from("assignment_messages")
    .select("assignment_id, role, delivered_at")
    .in("assignment_id", assignmentIds)
    .eq("org_id", orgId);

  for (const r of data ?? []) {
    const key = r.assignment_id as string;
    if (!out.has(key)) out.set(key, { total: 0, awaitingAgent: 0 });
    const entry = out.get(key)!;
    entry.total += 1;
    if (r.role === "human" && !r.delivered_at) entry.awaitingAgent += 1;
  }
  return out;
}
