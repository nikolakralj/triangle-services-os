// ---------------------------------------------------------------------------
// WhatsApp Cloud API pilot. Decisions only: no database, no fetch, no send.
//
// A signed webhook is stored once per Meta wamid. Hanna is woken once when
// the sender is allowed. A badge files a draft and that draft does not send.
// A person approves, and only then does a later step build a Graph body.
// Free text is inside 24 hours of the contact's last inbound. Outside it,
// the configured template is the only thing that may go.
// ---------------------------------------------------------------------------

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

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
  personId: string | null;
  caseId: string | null;
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
  },
): { messages: PilotMessage[]; wakes: WakeContext[]; ignoredNonText: number } {
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
        row.woken = true;
        wakes.push({
          messageId: message.wamid,
          sender: message.from,
          personId: row.personId,
          caseId: row.missionId,
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

export function draftKey(agentId: string, to: string, replyTo: string | null, text: string): string {
  const hash = createHash("sha256")
    .update(`${to}|${replyTo ?? ""}|${text}`)
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
}): { ok: true; sends: false; to: string; text: string; draftKey: string } | { ok: false; error: string } {
  const to = normalizeE164(input.to);
  if (!to) return { ok: false, error: "Say who to, as an E.164 number." };
  const text = input.text.trim();
  const templateName = input.templateName?.trim() || "";
  if (!text && !templateName) {
    return { ok: false, error: "Write the reply, or name the approved template." };
  }
  if (text.length > 4096) return { ok: false, error: "That reply is longer than WhatsApp allows." };
  return {
    ok: true,
    sends: false,
    to,
    text,
    draftKey: draftKey(input.agentId, to, input.replyTo, text || templateName),
  };
}

export type SendPlan =
  | { ok: true; mode: "text"; to: string; body: string }
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
  graphVersion: string;
  templateName: string | null;
  templateLanguage: string;
  orgId: string | null;
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function readWhatsAppEnv(env: Record<string, string | undefined>): WhatsAppEnv {
  const org = clean(env.DEFAULT_ORGANIZATION_ID);
  return {
    phoneNumberId: clean(env.WHATSAPP_PHONE_NUMBER_ID),
    wabaId: clean(env.WHATSAPP_WABA_ID),
    accessToken: clean(env.WHATSAPP_ACCESS_TOKEN),
    appSecret: clean(env.WHATSAPP_APP_SECRET),
    verifyToken: clean(env.WHATSAPP_VERIFY_TOKEN),
    allowlist: readAllowlist(env.WHATSAPP_ALLOWED_NUMBERS),
    graphVersion: graphVersion(env.WHATSAPP_GRAPH_VERSION),
    templateName: clean(env.WHATSAPP_TEMPLATE_NAME),
    templateLanguage: templateLanguage(env.WHATSAPP_TEMPLATE_LANGUAGE),
    orgId: org && UUID.test(org) ? org : null,
  };
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
