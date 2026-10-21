import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  ACTIVITY_QUERY_LIMIT,
  badgeLabel,
  shapeActivity,
  type ActivityAssignmentRow,
  type ActivityBody,
  type ActivityBotIdentity,
  type ActivityFindingRow,
  type ActivityMissionRow,
  type ActivityReportRow,
  type ActivityWhatsAppRow,
  type ActivityWindow,
} from "@/lib/data/agent-activity";

// ---------------------------------------------------------------------------
// Read the previous day's work for one organisation.
//
// Selects only. A badge that calls the route cannot file, send, or update
// through this path. Every query is pinned to that badge's org id.
// ---------------------------------------------------------------------------

const FETCH = ACTIVITY_QUERY_LIMIT + 1;

const WHATSAPP_SENT = ["sent", "delivered", "read"] as const;
const WHATSAPP_OBSERVED = ["delivered", "read"] as const;
const FINISHED = ["completed", "failed"] as const;

interface Query {
  eq(column: string, value: string): Query;
  in(column: string, values: readonly string[]): Query;
  gte(column: string, value: string): Query;
  lt(column: string, value: string): Query;
  is(column: string, value: null): Query;
  order(column: string, options: { ascending: boolean }): Query;
  limit(count: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
}

interface LooseClient {
  from(table: string): { select(columns: string): Query };
}

type ReadResult =
  | { ok: true; body: ActivityBody }
  | { ok: false; status: number; error: string };

function asRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function keepOrg(rows: Record<string, unknown>[], orgId: string): Record<string, unknown>[] {
  return rows.filter((row) => row.org_id === orgId);
}

async function readQuery(
  query: Query,
  orgId: string,
  limit = FETCH,
  cap = true,
): Promise<{ rows: Record<string, unknown>[]; truncated: boolean; error: string | null }> {
  const { data, error } = await query.limit(limit);
  if (error) return { rows: [], truncated: false, error: error.message };
  const rows = keepOrg(asRows(data), orgId);
  if (cap && rows.length > ACTIVITY_QUERY_LIMIT) {
    return { rows: rows.slice(0, ACTIVITY_QUERY_LIMIT), truncated: true, error: null };
  }
  return { rows, truncated: false, error: null };
}

const ID_CHUNK = 100;
const ID_LOOKUP_LIMIT = 1000;

async function readByIds(
  svc: LooseClient,
  table: string,
  columns: string,
  orgId: string,
  idColumn: string,
  ids: string[],
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const chunk = ids.slice(index, index + ID_CHUNK);
    const result = await readQuery(
      svc.from(table).select(columns).eq("org_id", orgId).in(idColumn, chunk),
      orgId,
      ID_LOOKUP_LIMIT,
      false,
    );
    if (result.error) return { rows: [], error: result.error };
    rows.push(...result.rows);
  }
  return { rows, error: null };
}

function ranged(
  svc: LooseClient,
  table: string,
  columns: string,
  orgId: string,
  timeColumn: string,
  window: ActivityWindow,
  extra?: (query: Query) => Query,
): Promise<{ rows: Record<string, unknown>[]; truncated: boolean; error: string | null }> {
  let query = svc
    .from(table)
    .select(columns)
    .eq("org_id", orgId)
    .gte(timeColumn, window.since)
    .lt(timeColumn, window.until);
  if (extra) query = extra(query);
  return readQuery(query.order(timeColumn, { ascending: false }), orgId);
}

function payloadObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function loadAgentActivity(orgId: string, window: ActivityWindow): Promise<ReadResult> {
  const svc = createServiceSupabaseClient() as unknown as LooseClient | null;
  if (!svc) return { ok: false, status: 503, error: "Database unavailable." };

  const assignmentColumns =
    "id, org_id, agent_instance_id, title, status, result_summary, mission_id, created_at, completed_at";
  const missionColumns = "id, org_id, title, objective, kind, lead_agent_instance_id, created_at";
  const whatsappColumns =
    "id, org_id, agent_instance_id, direction, to_number, body, status, sent_at, wa_timestamp, updated_at";
  const reportColumns =
    "id, org_id, agent_instance_id, employee_name, kind, person_name, company_name, note, created_at";
  const findingColumns =
    "id, org_id, agent_instance_id, finding_type, status, evidence_text, payload, created_at";

  const [
    createdAssignments,
    finishedAssignments,
    createdMissions,
    sentMessages,
    unstampedMessages,
    observedMessages,
    reports,
    findings,
  ] = await Promise.all([
    ranged(svc, "agent_assignments", assignmentColumns, orgId, "created_at", window),
    ranged(svc, "agent_assignments", assignmentColumns, orgId, "completed_at", window, (query) =>
      query.in("status", FINISHED),
    ),
    ranged(svc, "missions", missionColumns, orgId, "created_at", window),
    ranged(svc, "whatsapp_messages", whatsappColumns, orgId, "sent_at", window, (query) =>
      query.eq("direction", "outbound").in("status", WHATSAPP_SENT),
    ),
    ranged(svc, "whatsapp_messages", whatsappColumns, orgId, "wa_timestamp", window, (query) =>
      query.eq("direction", "outbound").in("status", WHATSAPP_SENT).is("sent_at", null),
    ),
    ranged(svc, "whatsapp_messages", whatsappColumns, orgId, "updated_at", window, (query) =>
      query.eq("direction", "outbound").in("status", WHATSAPP_OBSERVED),
    ),
    ranged(svc, "employee_reports", reportColumns, orgId, "created_at", window),
    ranged(svc, "agent_findings", findingColumns, orgId, "created_at", window),
  ]);

  const failed = [
    createdAssignments,
    finishedAssignments,
    createdMissions,
    sentMessages,
    unstampedMessages,
    observedMessages,
    reports,
    findings,
  ].find((result) => result.error);
  if (failed?.error) {
    console.error("agent activity read failed:", failed.error);
    return { ok: false, status: 500, error: "Could not read activity." };
  }

  const assignmentById = new Map<string, Record<string, unknown>>();
  for (const row of [...createdAssignments.rows, ...finishedAssignments.rows]) {
    assignmentById.set(String(row.id), row);
  }
  const messageById = new Map<string, Record<string, unknown>>();
  for (const row of [...sentMessages.rows, ...unstampedMessages.rows, ...observedMessages.rows]) {
    messageById.set(String(row.id), row);
  }

  const missionIds = [
    ...new Set(
      [...assignmentById.values()]
        .map((row) => text(row.mission_id))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  let missionTitleRows: Record<string, unknown>[] = [];
  if (missionIds.length) {
    const titles = await readByIds(svc, "missions", "id, org_id, title", orgId, "id", missionIds);
    if (titles.error) {
      console.error("agent activity read failed:", titles.error);
      return { ok: false, status: 500, error: "Could not read activity." };
    }
    missionTitleRows = titles.rows;
  }

  const titleById = new Map<string, string>();
  for (const row of [...createdMissions.rows, ...missionTitleRows]) {
    const title = text(row.title);
    if (title) titleById.set(String(row.id), title);
  }

  const assignments: ActivityAssignmentRow[] = [...assignmentById.values()].map((row) => {
    const missionId = text(row.mission_id);
    return {
      id: String(row.id),
      agentInstanceId: text(row.agent_instance_id),
      title: text(row.title) ?? "",
      status: text(row.status) ?? "",
      resultSummary: text(row.result_summary),
      missionId,
      missionTitle: missionId ? titleById.get(missionId) ?? null : null,
      createdAt: text(row.created_at) ?? "",
      completedAt: text(row.completed_at),
    };
  });

  const missions: ActivityMissionRow[] = createdMissions.rows.map((row) => ({
    id: String(row.id),
    leadAgentInstanceId: text(row.lead_agent_instance_id),
    title: text(row.title) ?? "",
    kind: text(row.kind) ?? "",
    objective: text(row.objective) ?? "",
    createdAt: text(row.created_at) ?? "",
  }));

  const whatsapp: ActivityWhatsAppRow[] = [...messageById.values()].map((row) => ({
    id: String(row.id),
    agentInstanceId: text(row.agent_instance_id),
    toNumber: text(row.to_number) ?? "",
    status: text(row.status) ?? "",
    body: text(row.body),
    direction: text(row.direction) ?? "",
    sentAt: text(row.sent_at),
    waTimestamp: text(row.wa_timestamp),
    updatedAt: text(row.updated_at),
  }));

  const reportRows: ActivityReportRow[] = reports.rows.map((row) => ({
    id: String(row.id),
    agentInstanceId: text(row.agent_instance_id),
    employeeName: text(row.employee_name),
    kind: text(row.kind) ?? "",
    personName: text(row.person_name),
    companyName: text(row.company_name),
    note: text(row.note),
    createdAt: text(row.created_at) ?? "",
  }));

  const findingRows: ActivityFindingRow[] = findings.rows.map((row) => ({
    id: String(row.id),
    agentInstanceId: text(row.agent_instance_id),
    findingType: text(row.finding_type) ?? "",
    status: text(row.status) ?? "",
    evidenceText: text(row.evidence_text),
    payload: payloadObject(row.payload),
    createdAt: text(row.created_at) ?? "",
  }));

  const agentIds = [
    ...new Set(
      [
        ...assignments.map((row) => row.agentInstanceId),
        ...missions.map((row) => row.leadAgentInstanceId),
        ...whatsapp.map((row) => row.agentInstanceId),
        ...reportRows.map((row) => row.agentInstanceId),
        ...findingRows.map((row) => row.agentInstanceId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];

  const bots: ActivityBotIdentity[] = [];
  if (agentIds.length) {
    const [instances, credentials] = await Promise.all([
      readByIds(svc, "agent_instances", "id, org_id, role_key, display_name", orgId, "id", agentIds),
      readByIds(
        svc,
        "machine_credentials",
        "org_id, name, status, agent_instance_id",
        orgId,
        "agent_instance_id",
        agentIds,
      ),
    ]);
    if (instances.error || credentials.error) {
      console.error("agent activity read failed:", instances.error ?? credentials.error);
      return { ok: false, status: 500, error: "Could not read activity." };
    }
    const credentialsByAgent = new Map<string, Array<{ name: string; status: string }>>();
    for (const row of credentials.rows) {
      const agentId = text(row.agent_instance_id);
      const name = text(row.name);
      if (!agentId || !name) continue;
      const list = credentialsByAgent.get(agentId) ?? [];
      list.push({ name, status: text(row.status) ?? "" });
      credentialsByAgent.set(agentId, list);
    }
    for (const row of instances.rows) {
      const id = String(row.id);
      bots.push({
        id,
        name: text(row.display_name) ?? "Unknown employee",
        role: text(row.role_key),
        badge: badgeLabel(credentialsByAgent.get(id) ?? []),
      });
    }
  }

  const truncated = [
    createdAssignments,
    finishedAssignments,
    createdMissions,
    sentMessages,
    unstampedMessages,
    observedMessages,
    reports,
    findings,
  ].some((result) => result.truncated);

  return {
    ok: true,
    body: shapeActivity({
      window,
      assignments,
      missions,
      whatsapp,
      reports: reportRows,
      findings: findingRows,
      bots,
      truncated,
    }),
  };
}
