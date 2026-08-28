import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  countMessagesByAssignment,
  takeThreadForBot,
} from "@/lib/data/assignment-threads";

// ---------------------------------------------------------------------------
// Workforce data layer (agent_instances era).
//
// The employee is durable and provider-independent; the machine credential is
// only its badge. Everything here reads/writes the instance-centric tables
// introduced in migration 023. The older agents.ts (credential-roster,
// agent_tasks quick notes, agent_runs log) stays for compatibility — Bob's
// inbox contract must not break.
// ---------------------------------------------------------------------------

export interface WorkforceEmployee {
  id: string;
  roleKey: string;
  displayName: string;
  department: string | null;
  emoji: string;
  description: string | null;
  status: string;
  roleVersion: string | null;
  provider: string | null;
  providerRef: string | null;
  lastUsedAt: string | null;
  onDuty: boolean;
  /** Hired but has never called Triangle — "Off duty" would be misleading. */
  neverStarted: boolean;
  openAssignments: number;
  badgeName: string | null;
}

export interface HumanMember {
  userId: string;
  email: string;
  role: string;
}

export interface Assignment {
  id: string;
  agentInstanceId: string;
  title: string;
  objective: string;
  status: "queued" | "active" | "waiting_review" | "completed" | "failed" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  dueAt: string | null;
  resultSummary: string | null;
  createdAt: string;
  completedAt: string | null;
  /** Attached business objects, summarised for display. */
  workers: Array<{ id: string; name: string }>;
  /** The project this job is about, if it is about one. */
  projectId: string | null;
  projectName: string | null;
  /** Thread size, and how many of your messages the agent has not fetched. */
  messageCount: number;
  awaitingAgent: number;
}

export interface WorkerLite {
  id: string;
  name: string;
  role: string | null;
  availability: string | null;
}

const OPEN_STATUSES = ["queued", "active", "waiting_review"];

export async function listWorkforce(orgId: string): Promise<WorkforceEmployee[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const [instancesRes, bindingsRes, credsRes, openRes] = await Promise.all([
    svc
      .from("agent_instances")
      .select("id, role_key, display_name, department, emoji, description, status, role_version")
      .eq("org_id", orgId)
      .neq("status", "retired")
      .order("created_at"),
    svc
      .from("agent_provider_bindings")
      .select("agent_instance_id, provider, external_agent_ref, status")
      .eq("org_id", orgId)
      .eq("status", "active"),
    svc
      .from("machine_credentials")
      .select("agent_instance_id, name, status, last_used_at")
      .eq("org_id", orgId)
      .eq("status", "active"),
    svc
      .from("agent_assignments")
      .select("agent_instance_id, status")
      .eq("org_id", orgId)
      .in("status", OPEN_STATUSES),
  ]);

  const bindings = new Map<string, { provider: string; ref: string | null }>();
  for (const b of bindingsRes.data ?? []) {
    bindings.set(b.agent_instance_id as string, {
      provider: b.provider as string,
      ref: (b.external_agent_ref as string) ?? null,
    });
  }
  const badges = new Map<string, { name: string; lastUsedAt: string | null }>();
  for (const c of credsRes.data ?? []) {
    if (c.agent_instance_id) {
      badges.set(c.agent_instance_id as string, {
        name: c.name as string,
        lastUsedAt: (c.last_used_at as string) ?? null,
      });
    }
  }
  const openCounts = new Map<string, number>();
  for (const a of openRes.data ?? []) {
    const k = a.agent_instance_id as string;
    openCounts.set(k, (openCounts.get(k) ?? 0) + 1);
  }

  return (instancesRes.data ?? []).map((i) => {
    const badge = badges.get(i.id as string) ?? null;
    const lastUsedAt = badge?.lastUsedAt ?? null;
    return {
      id: i.id as string,
      roleKey: i.role_key as string,
      displayName: i.display_name as string,
      department: (i.department as string) ?? null,
      emoji: (i.emoji as string) || "🤖",
      description: (i.description as string) ?? null,
      status: i.status as string,
      roleVersion: (i.role_version as string) ?? null,
      provider: bindings.get(i.id as string)?.provider ?? null,
      providerRef: bindings.get(i.id as string)?.ref ?? null,
      lastUsedAt,
      onDuty:
        lastUsedAt !== null &&
        Date.now() - new Date(lastUsedAt).getTime() < 24 * 60 * 60 * 1000,
      neverStarted: lastUsedAt === null,
      openAssignments: openCounts.get(i.id as string) ?? 0,
      badgeName: badge?.name ?? null,
    };
  });
}

