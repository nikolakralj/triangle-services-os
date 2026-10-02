import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { getOpenAIClient } from "@/lib/ai/openai-client";
import { isScoutRole, wakeEmployee } from "@/lib/data/bot-runtime";
import { isHannaEmployee } from "@/lib/data/ask-hanna-policy";
import type { WhatsAppRecord } from "@/lib/whatsapp/view";
import {
  decideSend,
  graphDocumentBody,
  graphMediaUrl,
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
import {
  decodeDraftDocument,
  draftTextAllowed,
  employeeMayDraftWhatsApp,
  isScoutEmployee,
  parseModelRoute,
  resolveRoute,
  ROUTE_MODEL_INSTRUCTIONS,
  WHATSAPP_DRAFT_BUCKET,
  WHATSAPP_DRAFT_ENDPOINT,
  workerProfileAttachment,
  type NormalizedAttachment,
  type RouteDecision,
} from "@/lib/whatsapp/routing";

// ---------------------------------------------------------------------------
// WhatsApp pilot, on the database. The rules live in src/lib/whatsapp/pilot.ts
// and src/lib/whatsapp/routing.ts. This file stores an inbound, routes it to
// Scout or Hanna, wakes that employee once, files a draft, and — only after
// a person approves — posts one message to Graph. A missing table or missing
// env is a 503 with a log, never a crash and never a send. A CV or worker
// profile is refused before it is stored and again before it could be sent.
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
    .select("id, woken_at, person_id, mission_id, routed_employee, route_reason")
    .eq("org_id", orgId)
    .eq("wamid", message.wamid)
    .maybeSingle();
  if (schemaMissing(readError)) {
    console.error(
      "whatsapp: whatsapp_messages is missing columns or the table (migrations 054 and 055). Inbound was not stored.",
    );
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

  const storedRoute = routeFromRow(existing?.routed_employee, existing?.route_reason);
  let route = plan.wake ? (storedRoute ?? (await classifyInbound(message.text))) : storedRoute;

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
        routed_employee: route?.employee ?? null,
        route_reason: route?.reason ?? null,
      })
      .select("id")
      .maybeSingle();
    if (schemaMissing(error)) {
      console.error(
        "whatsapp: whatsapp_messages is missing columns or the table (migrations 054 and 055). Inbound was not stored.",
      );
      return "missing";
    }
    if (error?.code === "23505") {
      const again = await svc
        .from("whatsapp_messages")
        .select("id, woken_at, routed_employee, route_reason")
        .eq("org_id", orgId)
        .eq("wamid", message.wamid)
        .maybeSingle();
      id = (again.data?.id as string | undefined) ?? null;
      if (again.data?.woken_at) return "ok";
      const stored = routeFromRow(again.data?.routed_employee, again.data?.route_reason);
      if (stored) route = stored;
    } else if (error || !data) {
      console.error("whatsapp: could not store an inbound message.");
      return "ok";
    } else {
      id = data.id as string;
    }
  }

  if (!plan.wake || !id || !route) return "ok";
  await wakeRoutedEmployee(svc, orgId, id, route, {
    messageId: message.wamid,
    sender: message.from,
    text: message.text,
    personId: filing.personId,
    caseId: filing.missionId,
    draftEndpoint: WHATSAPP_DRAFT_ENDPOINT,
    employee: route.employee,
    reason: route.reason,
  });
  return "ok";
}

function routeFromRow(employee: unknown, reason: unknown): RouteDecision | null {
  if (employee !== "scout" && employee !== "hanna") return null;
  return {
    employee,
    reason: typeof reason === "string" && reason.trim() ? reason : employee === "scout" ? "Scout." : "Hanna.",
    unsure: false,
  };
}

/**
 * Model first, when a key is set. A missing key, a timeout, or an unsure
 * answer uses the keyword rule. The keyword rule sends an unclear message
 * to Hanna. This never throws and never sends.
 */
async function classifyInbound(text: string): Promise<RouteDecision> {
  const model = await askRouteModel(text);
  return resolveRoute(text, model);
}

