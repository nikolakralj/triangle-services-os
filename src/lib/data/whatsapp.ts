import "server-only";
import { after } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { getOpenAIClient } from "@/lib/ai/openai-client";
import { wakeEmployee } from "@/lib/data/bot-runtime";
import { whatsAppInboundHasReply, type WhatsAppRecord } from "@/lib/whatsapp/view";
import {
  decideAutoSend,
  decideInstantAck,
  decideSend,
  INSTANT_ACK_REASON,
  instantAckKey,
  isInstantAcknowledgment,
  graphDocumentBody,
  graphMediaUrl,
  graphMessagesUrl,
  graphSendBody,
  isAutoSentAudit,
  matchPersonByPhone,
  nextStatus,
  parseWebhook,
  pickOpenCase,
  outboundCountsAsReply,
  planDraft,
  planInbound,
  readWhatsAppEnv,
  storedDocumentReplyAllowed,
  schemaMissing,
  serviceWindowOpen,
  type ParsedStatus,
  type ParsedText,
  type SendPlan,
  type WakeContext,
  type WaStatus,
} from "@/lib/whatsapp/pilot";
import {
  decodeDraftDocument,
  decideInbound,
  documentBlockedForRecipient,
  documentBytesAllowed,
  draftTextAllowed,
  employeeKeyOf,
  employeeMayDraftWhatsApp,
  parseModelRoute,
  pickWorkerCv,
  ROUTE_MODEL_INSTRUCTIONS,
  type SenderPermission,
  storedDocumentForRecipient,
  storedDocumentRowRequired,
  wakeExpectedOutput,
  WHATSAPP_DRAFT_BUCKET,
  WHATSAPP_DRAFT_ENDPOINT,
  whatsAppRecipientRole,
  type InboundPlan,
  type NormalizedAttachment,
} from "@/lib/whatsapp/routing";

