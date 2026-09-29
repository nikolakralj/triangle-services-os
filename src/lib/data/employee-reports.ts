import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { wakeEmployee } from "@/lib/data/bot-runtime";
import {
  availabilityReading,
  caseReplyAttachment,
  planEmployeeReport,
  accessNeededLines,
  normalizeMessageId,
  type AccessNeededLine,
  type PlannedReport,
  type ReportKind,
  type ReportView,
} from "@/lib/data/employee-report-policy";
import { requirementIdentity } from "@/lib/job-intake/requirement-case";

// ---------------------------------------------------------------------------
// Filing a report, and reading it back onto the person, the company and the
// case. The service client writes. A missing table (migration 053 not applied)
// is a refusal the employee can read, not a crash of mail ingest.
// ---------------------------------------------------------------------------

type Svc = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;

const COLUMNS =
  "id, kind, source, employee_name, person_name, company_name, mission_id, role_title, evidence_url, note, unavailable_until, access_what, occurred_on, follow_up_on, created_at, worker_id, company_id";

function tableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table/i.test(message) ||
    /relation ["']?public\.employee_reports["']? does not exist/i.test(message)
  );
}

function rowToReport(row: Record<string, unknown>): ReportView {
  return {
    id: String(row.id),
    kind: row.kind as ReportKind,
    source: row.source === "mailbox" ? "mailbox" : "employee",
    employeeName: String(row.employee_name ?? ""),
    personId: (row.worker_id as string | null) ?? null,
    personName: (row.person_name as string | null) ?? null,
    companyId: (row.company_id as string | null) ?? null,
    companyName: (row.company_name as string | null) ?? null,
    missionId: (row.mission_id as string | null) ?? null,
    roleTitle: (row.role_title as string | null) ?? null,
    evidenceUrl: (row.evidence_url as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    unavailableUntil: (row.unavailable_until as string | null) ?? null,
    accessWhat: (row.access_what as string | null) ?? null,
    occurredOn: String(row.occurred_on ?? "").slice(0, 10),
    followUpOn: row.follow_up_on ? String(row.follow_up_on).slice(0, 10) : null,
    createdAt: String(row.created_at ?? ""),
  };
}

export interface FiledReportResult {
  ok: true;
  duplicate: boolean;
  report: ReportView;
  sentence: string;
  followUpOn: string | null;
  warnings: string[];
}

export async function fileEmployeeReport(params: {
  orgId: string;
  agentInstanceId: string;
  body: unknown;
}): Promise<FiledReportResult | { ok: false; status: number; error: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, status: 503, error: "Database unavailable." };

  const { data: employee } = await svc
    .from("agent_instances")
    .select("display_name")
    .eq("id", params.agentInstanceId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  if (!employee) {
    return { ok: false, status: 403, error: "This badge is not an employee of this organisation." };
  }

  const planned = planEmployeeReport({
    employeeName: String(employee.display_name ?? "Employee"),
    agentInstanceId: params.agentInstanceId,
    body: params.body,
  });
  if (!planned.ok) return { ok: false, status: 400, error: planned.error };

  const warnings: string[] = [];
  const resolved = await resolveTargets(svc, params.orgId, planned.planned, warnings);
  if (!resolved.ok) return resolved;

  const keyed = planEmployeeReport({
    employeeName: planned.planned.employeeName,
    agentInstanceId: params.agentInstanceId,
    body: {
      ...(params.body as Record<string, unknown>),
      personId: resolved.workerId ?? undefined,
      companyId: resolved.companyId ?? undefined,
      caseId: resolved.missionId ?? undefined,
      occurredOn: planned.planned.occurredOn,
    },
  });
  const idempotencyKey = keyed.ok ? keyed.planned.idempotencyKey : planned.planned.idempotencyKey;

  const insert = {
    org_id: params.orgId,
    agent_instance_id: params.agentInstanceId,
    employee_name: planned.planned.employeeName,
    source: "employee",
    kind: planned.planned.kind,
    worker_id: resolved.workerId,
    person_name: resolved.personName,
    company_id: resolved.companyId,
    company_name: resolved.companyName,
    mission_id: resolved.missionId,
    role_title: planned.planned.roleTitle,
    evidence_url: planned.planned.evidenceUrl,
    note: planned.planned.note,
    unavailable_until: planned.planned.unavailableUntil,
    access_what: planned.planned.accessWhat,
    occurred_on: planned.planned.occurredOn,
    follow_up_on: planned.planned.followUpOn,
    idempotency_key: idempotencyKey,
  };

  const { data, error } = await svc.from("employee_reports").insert(insert).select(COLUMNS).maybeSingle();
  if (error?.code === "23505") {
    const existing = await svc
      .from("employee_reports")
      .select(COLUMNS)
      .eq("org_id", params.orgId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing.data) {
      const report = rowToReport(existing.data as Record<string, unknown>);
      return {
        ok: true,
        duplicate: true,
        report,
        sentence: planned.planned.sentence,
        followUpOn: report.followUpOn,
        warnings,
      };
    }
  }
  if (tableMissing(error)) {
    return {
      ok: false,
      status: 503,
      error: "Triangle cannot file this yet. Migration 053 has not been applied.",
    };
  }
  if (error || !data) {
    return { ok: false, status: 500, error: "Could not file that report." };
  }

  const report = rowToReport(data as Record<string, unknown>);
  return {
    ok: true,
    duplicate: false,
    report,
    sentence: planned.planned.sentence,
    followUpOn: report.followUpOn,
    warnings,
  };
}

async function resolveTargets(
  svc: Svc,
  orgId: string,
  planned: PlannedReport,
  warnings: string[],
): Promise<
  | {
      ok: true;
      workerId: string | null;
      personName: string | null;
      companyId: string | null;
      companyName: string | null;
      missionId: string | null;
    }
  | { ok: false; status: number; error: string }
> {
  let workerId = planned.personId;
  let personName = planned.personName;
  if (workerId) {
    const { data } = await svc
      .from("workers")
      .select("id, full_name")
      .eq("id", workerId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!data) return { ok: false, status: 400, error: "That person is not in this organisation." };
    personName = String(data.full_name);
  } else if (personName) {
    const { data } = await svc
      .from("workers")
      .select("id, full_name")
      .eq("organization_id", orgId)
      .ilike("full_name", personName)
      .limit(2);
    const rows = data ?? [];
    if (rows.length === 1) {
      workerId = rows[0].id as string;
      personName = String(rows[0].full_name);
    } else if (rows.length > 1) {
      warnings.push("More than one person has that name. Pass personId from lookup.");
    }
  }

  let companyId = planned.companyId;
  let companyName = planned.companyName;
  if (companyId) {
    const { data } = await svc
      .from("companies")
      .select("id, name")
      .eq("id", companyId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!data) return { ok: false, status: 400, error: "That company is not in this organisation." };
    companyName = String(data.name);
  } else if (companyName) {
    const { data } = await svc
      .from("companies")
      .select("id, name")
      .eq("organization_id", orgId)
      .ilike("name", companyName)
      .limit(2);
    const rows = data ?? [];
    if (rows.length === 1) {
      companyId = rows[0].id as string;
      companyName = String(rows[0].name);
    } else if (rows.length > 1) {
      warnings.push("More than one company has that name. Pass companyId.");
    }
  }

  const missionId = planned.caseId;
  if (missionId) {
    const { data } = await svc
      .from("missions")
      .select("id")
      .eq("id", missionId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!data) return { ok: false, status: 400, error: "That case is not in this organisation." };
  }

  return { ok: true, workerId, personName, companyId, companyName, missionId };
}

async function listReports(
  orgId: string,
  column: "worker_id" | "person_name" | "company_id" | "company_name" | "mission_id" | null,
  value?: string,
): Promise<ReportView[] | "missing"> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  let query = svc.from("employee_reports").select(COLUMNS).eq("org_id", orgId);
  if (column === "person_name" || column === "company_name") {
    query = query.ilike(column, value ?? "");
  } else if (column) {
    query = query.eq(column, value ?? "");
  }
  const { data, error } = await query
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(80);
  if (tableMissing(error)) return "missing";
  if (error) return [];
  return (data ?? []).map((row) => rowToReport(row as Record<string, unknown>));
}

