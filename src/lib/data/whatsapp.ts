import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { wakeEmployee } from "@/lib/data/bot-runtime";
import { isHannaEmployee } from "@/lib/data/ask-hanna-policy";
import type { WhatsAppRecord } from "@/lib/whatsapp/view";
import {
  decideSend,
  graphMessagesUrl,
  graphSendBody,
  matchPersonByPhone,
  nextStatus,
  parseWebhook,
  pickOpenCase,
  planDraft,
  planInbound,
  readWhatsAppEnv,
  schemaMissing,
  serviceWindowOpen,
  type ParsedStatus,
  type ParsedText,
  type WakeContext,
  type WaStatus,
} from "@/lib/whatsapp/pilot";

// ---------------------------------------------------------------------------
// WhatsApp pilot, on the database. The rules live in src/lib/whatsapp/pilot.ts.
// This file stores, wakes Hanna once, files a draft, and — only after a person
// approves — posts one message to Graph. A missing table or missing env is a
// 503 with a log, never a crash and never a send.
// ---------------------------------------------------------------------------

type Svc = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function ingestWhatsAppWebhook(rawBody: string): Promise<{ status: 200 | 503 }> {
  const env = readWhatsAppEnv(process.env);
  if (!env.orgId) {
    console.error("whatsapp: DEFAULT_ORGANIZATION_ID is missing. Inbound was not stored.");
    return { status: 503 };
  }
  const svc = createServiceSupabaseClient();
  if (!svc) {
    console.error("whatsapp: database client is not configured. Inbound was not stored.");
    return { status: 503 };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("whatsapp: signed body was not JSON.");
    return { status: 200 };
  }
  for (const change of parseWebhook(payload)) {
    if (env.wabaId && change.wabaId && change.wabaId !== env.wabaId) continue;
    if (env.phoneNumberId && change.phoneNumberId && change.phoneNumberId !== env.phoneNumberId) {
      continue;
    }
    if (change.ignoredNonText > 0) {
      console.error(`whatsapp: ignored ${change.ignoredNonText} non-text message(s).`);
    }
    const business = change.displayNumber ?? "unknown";
    for (const message of change.messages) {
      const outcome = await storeInbound(svc, env.orgId, env.allowlist, business, message);
      if (outcome === "missing") return { status: 503 };
    }
    for (const status of change.statuses) {
      const outcome = await applyStatus(svc, env.orgId, status);
      if (outcome === "missing") return { status: 503 };
    }
  }
  return { status: 200 };
}

