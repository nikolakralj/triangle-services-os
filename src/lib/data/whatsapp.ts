import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { getOpenAIClient } from "@/lib/ai/openai-client";
import { wakeEmployee } from "@/lib/data/bot-runtime";
import { inboundAnswered, type WhatsAppRecord } from "@/lib/whatsapp/view";
import {
  decideAutoSend,
  decideSend,
  graphDocumentBody,
  graphMediaUrl,
  graphMessagesUrl,
  graphSendBody,
  HELD_PREFIX,
  heldReasonOf,
  isAutoSentAudit,
  matchPersonByPhone,
  nextStatus,
  parseWebhook,
  pickOpenCase,
  planDraft,
  planInbound,
  readWhatsAppEnv,
  schemaMissing,
  serviceWindowOpen,
  webhookPostDecision,
  workerDocumentMayLeave,
  type ParsedStatus,
  type ParsedText,
  type SendPlan,
  type WakeContext,
  type WaStatus,
  type WhatsAppEnv,
} from "@/lib/whatsapp/pilot";
import {
  AUTO_REPLIES_PER_MESSAGE,
  decodeDraftDocument,
  decideInbound,
  draftTextAllowed,
  driveNote,
  employeeKeyOf,
  employeeMayDraftWhatsApp,
  parseModelRoute,
  permissionFor,
  refusalDraftFor,
  ROUTE_MODEL_INSTRUCTIONS,
  storedDocumentFilename,
  WHATSAPP_DRAFT_BUCKET,
  WHATSAPP_DRAFT_ENDPOINT,
  workerProfileAttachment,
  type AttachmentInput,
  type InboundPlan,
  type NormalizedAttachment,
  type WorkforceMember,
} from "@/lib/whatsapp/routing";

// ---------------------------------------------------------------------------
// WhatsApp pilot, on the database. The rules live in src/lib/whatsapp/pilot.ts
// and src/lib/whatsapp/routing.ts. This file stores an inbound that Meta
// signed, routes it to Scout, Bob, or Hanna, and wakes that employee once.
// A reply to the owner's or the field sender's own message is posted to
// Graph as it is filed, when decideAutoSend allows it. Every other reply is
// a draft, posted only after a person approves it. A missing table or
// missing env is a 503 with a log, never a crash and never a send. A CV or
// worker profile is refused before it is stored, and again before it could
// be sent, unless the owner or the field sender asked for that person's by
// name in the message being answered.
// ---------------------------------------------------------------------------

type Svc = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * The only way a WhatsApp message gets into Triangle. Meta's signature over
 * the raw body is checked here, in the function that stores, so no caller
 * can store a message — or cause a reply to one — without it. Without the
 * app secret there is nothing to check against, and nothing is stored.
 */
export async function ingestWhatsAppWebhook(
  rawBody: string,
  signatureHeader: string | null,
): Promise<{ status: 200 | 401 | 503 }> {
  const env = readWhatsAppEnv(process.env);
  const signed = webhookPostDecision(signatureHeader, rawBody, env.appSecret);
  if (signed === 503) {
    console.error("whatsapp: WHATSAPP_APP_SECRET is not set. Inbound was not stored.");
    return { status: 503 };
  }
  if (signed === 401) {
    console.error("whatsapp: the signature did not match. Inbound was not stored.");
    return { status: 401 };
  }
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
      const outcome = await storeInbound(svc, env.orgId, env, business, message);
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
  access: WhatsAppEnv,
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
    allowlist: access.allowlist,
  });

  const alreadyRefused = String(existing?.route_reason ?? "").startsWith("Refused:");
  if (alreadyRefused && !plan.store) {
    await ensureRefusalDraft(svc, orgId, business, message, filing, String(existing?.route_reason ?? ""));
    return "ok";
  }

  const workforce = plan.wake ? await activeWorkforce(svc, orgId) : [];
  const storedRoute = routeFromRow(existing?.routed_employee, existing?.route_reason);
  let route = plan.wake
    ? (storedRoute ?? (await classifyInbound(message.from, message.text, access, workforce)))
    : storedRoute;
  if (plan.wake && storedRoute?.employee) {
    route = decideInbound({
      text: message.text,
      from: message.from,
      model: { employee: storedRoute.employee, reason: storedRoute.reason },
      senders: access.senders,
      unmatched: access.unmatched,
      workforce,
    });
  }

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
      if (String(again.data?.route_reason ?? "").startsWith("Refused:")) {
        await ensureRefusalDraft(svc, orgId, business, message, filing, String(again.data?.route_reason ?? ""));
        return "ok";
      }
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
  if (route.action === "refuse") {
    await ensureRefusalDraft(svc, orgId, business, message, filing, route.reason, route.draftText);
    console.error("whatsapp: inbound refused. Flagged for the owner. Nobody was woken. Nothing was sent.");
    return "ok";
  }
  if (!route.employee) return "ok";
  const sender = permissionFor(message.from, access.senders, access.unmatched);
  const folderOnFile =
    sender.driveFolders === "all" || sender.driveFolders.length > 0
      ? null
      : await organisationName(svc, orgId);
  await wakeRoutedEmployee(svc, orgId, id, route, {
    messageId: message.wamid,
    sender: message.from,
    text: message.text,
    personId: filing.personId,
    caseId: filing.missionId,
    draftEndpoint: WHATSAPP_DRAFT_ENDPOINT,
    employee: route.employee,
    reason: route.reason,
    handoffNote: route.handoffNote,
    replySends: access.autoSend && Boolean(access.appSecret) && sender.repliesSendWithoutApproval,
    senderNote: driveNote(sender, folderOnFile),
  });
  return "ok";
}