function mergeReports(groups: ReportView[][]): ReportView[] {
  const seen = new Set<string>();
  const merged: ReportView[] = [];
  for (const group of groups) {
    for (const report of group) {
      if (seen.has(report.id)) continue;
      seen.add(report.id);
      merged.push(report);
    }
  }
  return merged.sort((a, b) => (a.occurredOn === b.occurredOn ? (a.createdAt < b.createdAt ? 1 : -1) : a.occurredOn < b.occurredOn ? 1 : -1));
}

export async function listReportsForPerson(
  orgId: string,
  workerId: string,
  fullName: string,
): Promise<ReportView[]> {
  const [byId, byName] = await Promise.all([
    listReports(orgId, "worker_id", workerId),
    fullName.trim()
      ? listReports(orgId, "person_name", fullName.trim())
      : Promise.resolve([] as ReportView[]),
  ]);
  if (byId === "missing" || byName === "missing") return [];
  return mergeReports([byId, byName]);
}

export async function listReportsForCompany(
  orgId: string,
  companyId: string,
  name: string,
): Promise<ReportView[]> {
  const [byId, byName] = await Promise.all([
    listReports(orgId, "company_id", companyId),
    name.trim()
      ? listReports(orgId, "company_name", name.trim())
      : Promise.resolve([] as ReportView[]),
  ]);
  if (byId === "missing" || byName === "missing") return [];
  return mergeReports([byId, byName]);
}

