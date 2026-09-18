import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { countMessagesByAssignment } from "@/lib/data/assignment-threads";
import {
  withLabelFor,
  type InProgressWait,
} from "@/lib/data/today-handoff";

// Quiet In progress on Today: open Bob / Scout / Hanna waits that still
// belong on the same card, not in Workforce and not in Needs you. And the
// other end of the same work: what an employee finished recently.

function asId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function listInProgressWaits(
  orgId: string,
  limit = 24,
): Promise<InProgressWait[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const { data: rows } = await svc
    .from("agent_assignments")
    .select("id, agent_instance_id, title, status, constraints, created_at")
    .eq("org_id", orgId)
    .in("status", ["queued", "active"])
    .order("created_at", { ascending: false })
    .limit(80);

  const open = (rows ?? []).filter((row) => {
    const constraints = (row.constraints as Record<string, unknown> | null) ?? {};
    return String(constraints.case_type ?? "") !== "event_outbox";
  });
  if (open.length === 0) return [];

  const assignmentIds = open.map((row) => row.id as string);
  const agentIds = Array.from(
    new Set(open.map((row) => row.agent_instance_id as string)),
  );

  const [{ data: agents }, { data: entities }, threads] = await Promise.all([
    svc
      .from("agent_instances")
      .select("id, display_name, emoji, role_key")
      .eq("org_id", orgId)
      .in("id", agentIds),
    svc
      .from("agent_assignment_entities")
      .select("assignment_id, entity_id")
      .eq("org_id", orgId)
      .in("assignment_id", assignmentIds),
    countMessagesByAssignment(assignmentIds, orgId),
  ]);

  const faces = new Map(
    (agents ?? []).map((a) => [
      a.id as string,
      {
        name: (a.display_name as string) || "Employee",
        emoji: (a.emoji as string) || "🤖",
        roleKey: (a.role_key as string) || "",
      },
    ]),
  );
  const entityIds = new Map<string, string[]>();
  for (const row of entities ?? []) {
    const assignmentId = row.assignment_id as string;
    const entityId = row.entity_id as string;
    if (!entityIds.has(assignmentId)) entityIds.set(assignmentId, []);
    entityIds.get(assignmentId)!.push(entityId);
  }

  const waits: InProgressWait[] = [];
  for (const row of open) {
    const face = faces.get(row.agent_instance_id as string);
    if (!face) continue;
    const constraints = (row.constraints as Record<string, unknown> | null) ?? {};
    const thread = threads.get(row.id as string);
        waits.push({
      assignmentId: row.id as string,
      title: (row.title as string) || "Follow-through",
      agentName: face.name,
      agentEmoji: face.emoji,
      roleKey: face.roleKey,
      withLabel: withLabelFor(face.roleKey, face.name),
      status: row.status as "queued" | "active",
      leadId: asId(constraints.leadId),
      contactId: asId(constraints.contactId),
      personId: asId(constraints.personId),
      companyId: asId(constraints.companyId),
      missionId: asId(constraints.missionId),
      entityIds: entityIds.get(row.id as string) ?? [],
      messageCount: thread?.total ?? 0,
      awaitingAgent: thread?.awaitingAgent ?? 0,
      createdAt: (row.created_at as string) ?? "",
      lastAgentBody: thread?.lastAgentBody ?? null,
      caseType: asId(constraints.case_type),
    });
    if (waits.length >= limit) break;
  }
  return waits;
}

/** Work an employee finished recently that no mission holds. */
export interface DoneItem {
  assignmentId: string;
  title: string;
  agentName: string;
  agentEmoji: string;
  completedAt: string;
  messageCount: number;
  awaitingAgent: number;
  leadId: string | null;
  contactId: string | null;
  personId: string | null;
  lastAgentBody: string | null;
  resultSummary: string | null;
}

/** People on the books a human may attach as an anonymised profile. */
export interface AttachableWorker {
  workerId: string;
  name: string;
  role: string | null;
  status: string;
}

/**
 * "Done since you looked" for work outside missions.
 *
 * A mission knows when it was last seen; a missionless task (an Ask Bob, a
 * request) has no such marker, so this reads the last `hours` of finished work.
 * Event-outbox wake-ups are machinery, not results, and stay off the list.
 */
export async function listDoneSince(
  orgId: string,
  hours = 24,
  limit = 8,
): Promise<DoneItem[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data: rows } = await svc
    .from("agent_assignments")
    .select("id, agent_instance_id, title, constraints, completed_at, result_summary")
    .eq("org_id", orgId)
    .eq("status", "completed")
    .is("mission_id", null)
    .gte("completed_at", since)
    .order("completed_at", { ascending: false })
    .limit(40);

  const finished = (rows ?? []).filter((row) => {
    const constraints = (row.constraints as Record<string, unknown> | null) ?? {};
    return String(constraints.case_type ?? "") !== "event_outbox";
  });
  if (finished.length === 0) return [];

  const assignmentIds = finished.map((row) => row.id as string);
  const agentIds = Array.from(new Set(finished.map((row) => row.agent_instance_id as string)));
  const [{ data: agents }, threads] = await Promise.all([
    svc
      .from("agent_instances")
      .select("id, display_name, emoji")
      .eq("org_id", orgId)
      .in("id", agentIds),
    countMessagesByAssignment(assignmentIds, orgId),
  ]);
  const faces = new Map(
    (agents ?? []).map((a) => [
      a.id as string,
      { name: (a.display_name as string) || "Employee", emoji: (a.emoji as string) || "🤖" },
    ]),
  );

  const done: DoneItem[] = [];
  for (const row of finished) {
    const face = faces.get(row.agent_instance_id as string);
    if (!face) continue;
    const thread = threads.get(row.id as string);
    const constraints = (row.constraints as Record<string, unknown> | null) ?? {};
    done.push({
      assignmentId: row.id as string,
      title: (row.title as string) || "Finished work",
      agentName: face.name,
      agentEmoji: face.emoji,
      completedAt: (row.completed_at as string) ?? "",
      messageCount: thread?.total ?? 0,
      awaitingAgent: thread?.awaitingAgent ?? 0,
      leadId: asId(constraints.leadId),
      contactId: asId(constraints.contactId),
      personId: asId(constraints.personId),
      lastAgentBody: thread?.lastAgentBody ?? null,
      resultSummary: (row.result_summary as string | null) ?? null,
    });
    if (done.length >= limit) break;
  }
  return done;
}

/**
 * Active and candidate people a human may attach as an anonymised profile.
 * Candidates belong here: a CV on file is who Bob often names from the mail.
 */
export async function listAttachableWorkers(
  orgId: string,
  limit = 200,
): Promise<AttachableWorker[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data } = await svc
    .from("workers")
    .select("id, full_name, role, status")
    .eq("organization_id", orgId)
    .in("status", ["active", "candidate"])
    .order("full_name", { ascending: true })
    .limit(limit);
  return (data ?? []).map((w) => ({
    workerId: w.id as string,
    name: (w.full_name as string) || "Unnamed",
    role: (w.role as string | null) ?? null,
    status: (w.status as string) || "candidate",
  }));
}
