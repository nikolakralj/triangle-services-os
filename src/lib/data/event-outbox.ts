import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { wakeEmployee, WakeEvent, WakeResult } from "./bot-runtime";
import { listFollowUpsDue } from "./follow-ups";
import { CAPACITY_SHELF_LIFE_DAYS } from "./supply-partners";

// ---------------------------------------------------------------------------
// Minimal Event Outbox
//
// Wakes the owning employee when significant business events occur:
//   - client_reply: client or recruiter replied on outreach or inbound lead
//   - follow_up_due: scheduled follow-up date arrived without response
//   - availability_stale: worker or partner capacity expired (14-day shelf life)
//
// The outbox guarantees:
// 1. Idempotency: identical events within a window do not duplicate assignments
// 2. Canonical record: Triangle database stores work in agent_assignments
// 3. Honesty: webhook delivery status is recorded; missed wakes are collected
//    at the bot's scheduled inbox check.
// ---------------------------------------------------------------------------

export type OutboxEventKind =
  | "client_reply"
  | "follow_up_due"
  | "availability_stale";

export interface OutboxDispatchResult {
  ok: boolean;
  event: OutboxEventKind;
  assignmentId?: string;
  alreadyRecorded?: boolean;
  owningEmployee?: {
    id: string;
    name: string;
    roleKey: string;
  } | null;
  wake?: WakeResult | null;
  error?: string;
}

export interface OutboxEventRecord {
  id: string;
  event: OutboxEventKind;
  title: string;
  objective: string;
  employeeName: string | null;
  employeeRole: string | null;
  agentInstanceId: string;
  status: string;
  wakeStatus: "sent" | "failed" | "not_configured";
  wakeHttpStatus: number | null;
  wokenAt: string | null;
  createdAt: string;
  context: Record<string, unknown>;
}

export interface OutboxSweepSummary {
  orgId: string;
  timestamp: string;
  followUpsChecked: number;
  followUpsDispatched: number;
  staleWorkersChecked: number;
  stalePartnersChecked: number;
  staleAvailabilityDispatched: number;
  errors: string[];
}

interface ActiveEmployee {
  id: string;
  display_name: string;
  role_key: string;
}

/**
 * Resolves the active employee who owns the given domain.
 * - availability_stale -> HR (role hr or triangle_hr)
 * - client_reply -> author if known, or commercial ops / inbox coordinator
 * - follow_up_due -> commercial ops / inbox coordinator
 */
async function resolveEmployeeForEvent(
  svc: ReturnType<typeof createServiceSupabaseClient>,
  orgId: string,
  kind: OutboxEventKind,
  preferredRoleKey?: string | null,
  preferredInstanceId?: string | null,
): Promise<ActiveEmployee | null> {
  if (!svc) return null;

  if (preferredInstanceId) {
    const { data: specific } = await svc
      .from("agent_instances")
      .select("id, display_name, role_key, status")
      .eq("id", preferredInstanceId)
      .eq("org_id", orgId)
      .eq("status", "active")
      .maybeSingle();
    if (specific) {
      return {
        id: specific.id as string,
        display_name: (specific.display_name as string) ?? "Employee",
        role_key: (specific.role_key as string) ?? "",
      };
    }
  }

  const { data: instances } = await svc
    .from("agent_instances")
    .select("id, display_name, role_key, status")
    .eq("org_id", orgId)
    .eq("status", "active");

  const roster = (instances ?? []) as ActiveEmployee[];
  if (roster.length === 0) return null;

  const rolesToMatch: string[] = [];
  if (preferredRoleKey) rolesToMatch.push(preferredRoleKey.toLowerCase());

  if (kind === "availability_stale") {
    rolesToMatch.push("hr", "triangle_hr", "talent_pool");
  } else if (kind === "client_reply" || kind === "follow_up_due") {
    rolesToMatch.push("inbox_coordinator", "commercial_ops", "operations", "project_researcher");
  }

  for (const r of rolesToMatch) {
    const match = roster.find((e) => e.role_key.toLowerCase() === r);
    if (match) return match;
  }

  return roster[0];
}

