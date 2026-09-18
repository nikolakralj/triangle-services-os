// ---------------------------------------------------------------------------
// Match a mailbox message to a commercial target (mailbox-observed sent /
// replied). Pure: the IMAP fetch and the ledger write live elsewhere.
//
// Sent: our outgoing message, To: a person we are working. Records a send
// when Triangle did not already store that Message-ID (Open mail / Gmail).
// A send already recorded by DEV-013 has the same Message-ID and is skipped.
// A send already recorded without a Message-ID (Recorded outside Triangle)
// is skipped when the subject matches and the times are within a few hours.
// A genuine follow-up days later is a new send.
//
// Replied: their message, In-Reply-To / References contains our outbound
// Message-ID, or the Gmail thread matches, or the sender and stripped
// subject match the last send. A new job email from the same recruiter is
// not a reply — subject-only match requires a prior send.
// ---------------------------------------------------------------------------

export type ObserveFolder = "inbox" | "sent";
export type ObserveKind = "sent" | "replied";

export interface ObserveMessage {
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  from: string;
  to: string;
  subject: string;
  sentAt: string | null;
  folder: ObserveFolder;
  threadId: string | null;
}

export interface ObserveTarget {
  leadId?: string;
  contactId?: string;
  personId?: string;
  email: string;
  lastSubject?: string | null;
  lastAt?: string | null;
  outboundRfc822Ids: string[];
  threadIds: string[];
  /** What the ledger already knows about this person. */
  latest: "none" | "sent" | "reached" | "other";
}

export interface Observation {
  kind: ObserveKind;
  target: ObserveTarget;
  messageId: string;
}

/** Same subject + close timestamps: the send we already logged without a Message-ID. */
export const SAME_SEND_WINDOW_MS = 6 * 60 * 60 * 1000;

const ANGLE = /<[^>\s]+>/g;

/** `<id@host>` lowercase, adding brackets when the header omitted them. */
export function normalizeMessageId(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const angled = s.match(ANGLE);
  if (angled && angled.length > 0) return angled[0].toLowerCase();
  const bare = s.replace(/[<>\s]/g, "");
  if (!bare.includes("@")) return null;
  return `<${bare.toLowerCase()}>`;
}

export function parseMessageIds(header: string | null | undefined): string[] {
  if (!header) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of header.matchAll(ANGLE)) {
    const id = m[0].toLowerCase();
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  if (out.length === 0) {
    const one = normalizeMessageId(header);
    if (one) out.push(one);
  }
  return out;
}

export function normalizeEmail(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toLowerCase();
  const m = s.match(/[^\s<>]+@[^\s<>]+/);
  return m ? m[0] : s;
}

/** "Re: Fw: PLC — USA" → "plc usa" */
export function stripSubject(raw: string | null | undefined): string {
  let s = (raw ?? "").trim().toLowerCase();
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(/^(re|fw|fwd|aw|sv|antw|rv)\s*:\s*/i, "").trim();
  }
  return s.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function idsOf(msg: ObserveMessage): string[] {
  const out = [
    ...parseMessageIds(msg.inReplyTo),
    ...msg.references.flatMap((r) => parseMessageIds(r)),
  ];
  const self = normalizeMessageId(msg.messageId);
  return self ? [self, ...out] : out;
}

