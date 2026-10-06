// ---------------------------------------------------------------------------
// WhatsApp Cloud API pilot. Decisions only: no database, no fetch, no send.
//
// A signed webhook is stored once per Meta wamid. An allowlisted sender wakes
// one employee once: Scout or Hanna, from the routing rule. A badge files a
// draft. decideAutoSend says when that draft may leave on its own: an owner
// or field number, inside 24 hours, and not a refusal. Anyone else waits for
// a person. Free text, and one list document, are inside 24 hours of the
// contact's last inbound. Outside it, the configured template is the only
// thing a person may send, and it does not carry the document. This file
// does not fetch and does not send.
// ---------------------------------------------------------------------------

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  bindWhatsAppSenders,
  decideInbound,
  draftTextAllowed,
  EMAIL_REFUSAL_DRAFT,
  fieldSendersFor,
  planAttachment,
  SOFTWARE_REFUSAL_DRAFT,
  documentBlockedForRecipient,
  WHATSAPP_DRAFT_ENDPOINT,
  whatsAppEmployeeLabel,
  type DocumentRecipient,
  type AttachmentInput,
  type NormalizedAttachment,
  type SenderPermission,
} from "@/lib/whatsapp/routing";

export const DEFAULT_GRAPH_VERSION = "v25.0";
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type WaStatus = "received" | "draft" | "sent" | "delivered" | "read" | "failed";
export type WaDirection = "inbound" | "outbound";

const STATUS_RANK: Record<WaStatus, number> = {
  received: 0,
  draft: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 9,
};

export interface WakeContext {
  messageId: string;
  sender: string;
  text: string;
  personId: string | null;
  caseId: string | null;
  draftEndpoint: string;
  employee: string;
  reason: string;
  handoffNote: string | null;
  /** True when Triangle already sent the fixed acknowledgment for this inbound. */
  acknowledgementSent?: boolean;
}

export interface PilotMessage {
  wamid: string | null;
  direction: WaDirection;
  from: string;
  to: string;
  text: string;
  timestamp: string;
  status: WaStatus;
  personId: string | null;
  missionId: string | null;
  woken: boolean;
}

export function wakeEnvForRole(roleKey: string): { url: string; key: string } {
  const suffix = roleKey.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return { url: `BOT_WAKE_URL_${suffix}`, key: `BOT_WAKE_KEY_${suffix}` };
}

export function graphVersion(raw: string | null | undefined): string {
  const value = raw?.trim() ?? "";
  return /^v\d+\.\d+$/.test(value) ? value : DEFAULT_GRAPH_VERSION;
}

export function templateLanguage(raw: string | null | undefined): string {
  const value = raw?.trim() ?? "";
  return /^[a-z]{2}(_[A-Z]{2})?$/.test(value) ? value : "en";
}

export function readAllowlist(raw: string | null | undefined): string[] | null {
  if (raw == null || raw.trim() === "") return null;
  const numbers = raw
    .split(",")
    .map((part) => normalizeE164(part))
    .filter((part): part is string => Boolean(part));
  return numbers;
}

/** E.164 with a leading plus. Local numbers and junk return null. */
export function normalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.trim().replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function phonesMatch(a: string, b: string): boolean {
  const left = a.replace(/\D/g, "").replace(/^00/, "");
  const right = b.replace(/\D/g, "").replace(/^00/, "");
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  return shorter.length >= 8 && longer.endsWith(shorter);
}

/** No allowlist means every number. An empty parsed list refuses everyone. */
export function numberAllowed(number: string, allowlist: string[] | null): boolean {
  if (!allowlist) return true;
  const normalized = normalizeE164(number);
  if (!normalized) return false;
  return allowlist.some((item) => phonesMatch(item, normalized));
}

export function webhookGetDecision(
  query: { mode: string | null; verifyToken: string | null; challenge: string | null },
  expected: string | null,
): { status: 200 | 403 | 503; body: string } {
  if (!expected) return { status: 503, body: "WhatsApp verify token is not configured." };
  const challenge = query.challenge ?? "";
  if (
    query.mode === "subscribe" &&
    query.verifyToken === expected &&
    challenge.length > 0 &&
    challenge.length <= 256 &&
    !/[\r\n]/.test(challenge)
  ) {
    return { status: 200, body: challenge };
  }
  return { status: 403, body: "Forbidden" };
}