function routeFromRow(employee: unknown, reason: unknown): InboundPlan | null {
  if (typeof employee !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(employee)) return null;
  return {
    action: "route",
    employee,
    reason: typeof reason === "string" && reason.trim() ? reason : employee,
    unsure: false,
    handoffNote: null,
    draftText: null,
    flagOwner: false,
  };
}

/**
 * Model first, when a key is set. A missing key, a timeout, or an unsure
 * answer uses the keyword rule. The keyword rule sends an unclear message
 * to Hanna. This never throws and never sends.
 */
async function classifyInbound(
  from: string,
  text: string,
  access: WhatsAppEnv,
  workforce: readonly WorkforceMember[],
): Promise<InboundPlan> {
  const model = await askRouteModel(text);
  return decideInbound({
    text,
    from,
    model,
    senders: access.senders,
    unmatched: access.unmatched,
    workforce,
  });
}

/** Every active employee, so a name that is off a sender's list is recognised. */
async function activeWorkforce(svc: Svc, orgId: string): Promise<WorkforceMember[]> {
  const { data } = await svc
    .from("agent_instances")
    .select("role_key, display_name")
    .eq("org_id", orgId)
    .eq("status", "active");
  return (data ?? []).map((row) => ({
    roleKey: String(row.role_key ?? ""),
    displayName: String(row.display_name ?? ""),
  }));
}