async function askRouteModel(text: string): Promise<ReturnType<typeof parseModelRoute>> {
  if (!process.env.OPENAI_API_KEY?.trim()) return null;
  try {
    const client = getOpenAIClient();
    const response = await client.responses.create(
      {
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        instructions: ROUTE_MODEL_INSTRUCTIONS,
        input: text.slice(0, 2000),
      },
      { signal: AbortSignal.timeout(8_000) },
    );
    const raw = typeof response.output_text === "string" ? response.output_text : "";
    return parseModelRoute(raw);
  } catch {
    console.error("whatsapp: route model did not answer. Using the keyword rule.");
    return null;
  }
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

async function wakeRoutedEmployee(
  svc: Svc,
  orgId: string,
  messageRowId: string,
  route: RouteDecision,
  ctx: WakeContext,
): Promise<void> {
  const { data: employees } = await svc
    .from("agent_instances")
    .select("id, role_key, display_name, status")
    .eq("org_id", orgId)
    .eq("status", "active");
  const employee = (employees ?? []).find((row) => {
    const who = { roleKey: String(row.role_key ?? ""), displayName: String(row.display_name ?? "") };
    return route.employee === "scout" ? isScoutEmployee(who) || isScoutRole(who.roleKey) : isHannaEmployee(who);
  });
  if (!employee) {
    console.error(
      `whatsapp: no ${route.employee} on the workforce. Inbound is stored. Nobody was woken.`,
    );
    return;
  }

  const { data: claimed, error: claimError } = await svc
    .from("whatsapp_messages")
    .update({
      woken_at: new Date().toISOString(),
      routed_employee: route.employee,
      route_reason: route.reason,
      agent_instance_id: employee.id,
    })
    .eq("id", messageRowId)
    .eq("org_id", orgId)
    .is("woken_at", null)
    .select("id")
    .maybeSingle();
  if (schemaMissing(claimError)) {
    console.error("whatsapp: could not record the wake (migration 055). Nobody was woken.");
    return;
  }
  if (!claimed) return;

  let stepId: string | null = null;
  if (ctx.caseId) {
    const { data: openStep } = await svc
      .from("agent_assignments")
      .select("id")
      .eq("org_id", orgId)
      .eq("mission_id", ctx.caseId)
      .eq("agent_instance_id", employee.id as string)
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
      const who = route.employee === "scout" ? "Scout" : "Hanna";
      const { data: created, error } = await svc
        .from("agent_assignments")
        .insert({
          org_id: orgId,
          agent_instance_id: employee.id,
          mission_id: ctx.caseId,
          title: "WhatsApp",
          objective: `A WhatsApp message arrived (${ctx.messageId}) from ${ctx.sender}. Routed to ${who}: ${route.reason}. Person ${ctx.personId ?? "unknown"}. Case ${ctx.caseId ?? "none"}. Draft at ${ctx.draftEndpoint}. Do not send. No CV or worker profile.`,
          expected_output: "A draft reply. Do not send. No CV or worker profile.",
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
            text: ctx.text.slice(0, 1500),
            draft_endpoint: ctx.draftEndpoint,
            routed_employee: route.employee,
            route_reason: route.reason,
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
        console.error(`whatsapp: could not queue ${route.employee}'s pickup.`);
      }
    }
  }

  if (!stepId) return;
  await wakeEmployee({
    orgId,
    agentInstanceId: employee.id as string,
    stepId,
    missionId: ctx.caseId,
    event: "whatsapp_inbound",
    context: {
      messageId: ctx.messageId,
      sender: ctx.sender,
      personId: ctx.personId,
      caseId: ctx.caseId,
      text: ctx.text,
      draftEndpoint: ctx.draftEndpoint,
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
    !employeeMayDraftWhatsApp({
      roleKey: String(employee.role_key ?? ""),
      displayName: String(employee.display_name ?? ""),
    })
  ) {
    return { ok: false, status: 403, error: "Only Scout or Hanna can draft a WhatsApp reply." };
  }

  const body = asRecord(params.body);
  if (!body) return { ok: false, status: 400, error: "Send a JSON object." };
  const replyTo = typeof body.replyTo === "string" && body.replyTo.trim() ? body.replyTo.trim() : null;
  let to = typeof body.to === "string" ? body.to : "";
  const text = typeof body.text === "string" ? body.text : "";
  const templateName = typeof body.templateName === "string" ? body.templateName : null;
  let personId = typeof body.personId === "string" && UUID.test(body.personId) ? body.personId : null;
  let missionId = typeof body.caseId === "string" && UUID.test(body.caseId) ? body.caseId : null;
  const document = asRecord(body.document);
  let documentBytes: Buffer | null = null;
  if (document && typeof document.contentBase64 === "string") {
    const decoded = decodeDraftDocument(document.contentBase64);
    if (!decoded.ok) return { ok: false, status: 400, error: decoded.error };
    documentBytes = decoded.bytes;
  }

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
    attachment: document
      ? {
          filename: typeof document.filename === "string" ? document.filename : "",
          mime: typeof document.mime === "string" ? document.mime : "",
          kind: typeof document.kind === "string" ? document.kind : null,
          sourceTable: typeof document.sourceTable === "string" ? document.sourceTable : null,
          linkedEntityType: typeof document.linkedEntityType === "string" ? document.linkedEntityType : null,
          storageBucket: typeof document.storageBucket === "string" ? document.storageBucket : null,
          storagePath: typeof document.storagePath === "string" ? document.storagePath : null,
          hasContent: Boolean(documentBytes),
          title: typeof document.title === "string" ? document.title : null,
        }
      : null,
  });
  if (!planned.ok) return { ok: false, status: 400, error: planned.error };

  let attachment = planned.attachment;
  if (attachment) {
    const stored = await guardStoredDocument(svc, params.orgId, attachment, document);
    if (!stored.ok) return stored;
    attachment = stored.attachment;
    if (documentBytes) {
      const uploaded = await storeDraftDocument(svc, params.orgId, planned.draftKey, attachment, documentBytes);
      if (!uploaded.ok) return uploaded;
      attachment = { ...attachment, path: uploaded.path, bucket: WHATSAPP_DRAFT_BUCKET };
    }
  }

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
    attachment_filename: attachment?.filename ?? null,
    attachment_mime: attachment?.mime ?? null,
    attachment_bucket: attachment?.bucket ?? null,
    attachment_path: attachment?.path ?? null,
    attachment_kind: attachment?.kind ?? null,
    attachment_source_table: attachment?.sourceTable ?? null,
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
    return {
      ok: false,
      status: 503,
      error: "Triangle cannot file this yet. Migrations 054 and 055 have not been applied.",
    };
  }
  if (error || !data) {
    if (documentBytes && attachment?.path) {
      await svc.storage.from(WHATSAPP_DRAFT_BUCKET).remove([attachment.path]);
    }
    return { ok: false, status: 500, error: "Could not store that draft." };
  }
  return { ok: true, draftId: data.id as string, duplicate: false, sends: false };
}