export function signatureHex(rawBody: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
}

export function signaturesMatch(header: string | null, rawBody: string, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const provided = header.trim().replace(/^sha256=/i, "");
  if (!/^[0-9a-f]+$/i.test(provided) || provided.length % 2 !== 0) return false;
  const given = Buffer.from(provided, "hex");
  const expected = Buffer.from(signatureHex(rawBody, appSecret), "hex");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

export function webhookPostDecision(
  header: string | null,
  rawBody: string,
  appSecret: string | null,
): 200 | 401 | 503 {
  if (!appSecret) return 503;
  return signaturesMatch(header, rawBody, appSecret) ? 200 : 401;
}

export interface ParsedText {
  wamid: string;
  from: string;
  text: string;
  timestamp: string;
}

export interface ParsedStatus {
  wamid: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient: string | null;
}

export interface ParsedChange {
  wabaId: string | null;
  phoneNumberId: string | null;
  displayNumber: string | null;
  messages: ParsedText[];
  statuses: ParsedStatus[];
  ignoredNonText: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function unixToIso(raw: unknown): string {
  const n = typeof raw === "string" || typeof raw === "number" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return new Date(0).toISOString();
  const ms = n < 1e12 ? n * 1000 : n;
  return new Date(ms).toISOString();
}

export function parseWebhook(body: unknown): ParsedChange[] {
  const root = asRecord(body);
  const entries = Array.isArray(root?.entry) ? root.entry : [];
  const changes: ParsedChange[] = [];
  for (const entry of entries) {
    const entryRecord = asRecord(entry);
    const changeList = Array.isArray(entryRecord?.changes) ? entryRecord.changes : [];
    for (const change of changeList) {
      const value = asRecord(asRecord(change)?.value);
      if (!value) continue;
      const metadata = asRecord(value.metadata);
      const parsed: ParsedChange = {
        wabaId: typeof entryRecord?.id === "string" ? entryRecord.id : null,
        phoneNumberId: typeof metadata?.phone_number_id === "string" ? metadata.phone_number_id : null,
        displayNumber:
          typeof metadata?.display_phone_number === "string"
            ? normalizeE164(metadata.display_phone_number)
            : null,
        messages: [],
        statuses: [],
        ignoredNonText: 0,
      };
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of messages) {
        const row = asRecord(message);
        const text = asRecord(row?.text);
        const wamid = typeof row?.id === "string" ? row.id.trim() : "";
        const from = normalizeE164(typeof row?.from === "string" ? row.from : null);
        const bodyText = typeof text?.body === "string" ? text.body : "";
        if (row?.type === "text" && wamid && from && bodyText.trim()) {
          parsed.messages.push({
            wamid,
            from,
            text: bodyText,
            timestamp: unixToIso(row.timestamp),
          });
        } else if (row) {
          parsed.ignoredNonText += 1;
        }
      }
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const status of statuses) {
        const row = asRecord(status);
        const name = typeof row?.status === "string" ? row.status : "";
        const wamid = typeof row?.id === "string" ? row.id.trim() : "";
        if (!wamid || (name !== "sent" && name !== "delivered" && name !== "read" && name !== "failed")) {
          continue;
        }
        parsed.statuses.push({
          wamid,
          status: name,
          timestamp: unixToIso(row?.timestamp),
          recipient: normalizeE164(typeof row?.recipient_id === "string" ? row.recipient_id : null),
        });
      }
      changes.push(parsed);
    }
  }
  return changes;
}

export function planInbound(input: {
  exists: boolean;
  woken: boolean;
  from: string;
  allowlist: string[] | null;
}): { store: boolean; wake: boolean } {
  const allowed = numberAllowed(input.from, input.allowlist);
  if (input.exists) return { store: false, wake: allowed && !input.woken };
  return { store: true, wake: allowed };
}

export function nextStatus(current: WaStatus, incoming: "sent" | "delivered" | "read" | "failed"): WaStatus {
  if (current === "draft") return current;
  if (incoming === "failed") return "failed";
  if (current === "failed") return "failed";
  return STATUS_RANK[incoming] >= STATUS_RANK[current] ? incoming : current;
}