/**
 * Dispatches an event to the outbox:
 * 1. Verifies idempotency key (skips if already recorded)
 * 2. Assigns work to the owning employee
 * 3. Wakes the employee via webhook (wakeEmployee)
 * 4. Links related business entity
 */
export async function dispatchOutboxEvent(params: {
  orgId: string;
  kind: OutboxEventKind;
  title: string;
  objective: string;
  expectedOutput?: string;
  idempotencyKey: string;
  preferredAgentInstanceId?: string | null;
  preferredRoleKey?: string | null;
  entityType?: "worker" | "buyer_contact" | "outreach_draft" | "job_lead" | "supply_partner" | "commercial_action" | "project";
  entityId?: string;
  metadata?: Record<string, unknown>;
  priority?: "urgent" | "high" | "normal" | "low";
}): Promise<OutboxDispatchResult> {
  const svc = createServiceSupabaseClient();
  if (!svc) {
    return { ok: false, event: params.kind, error: "Database client unavailable." };
  }

  // Idempotency check: prevent duplicate work and duplicate wake calls
  const { data: existing } = await svc
    .from("agent_assignments")
    .select("id, agent_instance_id, status, constraints")
    .eq("org_id", params.orgId)
    .eq("idempotency_key", params.idempotencyKey)
    .maybeSingle();

  if (existing?.id) {
    const c = (existing.constraints as Record<string, unknown> | null) ?? {};
    const wake = (c.wake as WakeResult) ?? null;
    return {
      ok: true,
      event: params.kind,
      assignmentId: existing.id as string,
      alreadyRecorded: true,
      wake,
    };
  }

  const target = await resolveEmployeeForEvent(
    svc,
    params.orgId,
    params.kind,
    params.preferredRoleKey,
    params.preferredAgentInstanceId,
  );

  if (!target) {
    return {
      ok: false,
      event: params.kind,
      error: `No active employee found to handle ${params.kind}.`,
    };
  }

  const constraints = {
    case_type: "event_outbox",
    outbox_event: params.kind,
    execution_mode: "bot",
    source_entity: params.entityType && params.entityId ? { type: params.entityType, id: params.entityId } : null,
    metadata: params.metadata ?? {},
  };

  const { data: created, error } = await svc
    .from("agent_assignments")
    .insert({
      org_id: params.orgId,
      agent_instance_id: target.id,
      title: params.title,
      objective: params.objective,
      expected_output: params.expectedOutput ?? "Review in Triangle and prepare appropriate next steps. Do not take unapproved external action.",
      status: "queued",
      priority: params.priority ?? (params.kind === "client_reply" ? "high" : "normal"),
      constraints,
      idempotency_key: params.idempotencyKey,
    })
    .select("id")
    .single();

  if (error || !created) {
    return {
      ok: false,
      event: params.kind,
      error: `Could not create assignment: ${error?.message ?? "unknown error"}`,
    };
  }

  const assignmentId = created.id as string;

  // Link entity relationship if specified
  if (params.entityType && params.entityId) {
    await svc.from("agent_assignment_entities").insert({
      org_id: params.orgId,
      assignment_id: assignmentId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      relation: "subject",
    });
  }

  // Wake the employee routine
  const wake = await wakeEmployee({
    orgId: params.orgId,
    agentInstanceId: target.id,
    stepId: assignmentId,
    missionId: null,
    event: params.kind as WakeEvent,
  });

  return {
    ok: true,
    event: params.kind,
    assignmentId,
    alreadyRecorded: false,
    owningEmployee: {
      id: target.id,
      name: target.display_name,
      roleKey: target.role_key,
    },
    wake,
  };
}

/**
 * Records a client reply received event (e.g. from outreach, email or contact log).
 */
