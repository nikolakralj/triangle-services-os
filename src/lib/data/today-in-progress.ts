import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { countMessagesByAssignment } from "@/lib/data/assignment-threads";
import {
  withLabelFor,
  type InProgressWait,
} from "@/lib/data/today-handoff";

// Quiet In progress on Today: open Bob / Scout / Hanna waits that still
// belong on the same card, not in Workforce and not in Needs you.

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
    });
    if (waits.length >= limit) break;
  }
  return waits;
}