export function acceptCloudPayload(
  messages: readonly PilotMessage[],
  payload: unknown,
  opts: {
    allowlist: string[] | null;
    businessNumber: string;
    matchFor: (from: string) => { personId: string | null; missionId: string | null };
    expectedPhoneNumberId?: string | null;
    expectedWabaId?: string | null;
    senders?: readonly SenderPermission[];
    unmatched?: "unlisted" | "field";
  },
): { messages: PilotMessage[]; wakes: WakeContext[]; ignoredNonText: number } {
  const senders = opts.senders ?? (opts.allowlist ? fieldSendersFor(opts.allowlist) : []);
  const unmatched = opts.unmatched ?? (opts.allowlist ? "unlisted" : "field");
  const next = messages.map((row) => ({ ...row }));
  const wakes: WakeContext[] = [];
  let ignoredNonText = 0;
  for (const change of parseWebhook(payload)) {
    if (opts.expectedWabaId && change.wabaId && change.wabaId !== opts.expectedWabaId) continue;
    if (
      opts.expectedPhoneNumberId &&
      change.phoneNumberId &&
      change.phoneNumberId !== opts.expectedPhoneNumberId
    ) {
      continue;
    }
    ignoredNonText += change.ignoredNonText;
    const business = change.displayNumber ?? opts.businessNumber;
    for (const message of change.messages) {
      const existing = next.find((row) => row.wamid === message.wamid);
      const plan = planInbound({
        exists: Boolean(existing),
        woken: existing?.woken ?? false,
        from: message.from,
        allowlist: opts.allowlist,
      });
      const match = opts.matchFor(message.from);
      if (plan.store) {
        next.push({
          wamid: message.wamid,
          direction: "inbound",
          from: message.from,
          to: business,
          text: message.text,
          timestamp: message.timestamp,
          status: "received",
          personId: match.personId,
          missionId: match.missionId,
          woken: false,
        });
      }
      const row = existing ?? next.find((item) => item.wamid === message.wamid);
      if (plan.wake && row && !row.woken) {
        const decision = decideInbound({
          text: message.text,
          from: message.from,
          senders,
          unmatched,
        });
        if (decision.action === "refuse" || !decision.employee) continue;
        row.woken = true;
        wakes.push({
          messageId: message.wamid,
          sender: message.from,
          text: message.text,
          personId: row.personId,
          caseId: row.missionId,
          draftEndpoint: WHATSAPP_DRAFT_ENDPOINT,
          employee: decision.employee,
          reason: decision.reason,
          handoffNote: decision.handoffNote,
        });
      }
    }
    for (const status of change.statuses) {
      const row = next.find((item) => item.wamid === status.wamid);
      if (!row) continue;
      row.status = nextStatus(row.status, status.status);
    }
  }
  return { messages: next, wakes, ignoredNonText };
}

export function matchPersonByPhone(
  from: string,
  people: readonly { id: string; phone: string | null }[],
): string | null {
  const hits = people.filter((person) => person.phone && phonesMatch(person.phone, from));
  return hits.length === 1 ? hits[0].id : null;
}

export function pickOpenCase(
  priorMissionId: string | null,
  candidates: readonly { missionId: string; closed: boolean; at: string }[],
): string | null {
  const open = candidates.filter((candidate) => candidate.missionId && !candidate.closed);
  if (priorMissionId && open.some((candidate) => candidate.missionId === priorMissionId)) {
    return priorMissionId;
  }
  return [...open].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))[0]?.missionId ?? null;
}

export function serviceWindowOpen(lastInboundAt: string | null, now: Date): boolean {
  if (!lastInboundAt) return false;
  const then = new Date(lastInboundAt).getTime();
  if (Number.isNaN(then)) return false;
  return now.getTime() - then < SERVICE_WINDOW_MS;
}

export function draftKey(
  agentId: string,
  to: string,
  replyTo: string | null,
  text: string,
  attachmentName: string | null,
): string {
  const hash = createHash("sha256")
    .update(`${to}|${replyTo ?? ""}|${text}|${attachmentName ?? ""}`)
    .digest("hex")
    .slice(0, 24);
  return `draft|${agentId}|${hash}`;
}