export async function listReportsForCase(orgId: string, missionId: string): Promise<ReportView[]> {
  const rows = await listReports(orgId, "mission_id", missionId);
  return rows === "missing" ? [] : rows;
}

export async function listOpenAccessNeeds(orgId: string): Promise<AccessNeededLine[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const [access, recent] = await Promise.all([
    svc
      .from("employee_reports")
      .select(COLUMNS)
      .eq("org_id", orgId)
      .eq("kind", "access_needed")
      .order("occurred_on", { ascending: false })
      .limit(40),
    svc
      .from("employee_reports")
      .select(COLUMNS)
      .eq("org_id", orgId)
      .neq("kind", "access_needed")
      .order("occurred_on", { ascending: false })
      .limit(80),
  ]);
  if (tableMissing(access.error) || tableMissing(recent.error)) return [];
  const rows = [...(access.data ?? []), ...(recent.data ?? [])].map((row) =>
    rowToReport(row as Record<string, unknown>),
  );
  return accessNeededLines(rows);
}

/** Phrases that must not fall back to "Unknown" on the talent cards. */
export async function unavailablePhrases(orgId: string): Promise<Record<string, string>> {
  const svc = createServiceSupabaseClient();
  if (!svc) return {};
  const { data, error } = await svc
    .from("employee_reports")
    .select("worker_id, person_name, kind, occurred_on")
    .eq("org_id", orgId)
    .eq("kind", "not_available")
    .order("occurred_on", { ascending: false })
    .limit(400);
  if (tableMissing(error) || error || !data) return {};

  const byWorker = new Map<string, { occurredOn: string }[]>();
  const nameToIds = new Map<string, string[]>();
  const { data: workers } = await svc
    .from("workers")
    .select("id, full_name, availability_status")
    .eq("organization_id", orgId);
  for (const worker of workers ?? []) {
    const key = String(worker.full_name ?? "").trim().toLowerCase();
    const list = nameToIds.get(key) ?? [];
    list.push(worker.id as string);
    nameToIds.set(key, list);
  }

  for (const row of data) {
    const occurredOn = String(row.occurred_on ?? "").slice(0, 10);
    const ids = new Set<string>();
    if (row.worker_id) ids.add(row.worker_id as string);
    const named = nameToIds.get(String(row.person_name ?? "").trim().toLowerCase()) ?? [];
    for (const id of named) ids.add(id);
    for (const id of ids) {
      const list = byWorker.get(id) ?? [];
      list.push({ occurredOn });
      byWorker.set(id, list);
    }
  }

  const phrases: Record<string, string> = {};
  for (const worker of workers ?? []) {
    const reports = (byWorker.get(worker.id as string) ?? []).map((item) => ({
      kind: "not_available",
      occurredOn: item.occurredOn,
    }));
    const reading = availabilityReading({
      status: (worker.availability_status as string | null) ?? null,
      reports,
    });
    if (reading.tone === "unavailable") phrases[worker.id as string] = reading.phrase;
  }
  return phrases;
}

export interface MailboxReplyInput {
  orgId: string;
  inboundEmailId: string;
  messageId: string;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  subject?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  sentAt?: string | null;
}

/**
 * After a message is stored, attach it to the recruiting case that already
 * owns the thread, and wake that case's owner once. The message that opened
 * the case is not a reply. A missing reports table does not fail the read.
 */