export async function recordClientReplyEvent(params: {
  orgId: string;
  sourceType: "outreach_draft" | "contact_log" | "inbound_email" | "submission_packet";
  sourceId: string;
  recipientName?: string | null;
  recipientEmail?: string | null;
  recipientCompany?: string | null;
  subject?: string | null;
  replySummary?: string | null;
  agentInstanceId?: string | null;
}): Promise<OutboxDispatchResult> {
  const who = params.recipientName || params.recipientEmail || "client";
  const about = params.subject || (params.recipientCompany ? `conversation with ${params.recipientCompany}` : "outreach thread");
  const title = `Client reply: ${who}`;
  const objective =
    `A client reply was received from ${who}${params.recipientCompany ? ` at ${params.recipientCompany}` : ""}${params.recipientEmail ? ` (${params.recipientEmail})` : ""}. ` +
    `Subject / topic: "${about}". ` +
    (params.replySummary ? `Summary: ${params.replySummary}. ` : "") +
    `Review the conversation and draft the next commercial move or follow-up in Triangle. Do not send any messages externally without human approval.`;

  const entityType =
    params.sourceType === "outreach_draft"
      ? "outreach_draft"
      : params.sourceType === "inbound_email"
      ? "job_lead"
      : "commercial_action";

  return dispatchOutboxEvent({
    orgId: params.orgId,
    kind: "client_reply",
    title,
    objective,
    expectedOutput: "Draft the next commercial reply or follow-through step in Triangle. Do not contact externally.",
    idempotencyKey: `outbox:client_reply:${params.sourceType}:${params.sourceId}`,
    preferredAgentInstanceId: params.agentInstanceId,
    preferredRoleKey: "inbox_coordinator",
    entityType,
    entityId: params.sourceId,
    metadata: {
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      recipientName: params.recipientName ?? null,
      recipientEmail: params.recipientEmail ?? null,
      recipientCompany: params.recipientCompany ?? null,
      replySummary: params.replySummary ?? null,
    },
    priority: "high",
  });
}

/**
 * Sweeps all commercial actions where follow_up_at has arrived and no response exists.
 */
export async function sweepDueFollowUps(orgId: string): Promise<{
  checked: number;
  dispatched: number;
  errors: string[];
}> {
  const due = await listFollowUpsDue(orgId);
  let dispatched = 0;
  const errors: string[] = [];

  const today = new Date().toISOString().slice(0, 10);
  for (const item of due.items) {
    try {
      const who = item.who || item.company || "contact";
      const title = `Follow-up due: ${who}`;
      const objective =
        `A follow-up is due for ${item.who ?? "contact"}${item.company ? ` at ${item.company}` : ""} ` +
        `(last sent: ${item.subject || item.sent || "message"} on ${item.at}, due ${item.dueAt}). ` +
        `Draft the follow-up message or chaser in Triangle for a person to review. Do not send externally.`;

      const result = await dispatchOutboxEvent({
        orgId,
        kind: "follow_up_due",
        title,
        objective,
        expectedOutput: "Draft a follow-up or chaser message in Triangle for human review. Do not send externally.",
        idempotencyKey: `outbox:follow_up_due:${item.actionId}:${today}`,
        preferredRoleKey: "inbox_coordinator",
        entityType: "commercial_action",
        entityId: item.actionId,
        metadata: {
          actionId: item.actionId,
          target: item.target,
          who: item.who,
          company: item.company,
          dueAt: item.dueAt,
          daysOverdue: item.daysOverdue,
        },
        priority: item.daysOverdue > 2 ? "high" : "normal",
      });

      if (result.ok && !result.alreadyRecorded) {
        dispatched++;
      } else if (!result.ok && result.error) {
        errors.push(`${item.actionId}: ${result.error}`);
      }
    } catch (err) {
      errors.push(`${item.actionId}: ${err instanceof Error ? err.message : "dispatch failed"}`);
    }
  }

  return { checked: due.total, dispatched, errors };
}

/**
 * Sweeps active workers and supply partners whose availability confirmation
 * is older than the 14-day shelf life.
 */