/** The human side of the org chart. */
export async function listHumans(orgId: string): Promise<HumanMember[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data: members } = await svc
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", orgId)
    .eq("status", "active");
  if (!members || members.length === 0) return [];

  // Few users at this stage; one admin page is plenty.
  const emails = new Map<string, string>();
  try {
    const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 100 });
    for (const u of data?.users ?? []) emails.set(u.id, u.email ?? "");
  } catch {
    // Emails are presentation only — the org chart still renders without them.
  }

  return members.map((m) => ({
    userId: m.user_id as string,
    email: emails.get(m.user_id as string) ?? "member",
    role: m.role as string,
  }));
}

export async function createAssignment(params: {
  orgId: string;
  agentInstanceId: string;
  title: string;
  objective: string;
  priority?: Assignment["priority"];
  dueAt?: string | null;
  constraints?: Record<string, unknown>;
  workerIds?: string[];
  projectId?: string | null;
  userId: string | null;
}): Promise<{ id: string } | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data, error } = await svc
    .from("agent_assignments")
    .insert({
      org_id: params.orgId,
      agent_instance_id: params.agentInstanceId,
      title: params.title.slice(0, 200),
      objective: params.objective.slice(0, 8000),
      priority: params.priority ?? "normal",
      due_at: params.dueAt ?? null,
      constraints: params.constraints ?? {},
      project_id: params.projectId ?? null,
      created_by: params.userId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return null;

  const workerIds = params.workerIds ?? [];
  if (workerIds.length > 0) {
    await svc.from("agent_assignment_entities").insert(
      workerIds.map((wid) => ({
        org_id: params.orgId,
        assignment_id: data.id as string,
        entity_type: "worker",
        entity_id: wid,
        relation: "input",
      })),
    );
  }
  return { id: data.id as string };
}

export async function listAssignments(
  orgId: string,
  opts: { limit?: number } = {},
): Promise<Assignment[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data } = await svc
    .from("agent_assignments")
    .select(
      "id, agent_instance_id, title, objective, status, priority, due_at, result_summary, created_at, completed_at, project_id",
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 30);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id as string);
  const { data: ents } = await svc
    .from("agent_assignment_entities")
    .select("assignment_id, entity_type, entity_id")
    .in("assignment_id", ids);

  const workerIds = Array.from(
    new Set(
      (ents ?? [])
        .filter((e) => e.entity_type === "worker")
        .map((e) => e.entity_id as string),
    ),
  );
  const workerNames = new Map<string, string>();
  if (workerIds.length > 0) {
    const { data: ws } = await svc
      .from("workers")
      .select("id, full_name")
      .in("id", workerIds);
    for (const w of ws ?? []) workerNames.set(w.id as string, w.full_name as string);
  }
  const byAssignment = new Map<string, Array<{ id: string; name: string }>>();
  for (const e of ents ?? []) {
    if (e.entity_type !== "worker") continue;
    const k = e.assignment_id as string;
    if (!byAssignment.has(k)) byAssignment.set(k, []);
    byAssignment.get(k)!.push({
      id: e.entity_id as string,
      name: workerNames.get(e.entity_id as string) ?? "worker",
    });
  }

  // Project names, so the list says what a job is about without opening it.
  const projectIds = Array.from(
    new Set(rows.map((r) => r.project_id).filter(Boolean) as string[]),
  );
  const projectNames = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: ps } = await svc
      .from("discovered_projects")
      .select("id, project_name")
      .in("id", projectIds);
    for (const p of ps ?? []) projectNames.set(p.id as string, p.project_name as string);
  }

  const threads = await countMessagesByAssignment(ids, orgId);

  return rows.map((r) => {
    const t = threads.get(r.id as string);
    return {
      id: r.id as string,
      agentInstanceId: r.agent_instance_id as string,
      title: r.title as string,
      objective: r.objective as string,
      status: r.status as Assignment["status"],
      priority: r.priority as Assignment["priority"],
      dueAt: (r.due_at as string) ?? null,
      resultSummary: (r.result_summary as string) ?? null,
      createdAt: r.created_at as string,
      completedAt: (r.completed_at as string) ?? null,
      workers: byAssignment.get(r.id as string) ?? [],
      projectId: (r.project_id as string) ?? null,
      projectName: r.project_id
        ? projectNames.get(r.project_id as string) ?? null
        : null,
      messageCount: t?.total ?? 0,
      awaitingAgent: t?.awaitingAgent ?? 0,
    };
  });
}

export async function cancelAssignment(
  assignmentId: string,
  orgId: string,
): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;
  const { data, error } = await svc
    .from("agent_assignments")
    .update({ status: "cancelled" })
    .eq("id", assignmentId)
    .eq("org_id", orgId)
    .in("status", ["queued", "active"])
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