async function guardStoredDocument(
  svc: Svc,
  orgId: string,
  attachment: NormalizedAttachment,
  document: Record<string, unknown> | null,
): Promise<{ ok: true; attachment: NormalizedAttachment } | { ok: false; status: number; error: string }> {
  if (!attachment) return { ok: false, status: 400, error: "That document is not usable." };
  if (!attachment.path) return { ok: true, attachment };
  const { data, error } = await svc
    .from("documents")
    .select("file_name, document_category, linked_entity_type, title, storage_bucket")
    .eq("organization_id", orgId)
    .eq("storage_path", attachment.path)
    .limit(1)
    .maybeSingle();
  if (error && !schemaMissing(error)) {
    return { ok: false, status: 400, error: "Could not check that document against worker records." };
  }
  const verdict = workerProfileAttachment({
    filename: (data?.file_name as string | undefined) || attachment.filename,
    kind: (data?.document_category as string | undefined) || attachment.kind,
    sourceTable:
      data?.linked_entity_type === "worker"
        ? "workers"
        : (typeof document?.sourceTable === "string" ? document.sourceTable : attachment.sourceTable),
    linkedEntityType: (data?.linked_entity_type as string | undefined) ?? null,
    storagePath: attachment.path,
    title: (data?.title as string | undefined) ?? null,
  });
  if (verdict.blocked) return { ok: false, status: 400, error: verdict.reason };
  return { ok: true, attachment };
}