export function planDraft(input: {
  agentId: string;
  to: string;
  text: string;
  replyTo: string | null;
  templateName: string | null;
  attachment?: AttachmentInput | null;
  recipientRole?: DocumentRecipient | null;
}):
  | { ok: true; sends: false; to: string; text: string; draftKey: string; attachment: NormalizedAttachment | null }
  | { ok: false; error: string } {
  const to = normalizeE164(input.to);
  if (!to) return { ok: false, error: "Say who to, as an E.164 number." };
  const text = input.text.trim();
  const templateName = input.templateName?.trim() || "";
  const words = draftTextAllowed(text, input.recipientRole ?? "other");
  if (!words.ok) return words;
  let attachment: NormalizedAttachment | null = null;
  if (input.attachment) {
    const planned = planAttachment(input.attachment, input.recipientRole ?? "other");
    if (!planned.ok) return planned;
    attachment = planned.attachment;
  }
  if (!text && !templateName && !attachment) {
    return { ok: false, error: "Write the reply, or name the approved template." };
  }
  if (text.length > 4096) return { ok: false, error: "That reply is longer than WhatsApp allows." };
  if (attachment && text.length > 1024) {
    return { ok: false, error: "The document caption is longer than WhatsApp allows." };
  }
  return {
    ok: true,
    sends: false,
    to,
    text,
    attachment,
    draftKey: draftKey(input.agentId, to, input.replyTo, text || templateName, attachment?.filename ?? null),
  };
}

export type SendPlan =
  | { ok: true; mode: "text"; to: string; body: string }
  | { ok: true; mode: "document"; to: string; body: string; filename: string; mime: string }
  | { ok: true; mode: "template"; to: string; templateName: string; language: string }
  | { ok: false; status: number; error: string };

export function decideSend(input: {
  actor: "human" | "machine" | "demo";
  approve: boolean;
  status: string;
  to: string;
  text: string;
  draftTemplate: string | null;
  allowlist: string[] | null;
  lastInboundAt: string | null;
  now: Date;
  approvedTemplate: string | null;
  templateLanguageCode: string;
  sendAttempted: boolean;
  document?: { filename: string; mime: string } | null;
}): SendPlan {
  if (input.actor !== "human") {
    return { ok: false, status: 403, error: "Only a signed-in person can send a WhatsApp message." };
  }
  if (input.approve !== true) {
    return { ok: false, status: 400, error: "Approve the draft before it can be sent." };
  }
  if (input.status !== "draft") {
    return { ok: false, status: 409, error: "That draft is no longer waiting to be sent." };
  }
  if (input.sendAttempted) {
    return {
      ok: false,
      status: 409,
      error: "A send was already attempted and WhatsApp did not confirm it. Check the phone before asking for a new draft.",
    };
  }
  const to = normalizeE164(input.to);
  if (!to) return { ok: false, status: 400, error: "That recipient is not a usable number." };
  if (!numberAllowed(to, input.allowlist)) {
    return { ok: false, status: 403, error: "That number is not on the WhatsApp pilot allowlist." };
  }
  if (input.document) {
    if (!serviceWindowOpen(input.lastInboundAt, input.now)) {
      return {
        ok: false,
        status: 409,
        error: "Outside the 24-hour window. A document cannot be sent then, and the template does not carry it.",
      };
    }
    const caption = input.text.trim();
    if (caption.length > 1024) {
      return { ok: false, status: 400, error: "The document caption is longer than WhatsApp allows." };
    }
    return {
      ok: true,
      mode: "document",
      to,
      body: caption,
      filename: input.document.filename,
      mime: input.document.mime,
    };
  }
  if (serviceWindowOpen(input.lastInboundAt, input.now)) {
    const body = input.text.trim();
    if (body.length < 1 || body.length > 4096) {
      return { ok: false, status: 400, error: "Write the reply before sending it." };
    }
    return { ok: true, mode: "text", to, body };
  }
  const approved = input.approvedTemplate?.trim() || null;
  if (!approved) {
    return {
      ok: false,
      status: 409,
      error: "Outside the 24-hour window. Only an approved template can be sent, and none is configured.",
    };
  }
  const asked = input.draftTemplate?.trim() || null;
  if (asked && asked !== approved) {
    return { ok: false, status: 400, error: "That template is not the approved one." };
  }
  return {
    ok: true,
    mode: "template",
    to,
    templateName: approved,
    language: templateLanguage(input.templateLanguageCode),
  };
}