export interface AssignmentForBot {
  id: string;
  title: string;
  objective: string;
  priority: string;
  dueAt: string | null;
  constraints: Record<string, unknown>;
  workers: Array<Record<string, unknown>>;
  /** The project this job is about, when it is about one. */
  project: { id: string; name: string } | null;
  /** Everything said on this job so far, oldest first. */
  thread: Array<{ from: string; text: string; at: string }>;
  /**
   * Human messages the bot has not been handed before. These are the ones it
   * still owes an answer to — the rest of the thread is context.
   */
  newQuestions: string[];
}

/**
 * What a bot sees: its open assignments with hydrated worker context.
 * Fetching marks queued ones active — the shift has started.
 */
export async function listOpenAssignmentsForInstance(
  orgId: string,
  agentInstanceId: string,
): Promise<AssignmentForBot[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data } = await svc
    .from("agent_assignments")
    .select("id, title, objective, priority, due_at, constraints, status, project_id")
    .eq("org_id", orgId)
    .eq("agent_instance_id", agentInstanceId)
    .in("status", ["queued", "active"])
    .order("created_at");
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const queued = rows.filter((r) => r.status === "queued").map((r) => r.id as string);
  if (queued.length > 0) {
    await svc
      .from("agent_assignments")
      .update({ status: "active", started_at: new Date().toISOString() })
      .in("id", queued);
  }

  const ids = rows.map((r) => r.id as string);
  const { data: ents } = await svc
    .from("agent_assignment_entities")
    .select("assignment_id, entity_type, entity_id")
    .in("assignment_id", ids);
  const workerIds = Array.from(
    new Set(
      (ents ?? [])
        .filter((e) => e.entity_type === "worker")
        .map((e) => e.entity_id as string),
    ),
  );
  const workerRows = new Map<string, Record<string, unknown>>();
  if (workerIds.length > 0) {
    const { data: ws } = await svc
      .from("workers")
      .select(
        "id, full_name, role, skills, country, languages, availability_status, available_from, hourly_rate_expectation, daily_rate_expectation, certificates",
      )
      .in("id", workerIds);
    for (const w of ws ?? []) workerRows.set(w.id as string, w as Record<string, unknown>);
  }
  const byAssignment = new Map<string, Array<Record<string, unknown>>>();
  for (const e of ents ?? []) {
    if (e.entity_type !== "worker") continue;
    const k = e.assignment_id as string;
    const w = workerRows.get(e.entity_id as string);
    if (!w) continue;
    if (!byAssignment.has(k)) byAssignment.set(k, []);
    byAssignment.get(k)!.push(w);
  }

  // Hand over the conversation and stamp the human messages delivered, so the
  // bot is told exactly once what it still owes an answer to.
  const threads = await takeThreadForBot(ids, orgId);

  const projectIds = Array.from(
    new Set(rows.map((r) => r.project_id).filter(Boolean) as string[]),
  );
  const projectNames = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: ps } = await svc
      .from("discovered_projects")
      .select("id, project_name")
      .in("id", projectIds);
    for (const p of ps ?? []) projectNames.set(p.id as string, p.project_name as string);
  }

  return rows.map((r) => {
    const t = threads.get(r.id as string);
    const pid = (r.project_id as string) ?? null;
    return {
      id: r.id as string,
      title: r.title as string,
      objective: r.objective as string,
      priority: r.priority as string,
      dueAt: (r.due_at as string) ?? null,
      constraints: (r.constraints as Record<string, unknown>) ?? {},
      workers: byAssignment.get(r.id as string) ?? [],
      project: pid ? { id: pid, name: projectNames.get(pid) ?? "unknown project" } : null,
      thread: t?.thread ?? [],
      newQuestions: t?.newQuestions ?? [],
    };
  });
}

/** A bot finishing ITS OWN assignment. Identity comes from the badge. */
export async function completeAssignment(params: {
  assignmentId: string;
  orgId: string;
  agentInstanceId: string;
  resultSummary: string;
  failed?: boolean;
}): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;
  const { data, error } = await svc
    .from("agent_assignments")
    .update({
      status: params.failed ? "failed" : "completed",
      result_summary: params.resultSummary.slice(0, 8000),
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.assignmentId)
    .eq("org_id", params.orgId)
    .eq("agent_instance_id", params.agentInstanceId)
    .in("status", ["queued", "active"])
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

/** Minimal worker list for the assignment form's context picker. */
export async function listWorkersLite(orgId: string): Promise<WorkerLite[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data } = await svc
    .from("workers")
    .select("id, full_name, role, availability_status")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .order("full_name");
  return (data ?? []).map((w) => ({
    id: w.id as string,
    name: w.full_name as string,
    role: (w.role as string) ?? null,
    availability: (w.availability_status as string) ?? null,
  }));
}
