// ---------------------------------------------------------------------------
// WhatsApp Cloud API pilot. Decisions only: no database, no fetch, no send.
//
// A signed webhook is stored once per Meta wamid. An allowlisted sender wakes
// one employee once: Scout, Bob, or Hanna, from the routing rule. A badge
// files a reply. decideAutoSend says when that reply goes out as it is
// filed: it answers a stored message from the owner's or the field sender's
// own number, it is addressed to that same number, and it is inside 24 hours.
// Every other reply is a draft a person approves, and decideSend is that
// gate. Free text, and one document, are inside 24 hours of the contact's
// last inbound. Outside it, the configured template is the only thing that
// may go, a person sends it, and it does not carry the document.
// ---------------------------------------------------------------------------

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  attachmentAskedFor,
  AUTO_REPLIES_PER_MESSAGE,
  bindWhatsAppSenders,
  decideInbound,
  draftTextAllowed,
  driveNote,
  fieldSendersFor,
  permissionFor,
  planAttachment,
  senderMayTalkTo,
  WHATSAPP_DRAFT_ENDPOINT,
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
  /** True when the reply to this message goes out as it is filed. */
  replySends: boolean;
  /** What this sender may be given from Google Drive. Null when there is no limit. */
  senderNote: string | null;
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
    /** The kill switch. False keeps every reply a draft. */
    autoSend?: boolean;
    /** The organisation's own name: the field sender's Drive folder when none is configured. */
    organisationFolder?: string | null;
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
        const sender = permissionFor(message.from, senders, unmatched);
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
          replySends: opts.autoSend !== false && sender.repliesSendWithoutApproval,
          senderNote: driveNote(sender, opts.organisationFolder ?? null),
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
  /**
   * Set by the data layer once it has read the stored message and the
   * worker's record and found that the owner or the field sender asked for
   * this person's document by name. Without it a CV is refused here.
   */
  workerDocumentAsked?: boolean;
}):
  | { ok: true; sends: false; to: string; text: string; draftKey: string; attachment: NormalizedAttachment | null }
  | { ok: false; error: string } {
  const to = normalizeE164(input.to);
  if (!to) return { ok: false, error: "Say who to, as an E.164 number." };
  const text = input.text.trim();
  const templateName = input.templateName?.trim() || "";
  const asked = input.workerDocumentAsked === true && Boolean(input.attachment);
  const words = draftTextAllowed(text, { carriesAskedDocument: asked });
  if (!words.ok) return words;
  let attachment: NormalizedAttachment | null = null;
  if (input.attachment) {
    const planned = planAttachment(input.attachment, { workerDocumentAsked: asked });
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

/** How an outbound row says it went without a person. The record reads this. */
export const AUTO_SENT_PREFIX = "Sent without approval";
/** How a draft says why it did not go on its own. */
export const HELD_PREFIX = "Held";

export function isAutoSentAudit(reason: string | null | undefined): boolean {
  return (reason ?? "").trim().startsWith(AUTO_SENT_PREFIX);
}

export function heldReasonOf(reason: string | null | undefined): string | null {
  const text = (reason ?? "").trim();
  if (!text.startsWith(`${HELD_PREFIX}: `)) return null;
  return text.slice(HELD_PREFIX.length + 2).trim() || null;
}

/** The stored message a reply answers. Stored only from a webhook Meta signed. */
export interface AutoSendInbound {
  /** The number that wrote. */
  from: string;
  /** Their words. */
  text: string;
  /** True once an employee was woken on it. */
  woken: boolean;
  /** The reason stored with the route. "Refused: …" when it was refused. */
  routeReason: string | null;
}

export type AutoSendPlan =
  | { send: true; role: string; mode: "text"; to: string; body: string; audit: string }
  | {
      send: true;
      role: string;
      mode: "document";
      to: string;
      body: string;
      filename: string;
      mime: string;
      audit: string;
    }
  /** granted: the reply is to the owner's or field sender's own message, so the hold is worth explaining. */
  | { send: false; reason: string; granted: boolean };

/**
 * Whether a filed reply goes out without a person. The CEO's grant of
 * 3 October 2026, and its three conditions:
 *
 * 1. It goes only to the number that wrote, and only when that number is on
 *    the owner or field list. The reply must answer a stored message, and be
 *    addressed to that message's sender.
 * 2. A file goes only when that message asked for it; a worker's document
 *    only when it asked for that worker's by name.
 * 3. The message was stored from a webhook Meta signed. With no app secret
 *    there is no such check, so nothing goes.
 *
 * The 24-hour window, the sender's list of employees, and a refusal all
 * still hold. A hold is not an error: the reply stays a draft for a person.
 */
export function decideAutoSend(input: {
  /** The kill switch. Off keeps every reply a draft. */
  enabled: boolean;
  /** True when every inbound is checked against Meta's signature. */
  signatureChecked: boolean;
  senders: readonly SenderPermission[];
  /** The stored message this reply answers. Null when it names none, or none is on file. */
  inbound: AutoSendInbound | null;
  /** The employee filing the reply: its key. Null when it is not a WhatsApp employee. */
  employee: string | null;
  to: string;
  text: string;
  templateName: string | null;
  /** The last message from that number. The 24-hour window runs from it. */
  lastInboundAt: string | null;
  now: Date;
  /** Replies to this same message that already went out without a person. */
  repliesAlreadySent: number;
  document: {
    filename: string;
    mime: string;
    /** True for a CV, a profile, or any other file on a worker's record. */
    workerDocument: boolean;
    /** Whose it is, from Triangle's own record. */
    workerName: string | null;
  } | null;
}): AutoSendPlan {
  const hold = (reason: string, granted = false): AutoSendPlan => ({ send: false, reason, granted });

  if (!input.inbound) return hold("It does not answer a stored message, so it waits for a person.");
  const from = normalizeE164(input.inbound.from);
  const sender = from ? permissionFor(from, input.senders, "unlisted") : null;
  if (!from || !sender || sender.repliesSendWithoutApproval !== true) {
    return hold("The number that wrote is not on the owner or field list, so the reply waits for a person.");
  }
  const to = normalizeE164(input.to);
  if (!to || to !== from) {
    return hold("It is addressed to a different number than the one that wrote, so it waits for a person.");
  }

  if (!input.enabled) return hold("Sending without approval is switched off.", true);
  if (!input.signatureChecked) {
    return hold(
      "Incoming messages are not being checked against WhatsApp's signature, so nothing goes without a person.",
      true,
    );
  }
  if ((input.inbound.routeReason ?? "").trim().startsWith("Refused:")) {
    return hold("That message was refused and left with the owner.", true);
  }
  if (!input.inbound.woken) {
    return hold("Nobody was woken on that message, so its reply waits for a person.", true);
  }
  if (!input.employee || !senderMayTalkTo(sender, input.employee)) {
    return hold("That sender cannot reach this employee, so the reply waits for a person.", true);
  }
  if (input.templateName?.trim()) return hold("A template is a person's send.", true);
  if (input.repliesAlreadySent >= AUTO_REPLIES_PER_MESSAGE) {
    return hold(
      `${AUTO_REPLIES_PER_MESSAGE} replies to that message have already gone on their own. This one waits for a person.`,
      true,
    );
  }
  if (!serviceWindowOpen(input.lastInboundAt, input.now)) {
    return hold("Outside the 24-hour window, so it waits for a person.", true);
  }

  const text = input.text.trim();
  let carriesAskedDocument = false;
  if (input.document) {
    const asked = attachmentAskedFor({
      request: input.inbound.text,
      workerDocument: input.document.workerDocument,
      workerName: input.document.workerName,
    });
    if (!asked.ok) return hold(asked.error, true);
    carriesAskedDocument = input.document.workerDocument;
  }
  const words = draftTextAllowed(text, { carriesAskedDocument });
  if (!words.ok) return hold(words.error, true);

  const whose = sender.id === "owner" ? "the owner's" : `the ${sender.id} sender's`;
  if (input.document) {
    if (text.length > 1024) return hold("The document caption is longer than WhatsApp allows.", true);
    return {
      send: true,
      role: sender.id,
      mode: "document",
      to,
      body: text,
      filename: input.document.filename,
      mime: input.document.mime,
      audit: `${AUTO_SENT_PREFIX}: a reply to ${whose} own message, with the file that message asked for.`,
    };
  }
  if (text.length < 1 || text.length > 4096) return hold("There are no words to send.", true);
  return {
    send: true,
    role: sender.id,
    mode: "text",
    to,
    body: text,
    audit: `${AUTO_SENT_PREFIX}: a reply to ${whose} own message.`,
  };
}

/**
 * Whether a CV, a profile, or any other file on a worker's record may be on
 * a reply at all. It may only when the reply answers the owner's or the
 * field sender's own message, is addressed to that same number, and that
 * message asks for this worker's document by name. Anything else is refused
 * before the reply is stored, and again before a person could send it.
 */
export function workerDocumentMayLeave(input: {
  senders: readonly SenderPermission[];
  /** The stored message the reply answers. Null when it names none. */
  inbound: { from: string; text: string } | null;
  to: string;
  /** Whose it is, from Triangle's own record. */
  workerName: string | null;
}): { ok: true } | { ok: false; error: string } {
  const rule =
    "A CV or worker profile leaves by WhatsApp only as a reply to the owner or the field sender who asked for that person's by name.";
  if (!input.inbound) return { ok: false, error: `${rule} This reply does not answer such a message.` };
  const from = normalizeE164(input.inbound.from);
  const sender = from ? permissionFor(from, input.senders, "unlisted") : null;
  if (!from || !sender || sender.repliesSendWithoutApproval !== true) {
    return { ok: false, error: `${rule} The number that wrote is not on the owner or field list.` };
  }
  const to = normalizeE164(input.to);
  if (!to || to !== from) {
    return { ok: false, error: "A CV or worker profile goes only to the number that asked for it." };
  }
  return attachmentAskedFor({
    request: input.inbound.text,
    workerDocument: true,
    workerName: input.workerName,
  });
}

const AUTO_SEND_ON = new Set(["1", "true", "on", "yes"]);

/**
 * The kill switch, WHATSAPP_AUTO_SEND. Unset or empty is on: the CEO granted
 * it. "off", "0", "false", "no", or anything else unrecognised keeps every
 * reply a draft.
 */
export function whatsAppAutoSendEnabled(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return true;
  return AUTO_SEND_ON.has(value);
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
  /** WHATSAPP_AUTO_SEND. Unset is on. Off keeps every reply a draft. */
  autoSend: boolean;
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function readWhatsAppEnv(env: Record<string, string | undefined>): WhatsAppEnv {
  const org = clean(env.DEFAULT_ORGANIZATION_ID);
  const directory = bindWhatsAppSenders(
    env.WHATSAPP_OWNER_NUMBERS,
    env.WHATSAPP_FIELD_NUMBERS,
    env.WHATSAPP_FIELD_DRIVE_FOLDERS,
  );
  const legacy = readAllowlist(env.WHATSAPP_ALLOWED_NUMBERS);
  const access = directory.active
    ? { allowlist: directory.allowlist, senders: directory.senders, unmatched: "unlisted" as const }
    : legacy && legacy.length > 0
      ? {
          allowlist: legacy,
          senders: fieldSendersFor(legacy, env.WHATSAPP_FIELD_DRIVE_FOLDERS),
          unmatched: "unlisted" as const,
        }
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