export async function attachMailboxReply(input: MailboxReplyInput): Promise<{
  attached: boolean;
  woke: boolean;
  reason: string;
}> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { attached: false, woke: false, reason: "no database" };

  const messageId = normalizeMessageId(input.messageId);
  if (!messageId) return { attached: false, woke: false, reason: "no message id" };
  const identity = requirementIdentity({ messageId, threadId: input.threadId });

  const found = await findCaseForReply(svc, input.orgId, identity.threadKey, input.inReplyTo);
  if (found === "missing") return { attached: false, woke: false, reason: "table_missing" };
  if (!found) return { attached: false, woke: false, reason: "no_case" };

  const decision = caseReplyAttachment({
    messageId,
    threadId: input.threadId,
    inReplyTo: input.inReplyTo,
    references: input.references,
    caseMessageKey: found.messageKey,
    caseThreadKey: found.threadKey,
  });
  if (!decision.attach) return { attached: false, woke: false, reason: decision.reason };

  const occurredOn = input.sentAt?.slice(0, 10) && /^\d{4}-\d{2}-\d{2}$/.test(input.sentAt.slice(0, 10))
    ? input.sentAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const who = (input.senderName || input.senderEmail || "someone").replace(/\s+/g, " ").trim();
  const idempotencyKey = `mailbox|${messageId}`;
  const { data, error } = await svc
    .from("employee_reports")
    .insert({
      org_id: input.orgId,
      agent_instance_id: null,
      employee_name: "Mailbox",
      source: "mailbox",
      kind: "reply_received",
      mission_id: found.missionId,
      note: input.subject ? `Reply from ${who}: ${input.subject}`.slice(0, 500) : `Reply from ${who}.`,
      occurred_on: occurredOn,
      follow_up_on: occurredOn,
      inbound_email_id: input.inboundEmailId,
      thread_key: found.threadKey,
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .maybeSingle();

  if (tableMissing(error)) return { attached: false, woke: false, reason: "table_missing" };
  if (error?.code === "23505") return { attached: true, woke: false, reason: "duplicate" };
  if (error || !data) return { attached: false, woke: false, reason: "failed" };

  const woke = await wakeCaseOwner(svc, {
    orgId: input.orgId,
    missionId: found.missionId,
    inboundEmailId: input.inboundEmailId,
    subject: input.subject ?? null,
    who,
  });
  return { attached: true, woke, reason: decision.reason };
}

async function findCaseForReply(
  svc: Svc,
  orgId: string,
  threadKey: string | null,
  inReplyTo: string | null | undefined,
): Promise<{ missionId: string; messageKey: string | null; threadKey: string | null } | null | "missing"> {
  const select = "mission_id, message_key, thread_key";
  if (threadKey) {
    const { data, error } = await svc
      .from("requirement_roles")
      .select(select)
      .eq("org_id", orgId)
      .eq("thread_key", threadKey)
      .limit(1);
    if (tableMissingRoles(error)) return "missing";
    const row = data?.[0];
    if (row) {
      return {
        missionId: row.mission_id as string,
        messageKey: (row.message_key as string | null) ?? null,
        threadKey: (row.thread_key as string | null) ?? null,
      };
    }
  }
  const opening = normalizeMessageId(inReplyTo);
  if (!opening) return null;
  const { data, error } = await svc
    .from("requirement_roles")
    .select(select)
    .eq("org_id", orgId)
    .eq("message_key", `message:${opening}`)
    .limit(1);
  if (tableMissingRoles(error)) return "missing";
  const row = data?.[0];
  if (!row) return null;
  return {
    missionId: row.mission_id as string,
    messageKey: (row.message_key as string | null) ?? null,
    threadKey: (row.thread_key as string | null) ?? null,
  };
}

function tableMissingRoles(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "42P01" || error.code === "PGRST205" || /requirement_roles/i.test(message);
}

async function wakeCaseOwner(
  svc: Svc,
  params: {
    orgId: string;
    missionId: string;
    inboundEmailId: string;
    subject: string | null;
    who: string;
  },
): Promise<boolean> {
  const { data: mission } = await svc
    .from("missions")
    .select("lead_agent_instance_id")
    .eq("id", params.missionId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  const ownerId = (mission?.lead_agent_instance_id as string | null) ?? null;
  if (!ownerId) return false;

  const { data: openStep } = await svc
    .from("agent_assignments")
    .select("id")
    .eq("org_id", params.orgId)
    .eq("mission_id", params.missionId)
    .eq("agent_instance_id", ownerId)
    .in("status", ["queued", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openStep?.id) {
    const wake = await wakeEmployee({
      orgId: params.orgId,
      agentInstanceId: ownerId,
      stepId: openStep.id as string,
      missionId: params.missionId,
      event: "client_reply",
    });
    return wake.status === "sent" || wake.status === "not_configured";
  }

  const idempotencyKey = `outbox:case_reply:${params.inboundEmailId}`;
  const { data: existing } = await svc
    .from("agent_assignments")
    .select("id")
    .eq("org_id", params.orgId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing?.id) return false;

  const { data: created, error } = await svc
    .from("agent_assignments")
    .insert({
      org_id: params.orgId,
      agent_instance_id: ownerId,
      mission_id: params.missionId,
      title: `Reply: ${params.who}`.slice(0, 200),
      objective: `A reply arrived on this case from ${params.who}. Subject: "${params.subject ?? ""}". It is filed on the case. Draft the next move. Do not send.`.slice(
        0,
        4000,
      ),
      expected_output: "Draft the next move on this case. Do not send.",
      status: "queued",
      priority: "high",
      idempotency_key: idempotencyKey,
      constraints: {
        case_type: "event_outbox",
        outbox_event: "client_reply",
        execution_mode: "bot",
      },
    })
    .select("id")
    .maybeSingle();
  if (error?.code === "23505" || !created) return false;

  const wake = await wakeEmployee({
    orgId: params.orgId,
    agentInstanceId: ownerId,
    stepId: created.id as string,
    missionId: params.missionId,
    event: "client_reply",
  });
  return wake.status === "sent" || wake.status === "not_configured";
}