async function storeInbound(
  svc: Svc,
  orgId: string,
  allowlist: string[] | null,
  business: string,
  message: ParsedText,
): Promise<"ok" | "missing"> {
  const { data: existing, error: readError } = await svc
    .from("whatsapp_messages")
    .select("id, woken_at, person_id, mission_id")
    .eq("org_id", orgId)
    .eq("wamid", message.wamid)
    .maybeSingle();
  if (schemaMissing(readError)) {
    console.error("whatsapp: whatsapp_messages is missing (migration 054). Inbound was not stored.");
    return "missing";
  }
  if (readError) {
    console.error("whatsapp: could not read an inbound message.");
    return "missing";
  }

  const filing = existing
    ? {
        personId: (existing.person_id as string | null) ?? null,
        missionId: (existing.mission_id as string | null) ?? null,
      }
    : await resolveFiling(svc, orgId, message.from);

  const plan = planInbound({
    exists: Boolean(existing),
    woken: Boolean(existing?.woken_at),
    from: message.from,
    allowlist,
  });

  let id = (existing?.id as string | undefined) ?? null;
  if (plan.store) {
    const { data, error } = await svc
      .from("whatsapp_messages")
      .insert({
        org_id: orgId,
        wamid: message.wamid,
        direction: "inbound",
        from_number: message.from,
        to_number: business,
        body: message.text,
        wa_timestamp: message.timestamp,
        status: "received",
        person_id: filing.personId,
        mission_id: filing.missionId,
      })
      .select("id")
      .maybeSingle();
    if (schemaMissing(error)) {
      console.error("whatsapp: whatsapp_messages is missing (migration 054). Inbound was not stored.");
      return "missing";
    }
    if (error?.code === "23505") {
      const again = await svc
        .from("whatsapp_messages")
        .select("id, woken_at")
        .eq("org_id", orgId)
        .eq("wamid", message.wamid)
        .maybeSingle();
      id = (again.data?.id as string | undefined) ?? null;
      if (again.data?.woken_at) return "ok";
    } else if (error || !data) {
      console.error("whatsapp: could not store an inbound message.");
      return "ok";
    } else {
      id = data.id as string;
    }
  }

  if (!plan.wake || !id) return "ok";
  const { data: claimed, error: claimError } = await svc
    .from("whatsapp_messages")
    .update({ woken_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .is("woken_at", null)
    .select("id")
    .maybeSingle();
  if (schemaMissing(claimError)) return "missing";
  if (!claimed) return "ok";

  await wakeHanna(svc, orgId, {
    messageId: message.wamid,
    sender: message.from,
    personId: filing.personId,
    caseId: filing.missionId,
  });
  return "ok";
}

async function resolveFiling(
  svc: Svc,
  orgId: string,
  from: string,
): Promise<{ personId: string | null; missionId: string | null }> {
  const { data: workers } = await svc
    .from("workers")
    .select("id, phone")
    .eq("organization_id", orgId)
    .not("phone", "is", null)
    .limit(500);
  const personId = matchPersonByPhone(
    from,
    (workers ?? []).map((worker) => ({
      id: String(worker.id),
      phone: (worker.phone as string | null) ?? null,
    })),
  );
  const prior = await priorOpenMission(svc, orgId, from);
  const candidates = personId ? await openCasesForPerson(svc, orgId, personId) : [];
  if (prior) candidates.push(prior);
  return { personId, missionId: pickOpenCase(prior?.missionId ?? null, candidates) };
}

async function priorOpenMission(
  svc: Svc,
  orgId: string,
  from: string,
): Promise<{ missionId: string; closed: boolean; at: string } | null> {
  const { data, error } = await svc
    .from("whatsapp_messages")
    .select("mission_id, wa_timestamp")
    .eq("org_id", orgId)
    .eq("from_number", from)
    .not("mission_id", "is", null)
    .order("wa_timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.mission_id) return null;
  return missionOpen(svc, orgId, String(data.mission_id), String(data.wa_timestamp ?? ""));
}

async function missionOpen(
  svc: Svc,
  orgId: string,
  missionId: string,
  at: string,
): Promise<{ missionId: string; closed: boolean; at: string } | null> {
  const { data, error } = await svc
    .from("missions")
    .select("id, closed_at")
    .eq("org_id", orgId)
    .eq("id", missionId)
    .maybeSingle();
  if (error || !data) return null;
  return { missionId, closed: Boolean(data.closed_at), at };
}

async function openCasesForPerson(
  svc: Svc,
  orgId: string,
  personId: string,
): Promise<Array<{ missionId: string; closed: boolean; at: string }>> {
  const found: Array<{ missionId: string; closed: boolean; at: string }> = [];
  const reports = await svc
    .from("employee_reports")
    .select("mission_id, created_at")
    .eq("org_id", orgId)
    .eq("worker_id", personId)
    .not("mission_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(8);
  if (!schemaMissing(reports.error)) {
    for (const row of reports.data ?? []) {
      const mission = await missionOpen(svc, orgId, String(row.mission_id), String(row.created_at ?? ""));
      if (mission) found.push(mission);
    }
  }
  const links = await svc
    .from("agent_assignment_entities")
    .select("assignment_id, created_at")
    .eq("org_id", orgId)
    .eq("entity_type", "worker")
    .eq("entity_id", personId)
    .order("created_at", { ascending: false })
    .limit(8);
  const assignmentIds = (links.data ?? []).map((row) => row.assignment_id as string);
  if (assignmentIds.length > 0) {
    const steps = await svc
      .from("agent_assignments")
      .select("id, mission_id, created_at")
      .eq("org_id", orgId)
      .in("id", assignmentIds);
    for (const step of steps.data ?? []) {
      if (!step.mission_id) continue;
      const mission = await missionOpen(svc, orgId, String(step.mission_id), String(step.created_at ?? ""));
      if (mission) found.push(mission);
    }
  }
  return found;
}

async function wakeHanna(svc: Svc, orgId: string, ctx: WakeContext): Promise<void> {
  const { data: employees } = await svc
    .from("agent_instances")
    .select("id, role_key, display_name, status")
    .eq("org_id", orgId)
    .eq("status", "active");
  const hanna = (employees ?? []).find((row) =>
    isHannaEmployee({
      roleKey: String(row.role_key ?? ""),
      displayName: String(row.display_name ?? ""),
    }),
  );
  if (!hanna) {
    console.error("whatsapp: no Hanna on the workforce. Inbound is stored. Nobody was woken.");
    return;
  }

  let stepId: string | null = null;
  if (ctx.caseId) {
    const { data: openStep } = await svc
      .from("agent_assignments")
      .select("id")
      .eq("org_id", orgId)
      .eq("mission_id", ctx.caseId)
      .eq("agent_instance_id", hanna.id as string)
      .in("status", ["queued", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    stepId = (openStep?.id as string | undefined) ?? null;
  }

  if (!stepId) {
    const idempotencyKey = `whatsapp:${ctx.messageId}`;
    const { data: existing } = await svc
      .from("agent_assignments")
      .select("id")
      .eq("org_id", orgId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    stepId = (existing?.id as string | undefined) ?? null;
    if (!stepId) {
      const { data: created, error } = await svc
        .from("agent_assignments")
        .insert({
          org_id: orgId,
          agent_instance_id: hanna.id,
          mission_id: ctx.caseId,
          title: "WhatsApp",
          objective: `A WhatsApp message arrived (${ctx.messageId}) from ${ctx.sender}. Person ${ctx.personId ?? "unknown"}. Case ${ctx.caseId ?? "none"}. Draft a reply. Do not send.`,
          expected_output: "A draft reply. Do not send.",
          status: "queued",
          priority: "high",
          idempotency_key: idempotencyKey,
          constraints: {
            case_type: "event_outbox",
            outbox_event: "whatsapp_inbound",
            execution_mode: "bot",
            message_id: ctx.messageId,
            sender: ctx.sender,
            person_id: ctx.personId,
            mission_id: ctx.caseId,
          },
        })
        .select("id")
        .maybeSingle();
      if (error?.code === "23505") {
        const again = await svc
          .from("agent_assignments")
          .select("id")
          .eq("org_id", orgId)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        stepId = (again.data?.id as string | undefined) ?? null;
      } else if (created?.id) {
        stepId = created.id as string;
        if (ctx.personId) {
          await svc.from("agent_assignment_entities").insert({
            org_id: orgId,
            assignment_id: stepId,
            entity_type: "worker",
            entity_id: ctx.personId,
            relation: "context",
          });
        }
      } else {
        console.error("whatsapp: could not queue Hanna's pickup.");
      }
    }
  }

  if (!stepId) return;
  await wakeEmployee({
    orgId,
    agentInstanceId: hanna.id as string,
    stepId,
    missionId: ctx.caseId,
    event: "whatsapp_inbound",
    context: {
      messageId: ctx.messageId,
      sender: ctx.sender,
      personId: ctx.personId,
      caseId: ctx.caseId,
    },
  });
}

async function applyStatus(svc: Svc, orgId: string, status: ParsedStatus): Promise<"ok" | "missing"> {
  const { data, error } = await svc
    .from("whatsapp_messages")
    .select("id, status")
    .eq("org_id", orgId)
    .eq("wamid", status.wamid)
    .maybeSingle();
  if (schemaMissing(error)) {
    console.error("whatsapp: whatsapp_messages is missing (migration 054). Status was not stored.");
    return "missing";
  }
  if (error || !data) {
    if (!data && !error) console.error("whatsapp: status for a message that is not stored.");
    return "ok";
  }
  const current = data.status as WaStatus;
  const next = nextStatus(current, status.status);
  if (next === current) return "ok";
  const { error: updateError } = await svc
    .from("whatsapp_messages")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", data.id as string)
    .eq("org_id", orgId);
  if (schemaMissing(updateError)) return "missing";
  return "ok";
}

export async function fileWhatsAppDraft(params: {
  orgId: string;
  agentInstanceId: string;
  body: unknown;
}): Promise<
  | { ok: true; draftId: string; duplicate: boolean; sends: false }
  | { ok: false; status: number; error: string }
> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, status: 503, error: "Database unavailable." };

  const { data: employee } = await svc
    .from("agent_instances")
    .select("role_key, display_name, status")
    .eq("id", params.agentInstanceId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  if (
    !employee ||
    employee.status !== "active" ||
    !isHannaEmployee({
      roleKey: String(employee.role_key ?? ""),
      displayName: String(employee.display_name ?? ""),
    })
  ) {
    return { ok: false, status: 403, error: "Only Hanna can draft a WhatsApp reply." };
  }

  const body = asRecord(params.body);
  if (!body) return { ok: false, status: 400, error: "Send a JSON object." };
  const replyTo = typeof body.replyTo === "string" && body.replyTo.trim() ? body.replyTo.trim() : null;
  let to = typeof body.to === "string" ? body.to : "";
  const text = typeof body.text === "string" ? body.text : "";
  const templateName = typeof body.templateName === "string" ? body.templateName : null;
  let personId = typeof body.personId === "string" && UUID.test(body.personId) ? body.personId : null;
  let missionId = typeof body.caseId === "string" && UUID.test(body.caseId) ? body.caseId : null;

  if (replyTo) {
    const inbound = await svc
      .from("whatsapp_messages")
      .select("from_number, person_id, mission_id")
      .eq("org_id", params.orgId)
      .eq("wamid", replyTo)
      .eq("direction", "inbound")
      .maybeSingle();
    if (schemaMissing(inbound.error)) {
      return { ok: false, status: 503, error: "Triangle cannot file this yet. Migration 054 has not been applied." };
    }
    if (inbound.data) {
      if (!to) to = String(inbound.data.from_number ?? "");
      personId = personId ?? ((inbound.data.person_id as string | null) ?? null);
      missionId = missionId ?? ((inbound.data.mission_id as string | null) ?? null);
    }
  }

  const planned = planDraft({
    agentId: params.agentInstanceId,
    to,
    text,
    replyTo,
    templateName,
  });
  if (!planned.ok) return { ok: false, status: 400, error: planned.error };

  if (personId) {
    const person = await svc
      .from("workers")
      .select("id")
      .eq("id", personId)
      .eq("organization_id", params.orgId)
      .maybeSingle();
    if (!person.data) return { ok: false, status: 400, error: "That person is not in this organisation." };
  }
  if (missionId) {
    const mission = await svc
      .from("missions")
      .select("id")
      .eq("id", missionId)
      .eq("org_id", params.orgId)
      .maybeSingle();
    if (!mission.data) return { ok: false, status: 400, error: "That case is not in this organisation." };
  }

  const insert = {
    org_id: params.orgId,
    direction: "outbound",
    from_number: "business",
    to_number: planned.to,
    body: planned.text,
    wa_timestamp: new Date().toISOString(),
    status: "draft",
    person_id: personId,
    mission_id: missionId,
    reply_to_wamid: replyTo,
    template_name: templateName?.trim() || null,
    agent_instance_id: params.agentInstanceId,
    draft_key: planned.draftKey,
  };
  const { data, error } = await svc.from("whatsapp_messages").insert(insert).select("id").maybeSingle();
  if (error?.code === "23505") {
    const existing = await svc
      .from("whatsapp_messages")
      .select("id")
      .eq("org_id", params.orgId)
      .eq("draft_key", planned.draftKey)
      .maybeSingle();
    if (existing.data?.id) {
      return { ok: true, draftId: existing.data.id as string, duplicate: true, sends: false };
    }
  }
  if (schemaMissing(error)) {
    return { ok: false, status: 503, error: "Triangle cannot file this yet. Migration 054 has not been applied." };
  }
  if (error || !data) return { ok: false, status: 500, error: "Could not store that draft." };
  return { ok: true, draftId: data.id as string, duplicate: false, sends: false };
}

export async function sendApprovedWhatsAppDraft(params: {
  orgId: string;
  userId: string;
  actor: "human" | "machine" | "demo";
  draftId: string;
  text: string;
  approve: boolean;
}): Promise<{ ok: true; wamid: string } | { ok: false; status: number; error: string }> {
  const env = readWhatsAppEnv(process.env);
  if (!env.phoneNumberId || !env.accessToken) {
    console.error("whatsapp: phone number id or access token is missing. Nothing was sent.");
    return { ok: false, status: 503, error: "WhatsApp sending is not configured." };
  }
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, status: 503, error: "Database unavailable." };

  const { data: draft, error } = await svc
    .from("whatsapp_messages")
    .select("id, status, to_number, body, template_name, send_attempted_at, direction")
    .eq("id", params.draftId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  if (schemaMissing(error)) {
    return { ok: false, status: 503, error: "Triangle cannot send this yet. Migration 054 has not been applied." };
  }
  if (error || !draft || draft.direction !== "outbound") {
    return { ok: false, status: 404, error: "That draft is not on file." };
  }

  const last = await svc
    .from("whatsapp_messages")
    .select("wa_timestamp")
    .eq("org_id", params.orgId)
    .eq("direction", "inbound")
    .eq("from_number", draft.to_number as string)
    .order("wa_timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (schemaMissing(last.error)) {
    return { ok: false, status: 503, error: "Triangle cannot send this yet. Migration 054 has not been applied." };
  }

  const decision = decideSend({
    actor: params.actor,
    approve: params.approve,
    status: String(draft.status),
    to: String(draft.to_number),
    text: params.text || String(draft.body ?? ""),
    draftTemplate: (draft.template_name as string | null) ?? null,
    allowlist: env.allowlist,
    lastInboundAt: (last.data?.wa_timestamp as string | undefined) ?? null,
    now: new Date(),
    approvedTemplate: env.templateName,
    templateLanguageCode: env.templateLanguage,
    sendAttempted: Boolean(draft.send_attempted_at),
  });
  if (!decision.ok) return decision;

  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await svc
    .from("whatsapp_messages")
    .update({
      send_attempted_at: now,
      approved_at: now,
      approved_by: params.userId,
      body: decision.mode === "text" ? decision.body : (draft.body as string | null),
      template_name: decision.mode === "template" ? decision.templateName : (draft.template_name as string | null),
      updated_at: now,
    })
    .eq("id", params.draftId)
    .eq("org_id", params.orgId)
    .eq("status", "draft")
    .is("send_attempted_at", null)
    .select("id")
    .maybeSingle();
  if (schemaMissing(claimError)) {
    return { ok: false, status: 503, error: "Triangle cannot send this yet. Migration 054 has not been applied." };
  }
  if (!claimed) {
    return { ok: false, status: 409, error: "That draft is no longer waiting to be sent." };
  }

  const graph = await postToGraph({
    version: env.graphVersion,
    phoneNumberId: env.phoneNumberId,
    accessToken: env.accessToken,
    body: graphSendBody(decision),
  });
  if (!graph.ok) {
    if (!graph.ambiguous) {
      await svc
        .from("whatsapp_messages")
        .update({ send_attempted_at: null, error: graph.error, updated_at: new Date().toISOString() })
        .eq("id", params.draftId)
        .eq("org_id", params.orgId)
        .eq("status", "draft");
    } else {
      await svc
        .from("whatsapp_messages")
        .update({ error: graph.error, updated_at: new Date().toISOString() })
        .eq("id", params.draftId)
        .eq("org_id", params.orgId);
    }
    return { ok: false, status: graph.status, error: graph.error };
  }

  const { error: sentError } = await svc
    .from("whatsapp_messages")
    .update({
      status: "sent",
      wamid: graph.wamid,
      sent_at: new Date().toISOString(),
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.draftId)
    .eq("org_id", params.orgId);
  if (sentError) {
    console.error("whatsapp: the message was accepted and was not sent again, but the row could not be marked sent.");
  }
  return { ok: true, wamid: graph.wamid };
}

async function postToGraph(args: {
  version: string;
  phoneNumberId: string;
  accessToken: string;
  body: Record<string, unknown>;
}): Promise<{ ok: true; wamid: string } | { ok: false; status: number; error: string; ambiguous: boolean }> {
  try {
    const res = await fetch(graphMessagesUrl(args.version, args.phoneNumberId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args.body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { messages?: { id?: string }[]; error?: { message?: string } } | null;
    if (res.ok) {
      const id = json?.messages?.[0]?.id;
      if (typeof id === "string" && id) return { ok: true, wamid: id };
      return {
        ok: false,
        status: 502,
        error: "WhatsApp accepted the call but did not return a message id. Not sent again.",
        ambiguous: true,
      };
    }
    const message = typeof json?.error?.message === "string" ? json.error.message.slice(0, 300) : "";
    const ambiguous = res.status >= 500;
    return {
      ok: false,
      status: ambiguous ? 502 : 400,
      error: message || `WhatsApp refused the send (${res.status}).`,
      ambiguous,
    };
  } catch {
    return { ok: false, status: 502, error: "WhatsApp did not answer. Nothing was retried.", ambiguous: true };
  }
}

function whenLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zagreb",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

const EMPTY: WhatsAppRecord = { drafts: [], waiting: [], approvedTemplate: null };

export async function listWhatsAppForCase(orgId: string, missionId: string): Promise<WhatsAppRecord> {
  return listWhatsApp(orgId, "mission_id", missionId, null);
}

export async function listWhatsAppForPerson(
  orgId: string,
  personId: string,
  personName: string,
): Promise<WhatsAppRecord> {
  return listWhatsApp(orgId, "person_id", personId, personName);
}

async function listWhatsApp(
  orgId: string,
  column: "mission_id" | "person_id",
  id: string,
  knownName: string | null,
): Promise<WhatsAppRecord> {
  const env = readWhatsAppEnv(process.env);
  const svc = createServiceSupabaseClient();
  if (!svc) return { ...EMPTY, approvedTemplate: env.templateName };
  const { data, error } = await svc
    .from("whatsapp_messages")
    .select("id, wamid, direction, from_number, to_number, body, wa_timestamp, status, person_id, reply_to_wamid")
    .eq("org_id", orgId)
    .eq(column, id)
    .order("wa_timestamp", { ascending: false })
    .limit(40);
  if (schemaMissing(error)) {
    console.error("whatsapp: whatsapp_messages is missing (migration 054). Nothing to show.");
    return { ...EMPTY, approvedTemplate: env.templateName };
  }
  if (error || !data) return { ...EMPTY, approvedTemplate: env.templateName };

  const names = new Map<string, string>();
  if (knownName) {
    for (const row of data) if (row.person_id) names.set(row.person_id as string, knownName);
  } else {
    const ids = Array.from(new Set(data.map((row) => row.person_id).filter(Boolean))) as string[];
    if (ids.length > 0) {
      const people = await svc.from("workers").select("id, full_name").eq("organization_id", orgId).in("id", ids);
      for (const person of people.data ?? []) names.set(person.id as string, String(person.full_name));
    }
  }

  const inbound = data.filter((row) => row.direction === "inbound");
  const drafts = data.filter((row) => row.direction === "outbound" && row.status === "draft");
  const draftNumbers = new Set(drafts.map((row) => String(row.to_number)));
  const now = new Date();

  return {
    approvedTemplate: env.templateName,
    drafts: drafts.map((row) => {
      const thread = inbound.filter((item) => item.from_number === row.to_number);
      const latest = thread[0] ?? null;
      const quoted =
        inbound.find((item) => item.wamid && item.wamid === row.reply_to_wamid) ?? latest;
      const who =
        (row.person_id && names.get(row.person_id as string)) ||
        (quoted?.from_number as string | undefined) ||
        String(row.to_number);
      return {
        id: String(row.id),
        to: String(row.to_number),
        body: String(row.body ?? ""),
        who,
        inboundText: quoted?.body ? String(quoted.body) : null,
        windowOpen: serviceWindowOpen((latest?.wa_timestamp as string | undefined) ?? null, now),
      };
    }),
    waiting: inbound
      .filter((row) => !draftNumbers.has(String(row.from_number)))
      .slice(0, 5)
      .map((row) => ({
        id: String(row.id),
        who: (row.person_id && names.get(row.person_id as string)) || String(row.from_number),
        from: String(row.from_number),
        text: String(row.body ?? ""),
        at: whenLabel(String(row.wa_timestamp ?? "")),
      })),
  };
}
