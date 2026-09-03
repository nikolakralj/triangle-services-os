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
  expectedOutput?: string | null;
  idempotencyKey?: string | null;
  workerIds?: string[];
  entityRefs?: Array<{
    type: "worker" | "job_lead" | "project" | "project_package" | "company" | "contact" | "crew" | "other";
    id: string;
    relation?: "input" | "target" | "context" | "output";
  }>;
  projectId?: string | null;
  userId: string | null;
}): Promise<{ id: string } | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  // Approval endpoints may be retried after a network interruption. Return
  // the already-created continuation instead of producing duplicate agent
  // work for the same accepted finding.
  if (params.idempotencyKey) {
    const { data: existing } = await svc
      .from("agent_assignments")
      .select("id")
      .eq("org_id", params.orgId)
      .eq("idempotency_key", params.idempotencyKey)
      .maybeSingle();
    if (existing) return { id: existing.id as string };
  }

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
      expected_output: params.expectedOutput ?? null,
      idempotency_key: params.idempotencyKey ?? null,
      project_id: params.projectId ?? null,
      created_by: params.userId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return null;

  const entityRefs = [
    ...(params.workerIds ?? []).map((id) => ({
      type: "worker" as const,
      id,
      relation: "input" as const,
    })),
    ...(params.entityRefs ?? []),
  ];
  if (entityRefs.length > 0) {
    await svc.from("agent_assignment_entities").insert(
      entityRefs.map((entity) => ({
        org_id: params.orgId,
        assignment_id: data.id as string,
        entity_type: entity.type,
        entity_id: entity.id,
        relation: entity.relation ?? "context",
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
    .select("assignment_id, entity_type, entity_id, relation")
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
  expectedOutput: string | null;
  workers: Array<Record<string, unknown>>;
  /** Non-worker records attached to this case, hydrated for useful context. */
  entities: Array<{
    type: string;
    relation: string;
    record: Record<string, unknown>;
  }>;
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
    .select(
      "id, title, objective, priority, due_at, constraints, expected_output, status, project_id",
    )
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
    .select("assignment_id, entity_type, entity_id, relation")
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

  // Company case assignments must carry the company record into the agent's
  // inbox. A bare UUID forces the human to copy context between pages, which
  // is the exact workflow this assignment model is meant to remove.
  const companyIds = Array.from(
    new Set(
      (ents ?? [])
        .filter((e) => e.entity_type === "company")
        .map((e) => e.entity_id as string),
    ),
  );
  const companies = new Map<string, Record<string, unknown>>();
  if (companyIds.length > 0) {
    const { data: rows } = await svc
      .from("companies")
      .select(
        "id,name,legal_name,company_type,company_status,country,region,city,website,website_domain,linkedin_url,source_url,sectors,priority,lead_score,lead_score_reason,description,pain_points,notes,research_status,do_not_contact,next_action_at",
      )
      .eq("organization_id", orgId)
      .in("id", companyIds);
    for (const company of rows ?? []) {
      companies.set(company.id as string, company as Record<string, unknown>);
    }
  }
  // Same reason as companies: a reachability job whose entity is a bare UUID
  // tells the employee nothing about who they are supposed to find. They need
  // the name, the title, the company, and why this person matters.
  const contactIds = Array.from(
    new Set(
      (ents ?? [])
        .filter((e) => e.entity_type === "contact")
        .map((e) => e.entity_id as string),
    ),
  );
  const contacts = new Map<string, Record<string, unknown>>();
  if (contactIds.length > 0) {
    const { data: rows } = await svc
      .from("buyer_contacts")
      .select(
        // No phone column on this table by design — a found number is written
        // into notes as "Phone: …", which is what the panel reads.
        "id,full_name,job_title,company_name,buyer_role,priority,email,linkedin_url,notes",
      )
      .eq("organization_id", orgId)
      .in("id", contactIds);
    for (const contact of rows ?? []) {
      contacts.set(contact.id as string, contact as Record<string, unknown>);
    }
  }

  const entitiesByAssignment = new Map<
    string,
    Array<{ type: string; relation: string; record: Record<string, unknown> }>
  >();
  for (const entity of ents ?? []) {
    if (entity.entity_type === "worker") continue;
    const record =
      entity.entity_type === "company"
        ? companies.get(entity.entity_id as string)
        : entity.entity_type === "contact"
          ? contacts.get(entity.entity_id as string)
          : { id: entity.entity_id as string };
    if (!record) continue;
    const assignmentId = entity.assignment_id as string;
    if (!entitiesByAssignment.has(assignmentId)) {
      entitiesByAssignment.set(assignmentId, []);
    }
    entitiesByAssignment.get(assignmentId)!.push({
      type: entity.entity_type as string,
      relation: (entity.relation as string) ?? "context",
      record,
    });
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
      expectedOutput: (r.expected_output as string) ?? null,
      workers: byAssignment.get(r.id as string) ?? [],
      entities: entitiesByAssignment.get(r.id as string) ?? [],
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
      // `result_summary` is an unrestricted Postgres text column. Never cut a
      // structured hand-in mid-JSON; presentation layers decide how much of
      // the worker audit to show.
      result_summary: params.resultSummary,
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

/**
 * An idempotency key that allows a genuine re-run.
 *
 * `createAssignment` treats a repeated key as a retry and hands back the
 * existing row — which is right for a network retry and wrong for "Scout
 * reported, filed nothing, do it again". A completed job would silently
 * return itself and the CEO would watch nothing happen.
 *
 * So: refuse while the work is still open, and otherwise number the attempt.
 */
export async function nextAttemptKey(
  orgId: string,
  baseKey: string,
): Promise<{ key: string } | { openAssignmentId: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { key: baseKey };

  const { data } = await svc
    .from("agent_assignments")
    .select("id, status, idempotency_key")
    .eq("org_id", orgId)
    .or(`idempotency_key.eq.${baseKey},idempotency_key.like.${baseKey}#%`);

  const rows = data ?? [];
  const open = rows.find(
    (r) => r.status === "queued" || r.status === "active",
  );
  if (open) return { openAssignmentId: open.id as string };
  if (rows.length === 0) return { key: baseKey };
  return { key: `${baseKey}#${rows.length + 1}` };
}