async function storeDraftDocument(
  svc: Svc,
  orgId: string,
  draftKey: string,
  attachment: { filename: string; mime: string },
  bytes: Buffer,
): Promise<{ ok: true; path: string } | { ok: false; status: number; error: string }> {
  const safeKey = draftKey.replace(/[^A-Za-z0-9_-]+/g, "-");
  const path = `${orgId}/${safeKey}/${attachment.filename}`;
  const { error } = await svc.storage.from(WHATSAPP_DRAFT_BUCKET).upload(path, bytes, {
    contentType: attachment.mime,
    upsert: true,
  });
  if (error) {
    console.error("whatsapp: could not store the draft document. Nothing was sent.");
    return {
      ok: false,
      status: 503,
      error: "Could not store that document. Apply migration 055 so the whatsapp-drafts bucket exists.",
    };
  }
  return { ok: true, path };
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
    .select(
      "id, status, to_number, body, template_name, send_attempted_at, direction, attachment_filename, attachment_mime, attachment_bucket, attachment_path, attachment_kind, attachment_source_table",
    )
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

  const outboundText = params.text || String(draft.body ?? "");
  const words = draftTextAllowed(outboundText);
  if (!words.ok) return { ok: false, status: 400, error: words.error };

  const filename = (draft.attachment_filename as string | null) ?? null;
  const attachmentPath = (draft.attachment_path as string | null) ?? null;
  const attachmentBucket = (draft.attachment_bucket as string | null) ?? null;
  if (filename && (!attachmentPath || !attachmentBucket)) {
    return { ok: false, status: 409, error: "That draft names a document but the file is not stored." };
  }
  if (filename && attachmentPath) {
    const verdict = workerProfileAttachment({
      filename,
      kind: (draft.attachment_kind as string | null) ?? null,
      sourceTable: (draft.attachment_source_table as string | null) ?? null,
      storageBucket: attachmentBucket,
      storagePath: attachmentPath,
    });
    if (verdict.blocked) return { ok: false, status: 400, error: verdict.reason };
    const guarded = await guardStoredDocument(
      svc,
      params.orgId,
      {
        filename,
        mime: String(draft.attachment_mime ?? "application/octet-stream"),
        kind: (draft.attachment_kind as string | null) ?? null,
        sourceTable: (draft.attachment_source_table as string | null) ?? null,
        bucket: attachmentBucket ?? "documents",
        path: attachmentPath,
      },
      null,
    );
    if (!guarded.ok) return guarded;
  }

  const decision = decideSend({
    actor: params.actor,
    approve: params.approve,
    status: String(draft.status),
    to: String(draft.to_number),
    text: outboundText,
    draftTemplate: (draft.template_name as string | null) ?? null,
    document: filename
      ? { filename, mime: String(draft.attachment_mime ?? "application/octet-stream") }
      : null,
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
      body: decision.mode === "template" ? (draft.body as string | null) : decision.body,
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

  let graphBody: Record<string, unknown>;
  if (decision.mode === "document") {
    const file = await downloadDraftFile(svc, attachmentBucket ?? "", attachmentPath ?? "");
    if (!file.ok) {
      await releaseSendClaim(svc, params.orgId, params.draftId, file.error);
      return file;
    }
    const media = await uploadGraphMedia({
      version: env.graphVersion,
      phoneNumberId: env.phoneNumberId,
      accessToken: env.accessToken,
      filename: decision.filename,
      mime: decision.mime,
      bytes: file.bytes,
    });
    if (!media.ok) {
      await releaseSendClaim(svc, params.orgId, params.draftId, media.error);
      return { ok: false, status: media.status, error: media.error };
    }
    graphBody = graphDocumentBody({
      to: decision.to,
      mediaId: media.mediaId,
      filename: decision.filename,
      caption: decision.body,
    });
  } else {
    graphBody = graphSendBody(decision);
  }

  const graph = await postToGraph({
    version: env.graphVersion,
    phoneNumberId: env.phoneNumberId,
    accessToken: env.accessToken,
    body: graphBody,
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

async function releaseSendClaim(svc: Svc, orgId: string, draftId: string, error: string): Promise<void> {
  await svc
    .from("whatsapp_messages")
    .update({ send_attempted_at: null, error, updated_at: new Date().toISOString() })
    .eq("id", draftId)
    .eq("org_id", orgId)
    .eq("status", "draft");
}

async function downloadDraftFile(
  svc: Svc,
  bucket: string,
  path: string,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; status: number; error: string }> {
  const { data, error } = await svc.storage.from(bucket).download(path);
  if (error || !data) {
    return { ok: false, status: 409, error: "The document is no longer stored. Nothing was sent." };
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength < 1) {
    return { ok: false, status: 409, error: "The document was empty. Nothing was sent." };
  }
  return { ok: true, bytes };
}

async function uploadGraphMedia(args: {
  version: string;
  phoneNumberId: string;
  accessToken: string;
  filename: string;
  mime: string;
  bytes: Uint8Array;
}): Promise<{ ok: true; mediaId: string } | { ok: false; status: number; error: string; ambiguous: boolean }> {
  try {
    const copy = new ArrayBuffer(args.bytes.byteLength);
    new Uint8Array(copy).set(args.bytes);
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set("type", args.mime);
    form.set("file", new File([copy], args.filename, { type: args.mime }));
    const res = await fetch(graphMediaUrl(args.version, args.phoneNumberId), {
      method: "POST",
      headers: { Authorization: `Bearer ${args.accessToken}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
    if (res.ok && typeof json?.id === "string" && json.id) return { ok: true, mediaId: json.id };
    const message = typeof json?.error?.message === "string" ? json.error.message.slice(0, 300) : "";
    return {
      ok: false,
      status: res.status >= 500 ? 502 : 400,
      error: message || "WhatsApp did not accept the document. Nothing was sent.",
      ambiguous: false,
    };
  } catch {
    return {
      ok: false,
      status: 502,
      error: "WhatsApp did not accept the document. Nothing was sent.",
      ambiguous: false,
    };
  }
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
    .select(
      "id, wamid, direction, from_number, to_number, body, wa_timestamp, status, person_id, reply_to_wamid, attachment_filename",
    )
    .eq("org_id", orgId)
    .eq(column, id)
    .order("wa_timestamp", { ascending: false })
    .limit(40);
  if (schemaMissing(error)) {
    console.error(
      "whatsapp: whatsapp_messages is missing columns or the table (migrations 054 and 055). Nothing to show.",
    );
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
        documentName: (row.attachment_filename as string | null) ?? null,
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