// ---------------------------------------------------------------------------
// WhatsApp pilot, on the database. The rules live in src/lib/whatsapp/pilot.ts
// and src/lib/whatsapp/routing.ts. This file stores an inbound, routes it by
// keywords, and after the response sends a fixed acknowledgment to an owner
// or field number and wakes the employee once. The route model runs only when
// the keywords are unsure, and only after that response. A reply to an owner
// or field number is sent on filing when decideAutoSend says so. The
// acknowledgment is not that reply. Every other reply stays a draft until a
// person approves, and only then is it posted to Graph. A refusal stays a
// draft. A missing table or missing env is a 503 with a log, never a crash.
// A CV or worker profile is refused before it is stored and again before it
// could be sent.
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
  access: {
    allowlist: string[] | null;
    senders: readonly SenderPermission[];
    unmatched: "unlisted" | "field";
  },
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

  const storedRoute = routeFromRow(existing?.routed_employee, existing?.route_reason);
  // Keywords first. The route model, when the words are unsure, runs after
  // the response so it does not hold Meta's 200 or the acknowledgment.
  let route = plan.wake
    ? (storedRoute ??
      decideInbound({
        text: message.text,
        from: message.from,
        senders: access.senders,
        unmatched: access.unmatched,
      }))
    : storedRoute;
  if (plan.wake && storedRoute?.employee) {
    route = decideInbound({
      text: message.text,
      from: message.from,
      model: { employee: storedRoute.employee, reason: storedRoute.reason },
      senders: access.senders,
      unmatched: access.unmatched,
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
  const messageRowId = id;
  const keywordRoute = route;
  const ack = decideInstantAck({
    enabled: readWhatsAppEnv(process.env).autoSend,
    to: message.from,
    senders: access.senders,
    route: keywordRoute,
    wamid: message.wamid,
    alreadyAcked: false,
  });
  runAfterResponse(async () => {
    const acknowledgment = sendInstantAck(svc, orgId, business, message, filing, keywordRoute).catch(() => {
      console.error("whatsapp: the acknowledgment failed. The wake continues.");
    });
    try {
      let chosen = keywordRoute;
      if (chosen.unsure && chosen.action === "route") {
        const refined = await classifyInbound(message.from, message.text, access);
        if (refined.action === "route" && refined.employee) {
          chosen = refined;
          if (refined.employee !== keywordRoute.employee || refined.reason !== keywordRoute.reason) {
            await svc
              .from("whatsapp_messages")
              .update({
                routed_employee: refined.employee,
                route_reason: refined.reason,
              })
              .eq("id", messageRowId)
              .eq("org_id", orgId);
          }
        }
      }
      if (chosen.action === "route" && chosen.employee) {
        await wakeRoutedEmployee(svc, orgId, messageRowId, chosen, {
          messageId: message.wamid,
          sender: message.from,
          text: message.text,
          personId: filing.personId,
          caseId: filing.missionId,
          draftEndpoint: WHATSAPP_DRAFT_ENDPOINT,
          employee: chosen.employee,
          reason: chosen.reason,
          handoffNote: chosen.handoffNote,
          acknowledgementSent: ack.send,
        });
      }
    } catch {
      console.error("whatsapp: the wake failed.");
    }
    await acknowledgment;
  });
  return "ok";
}

function runAfterResponse(work: () => Promise<void>): void {
  const safe = () =>
    work().catch(() => {
      console.error("whatsapp: background work after the webhook failed.");
    });
  try {
    after(safe);
  } catch {
    console.error("whatsapp: could not schedule work after the response.");
    void safe();
  }
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
 * Model refinement for an unsure keyword route. Runs after the webhook has
 * stored the row and scheduled the acknowledgment. A missing key, a timeout,
 * or an unsure answer keeps the keyword route. This never throws and never sends.
 */
async function classifyInbound(
  from: string,
  text: string,
  access: { senders: readonly SenderPermission[]; unmatched: "unlisted" | "field" },
): Promise<InboundPlan> {
  const model = await askRouteModel(text);
  return decideInbound({
    text,
    from,
    model,
    senders: access.senders,
    unmatched: access.unmatched,
  });
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
      const { data: created, error } = await svc
        .from("agent_assignments")
        .insert({
          org_id: orgId,
          agent_instance_id: employee.id,
          mission_id: ctx.caseId,
          title: "WhatsApp",
          objective: `A WhatsApp message arrived (${ctx.messageId}) from ${ctx.sender}. Routed to ${who}: ${route.reason}. Person ${ctx.personId ?? "unknown"}. Case ${ctx.caseId ?? "none"}. Draft at ${ctx.draftEndpoint}.${handoff}${ctx.acknowledgementSent ? " An acknowledgment was already sent. Draft the answer, not another note that you are looking." : ""} Do not send. A CV, worker profile, financial document, or mission document may be attached only for an owner or field sender.`,
          expected_output: wakeExpectedOutput(
            whatsAppRecipientRole(ctx.sender, readWhatsAppEnv(process.env).senders),
          ),
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
            ...(ctx.handoffNote ? { handoff_note: ctx.handoffNote } : {}),
            ...(ctx.acknowledgementSent ? { acknowledgement_sent: true } : {}),
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
      ...(ctx.handoffNote ? { handoffNote: ctx.handoffNote } : {}),
      ...(ctx.acknowledgementSent ? { acknowledgementSent: true } : {}),
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
  const text =
    draftText?.trim() ||
    decideInbound({ text: message.text, from: message.from, unmatched: "field" }).draftText ||
    "I've left this with the owner. Nothing was sent.";
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
  // Stays a draft for the owner. Nothing in this function sends.
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

/**
 * Fixed acknowledgment for one inbound. Not the employee's reply: no
 * reply_to_wamid, no employee badge, and a route reason the auto-send
 * binding ignores. A failure here must not throw. Status webhooks never
 * call this. A duplicate wamid hits the draft key and does not send again.
 */
async function sendInstantAck(
  svc: Svc,
  orgId: string,
  business: string,
  message: ParsedText,
  filing: { personId: string | null; missionId: string | null },
  route: InboundPlan,
): Promise<void> {
  try {
    const env = readWhatsAppEnv(process.env);
    const draftKey = instantAckKey(message.wamid);
    const { data: existing, error: readError } = await svc
      .from("whatsapp_messages")
      .select("id")
      .eq("org_id", orgId)
      .eq("draft_key", draftKey)
      .maybeSingle();
    if (schemaMissing(readError) || readError) {
      console.error("whatsapp: could not check for an acknowledgment. Nothing was sent.");
      return;
    }
    const decision = decideInstantAck({
      enabled: env.autoSend,
      to: message.from,
      senders: env.senders,
      route,
      wamid: message.wamid,
      alreadyAcked: Boolean(existing?.id),
    });
    if (!decision.send) return;
    if (!env.phoneNumberId || !env.accessToken) {
      console.error("whatsapp: phone number id or access token is missing. The acknowledgment was not sent.");
      return;
    }
    const { data, error } = await svc
      .from("whatsapp_messages")
      .insert({
        org_id: orgId,
        direction: "outbound",
        from_number: business,
        to_number: decision.to,
        body: decision.body,
        wa_timestamp: new Date().toISOString(),
        status: "draft",
        person_id: filing.personId,
        mission_id: filing.missionId,
        reply_to_wamid: null,
        draft_key: decision.draftKey,
        route_reason: decision.audit,
      })
      .select("id")
      .maybeSingle();
    if (error?.code === "23505") return;
    if (schemaMissing(error) || error || !data?.id) {
      console.error("whatsapp: the acknowledgment was not stored. Nothing was sent.");
      return;
    }
    const draftId = data.id as string;
    const transmitted = await transmitWhatsAppDraft({
      svc,
      orgId,
      draftId,
      env: {
        graphVersion: env.graphVersion,
        phoneNumberId: env.phoneNumberId,
        accessToken: env.accessToken,
      },
      decision: { ok: true, mode: "text", to: decision.to, body: decision.body },
      routeReason: INSTANT_ACK_REASON,
      approvedBy: null,
      attachmentBucket: null,
      attachmentPath: null,
      priorTemplate: null,
      priorBody: decision.body,
    });
    if (!transmitted.ok) {
      const again = await svc
        .from("whatsapp_messages")
        .select("send_attempted_at")
        .eq("id", draftId)
        .eq("org_id", orgId)
        .maybeSingle();
      const ambiguous = Boolean(again.data?.send_attempted_at);
      await svc
        .from("whatsapp_messages")
        .update({
          route_reason: INSTANT_ACK_REASON,
          ...(ambiguous ? {} : { status: "failed" }),
          error: transmitted.error,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftId)
        .eq("org_id", orgId);
      console.error("whatsapp: the acknowledgment was not sent.");
    }
  } catch {
    console.error("whatsapp: the acknowledgment failed. The wake continues.");
  }
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
      /** True when this reply is on its way, including a retry of one already sent. */
      sends: boolean;
      sent: boolean;
      autoSent: boolean;
      status: "draft" | "sent";
      wamid: string | null;
      /** Why it stayed a draft. Null when it was sent. */
      held: string | null;
    }
  | { ok: false; status: number; error: string };

interface StoredDocumentFields {
  filename: string;
  mime: string;
  kind: string | null;
  sourceTable: "stored_document";
  linkedEntityType: string | null;
  storageBucket: string;
  storagePath: string;
  title: string | null;
}

function fieldsFromDocumentRow(row: {
  file_name: string | null;
  mime_type: string | null;
  file_size: number | string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  document_category: string | null;
  linked_entity_type: string | null;
  title: string | null;
}): { ok: true; fields: StoredDocumentFields } | { ok: false; status: number; error: string } {
  const bucket = (row.storage_bucket ?? "").trim();
  const path = (row.storage_path ?? "").trim();
  if (bucket !== "documents" || !path) {
    return { ok: false, status: 400, error: "That file is not in the documents bucket." };
  }
  if (row.file_size != null && row.file_size !== "") {
    const size = Number(row.file_size);
    const allowed = documentBytesAllowed(size);
    if (!allowed.ok) return { ok: false, status: 400, error: allowed.error };
  }
  const filename = (row.file_name ?? "").trim();
  if (!filename) return { ok: false, status: 400, error: "That document has no filename." };
  return {
    ok: true,
    fields: {
      filename,
      mime: (row.mime_type ?? "").trim(),
      kind: (row.document_category ?? "").trim() || null,
      sourceTable: "stored_document",
      linkedEntityType: row.linked_entity_type,
      storageBucket: bucket,
      storagePath: path,
      title: row.title,
    },
  };
}

/**
 * A workerId is that person's current CV. A documentId is one documents row
 * in this organisation. The bytes stay in storage; the draft only keeps the path.
 * A CV drawn from the worker row, with no file stored, is not built here.
 */
async function resolveStoredDocument(
  svc: Svc,
  orgId: string,
  workerId: string,
  documentId: string,
): Promise<{ ok: true; fields: StoredDocumentFields } | { ok: false; status: number; error: string }> {
  if (workerId && documentId) {
    return { ok: false, status: 400, error: "Name the worker or the document, not both." };
  }
  const columns =
    "id, file_name, mime_type, file_size, storage_bucket, storage_path, document_category, linked_entity_type, linked_entity_id, is_current_version, title, created_at";
  if (workerId) {
    if (!UUID.test(workerId)) return { ok: false, status: 400, error: "That worker id is not usable." };
    const worker = await svc
      .from("workers")
      .select("id")
      .eq("id", workerId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (worker.error && !schemaMissing(worker.error)) {
      return { ok: false, status: 400, error: "Could not read that person." };
    }
    if (!worker.data) return { ok: false, status: 404, error: "That person is not in this organisation." };
    const docs = await svc
      .from("documents")
      .select(columns)
      .eq("organization_id", orgId)
      .eq("linked_entity_type", "worker")
      .eq("linked_entity_id", workerId)
      .limit(20);
    if (docs.error && !schemaMissing(docs.error)) {
      return { ok: false, status: 400, error: "Could not read that document." };
    }
    const picked = pickWorkerCv(
      (docs.data ?? []).map((row) => ({
        id: String(row.id),
        category: (row.document_category as string | null) ?? null,
        bucket: (row.storage_bucket as string | null) ?? null,
        path: (row.storage_path as string | null) ?? null,
        isCurrent: (row.is_current_version as boolean | null) ?? null,
        createdAt: (row.created_at as string | null) ?? null,
      })),
    );
    const row = (docs.data ?? []).find((item) => String(item.id) === picked?.id);
    if (!row) return { ok: false, status: 404, error: "There is no CV on file for this person." };
    return fieldsFromDocumentRow(row);
  }
  if (!UUID.test(documentId)) return { ok: false, status: 400, error: "That document id is not usable." };
  const doc = await svc
    .from("documents")
    .select(columns)
    .eq("id", documentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (doc.error && !schemaMissing(doc.error)) {
    return { ok: false, status: 400, error: "Could not read that document." };
  }
  if (!doc.data) return { ok: false, status: 404, error: "That document is not stored for this organisation." };
  return fieldsFromDocumentRow(doc.data);
}

export async function fileWhatsAppDraft(params: {
  orgId: string;
  agentInstanceId: string;
  body: unknown;
}): Promise<WhatsAppDraftFiling> {
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
    return { ok: false, status: 403, error: "Only Scout, Bob, or Hanna can draft a WhatsApp reply." };
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
  const workerRef = typeof document?.workerId === "string" ? document.workerId.trim() : "";
  const documentRef = typeof document?.documentId === "string" ? document.documentId.trim() : "";
  const referenced = Boolean(workerRef || documentRef);
  let documentBytes: Buffer | null = null;
  if (document && typeof document.contentBase64 === "string") {
    if (referenced) {
      return { ok: false, status: 400, error: "Name the stored document, or attach the file, not both." };
    }
    const decoded = decodeDraftDocument(document.contentBase64);
    if (!decoded.ok) return { ok: false, status: 400, error: decoded.error };
    documentBytes = decoded.bytes;
  }
  if (
    referenced &&
    ((typeof document?.storagePath === "string" && document.storagePath.trim()) ||
      (typeof document?.storageBucket === "string" && document.storageBucket.trim()))
  ) {
    return { ok: false, status: 400, error: "Name the stored document, or attach the file, not both." };
  }

  let inboundFrom: string | null = null;
  let inboundAt: string | null = null;
  if (replyTo) {
    const inbound = await svc
      .from("whatsapp_messages")
      .select("from_number, person_id, mission_id, wa_timestamp")
      .eq("org_id", params.orgId)
      .eq("wamid", replyTo)
      .eq("direction", "inbound")
      .maybeSingle();
    if (schemaMissing(inbound.error)) {
      return { ok: false, status: 503, error: "Triangle cannot file this yet. Migration 054 has not been applied." };
    }
    if (inbound.data) {
      inboundFrom = String(inbound.data.from_number ?? "");
      inboundAt = (inbound.data.wa_timestamp as string | null) ?? null;
      if (!to) to = inboundFrom;
      personId = personId ?? ((inbound.data.person_id as string | null) ?? null);
      missionId = missionId ?? ((inbound.data.mission_id as string | null) ?? null);
    }
  }

  const recipientRole = whatsAppRecipientRole(to, readWhatsAppEnv(process.env).senders);
  let referenceFields: StoredDocumentFields | null = null;
  if (referenced) {
    const allowed = storedDocumentReplyAllowed({
      to,
      replyTo,
      replyFrom: inboundFrom,
      recipientRole,
      lastInboundAt: inboundAt,
      now: new Date(),
    });
    if (!allowed.ok) return allowed;
    const resolved = await resolveStoredDocument(svc, params.orgId, workerRef, documentRef);
    if (!resolved.ok) return resolved;
    referenceFields = resolved.fields;
  }
  const planned = planDraft({
    agentId: params.agentInstanceId,
    to,
    text,
    replyTo,
    templateName,
    recipientRole,
    attachment: referenceFields
      ? { ...referenceFields, hasContent: false }
      : document
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
    const stored = await guardStoredDocument(svc, params.orgId, attachment, document, recipientRole);
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
      .select(
        "id, status, wamid, send_attempted_at, route_reason, body, to_number, reply_to_wamid, template_name, attachment_filename, attachment_mime, attachment_bucket, attachment_path, attachment_kind, attachment_source_table",
      )
      .eq("org_id", params.orgId)
      .eq("draft_key", planned.draftKey)
      .maybeSingle();
    if (existing.data?.id) {
      const row = existing.data;
      return considerAutoSend(svc, params.orgId, {
        draftId: row.id as string,
        duplicate: true,
        to: String(row.to_number ?? planned.to),
        text: String(row.body ?? planned.text),
        replyTo: (row.reply_to_wamid as string | null) ?? replyTo,
        templateName: (row.template_name as string | null) ?? null,
        attachment: attachmentFromRow(row),
        existing: {
          status: String(row.status ?? ""),
          wamid: (row.wamid as string | null) ?? null,
          sendAttempted: Boolean(row.send_attempted_at),
          routeReason: (row.route_reason as string | null) ?? null,
        },
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
  return considerAutoSend(svc, params.orgId, {
    draftId: data.id as string,
    duplicate: false,
    to: planned.to,
    text: planned.text,
    replyTo,
    templateName: templateName?.trim() || null,
    attachment,
  });
}

function heldDraft(draftId: string, duplicate: boolean, held: string): Extract<WhatsAppDraftFiling, { ok: true }> {
  return {
    ok: true,
    draftId,
    duplicate,
    sends: false,
    sent: false,
    autoSent: false,
    status: "draft",
    wamid: null,
    held,
  };
}

function sentFiling(
  draftId: string,
  duplicate: boolean,
  wamid: string,
  autoSent: boolean,
): Extract<WhatsAppDraftFiling, { ok: true }> {
  return {
    ok: true,
    draftId,
    duplicate,
    sends: true,
    sent: true,
    autoSent,
    status: "sent",
    wamid,
    held: null,
  };
}

function attachmentFromRow(row: {
  attachment_filename?: unknown;
  attachment_mime?: unknown;
  attachment_bucket?: unknown;
  attachment_path?: unknown;
  attachment_kind?: unknown;
  attachment_source_table?: unknown;
}): NormalizedAttachment | null {
  const filename = typeof row.attachment_filename === "string" ? row.attachment_filename : "";
  const path = typeof row.attachment_path === "string" ? row.attachment_path : "";
  const bucket = typeof row.attachment_bucket === "string" ? row.attachment_bucket : "";
  if (!filename || !path || !bucket) return null;
  return {
    filename,
    mime: typeof row.attachment_mime === "string" && row.attachment_mime ? row.attachment_mime : "application/octet-stream",
    kind: typeof row.attachment_kind === "string" ? row.attachment_kind : null,
    sourceTable: typeof row.attachment_source_table === "string" ? row.attachment_source_table : null,
    bucket,
    path,
  };
}

async function autoSendContext(
  svc: Svc,
  orgId: string,
  replyTo: string | null,
): Promise<
  | {
      ok: true;
      replyTo: string | null;
      replyFrom: string | null;
      inboundReason: string | null;
      latestInboundReason: string | null;
      lastInboundAt: string | null;
    }
  | { ok: false; held: string }
> {
  const answered = replyTo?.trim() || null;
  if (!answered) {
    return {
      ok: true,
      replyTo: null,
      replyFrom: null,
      inboundReason: null,
      latestInboundReason: null,
      lastInboundAt: null,
    };
  }
  const inbound = await svc
    .from("whatsapp_messages")
    .select("from_number, route_reason, wa_timestamp")
    .eq("org_id", orgId)
    .eq("wamid", answered)
    .eq("direction", "inbound")
    .maybeSingle();
  if (schemaMissing(inbound.error) || inbound.error) {
    return { ok: false, held: "Could not read the message this replies to, so it stayed a draft." };
  }
  const replyFrom = typeof inbound.data?.from_number === "string" ? inbound.data.from_number : null;
  if (!inbound.data || !replyFrom) {
    return {
      ok: true,
      replyTo: answered,
      replyFrom: null,
      inboundReason: null,
      latestInboundReason: null,
      lastInboundAt: null,
    };
  }
  const last = await svc
    .from("whatsapp_messages")
    .select("wa_timestamp, route_reason")
    .eq("org_id", orgId)
    .eq("direction", "inbound")
    .eq("from_number", replyFrom)
    .order("wa_timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (schemaMissing(last.error) || last.error || !last.data) {
    return { ok: false, held: "Could not confirm the 24-hour window, so the reply stayed a draft." };
  }
  return {
    ok: true,
    replyTo: answered,
    replyFrom,
    inboundReason: (inbound.data.route_reason as string | null) ?? null,
    latestInboundReason: (last.data.route_reason as string | null) ?? null,
    lastInboundAt: (last.data.wa_timestamp as string | undefined) ?? null,
  };
}

/**
 * After the row is stored as a draft. Auto-send runs only when the reply
 * answers a stored inbound and `to` is that inbound's sender. A refusal on
 * that inbound or on the sender's latest inbound stays a draft. The human
 * approval path is unchanged: a mismatched `to` is still stored.
 */
async function considerAutoSend(
  svc: Svc,
  orgId: string,
  input: {
    draftId: string;
    duplicate: boolean;
    to: string;
    text: string;
    replyTo: string | null;
    templateName: string | null;
    attachment: NormalizedAttachment | null;
    existing?: {
      status: string;
      wamid: string | null;
      sendAttempted: boolean;
      routeReason: string | null;
    };
  },
): Promise<Extract<WhatsAppDraftFiling, { ok: true }>> {
  const existing = input.existing;
  if (existing?.status === "sent" && existing.wamid) {
    return sentFiling(input.draftId, true, existing.wamid, isAutoSentAudit(existing.routeReason));
  }
  if (existing?.sendAttempted) {
    return heldDraft(
      input.draftId,
      input.duplicate,
      "A send was already attempted and WhatsApp did not confirm it. Check the phone before asking for a new draft.",
    );
  }

  const env = readWhatsAppEnv(process.env);
  const context = await autoSendContext(svc, orgId, input.replyTo);
  if (!context.ok) return heldDraft(input.draftId, input.duplicate, context.held);

  const decision = decideAutoSend({
    enabled: env.autoSend,
    to: input.to,
    text: input.text,
    senders: env.senders,
    replyTo: context.replyTo,
    replyFrom: context.replyFrom,
    inboundReason: context.inboundReason,
    latestInboundReason: context.latestInboundReason,
    lastInboundAt: context.lastInboundAt,
    now: new Date(),
    document: input.attachment
      ? {
          filename: input.attachment.filename,
          mime: input.attachment.mime,
          kind: input.attachment.kind,
          sourceTable: input.attachment.sourceTable,
        }
      : null,
  });
  if (!decision.send) return heldDraft(input.draftId, input.duplicate, decision.reason);

  if (!env.phoneNumberId || !env.accessToken) {
    console.error("whatsapp: phone number id or access token is missing. The reply stayed a draft.");
    return heldDraft(input.draftId, input.duplicate, "WhatsApp sending is not configured. The reply stayed a draft.");
  }
  if (decision.mode === "document" && (!input.attachment?.path || !input.attachment.bucket)) {
    return heldDraft(input.draftId, input.duplicate, "That draft names a document but the file is not stored.");
  }

  const plan: Extract<SendPlan, { ok: true }> =
    decision.mode === "document"
      ? {
          ok: true,
          mode: "document",
          to: decision.to,
          body: decision.body,
          filename: decision.filename ?? input.attachment?.filename ?? "list",
          mime: decision.mime ?? input.attachment?.mime ?? "application/octet-stream",
        }
      : { ok: true, mode: "text", to: decision.to, body: decision.body };

  const transmitted = await transmitWhatsAppDraft({
    svc,
    orgId,
    draftId: input.draftId,
    env: {
      graphVersion: env.graphVersion,
      phoneNumberId: env.phoneNumberId,
      accessToken: env.accessToken,
    },
    decision: plan,
    routeReason: decision.audit,
    approvedBy: null,
    attachmentBucket: input.attachment?.bucket ?? null,
    attachmentPath: input.attachment?.path ?? null,
    priorTemplate: input.templateName,
    priorBody: input.text,
  });
  if (!transmitted.ok) {
    if (transmitted.status === 409) {
      const again = await svc
        .from("whatsapp_messages")
        .select("status, wamid, route_reason")
        .eq("id", input.draftId)
        .eq("org_id", orgId)
        .maybeSingle();
      const wamid = (again.data?.wamid as string | null) ?? null;
      if (again.data?.status === "sent" && wamid) {
        return sentFiling(input.draftId, true, wamid, isAutoSentAudit(again.data.route_reason as string | null));
      }
    }
    return heldDraft(input.draftId, input.duplicate, transmitted.error);
  }
  return sentFiling(input.draftId, input.duplicate, transmitted.wamid, true);
}

async function guardStoredDocument(
  svc: Svc,
  orgId: string,
  attachment: NormalizedAttachment,
  document: Record<string, unknown> | null,
  recipientRole: "owner" | "field" | "other",
): Promise<{ ok: true; attachment: NormalizedAttachment } | { ok: false; status: number; error: string }> {
  if (!attachment) return { ok: false, status: 400, error: "That document is not usable." };
  if (!attachment.path) return { ok: true, attachment };
  const { data, error } = await svc
    .from("documents")
    .select("file_name, document_category, linked_entity_type, title, storage_bucket, organization_id")
    .eq("organization_id", orgId)
    .eq("storage_path", attachment.path)
    .limit(1)
    .maybeSingle();
  if (error && !schemaMissing(error)) {
    return { ok: false, status: 400, error: "Could not check that document against worker records." };
  }
  const row = data?.organization_id === orgId ? data : null;
  const listed = storedDocumentRowRequired(attachment.bucket, Boolean(row));
  if (!listed.ok) return { ok: false, status: 400, error: listed.error };
  const verdict = documentBlockedForRecipient(
    {
      filename: (row?.file_name as string | undefined) || attachment.filename,
      kind: (row?.document_category as string | undefined) || attachment.kind,
      sourceTable:
        row?.linked_entity_type === "worker"
          ? "workers"
          : (typeof document?.sourceTable === "string" ? document.sourceTable : attachment.sourceTable),
      linkedEntityType: (row?.linked_entity_type as string | undefined) ?? null,
      storagePath: attachment.path,
      title: (row?.title as string | undefined) ?? null,
    },
    recipientRole,
  );
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
  const recipientRole = whatsAppRecipientRole(String(draft.to_number ?? ""), env.senders);
  const words = draftTextAllowed(outboundText, recipientRole);
  if (!words.ok) return { ok: false, status: 400, error: words.error };

  const filename = (draft.attachment_filename as string | null) ?? null;
  const attachmentPath = (draft.attachment_path as string | null) ?? null;
  const attachmentBucket = (draft.attachment_bucket as string | null) ?? null;
  if (filename && (!attachmentPath || !attachmentBucket)) {
    return { ok: false, status: 409, error: "That draft names a document but the file is not stored." };
  }
  if (filename && attachmentPath) {
    const referenced = storedDocumentForRecipient(
      (draft.attachment_source_table as string | null) ?? null,
      recipientRole,
    );
    if (!referenced.ok) return { ok: false, status: 400, error: referenced.error };
    const verdict = documentBlockedForRecipient(
      {
        filename,
        kind: (draft.attachment_kind as string | null) ?? null,
        sourceTable: (draft.attachment_source_table as string | null) ?? null,
        storageBucket: attachmentBucket,
        storagePath: attachmentPath,
      },
      recipientRole,
    );
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
      recipientRole,
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

  return transmitWhatsAppDraft({
    svc,
    orgId: params.orgId,
    draftId: params.draftId,
    env: {
      graphVersion: env.graphVersion,
      phoneNumberId: env.phoneNumberId,
      accessToken: env.accessToken,
    },
    decision,
    routeReason: null,
    approvedBy: params.userId,
    attachmentBucket,
    attachmentPath,
    priorTemplate: (draft.template_name as string | null) ?? null,
    priorBody: (draft.body as string | null) ?? null,
  });
}

async function transmitWhatsAppDraft(args: {
  svc: Svc;
  orgId: string;
  draftId: string;
  env: { graphVersion: string; phoneNumberId: string; accessToken: string };
  decision: Extract<SendPlan, { ok: true }>;
  routeReason: string | null;
  approvedBy: string | null;
  attachmentBucket: string | null;
  attachmentPath: string | null;
  priorTemplate: string | null;
  priorBody: string | null;
}): Promise<{ ok: true; wamid: string } | { ok: false; status: number; error: string }> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    send_attempted_at: now,
    body: args.decision.mode === "template" ? args.priorBody : args.decision.body,
    template_name: args.decision.mode === "template" ? args.decision.templateName : args.priorTemplate,
    updated_at: now,
  };
  if (args.approvedBy) {
    patch.approved_at = now;
    patch.approved_by = args.approvedBy;
  }
  if (args.routeReason) patch.route_reason = args.routeReason;

  const { data: claimed, error: claimError } = await args.svc
    .from("whatsapp_messages")
    .update(patch)
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
  if (args.decision.mode === "document") {
    const file = await downloadDraftFile(args.svc, args.attachmentBucket ?? "", args.attachmentPath ?? "");
    if (!file.ok) {
      await releaseSendClaim(args.svc, args.orgId, args.draftId, file.error, Boolean(args.routeReason));
      return file;
    }
    const media = await uploadGraphMedia({
      version: args.env.graphVersion,
      phoneNumberId: args.env.phoneNumberId,
      accessToken: args.env.accessToken,
      filename: args.decision.filename,
      mime: args.decision.mime,
      bytes: file.bytes,
    });
    if (!media.ok) {
      await releaseSendClaim(args.svc, args.orgId, args.draftId, media.error, Boolean(args.routeReason));
      return { ok: false, status: media.status, error: media.error };
    }
    graphBody = graphDocumentBody({
      to: args.decision.to,
      mediaId: media.mediaId,
      filename: args.decision.filename,
      caption: args.decision.body,
    });
  } else {
    graphBody = graphSendBody(args.decision);
  }

  const graph = await postToGraph({
    version: args.env.graphVersion,
    phoneNumberId: args.env.phoneNumberId,
    accessToken: args.env.accessToken,
    body: graphBody,
  });
  if (!graph.ok) {
    if (!graph.ambiguous) {
      await args.svc
        .from("whatsapp_messages")
        .update({
          send_attempted_at: null,
          error: graph.error,
          ...(args.routeReason ? { route_reason: null } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", args.draftId)
        .eq("org_id", args.orgId)
        .eq("status", "draft");
    } else {
      await args.svc
        .from("whatsapp_messages")
        .update({ error: graph.error, updated_at: new Date().toISOString() })
        .eq("id", args.draftId)
        .eq("org_id", args.orgId);
    }
    return { ok: false, status: graph.status, error: graph.error };
  }

  const { error: sentError } = await args.svc
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

async function releaseSendClaim(
  svc: Svc,
  orgId: string,
  draftId: string,
  error: string,
  clearAudit = false,
): Promise<void> {
  await svc
    .from("whatsapp_messages")
    .update({
      send_attempted_at: null,
      error,
      ...(clearAudit ? { route_reason: null } : {}),
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
  const size = documentBytesAllowed(bytes.byteLength);
  if (!size.ok) return { ok: false, status: 400, error: size.error };
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
      signal: AbortSignal.timeout(120_000),
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
      "id, wamid, direction, from_number, to_number, body, wa_timestamp, status, person_id, reply_to_wamid, attachment_filename, route_reason",
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
  const drafts = data.filter(
    (row) =>
      row.direction === "outbound" &&
      row.status === "draft" &&
      !isInstantAcknowledgment(row.route_reason as string | null),
  );
  const outboundTo = data
    .filter(
      (row) =>
        row.direction === "outbound" && outboundCountsAsReply(row.route_reason as string | null),
    )
    .map((row) => String(row.to_number));
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
      .filter((row) => !whatsAppInboundHasReply(String(row.from_number), outboundTo))
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