/** The organisation's own name: the field sender's Drive folder when none is configured. */
async function organisationName(svc: Svc, orgId: string): Promise<string | null> {
  const { data } = await svc.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  return name || null;
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
  route: InboundPlan,
  ctx: WakeContext,
): Promise<void> {
  const { data: employees } = await svc
    .from("agent_instances")
    .select("id, role_key, display_name, status")
    .eq("org_id", orgId)
    .eq("status", "active");
  const employee = (employees ?? []).find((row) => {
    const key = employeeKeyOf({
      roleKey: String(row.role_key ?? ""),
      displayName: String(row.display_name ?? ""),
    });
    return key === route.employee;
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
      const who = route.employee ?? "Hanna";
      const handoff = ctx.handoffNote ? ` ${ctx.handoffNote}.` : "";
      const note = ctx.senderNote ? ` ${ctx.senderNote}` : "";
      const rule = ctx.replySends
        ? `File your reply at ${ctx.draftEndpoint} with replyTo ${ctx.messageId}.${handoff} It goes to that number as you file it; nobody approves it first. Attach a file only when this message asks for one, and a person's CV or profile only when it asks for that person's by name.`
        : `Draft at ${ctx.draftEndpoint}.${handoff} Do not send. No CV or worker profile.`;
      const { data: created, error } = await svc
        .from("agent_assignments")
        .insert({
          org_id: orgId,
          agent_instance_id: employee.id,
          mission_id: ctx.caseId,
          title: "WhatsApp",
          objective: `A WhatsApp message arrived (${ctx.messageId}) from ${ctx.sender}. Routed to ${who}: ${route.reason}. Person ${ctx.personId ?? "unknown"}. Case ${ctx.caseId ?? "none"}. ${rule}${note}`,
          expected_output: ctx.replySends
            ? "One reply. It is sent to the number that wrote as you file it. Do not send email when the handoff forbids it."
            : "A draft reply. Do not send. No CV or worker profile. Do not send email when the handoff forbids it.",
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
            reply_sends: ctx.replySends,
            ...(ctx.handoffNote ? { handoff_note: ctx.handoffNote } : {}),
            ...(ctx.senderNote ? { sender_note: ctx.senderNote } : {}),
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
      replySends: ctx.replySends,
      ...(ctx.handoffNote ? { handoffNote: ctx.handoffNote } : {}),
      ...(ctx.senderNote ? { senderNote: ctx.senderNote } : {}),
    },
  });
}

async function ensureRefusalDraft(
  svc: Svc,
  orgId: string,
  business: string,
  message: ParsedText,
  filing: { personId: string | null; missionId: string | null },
  reason: string,
  draftText?: string | null,
): Promise<void> {
  // A refusal is never sent from here. It waits for the owner, whoever wrote.
  const text = draftText?.trim() || refusalDraftFor(reason);
  const words = draftTextAllowed(text);
  if (!words.ok) {
    console.error("whatsapp: the refusal draft was blocked by the data rule. Nothing was sent.");
    return;
  }
  const draftKey = `refuse|${message.wamid}`;
  const { data: existing, error: readError } = await svc
    .from("whatsapp_messages")
    .select("id")
    .eq("org_id", orgId)
    .eq("draft_key", draftKey)
    .maybeSingle();
  if (schemaMissing(readError)) return;
  if (existing?.id) return;
  const { error } = await svc.from("whatsapp_messages").insert({
    org_id: orgId,
    direction: "outbound",
    from_number: business,
    to_number: message.from,
    body: text,
    wa_timestamp: new Date().toISOString(),
    status: "draft",
    person_id: filing.personId,
    mission_id: filing.missionId,
    reply_to_wamid: message.wamid,
    draft_key: draftKey,
    route_reason: reason,
  });
  if (error?.code === "23505") return;
  if (error) console.error("whatsapp: the refusal draft was not stored. Nothing was sent.");
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

export type WhatsAppDraftFiling =
  | {
      ok: true;
      draftId: string;
      duplicate: boolean;
      /** True when the reply went out: WhatsApp accepted it. */
      sends: boolean;
      status: "draft" | "sent" | "failed";
      wamid: string | null;
      /** Why it is waiting for a person. Null when it was sent. */
      held: string | null;
    }
  | { ok: false; status: number; error: string };

type Filed = Extract<WhatsAppDraftFiling, { ok: true }>;

interface StoredInbound {
  from: string;
  text: string;
  woken: boolean;
  routeReason: string | null;
  personId: string | null;
  missionId: string | null;
}

/**
 * The stored message a reply answers. It is on file only because Meta signed
 * the webhook that carried it: ingestWhatsAppWebhook is the one writer.
 */
async function inboundByWamid(
  svc: Svc,
  orgId: string,
  wamid: string,
): Promise<{ ok: true; inbound: StoredInbound | null } | { ok: false; missing: boolean }> {
  const { data, error } = await svc
    .from("whatsapp_messages")
    .select("from_number, body, woken_at, route_reason, person_id, mission_id")
    .eq("org_id", orgId)
    .eq("wamid", wamid)
    .eq("direction", "inbound")
    .maybeSingle();
  if (error) return { ok: false, missing: schemaMissing(error) };
  if (!data) return { ok: true, inbound: null };
  return {
    ok: true,
    inbound: {
      from: String(data.from_number ?? ""),
      text: String(data.body ?? ""),
      woken: Boolean(data.woken_at),
      routeReason: (data.route_reason as string | null) ?? null,
      personId: (data.person_id as string | null) ?? null,
      missionId: (data.mission_id as string | null) ?? null,
    },
  };
}

export async function fileWhatsAppDraft(params: {
  orgId: string;
  agentInstanceId: string;
  body: unknown;
}): Promise<WhatsAppDraftFiling> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, status: 503, error: "Database unavailable." };
  const env = readWhatsAppEnv(process.env);

  const { data: employee } = await svc
    .from("agent_instances")
    .select("role_key, display_name, status")
    .eq("id", params.agentInstanceId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  const identity = {
    roleKey: String(employee?.role_key ?? ""),
    displayName: String(employee?.display_name ?? ""),
  };
  if (!employee || employee.status !== "active" || !employeeMayDraftWhatsApp(identity)) {
    return { ok: false, status: 403, error: "Only Scout or Hanna can draft a WhatsApp reply." };
  }
  const employeeKey = employeeKeyOf(identity);

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

  let inbound: StoredInbound | null = null;
  if (replyTo) {
    const found = await inboundByWamid(svc, params.orgId, replyTo);
    if (!found.ok) {
      return found.missing
        ? { ok: false, status: 503, error: "Triangle cannot file this yet. Migration 054 has not been applied." }
        : { ok: false, status: 503, error: "Could not read the message this replies to. Nothing was filed." };
    }
    inbound = found.inbound;
    if (inbound) {
      if (!to) to = inbound.from;
      personId = personId ?? inbound.personId;
      missionId = missionId ?? inbound.missionId;
    }
  }

  const requested = document
    ? await resolveDraftDocument(svc, params.orgId, document, Boolean(documentBytes))
    : null;
  if (requested && !requested.ok) return requested;

  let workerDocumentAsked = false;
  if (requested?.workerDocument) {
    const allowed = workerDocumentMayLeave({
      senders: env.senders,
      inbound: inbound ? { from: inbound.from, text: inbound.text } : null,
      to,
      workerName: requested.worker?.name ?? null,
    });
    if (!allowed.ok) return { ok: false, status: 400, error: allowed.error };
    workerDocumentAsked = true;
    // Filed on the record it belongs to, so the person's page shows who was sent it.
    personId = requested.worker?.id ?? personId;
  }

  const planned = planDraft({
    agentId: params.agentInstanceId,
    to,
    text,
    replyTo,
    templateName,
    attachment: requested?.input ?? null,
    workerDocumentAsked,
  });
  if (!planned.ok) return { ok: false, status: 400, error: planned.error };

  let attachment = planned.attachment;
  if (attachment && documentBytes) {
    const uploaded = await storeDraftDocument(svc, params.orgId, planned.draftKey, attachment, documentBytes);
    if (!uploaded.ok) return uploaded;
    attachment = { ...attachment, path: uploaded.path, bucket: WHATSAPP_DRAFT_BUCKET };
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
      .select(
        "id, status, wamid, send_attempted_at, body, to_number, reply_to_wamid, template_name, attachment_filename, attachment_mime, attachment_bucket, attachment_path, attachment_kind, attachment_source_table",
      )
      .eq("org_id", params.orgId)
      .eq("draft_key", planned.draftKey)
      .maybeSingle();
    const row = existing.data;
    if (row?.id) {
      const draftId = String(row.id);
      const wamid = (row.wamid as string | null) ?? null;
      if (row.status === "failed") {
        return {
          ok: true,
          draftId,
          duplicate: true,
          sends: false,
          status: "failed",
          wamid,
          held: "WhatsApp reported that reply as failed. It was not sent again.",
        };
      }
      if (row.status !== "draft") {
        return { ok: true, draftId, duplicate: true, sends: true, status: "sent", wamid, held: null };
      }
      if (row.send_attempted_at) {
        return {
          ok: true,
          draftId,
          duplicate: true,
          sends: false,
          status: "draft",
          wamid: null,
          held: "A send was already attempted and WhatsApp did not confirm it. Check the phone before asking for a new draft.",
        };
      }
      return considerAutoSend(svc, params.orgId, env, {
        draftId,
        duplicate: true,
        to: String(row.to_number ?? planned.to),
        text: String(row.body ?? planned.text),
        replyTo: (row.reply_to_wamid as string | null) ?? null,
        templateName: (row.template_name as string | null) ?? null,
        attachment: attachmentOnRow(row),
        employeeKey,
      });
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
  return considerAutoSend(svc, params.orgId, env, {
    draftId: data.id as string,
    duplicate: false,
    to: planned.to,
    text: planned.text,
    replyTo,
    templateName: templateName?.trim() || null,
    attachment,
    employeeKey,
  });
}

function attachmentOnRow(row: Record<string, unknown>): NormalizedAttachment | null {
  const filename = typeof row.attachment_filename === "string" ? row.attachment_filename : "";
  const path = typeof row.attachment_path === "string" ? row.attachment_path : "";
  const bucket = typeof row.attachment_bucket === "string" ? row.attachment_bucket : "";
  if (!filename) return null;
  return {
    filename,
    mime:
      typeof row.attachment_mime === "string" && row.attachment_mime
        ? row.attachment_mime
        : "application/octet-stream",
    kind: typeof row.attachment_kind === "string" ? row.attachment_kind : null,
    sourceTable: typeof row.attachment_source_table === "string" ? row.attachment_source_table : null,
    bucket,
    path: path || null,
  };
}

interface StoredDocumentRecord {
  fileName: string | null;
  category: string | null;
  linkedType: string | null;
  linkedId: string | null;
  title: string | null;
}

/** What Triangle's own record says about a stored file. Null when the file has no record. */
async function storedDocumentRecord(
  svc: Svc,
  orgId: string,
  path: string,
): Promise<{ ok: true; record: StoredDocumentRecord | null } | { ok: false }> {
  const { data, error } = await svc
    .from("documents")
    .select("file_name, document_category, linked_entity_type, linked_entity_id, title")
    .eq("organization_id", orgId)
    .eq("storage_path", path)
    .limit(1)
    .maybeSingle();
  if (error && !schemaMissing(error)) return { ok: false };
  if (!data) return { ok: true, record: null };
  return {
    ok: true,
    record: {
      fileName: (data.file_name as string | null) ?? null,
      category: (data.document_category as string | null) ?? null,
      linkedType: (data.linked_entity_type as string | null) ?? null,
      linkedId: (data.linked_entity_id as string | null) ?? null,
      title: (data.title as string | null) ?? null,
    },
  };
}

async function workerOnFile(
  svc: Svc,
  orgId: string,
  workerId: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await svc
    .from("workers")
    .select("id, full_name")
    .eq("id", workerId)
    .eq("organization_id", orgId)
    .maybeSingle();
  const name = typeof data?.full_name === "string" ? data.full_name.trim() : "";
  return data?.id && name ? { id: String(data.id), name } : null;
}

type ResolvedDocument =
  | {
      ok: true;
      input: AttachmentInput;
      /** True for a CV, a profile, or any other file on a worker's record. */
      workerDocument: boolean;
      /** Whose it is, from Triangle's own record. Null when that is not known. */
      worker: { id: string; name: string } | null;
    }
  | { ok: false; status: number; error: string };

function textOf(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * The file a reply names, and whose it is. `document.workerId` asks for a
 * person's document from their own record — the only way a CV can be
 * attached, because only then does Triangle know whose it is. A file the
 * employee uploads, or a stored path, is checked against the record too.
 */
async function resolveDraftDocument(
  svc: Svc,
  orgId: string,
  document: Record<string, unknown>,
  hasContent: boolean,
): Promise<ResolvedDocument> {
  const givenWorker = textOf(document.workerId)?.trim() ?? "";
  if (givenWorker) {
    if (!UUID.test(givenWorker)) {
      return { ok: false, status: 400, error: "That is not a person's id. Use the id that lookup gives you." };
    }
    if (hasContent || textOf(document.storagePath)?.trim()) {
      return { ok: false, status: 400, error: "Name the person whose document it is, or attach a file, not both." };
    }
    const worker = await workerOnFile(svc, orgId, givenWorker);
    if (!worker) return { ok: false, status: 400, error: "That person is not in this organisation." };
    const kind = (textOf(document.kind) ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_") || "cv";
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(kind)) {
      return { ok: false, status: 400, error: "That document kind is not usable." };
    }
    const { data, error } = await svc
      .from("documents")
      .select("file_name, document_category, storage_bucket, storage_path, is_current_version, created_at")
      .eq("organization_id", orgId)
      .eq("linked_entity_type", "worker")
      .eq("linked_entity_id", worker.id)
      .eq("document_category", kind)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) return { ok: false, status: 503, error: "Could not read that person's documents." };
    const row = (data ?? []).find((item) => item.is_current_version !== false) ?? null;
    if (!row?.storage_path) {
      return {
        ok: false,
        status: 404,
        error: kind === "cv" ? "No CV is on file for that person." : "No document of that kind is on file for that person.",
      };
    }
    const filename = storedDocumentFilename(String(row.file_name ?? ""));
    if (!filename) return { ok: false, status: 400, error: "That file type cannot be attached on WhatsApp." };
    return {
      ok: true,
      workerDocument: true,
      worker,
      input: {
        filename,
        mime: null,
        kind: String(row.document_category ?? kind),
        sourceTable: "workers",
        linkedEntityType: "worker",
        storageBucket: String(row.storage_bucket ?? "") || "documents",
        storagePath: String(row.storage_path),
        hasContent: false,
        title: null,
      },
    };
  }

  const input: AttachmentInput = {
    filename: textOf(document.filename) ?? "",
    mime: textOf(document.mime) ?? "",
    kind: textOf(document.kind),
    sourceTable: textOf(document.sourceTable),
    linkedEntityType: textOf(document.linkedEntityType),
    storageBucket: textOf(document.storageBucket),
    storagePath: textOf(document.storagePath),
    hasContent,
    title: textOf(document.title),
  };
  const path = (input.storagePath ?? "").trim();
  if (!hasContent && path) {
    const stored = await storedDocumentRecord(svc, orgId, path);
    if (!stored.ok) {
      return { ok: false, status: 400, error: "Could not check that document against worker records." };
    }
    const record = stored.record;
    if (!record && !path.startsWith(`${orgId}/`)) {
      return { ok: false, status: 400, error: "That file is not on this organisation's record." };
    }
    if (record) {
      const onRecord: AttachmentInput = {
        ...input,
        kind: record.category || input.kind,
        linkedEntityType: record.linkedType ?? input.linkedEntityType,
        sourceTable: record.linkedType === "worker" ? "workers" : input.sourceTable,
        title: record.title ?? input.title,
      };
      if (record.linkedType === "worker" && record.linkedId) {
        const worker = await workerOnFile(svc, orgId, record.linkedId);
        const filename = storedDocumentFilename(record.fileName ?? "") ?? input.filename;
        return { ok: true, workerDocument: true, worker, input: { ...onRecord, filename } };
      }
      const named = workerProfileAttachment({ ...onRecord, filename: record.fileName || input.filename });
      return { ok: true, workerDocument: named.blocked, worker: null, input: onRecord };
    }
  }
  return { ok: true, workerDocument: workerProfileAttachment(input).blocked, worker: null, input };
}

/**
 * Whose file is on a stored draft, read again from Triangle's record at the
 * moment it would be sent. The draft row is not trusted to say.
 */
async function attachmentFacts(
  svc: Svc,
  orgId: string,
  attachment: NormalizedAttachment,
): Promise<{ ok: true; workerDocument: boolean; workerName: string | null } | { ok: false; error: string }> {
  let record: StoredDocumentRecord | null = null;
  if (attachment.path) {
    const stored = await storedDocumentRecord(svc, orgId, attachment.path);
    if (!stored.ok) return { ok: false, error: "Could not check that document against worker records." };
    record = stored.record;
    if (!record && !attachment.path.startsWith(`${orgId}/`)) {
      return { ok: false, error: "That file is not on this organisation's record." };
    }
  }
  const verdict = workerProfileAttachment({
    filename: record?.fileName || attachment.filename,
    kind: record?.category || attachment.kind,
    sourceTable: record?.linkedType === "worker" ? "workers" : attachment.sourceTable,
    linkedEntityType: record?.linkedType ?? null,
    storageBucket: attachment.bucket,
    storagePath: attachment.path,
    title: record?.title ?? null,
  });
  if (!verdict.blocked) return { ok: true, workerDocument: false, workerName: null };
  const worker =
    record?.linkedType === "worker" && record.linkedId
      ? await workerOnFile(svc, orgId, record.linkedId)
      : null;
  return { ok: true, workerDocument: true, workerName: worker?.name ?? null };
}

async function noteHeld(svc: Svc, orgId: string, draftId: string, reason: string): Promise<void> {
  await svc
    .from("whatsapp_messages")
    .update({ route_reason: `${HELD_PREFIX}: ${reason}`, updated_at: new Date().toISOString() })
    .eq("id", draftId)
    .eq("org_id", orgId)
    .eq("status", "draft");
}

/**
 * After the reply is stored as a draft. A reply to the owner's or the field
 * sender's own message that decideAutoSend accepts is posted to Graph and
 * marked sent. Everything else stays a draft for a person. A refusal draft
 * is written by ensureRefusalDraft and never comes through here.
 */
async function considerAutoSend(
  svc: Svc,
  orgId: string,
  env: WhatsAppEnv,
  draft: {
    draftId: string;
    duplicate: boolean;
    to: string;
    text: string;
    replyTo: string | null;
    templateName: string | null;
    attachment: NormalizedAttachment | null;
    employeeKey: string | null;
  },
): Promise<Filed> {
  const waits = (held: string): Filed => ({
    ok: true,
    draftId: draft.draftId,
    duplicate: draft.duplicate,
    sends: false,
    status: "draft",
    wamid: null,
    held,
  });

  let inbound: StoredInbound | null = null;
  let lastInboundAt: string | null = null;
  let repliesAlreadySent = 0;
  if (draft.replyTo) {
    const found = await inboundByWamid(svc, orgId, draft.replyTo);
    if (!found.ok) return waits("Could not read the message this replies to, so it waits for a person.");
    inbound = found.inbound;
  }
  if (inbound && draft.replyTo) {
    const last = await svc
      .from("whatsapp_messages")
      .select("wa_timestamp")
      .eq("org_id", orgId)
      .eq("direction", "inbound")
      .eq("from_number", inbound.from)
      .order("wa_timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last.error) return waits("Could not confirm the 24-hour window, so it waits for a person.");
    lastInboundAt = (last.data?.wa_timestamp as string | undefined) ?? null;

    const gone = await svc
      .from("whatsapp_messages")
      .select("id")
      .eq("org_id", orgId)
      .eq("direction", "outbound")
      .eq("reply_to_wamid", draft.replyTo)
      .in("status", ["sent", "delivered", "read"])
      .is("approved_by", null)
      .limit(AUTO_REPLIES_PER_MESSAGE + 1);
    if (gone.error) return waits("Could not count the replies already sent, so it waits for a person.");
    repliesAlreadySent = (gone.data ?? []).length;
  }

  let document: {
    filename: string;
    mime: string;
    workerDocument: boolean;
    workerName: string | null;
  } | null = null;
  if (draft.attachment) {
    const facts = await attachmentFacts(svc, orgId, draft.attachment);
    if (!facts.ok) return waits(facts.error);
    document = {
      filename: draft.attachment.filename,
      mime: draft.attachment.mime,
      workerDocument: facts.workerDocument,
      workerName: facts.workerName,
    };
  }

  const decision = decideAutoSend({
    enabled: env.autoSend,
    signatureChecked: Boolean(env.appSecret),
    senders: env.senders,
    inbound: inbound
      ? { from: inbound.from, text: inbound.text, woken: inbound.woken, routeReason: inbound.routeReason }
      : null,
    employee: draft.employeeKey,
    to: draft.to,
    text: draft.text,
    templateName: draft.templateName,
    lastInboundAt,
    now: new Date(),
    repliesAlreadySent,
    document,
  });
  if (!decision.send) {
    if (decision.granted) await noteHeld(svc, orgId, draft.draftId, decision.reason);
    return waits(decision.reason);
  }

  if (!env.phoneNumberId || !env.accessToken) {
    console.error("whatsapp: phone number id or access token is missing. The reply stayed a draft.");
    const reason = "WhatsApp sending is not configured.";
    await noteHeld(svc, orgId, draft.draftId, reason);
    return waits(reason);
  }
  if (decision.mode === "document" && (!draft.attachment?.path || !draft.attachment.bucket)) {
    const reason = "The file on that reply is not stored.";
    await noteHeld(svc, orgId, draft.draftId, reason);
    return waits(reason);
  }

  const plan: Extract<SendPlan, { ok: true }> =
    decision.mode === "document"
      ? {
          ok: true,
          mode: "document",
          to: decision.to,
          body: decision.body,
          filename: decision.filename,
          mime: decision.mime,
        }
      : { ok: true, mode: "text", to: decision.to, body: decision.body };

  const sent = await transmitWhatsAppDraft({
    svc,
    orgId,
    draftId: draft.draftId,
    env: { graphVersion: env.graphVersion, phoneNumberId: env.phoneNumberId, accessToken: env.accessToken },
    plan,
    approvedBy: null,
    audit: decision.audit,
    attachmentBucket: draft.attachment?.bucket ?? null,
    attachmentPath: draft.attachment?.path ?? null,
    priorTemplate: draft.templateName,
    priorBody: draft.text,
  });
  if (!sent.ok) {
    if (sent.status === 409) {
      // Another filing of the same reply may have sent it in the meantime.
      const again = await svc
        .from("whatsapp_messages")
        .select("status, wamid")
        .eq("id", draft.draftId)
        .eq("org_id", orgId)
        .maybeSingle();
      const wamid = (again.data?.wamid as string | null) ?? null;
      if (wamid && ["sent", "delivered", "read"].includes(String(again.data?.status))) {
        return { ok: true, draftId: draft.draftId, duplicate: true, sends: true, status: "sent", wamid, held: null };
      }
    }
    return waits(sent.error);
  }
  return {
    ok: true,
    draftId: draft.draftId,
    duplicate: draft.duplicate,
    sends: true,
    status: "sent",
    wamid: sent.wamid,
    held: null,
  };
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
      "id, status, to_number, body, template_name, send_attempted_at, direction, reply_to_wamid, attachment_filename, attachment_mime, attachment_bucket, attachment_path, attachment_kind, attachment_source_table",
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

  const filename = (draft.attachment_filename as string | null) ?? null;
  const attachmentPath = (draft.attachment_path as string | null) ?? null;
  const attachmentBucket = (draft.attachment_bucket as string | null) ?? null;
  if (filename && (!attachmentPath || !attachmentBucket)) {
    return { ok: false, status: 409, error: "That draft names a document but the file is not stored." };
  }
  // A person approving does not lift the rule for a worker's document. It is
  // read again from the record here, and it goes only when the owner or the
  // field sender asked for that person's by name, to the number that asked.
  let carriesAskedDocument = false;
  if (filename && attachmentPath) {
    const facts = await attachmentFacts(svc, params.orgId, {
      filename,
      mime: String(draft.attachment_mime ?? "application/octet-stream"),
      kind: (draft.attachment_kind as string | null) ?? null,
      sourceTable: (draft.attachment_source_table as string | null) ?? null,
      bucket: attachmentBucket ?? "documents",
      path: attachmentPath,
    });
    if (!facts.ok) return { ok: false, status: 400, error: facts.error };
    if (facts.workerDocument) {
      const replyTo = (draft.reply_to_wamid as string | null) ?? null;
      const found = replyTo ? await inboundByWamid(svc, params.orgId, replyTo) : null;
      if (found && !found.ok) {
        return { ok: false, status: 503, error: "Could not read the message this replies to. Nothing was sent." };
      }
      const inbound = found?.inbound ?? null;
      const allowed = workerDocumentMayLeave({
        senders: env.senders,
        inbound: inbound ? { from: inbound.from, text: inbound.text } : null,
        to: String(draft.to_number),
        workerName: facts.workerName,
      });
      if (!allowed.ok) return { ok: false, status: 400, error: allowed.error };
      carriesAskedDocument = true;
    }
  }

  const outboundText = params.text || String(draft.body ?? "");
  const words = draftTextAllowed(outboundText, { carriesAskedDocument });
  if (!words.ok) return { ok: false, status: 400, error: words.error };

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

  return transmitWhatsAppDraft({
    svc,
    orgId: params.orgId,
    draftId: params.draftId,
    env: { graphVersion: env.graphVersion, phoneNumberId: env.phoneNumberId, accessToken: env.accessToken },
    plan: decision,
    approvedBy: params.userId,
    audit: null,
    attachmentBucket,
    attachmentPath,
    priorTemplate: (draft.template_name as string | null) ?? null,
    priorBody: (draft.body as string | null) ?? null,
  });
}

/**
 * The one place that posts a stored draft to Graph. It is reached two ways:
 * a person approved it (approvedBy), or decideAutoSend allowed it (audit).
 * The row is claimed first, so one draft is posted at most once.
 */
async function transmitWhatsAppDraft(args: {
  svc: Svc;
  orgId: string;
  draftId: string;
  env: { graphVersion: string; phoneNumberId: string; accessToken: string };
  plan: Extract<SendPlan, { ok: true }>;
  /** The person who approved it. Null when it went without one. */
  approvedBy: string | null;
  /** Why it went without a person. Stored on the row. Null when a person approved it. */
  audit: string | null;
  attachmentBucket: string | null;
  attachmentPath: string | null;
  priorTemplate: string | null;
  priorBody: string | null;
}): Promise<{ ok: true; wamid: string } | { ok: false; status: number; error: string }> {
  const { svc, plan } = args;
  if (!args.approvedBy && !args.audit) {
    return { ok: false, status: 403, error: "Nobody approved that draft, and nothing allows it to go on its own." };
  }
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await svc
    .from("whatsapp_messages")
    .update({
      send_attempted_at: now,
      ...(args.approvedBy ? { approved_at: now, approved_by: args.approvedBy } : {}),
      ...(args.audit ? { route_reason: args.audit } : {}),
      body: plan.mode === "template" ? args.priorBody : plan.body,
      template_name: plan.mode === "template" ? plan.templateName : args.priorTemplate,
      updated_at: now,
    })
    .eq("id", args.draftId)
    .eq("org_id", args.orgId)
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
  if (plan.mode === "document") {
    const file = await downloadDraftFile(svc, args.attachmentBucket ?? "", args.attachmentPath ?? "");
    if (!file.ok) {
      await releaseSendClaim(svc, args.orgId, args.draftId, file.error, Boolean(args.audit));
      return file;
    }
    const media = await uploadGraphMedia({
      version: args.env.graphVersion,
      phoneNumberId: args.env.phoneNumberId,
      accessToken: args.env.accessToken,
      filename: plan.filename,
      mime: plan.mime,
      bytes: file.bytes,
    });
    if (!media.ok) {
      await releaseSendClaim(svc, args.orgId, args.draftId, media.error, Boolean(args.audit));
      return { ok: false, status: media.status, error: media.error };
    }
    graphBody = graphDocumentBody({
      to: plan.to,
      mediaId: media.mediaId,
      filename: plan.filename,
      caption: plan.body,
    });
  } else {
    graphBody = graphSendBody(plan);
  }

  const graph = await postToGraph({
    version: args.env.graphVersion,
    phoneNumberId: args.env.phoneNumberId,
    accessToken: args.env.accessToken,
    body: graphBody,
  });
  if (!graph.ok) {
    if (!graph.ambiguous) {
      await releaseSendClaim(svc, args.orgId, args.draftId, graph.error, Boolean(args.audit));
    } else {
      await svc
        .from("whatsapp_messages")
        .update({
          error: graph.error,
          ...(args.audit
            ? { route_reason: `${HELD_PREFIX}: WhatsApp did not confirm the send. Check the phone before sending again.` }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", args.draftId)
        .eq("org_id", args.orgId);
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
    .eq("id", args.draftId)
    .eq("org_id", args.orgId);
  if (sentError) {
    console.error("whatsapp: the message was accepted and was not sent again, but the row could not be marked sent.");
  }
  return { ok: true, wamid: graph.wamid };
}

/**
 * Nothing left the building: give the draft back. A reply that was going on
 * its own says why it did not, so the person who finds it knows.
 */
async function releaseSendClaim(
  svc: Svc,
  orgId: string,
  draftId: string,
  error: string,
  wasAutomatic = false,
): Promise<void> {
  await svc
    .from("whatsapp_messages")
    .update({
      send_attempted_at: null,
      error,
      ...(wasAutomatic ? { route_reason: `${HELD_PREFIX}: ${error}` } : {}),
      updated_at: new Date().toISOString(),
    })
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

const EMPTY: WhatsAppRecord = { drafts: [], waiting: [], sent: [], approvedTemplate: null };

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
      "id, wamid, direction, from_number, to_number, body, wa_timestamp, status, person_id, reply_to_wamid, attachment_filename, agent_instance_id, approved_by, route_reason, sent_at",
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
  const outbound = data.filter((row) => row.direction === "outbound");
  const drafts = outbound.filter((row) => row.status === "draft");
  const gone = outbound.filter((row) => ["sent", "delivered", "read", "failed"].includes(String(row.status)));
  const now = new Date();

  const employees = new Map<string, string>();
  const agentIds = Array.from(new Set(gone.map((row) => row.agent_instance_id).filter(Boolean))) as string[];
  if (agentIds.length > 0) {
    const found = await svc.from("agent_instances").select("id, display_name").eq("org_id", orgId).in("id", agentIds);
    for (const agent of found.data ?? []) employees.set(String(agent.id), String(agent.display_name ?? ""));
  }

  const answers = outbound.filter((row) => row.status !== "failed").map((row) => ({
    replyTo: (row.reply_to_wamid as string | null) ?? null,
    to: String(row.to_number),
    at: String(row.wa_timestamp ?? ""),
  }));

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
        heldBecause: heldReasonOf(row.route_reason as string | null),
      };
    }),
    waiting: inbound
      .filter(
        (row) =>
          !inboundAnswered(
            {
              wamid: (row.wamid as string | null) ?? null,
              from: String(row.from_number),
              at: String(row.wa_timestamp ?? ""),
            },
            answers,
          ),
      )
      .slice(0, 5)
      .map((row) => ({
        id: String(row.id),
        who: (row.person_id && names.get(row.person_id as string)) || String(row.from_number),
        from: String(row.from_number),
        text: String(row.body ?? ""),
        at: whenLabel(String(row.wa_timestamp ?? "")),
      })),
    sent: gone.slice(0, 5).map((row) => ({
      id: String(row.id),
      to: String(row.to_number),
      by: (row.agent_instance_id && employees.get(String(row.agent_instance_id))) || null,
      text: String(row.body ?? ""),
      at: whenLabel(String(row.sent_at ?? row.wa_timestamp ?? "")),
      documentName: (row.attachment_filename as string | null) ?? null,
      withoutApproval: !row.approved_by && isAutoSentAudit(row.route_reason as string | null),
      failed: row.status === "failed",
    })),
  };
}