export async function sweepStaleAvailability(orgId: string): Promise<{
  workersChecked: number;
  partnersChecked: number;
  dispatched: number;
  errors: string[];
}> {
  const svc = createServiceSupabaseClient();
  if (!svc) {
    return { workersChecked: 0, partnersChecked: 0, dispatched: 0, errors: ["No database client"] };
  }

  let dispatched = 0;
  const errors: string[] = [];
  const cutoffMs = Date.now() - CAPACITY_SHELF_LIFE_DAYS * 86_400_000;
  const fortnightBucket = Math.floor(Date.now() / (CAPACITY_SHELF_LIFE_DAYS * 86_400_000));

  // 1. Supply Partners with active status and available/available_soon
  const { data: partners, error: pError } = await svc
    .from("supply_partners")
    .select("id, name, country, availability_status, confirmed_at")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .in("availability_status", ["available", "available_soon"]);

  if (pError) {
    errors.push(`Supply partners query: ${pError.message}`);
  }

  const stalePartners = (partners ?? []).filter((p) => {
    if (!p.confirmed_at) return true;
    return new Date(p.confirmed_at).getTime() < cutoffMs;
  });

  for (const partner of stalePartners) {
    try {
      const confirmedDate = partner.confirmed_at ? new Date(partner.confirmed_at).toISOString().slice(0, 10) : "never";
      const title = `Check availability: ${partner.name} (stale >14d)`;
      const objective =
        `Supply partner ${partner.name} capacity has not been confirmed within the 14-day shelf life (last confirmed: ${confirmedDate}). ` +
        `Check availability and draft an inquiry or update in Triangle for a person to review. Do not commit supply.`;

      const res = await dispatchOutboxEvent({
        orgId,
        kind: "availability_stale",
        title,
        objective,
        expectedOutput: "Draft an availability check inquiry or update in Triangle. Do not commit supply.",
        idempotencyKey: `outbox:avail_stale:partner:${partner.id}:${fortnightBucket}`,
        preferredRoleKey: "hr",
        entityType: "supply_partner",
        entityId: partner.id,
        metadata: {
          partnerId: partner.id,
          name: partner.name,
          confirmedAt: partner.confirmed_at,
          shelfLifeDays: CAPACITY_SHELF_LIFE_DAYS,
        },
        priority: "normal",
      });
      if (res.ok && !res.alreadyRecorded) dispatched++;
      else if (!res.ok && res.error) errors.push(`partner ${partner.id}: ${res.error}`);
    } catch (e) {
      errors.push(`partner ${partner.id}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  // 2. Workers with active status and available/available_soon
  const { data: workers, error: wError } = await svc
    .from("workers")
    .select("id, full_name, role, availability_status, updated_at")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .in("availability_status", ["available", "available_soon"])
    .limit(100);

  if (wError) {
    errors.push(`Workers query: ${wError.message}`);
  }

  const workerList = workers ?? [];
  const workerIds = workerList.map((w) => w.id as string);

  // Fetch recent availability notes for these workers
  const { data: notes } = workerIds.length > 0
    ? await svc
        .from("worker_notes")
        .select("worker_id, occurred_on, created_at")
        .eq("organization_id", orgId)
        .eq("kind", "availability")
        .in("worker_id", workerIds)
        .order("occurred_on", { ascending: false })
    : { data: [] };

  const lastNoteByWorker = new Map<string, number>();
  for (const n of notes ?? []) {
    const wid = n.worker_id as string;
    const time = new Date(n.occurred_on ?? n.created_at).getTime();
    if (!lastNoteByWorker.has(wid) || time > (lastNoteByWorker.get(wid) ?? 0)) {
      lastNoteByWorker.set(wid, time);
    }
  }

  const staleWorkers = workerList.filter((w) => {
    const noteTime = lastNoteByWorker.get(w.id as string);
    if (noteTime) return noteTime < cutoffMs;
    if (w.updated_at) return new Date(w.updated_at).getTime() < cutoffMs;
    return true;
  });

  for (const worker of staleWorkers) {
    try {
      const title = `Check availability: ${worker.full_name} (stale >14d)`;
      const objective =
        `Worker ${worker.full_name} (${worker.role ?? "technical trade"}) availability has not been confirmed within the 14-day shelf life. ` +
        `Draft an availability check-in or CV request in Triangle for a person to send. Do not commit supply.`;

      const res = await dispatchOutboxEvent({
        orgId,
        kind: "availability_stale",
        title,
        objective,
        expectedOutput: "Draft an availability check or CV request in Triangle for human review. Do not commit supply.",
        idempotencyKey: `outbox:avail_stale:worker:${worker.id}:${fortnightBucket}`,
        preferredRoleKey: "hr",
        entityType: "worker",
        entityId: worker.id,
        metadata: {
          workerId: worker.id,
          fullName: worker.full_name,
          role: worker.role,
          shelfLifeDays: CAPACITY_SHELF_LIFE_DAYS,
        },
        priority: "normal",
      });
      if (res.ok && !res.alreadyRecorded) dispatched++;
      else if (!res.ok && res.error) errors.push(`worker ${worker.id}: ${res.error}`);
    } catch (e) {
      errors.push(`worker ${worker.id}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  return {
    workersChecked: workerList.length,
    partnersChecked: (partners ?? []).length,
    dispatched,
    errors,
  };
}

/**
 * Runs the full outbox sweep for both follow-ups and availability.
 */
export async function runEventOutboxSweep(orgId: string): Promise<OutboxSweepSummary> {
  const [followUps, availability] = await Promise.all([
    sweepDueFollowUps(orgId),
    sweepStaleAvailability(orgId),
  ]);

  return {
    orgId,
    timestamp: new Date().toISOString(),
    followUpsChecked: followUps.checked,
    followUpsDispatched: followUps.dispatched,
    staleWorkersChecked: availability.workersChecked,
    stalePartnersChecked: availability.partnersChecked,
    staleAvailabilityDispatched: availability.dispatched,
    errors: [...followUps.errors, ...availability.errors],
  };
}

/**
 * Lists recent outbox events across the organization for inspection and status auditing.
 */
export async function listOutboxEvents(
  orgId: string,
  limit = 50,
): Promise<{
  events: OutboxEventRecord[];
  summary: {
    clientReplyCount: number;
    followUpDueCount: number;
    availabilityStaleCount: number;
  };
}> {
  const svc = createServiceSupabaseClient();
  if (!svc) {
    return { events: [], summary: { clientReplyCount: 0, followUpDueCount: 0, availabilityStaleCount: 0 } };
  }

  const { data: assignments } = await svc
    .from("agent_assignments")
    .select("id, title, objective, status, priority, constraints, created_at, agent_instance_id")
    .eq("org_id", orgId)
    .contains("constraints", { case_type: "event_outbox" })
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = assignments ?? [];
  const instanceIds = Array.from(new Set(rows.map((r) => r.agent_instance_id as string).filter(Boolean)));

  const { data: instances } = instanceIds.length > 0
    ? await svc
        .from("agent_instances")
        .select("id, display_name, role_key")
        .eq("org_id", orgId)
        .in("id", instanceIds)
    : { data: [] };

  const instanceMap = new Map((instances ?? []).map((i) => [i.id as string, i]));

  const events: OutboxEventRecord[] = [];
  let clientReplyCount = 0;
  let followUpDueCount = 0;
  let availabilityStaleCount = 0;

  for (const a of rows) {
    const c = (a.constraints as Record<string, unknown> | null) ?? {};
    const kind = (c.outbox_event as OutboxEventKind) ?? "follow_up_due";
    if (kind === "client_reply") clientReplyCount++;
    else if (kind === "follow_up_due") followUpDueCount++;
    else if (kind === "availability_stale") availabilityStaleCount++;

    const wake = c.wake as { status?: string; http_status?: number | null; at?: string } | undefined;
    const instance = instanceMap.get(a.agent_instance_id as string);

    events.push({
      id: a.id as string,
      event: kind,
      title: (a.title as string) ?? "",
      objective: (a.objective as string) ?? "",
      employeeName: (instance?.display_name as string) ?? null,
      employeeRole: (instance?.role_key as string) ?? null,
      agentInstanceId: (a.agent_instance_id as string) ?? "",
      status: (a.status as string) ?? "queued",
      wakeStatus: (wake?.status as "sent" | "failed" | "not_configured") ?? "not_configured",
      wakeHttpStatus: wake?.http_status ?? null,
      wokenAt: wake?.at ?? null,
      createdAt: (a.created_at as string) ?? "",
      context: (c.metadata as Record<string, unknown>) ?? {},
    });
  }

  return {
    events,
    summary: {
      clientReplyCount,
      followUpDueCount,
      availabilityStaleCount,
    },
  };
}