function toAddresses(msg: ObserveMessage): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of msg.to.split(/[,;]/)) {
    const email = normalizeEmail(part);
    if (!email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function pickSentTarget(candidates: ObserveTarget[], msg: ObserveMessage): ObserveTarget | null {
  if (candidates.length === 0) return null;
  const sub = stripSubject(msg.subject);
  const subjectHit = sub
    ? candidates.filter((t) => stripSubject(t.lastSubject ?? null) === sub)
    : [];
  const pool = subjectHit.length > 0 ? subjectHit : candidates;
  return pool.find((t) => t.latest === "none") ?? pool[0];
}

function isSameSendAlreadyLogged(target: ObserveTarget, msg: ObserveMessage, messageId: string): boolean {
  if (target.outboundRfc822Ids.some((id) => normalizeMessageId(id) === messageId)) {
    return true;
  }
  if (target.latest !== "sent" && target.latest !== "reached") return false;
  const sub = stripSubject(msg.subject);
  if (!sub || sub !== stripSubject(target.lastSubject ?? null)) return false;
  if (!target.lastAt || !msg.sentAt) return false;
  const delta = Math.abs(Date.parse(msg.sentAt) - Date.parse(target.lastAt));
  return Number.isFinite(delta) && delta < SAME_SEND_WINDOW_MS;
}

/**
 * One message, one observation or none. `ourAddresses` are the connected
 * mailbox(es) — Sent from us, replies to us.
 */
export function observationFor(
  msg: ObserveMessage,
  targets: ObserveTarget[],
  ourAddresses: string[],
  alreadyRecorded: Set<string>,
): Observation | null {
  const messageId = normalizeMessageId(msg.messageId);
  if (!messageId) return null;
  if (alreadyRecorded.has(messageId)) return null;

  const ours = new Set(ourAddresses.map(normalizeEmail).filter(Boolean));
  const from = normalizeEmail(msg.from);
  const tos = toAddresses(msg);

  if (msg.folder === "sent" || ours.has(from)) {
    const foreign = tos.filter((email) => email && !ours.has(email));
    if (foreign.length === 0) return null;
    const candidates = targets.filter((t) => foreign.includes(normalizeEmail(t.email)));
    const target = pickSentTarget(candidates, msg);
    if (!target) return null;
    if (isSameSendAlreadyLogged(target, msg, messageId)) return null;
    return { kind: "sent", target, messageId };
  }

  // Inbox: not from us.
  if (ours.has(from) || !from) return null;

  const cited = new Set(idsOf(msg).filter((id) => id !== messageId));

  for (const target of targets) {
    if (target.latest === "reached") continue;
    const outIds = new Set(
      target.outboundRfc822Ids.map((id) => normalizeMessageId(id)).filter(Boolean) as string[],
    );
    const threadHit =
      Boolean(msg.threadId) && target.threadIds.some((t) => t && t === msg.threadId);
    const headerHit = [...cited].some((id) => outIds.has(id));
    const fromThisPerson = normalizeEmail(target.email) === from;
    const subjectHit =
      fromThisPerson &&
      target.latest === "sent" &&
      Boolean(stripSubject(msg.subject)) &&
      stripSubject(msg.subject) === stripSubject(target.lastSubject ?? null);

    if (headerHit || threadHit || subjectHit) {
      return { kind: "replied", target, messageId };
    }
  }
  return null;
}

/** Sent folder first, then oldest first, so a send is on the ledger before its reply. */
export function orderForObserve(messages: ObserveMessage[]): ObserveMessage[] {
  return [...messages].sort((a, b) => {
    if (a.folder !== b.folder) return a.folder === "sent" ? -1 : 1;
    const at = a.sentAt ? Date.parse(a.sentAt) : 0;
    const bt = b.sentAt ? Date.parse(b.sentAt) : 0;
    return at - bt;
  });
}

export function rememberObservation(
  target: ObserveTarget,
  obs: Observation,
  msg: ObserveMessage,
): void {
  if (obs.kind === "sent") {
    if (!target.outboundRfc822Ids.includes(obs.messageId)) {
      target.outboundRfc822Ids.push(obs.messageId);
    }
    if (msg.threadId && !target.threadIds.includes(msg.threadId)) {
      target.threadIds.push(msg.threadId);
    }
    target.latest = "sent";
    target.lastSubject = msg.subject;
    target.lastAt = msg.sentAt;
    return;
  }
  target.latest = "reached";
}

/**
 * Walk a batch: record sends before replies, and feed each hit back into
 * the target list so a reply in the same run can see the Message-ID.
 */
export function observationsFrom(
  messages: ObserveMessage[],
  targets: ObserveTarget[],
  ourAddresses: string[],
  alreadyRecorded: Set<string>,
): Observation[] {
  const recorded = new Set(alreadyRecorded);
  const copies: ObserveTarget[] = targets.map((t) => ({
    ...t,
    outboundRfc822Ids: [...t.outboundRfc822Ids],
    threadIds: [...t.threadIds],
  }));
  const out: Observation[] = [];
  for (const msg of orderForObserve(messages)) {
    const obs = observationFor(msg, copies, ourAddresses, recorded);
    if (!obs) continue;
    out.push(obs);
    recorded.add(obs.messageId);
    rememberObservation(obs.target, obs, msg);
  }
  return out;
}