export function graphMessagesUrl(version: string, phoneNumberId: string): string {
  return `https://graph.facebook.com/${graphVersion(version)}/${phoneNumberId}/messages`;
}

export function graphMediaUrl(version: string, phoneNumberId: string): string {
  return `https://graph.facebook.com/${graphVersion(version)}/${phoneNumberId}/media`;
}

export function graphDocumentBody(input: {
  to: string;
  mediaId: string;
  filename: string;
  caption: string;
}): Record<string, unknown> {
  const document: Record<string, unknown> = {
    id: input.mediaId,
    filename: input.filename,
  };
  const caption = input.caption.trim();
  if (caption) document.caption = caption;
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to,
    type: "document",
    document,
  };
}

export function graphSendBody(
  plan: { mode: "text"; to: string; body: string } | { mode: "template"; to: string; templateName: string; language: string },
): Record<string, unknown> {
  if (plan.mode === "text") {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: plan.to,
      type: "text",
      text: { body: plan.body, preview_url: false },
    };
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: plan.to,
    type: "template",
    template: { name: plan.templateName, language: { code: plan.language } },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WhatsAppEnv {
  phoneNumberId: string | null;
  wabaId: string | null;
  accessToken: string | null;
  appSecret: string | null;
  verifyToken: string | null;
  allowlist: string[] | null;
  senders: SenderPermission[];
  /** field only when no sender list is configured, so an open pilot stays the field role. */
  unmatched: "unlisted" | "field";
  graphVersion: string;
  templateName: string | null;
  templateLanguage: string;
  orgId: string | null;
  /** Unset is on. Off keeps every reply as a draft. */
  autoSend: boolean;
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function readWhatsAppEnv(env: Record<string, string | undefined>): WhatsAppEnv {
  const org = clean(env.DEFAULT_ORGANIZATION_ID);
  const directory = bindWhatsAppSenders(env.WHATSAPP_OWNER_NUMBERS, env.WHATSAPP_FIELD_NUMBERS);
  const legacy = readAllowlist(env.WHATSAPP_ALLOWED_NUMBERS);
  const access = directory.active
    ? { allowlist: directory.allowlist, senders: directory.senders, unmatched: "unlisted" as const }
    : legacy && legacy.length > 0
      ? { allowlist: legacy, senders: fieldSendersFor(legacy), unmatched: "unlisted" as const }
      : { allowlist: null, senders: [], unmatched: "field" as const };
  return {
    phoneNumberId: clean(env.WHATSAPP_PHONE_NUMBER_ID),
    wabaId: clean(env.WHATSAPP_WABA_ID),
    accessToken: clean(env.WHATSAPP_ACCESS_TOKEN),
    appSecret: clean(env.WHATSAPP_APP_SECRET),
    verifyToken: clean(env.WHATSAPP_VERIFY_TOKEN),
    allowlist: access.allowlist,
    senders: access.senders,
    unmatched: access.unmatched,
    graphVersion: graphVersion(env.WHATSAPP_GRAPH_VERSION),
    templateName: clean(env.WHATSAPP_TEMPLATE_NAME),
    templateLanguage: templateLanguage(env.WHATSAPP_TEMPLATE_LANGUAGE),
    orgId: org && UUID.test(org) ? org : null,
    autoSend: whatsAppAutoSendEnabled(env.WHATSAPP_AUTO_SEND),
  };
}

const AUTO_SEND_ON = new Set(["1", "true", "on", "yes"]);
const AUTO_SEND_OFF = new Set(["0", "false", "off", "no"]);

/**
 * Kill switch. Unset or empty is on, so owner and field replies send.
 * `off`, `0`, `false`, and `no` keep the draft. Any other value is off.
 */
export function whatsAppAutoSendEnabled(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return true;
  if (AUTO_SEND_ON.has(value)) return true;
  if (AUTO_SEND_OFF.has(value)) return false;
  return false;
}

export function isAutoSentAudit(reason: string | null | undefined): boolean {
  return (reason ?? "").trim().startsWith("Auto-sent");
}

/** Stored on the acknowledgment row. Not an employee reply, and not an auto-send audit. */
export const INSTANT_ACK_REASON = "Instant acknowledgment.";

export function isInstantAcknowledgment(reason: string | null | undefined): boolean {
  return (reason ?? "").trim().startsWith("Instant acknowledgment");
}

/**
 * An acknowledgment does not answer the inbound. The employee's later draft
 * still binds with replyTo and can auto-send. The waiting list uses this so
 * the fixed note does not clear the inbound.
 */
export function outboundCountsAsReply(routeReason: string | null | undefined): boolean {
  return !isInstantAcknowledgment(routeReason);
}

/** The only fixed WhatsApp text Triangle sends. The employee's reply is not this. */
export function instantAckCopy(employee: string | null | undefined): string {
  const label = whatsAppEmployeeLabel(employee);
  return label ? `${label} is looking into it.` : "Looking into it.";
}

export function instantAckKey(wamid: string): string {
  return `ack|${wamid.trim()}`;
}

export type InstantAckPlan =
  | { send: true; to: string; body: string; audit: string; draftKey: string }
  | { send: false; reason: string };

/**
 * Fixed acknowledgment for one stored inbound. Same owner/field gate as
 * auto-send: the number must be on the sender list. Unlisted numbers, open
 * pilots, refusals, and a wamid that already has an acknowledgment do not
 * send. No template. The plan carries no replyTo, so it does not bind the
 * inbound for the employee's reply.
 */
export function decideInstantAck(input: {
  enabled: boolean;
  to: string;
  senders: readonly SenderPermission[];
  route: {
    action: "route" | "refuse";
    employee: string | null;
    reason: string;
    flagOwner: boolean;
  };
  wamid: string;
  alreadyAcked: boolean;
}): InstantAckPlan {
  if (!input.enabled) {
    return { send: false, reason: "Auto-send is switched off. No acknowledgment was sent." };
  }
  if (input.alreadyAcked) {
    return { send: false, reason: "An acknowledgment was already stored for this message." };
  }
  if (input.route.action === "refuse" || input.route.flagOwner || isRefusalReason(input.route.reason)) {
    return { send: false, reason: "A refused or flagged message gets no acknowledgment." };
  }
  if (!input.route.employee) {
    return { send: false, reason: "Nobody was routed, so no acknowledgment was sent." };
  }
  const to = normalizeE164(input.to);
  if (!to) return { send: false, reason: "That sender is not a usable number." };
  const listed = input.senders.find((sender) => normalizeE164(sender.e164) === to);
  const role = listed?.id === "owner" ? "owner" : listed?.id === "field" ? "field" : null;
  if (!role) {
    return {
      send: false,
      reason: "That sender is not an owner or field number, so no acknowledgment was sent.",
    };
  }
  const body = instantAckCopy(input.route.employee);
  const words = draftTextAllowed(body);
  if (!words.ok) return { send: false, reason: words.error };
  return {
    send: true,
    to,
    body,
    audit: INSTANT_ACK_REASON,
    draftKey: instantAckKey(input.wamid),
  };
}

export type AutoSendPlan =
  | {
      send: true;
      role: "owner" | "field";
      mode: "text" | "document";
      to: string;
      body: string;
      filename?: string;
      mime?: string;
      audit: string;
    }
  | { send: false; reason: string };

function isRefusalReason(reason: string | null | undefined): boolean {
  return (reason ?? "").trim().startsWith("Refused:");
}

/**
 * Auto-send goes only to the number on the inbound being answered.
 * A missing replyTo, or a `to` for anyone else, stays a draft.
 */
export function autoSendBoundToInbound(input: {
  to: string;
  replyTo?: string | null;
  replyFrom?: string | null;
}): { ok: true; to: string } | { ok: false; reason: string } {
  const replyTo = (input.replyTo ?? "").trim();
  if (!replyTo) {
    return { ok: false, reason: "A reply with no inbound to answer stays a draft." };
  }
  const to = normalizeE164(input.to);
  const from = normalizeE164(input.replyFrom);
  if (!to || !from || to !== from) {
    return { ok: false, reason: "The reply is not to the number that wrote in, so it stays a draft." };
  }
  return { ok: true, to };
}

/**
 * Whether a filed reply leaves without a person.
 * It must answer a stored inbound, and `to` must be that inbound's sender.
 * That sender must be an explicit owner or field number. An open pilot,
 * where every unmatched number is treated as field, does not qualify.
 * A refusal on the answered inbound or on that sender's latest inbound
 * stays a draft. Outside 24 hours, free text and documents stay drafts;
 * the approved template is still a person's send. A list document that
 * passed the attachment guard may leave with the reply, inside the window.
 */
export function decideAutoSend(input: {
  enabled: boolean;
  to: string;
  text: string;
  senders: readonly SenderPermission[];
  replyTo?: string | null;
  /** from_number of the inbound `replyTo` names. */
  replyFrom?: string | null;
  /** route_reason of the inbound being answered. */
  inboundReason?: string | null;
  /** route_reason of that sender's latest inbound. */
  latestInboundReason?: string | null;
  flagged?: boolean;
  lastInboundAt: string | null;
  now: Date;
  document?: {
    filename: string;
    mime: string;
    kind?: string | null;
    sourceTable?: string | null;
  } | null;
}): AutoSendPlan {
  if (!input.enabled) {
    return { send: false, reason: "Auto-send is switched off. The reply stays a draft." };
  }
  const bound = autoSendBoundToInbound(input);
  if (!bound.ok) return { send: false, reason: bound.reason };
  const to = bound.to;

  const listed = input.senders.find((sender) => normalizeE164(sender.e164) === to);
  const role = listed?.id === "owner" ? "owner" : listed?.id === "field" ? "field" : null;
  if (!role) {
    return {
      send: false,
      reason: "That recipient is not an owner or field number, so the reply stays a draft.",
    };
  }

  const text = input.text.trim();
  if (
    input.flagged === true ||
    isRefusalReason(input.inboundReason) ||
    isRefusalReason(input.latestInboundReason) ||
    text === SOFTWARE_REFUSAL_DRAFT ||
    text === EMAIL_REFUSAL_DRAFT
  ) {
    return { send: false, reason: "A refused or flagged reply stays a draft for the owner." };
  }

  const words = draftTextAllowed(text, role);
  if (!words.ok) return { send: false, reason: words.error };

  if (input.document) {
    const blocked = documentBlockedForRecipient(
      {
        filename: input.document.filename,
        mime: input.document.mime,
        kind: input.document.kind ?? null,
        sourceTable: input.document.sourceTable ?? null,
      },
      role,
    );
    if (blocked.blocked) return { send: false, reason: blocked.reason };
  }

  if (!serviceWindowOpen(input.lastInboundAt, input.now)) {
    return {
      send: false,
      reason: input.document
        ? "Outside the 24-hour window. The document stays a draft, and free text is not auto-sent."
        : "Outside the 24-hour window. Free text is not auto-sent; the draft stays for a person.",
    };
  }

  const audit =
    input.document
      ? role === "owner"
        ? "Auto-sent to the owner, with a document."
        : "Auto-sent to the field, with a document."
      : role === "owner"
        ? "Auto-sent to the owner."
        : "Auto-sent to the field.";

  if (input.document) {
    if (text.length > 1024) {
      return { send: false, reason: "The document caption is longer than WhatsApp allows." };
    }
    return {
      send: true,
      role,
      mode: "document",
      to,
      body: text,
      filename: input.document.filename,
      mime: input.document.mime,
      audit,
    };
  }

  if (text.length < 1 || text.length > 4096) {
    return { send: false, reason: "Write the reply before it can be sent." };
  }
  return { send: true, role, mode: "text", to, body: text, audit };
}

export function schemaMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST204" ||
    /could not find the table/i.test(message) ||
    (/whatsapp_messages/i.test(message) && /does not exist|schema cache/i.test(message))
  );
}
