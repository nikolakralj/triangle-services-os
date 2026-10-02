// ---------------------------------------------------------------------------
// Work done outside Triangle, reported by the employee who did it.
//
// LinkedIn, a mailbox on someone's own computer, a chat: none of that is a
// record until it is filed here. Triangle files it on the person, the company
// and the case, and sets the follow-up. This module decides. It does not
// write, and it does not send.
//
// A reported "not available" stays "Last reported unavailable, on this date"
// until a later confirmation replaces it. Time passing does not turn it into
// "unknown".
// ---------------------------------------------------------------------------

import { requirementIdentity } from "@/lib/job-intake/requirement-case";

/** Same gap as a recorded send. Defined here so this file stays free of the database. */
const FOLLOW_UP_AFTER_DAYS = 4;

export const REPORT_KINDS = [
  "linkedin_invitation",
  "email_drafted",
  "email_sent",
  "candidate_found",
  "reply_received",
  "not_available",
  "access_needed",
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

/** Scopes the three employees already carry. No new scope, so no new badge. */
export const REPORT_SCOPES = ["mission.work", "worker.propose", "research.suggestion.create"] as const;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function badgeMayReport(scopes: readonly string[]): boolean {
  return REPORT_SCOPES.some((scope) => scopes.includes(scope));
}

export function zagrebToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatReportDate(iso: string): string {
  const day = Number(iso.slice(8, 10));
  const month = MONTHS[Number(iso.slice(5, 7)) - 1];
  const year = iso.slice(0, 4);
  if (!day || !month || !DATE.test(iso.slice(0, 10))) return iso.slice(0, 10);
  return `${day} ${month} ${year}`;
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeMessageId(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^<|>$/g, "").trim().toLowerCase();
}

export interface ReportView {
  id: string;
  kind: ReportKind;
  source: "employee" | "mailbox";
  employeeName: string;
  personId: string | null;
  personName: string | null;
  companyId: string | null;
  companyName: string | null;
  missionId: string | null;
  roleTitle: string | null;
  evidenceUrl: string | null;
  note: string | null;
  unavailableUntil: string | null;
  accessWhat: string | null;
  occurredOn: string;
  followUpOn: string | null;
  createdAt: string;
}

export interface PlannedReport {
  kind: ReportKind;
  employeeName: string;
  agentInstanceId: string;
  personName: string | null;
  personId: string | null;
  companyName: string | null;
  companyId: string | null;
  caseId: string | null;
  /** A lead the work is about. Not a case. Null when the report did not name one. */
  leadId: string | null;
  roleTitle: string | null;
  evidenceUrl: string | null;
  note: string | null;
  unavailableUntil: string | null;
  accessWhat: string | null;
  occurredOn: string;
  followUpOn: string | null;
  idempotencyKey: string;
  sentence: string;
}

export function reportSentence(report: {
  kind: ReportKind;
  followUpOn: string | null;
  unavailableUntil: string | null;
  roleTitle: string | null;
  accessWhat: string | null;
}): string {
  const follow = report.followUpOn ? ` Follow up ${formatReportDate(report.followUpOn)}.` : "";
  switch (report.kind) {
    case "linkedin_invitation":
      return `LinkedIn invitation sent.${follow}`;
    case "email_drafted":
      return `Email drafted.${follow}`;
    case "email_sent":
      return `Email sent.${follow}`;
    case "candidate_found":
      return report.roleTitle
        ? `Candidate found for ${report.roleTitle}.${follow}`
        : `Candidate found.${follow}`;
    case "reply_received":
      return `Reply received.${follow}`;
    case "not_available":
      return report.unavailableUntil
        ? `Not available until ${formatReportDate(report.unavailableUntil)}.${follow}`
        : `Not available.${follow}`;
    case "access_needed":
      return report.accessWhat ? `Needs ${report.accessWhat.trim()}.` : "Needs access.";
    default:
      return `Reported.${follow}`;
  }
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function asDate(value: unknown): string | null {
  if (typeof value !== "string" || !DATE.test(value.trim())) return null;
  const [year, month, day] = value.trim().split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value.trim();
}

function asUuid(value: unknown): string | null {
  if (typeof value !== "string" || !UUID.test(value.trim())) return null;
  return value.trim();
}

/**
 * A case id from the badge. Absent, blank, and the wake's JSON null
 * (`null` or the string `"null"`) are no case. The case is optional.
 */
function caseIdFrom(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.toLowerCase() === "null") return null;
  return asUuid(text);
}

function evidenceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function followUpFor(kind: ReportKind, occurredOn: string, until: string | null): string | null {
  if (kind === "not_available") return until;
  if (kind === "access_needed") return occurredOn;
  return addCalendarDays(occurredOn, FOLLOW_UP_AFTER_DAYS);
}

function idempotencyKey(report: {
  agentInstanceId: string;
  kind: ReportKind;
  personName: string | null;
  personId: string | null;
  companyName: string | null;
  companyId: string | null;
  caseId: string | null;
  occurredOn: string;
  evidenceUrl: string | null;
  unavailableUntil: string | null;
  accessWhat: string | null;
  note: string | null;
}): string {
  const detail =
    report.kind === "candidate_found"
      ? (report.evidenceUrl ?? "")
      : report.kind === "not_available"
        ? (report.unavailableUntil ?? "")
        : report.kind === "access_needed"
          ? (report.accessWhat ?? "")
          : report.kind === "email_drafted" ||
              report.kind === "email_sent" ||
              report.kind === "reply_received"
            ? (report.note ?? "")
            : "";
  return [
    report.agentInstanceId,
    report.kind,
    report.personId ?? report.personName ?? "",
    report.companyId ?? report.companyName ?? "",
    report.caseId ?? "",
    report.occurredOn,
    detail,
  ]
    .join("|")
    .toLowerCase();
}

/**
 * What the badge sent, checked before any row is written.
 * A LinkedIn invitation is filed on the person. An email to a firm is filed
 * on the company. A candidate needs the evidence link. "Not available" needs
 * the until date. "Access needed" needs what, in the employee's words.
 */
export function planEmployeeReport(input: {
  employeeName: string;
  agentInstanceId: string;
  body: unknown;
  now?: Date;
}): { ok: true; planned: PlannedReport } | { ok: false; error: string } {
  const body = (input.body ?? null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Send a JSON object." };
  }

  const kindRaw = typeof body.kind === "string" ? body.kind.trim() : "";
  if (!REPORT_KINDS.includes(kindRaw as ReportKind)) {
    return {
      ok: false,
      error: `kind must be one of: ${REPORT_KINDS.join(", ")}.`,
    };
  }
  const kind = kindRaw as ReportKind;

  const personId = asUuid(body.personId);
  const personText = cleanText(body.person, 200);
  const personFromText = personText && UUID.test(personText) ? personText : null;
  const companyId = asUuid(body.companyId);
  const companyName = cleanText(body.company, 200);
  const caseId = caseIdFrom(body.caseId) ?? caseIdFrom(body.missionId);
  const leadId = caseIdFrom(body.leadId) ?? caseIdFrom(body.jobLeadId);
  const roleTitle = cleanText(body.role, 160);
  const note = cleanText(body.note, 2000);
  const accessWhat = cleanText(body.what, 160);
  const until = asDate(body.until);
  const url = evidenceUrl(body.evidenceUrl);
  const occurredOn = asDate(body.occurredOn) ?? zagrebToday(input.now ?? new Date());

  if (body.occurredOn != null && body.occurredOn !== "" && !asDate(body.occurredOn)) {
    return { ok: false, error: "occurredOn must be a date, YYYY-MM-DD." };
  }
  if (body.until != null && body.until !== "" && !until) {
    return { ok: false, error: "until must be a date, YYYY-MM-DD." };
  }
  if (body.evidenceUrl != null && body.evidenceUrl !== "" && !url) {
    return { ok: false, error: "evidenceUrl must be an http(s) link." };
  }

  const personName = personFromText ? null : personText;
  const resolvedPersonId = personId ?? personFromText;

  if (kind === "candidate_found" && !url) {
    return { ok: false, error: "A candidate needs an evidence link." };
  }
  if (kind === "candidate_found" && !resolvedPersonId && !personName) {
    return { ok: false, error: "A candidate needs the person." };
  }
  if (kind === "not_available" && !until) {
    return { ok: false, error: "Not available needs until, as a date." };
  }
  if (kind === "not_available" && !resolvedPersonId && !personName && !companyId && !companyName) {
    return { ok: false, error: "Not available needs the person or the company." };
  }
  if (kind === "access_needed" && !accessWhat) {
    return { ok: false, error: "Access needed needs what, in a few words." };
  }
  if ((personName && /[%_]/.test(personName)) || (companyName && /[%_]/.test(companyName))) {
    return { ok: false, error: "Names cannot include wildcard characters." };
  }
  if (kind === "linkedin_invitation" && !resolvedPersonId && !personName) {
    return { ok: false, error: "A LinkedIn invitation needs the person." };
  }
  if (
    kind !== "access_needed" &&
    !resolvedPersonId &&
    !personName &&
    !companyId &&
    !companyName &&
    !caseId &&
    !leadId
  ) {
    return { ok: false, error: "Name the person, the company, or the case." };
  }

  const followUpOn = followUpFor(kind, occurredOn, until);
  const planned: PlannedReport = {
    kind,
    employeeName: input.employeeName.trim() || "Employee",
    agentInstanceId: input.agentInstanceId,
    personName,
    personId: resolvedPersonId,
    companyName: companyId ? null : companyName,
    companyId,
    caseId,
    leadId,
    roleTitle,
    evidenceUrl: url,
    note,
    unavailableUntil: until,
    accessWhat,
    occurredOn,
    followUpOn,
    idempotencyKey: "",
    sentence: "",
  };
  planned.idempotencyKey = idempotencyKey(planned);
  planned.sentence = reportSentence(planned);
  return { ok: true, planned };
}

/**
 * Where a report's case id lands.
 *
 * No case, or a case id that is not a mission, is filed without that case.
 * A lead id in the case field is the lead, not a foreign case. The only
 * rejection is a mission that belongs to another organisation.
 */
export function decideReportCase(input: {
  caseId: string | null;
  /** The mission row's organisation, when this id is a mission. Null when it is not. */
  missionOrgId: string | null;
  orgId: string;
  /** The id is a lead in this organisation, not a mission. */
  leadInThisOrg?: boolean;
  /** Open case for that lead, when one exists. */
  openCaseId?: string | null;
}): { ok: true; missionId: string | null } | { ok: false; error: string } {
  if (!input.caseId) {
    return { ok: true, missionId: input.openCaseId ?? null };
  }
  if (input.missionOrgId) {
    if (input.missionOrgId.toLowerCase() !== input.orgId.toLowerCase()) {
      return { ok: false, error: "That case is not in this organisation." };
    }
    return { ok: true, missionId: input.caseId };
  }
  if (input.leadInThisOrg) {
    return { ok: true, missionId: input.openCaseId ?? null };
  }
  return { ok: true, missionId: null };
}

/**
 * The case a follow-up sits on. A lead with an open case uses that case.
 * No lead, or only a closed case, leaves the assignment without a mission.
 * When several are open, the newest one is the case.
 */
export function openCaseId(input: {
  leadId: string | null;
  cases: { missionId: string; closed: boolean; updatedAt?: string | null }[];
}): string | null {
  if (!input.leadId) return null;
  const open = input.cases
    .filter((item) => item.missionId && !item.closed)
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
  return open[0]?.missionId ?? null;
}

/**
 * Hanna's work of 29 September 2026: two people invited on LinkedIn, and
 * emails to two partner firms. The fixture the offline check files.
 */
export const HANNA_29_SEP_WORK = [
  {
    kind: "linkedin_invitation",
    person: "Dario Martić",
    occurredOn: "2026-09-29",
  },
  {
    kind: "linkedin_invitation",
    person: "Ratko Vukonić",
    occurredOn: "2026-09-29",
  },
  {
    kind: "email_sent",
    company: "INITECH",
    occurredOn: "2026-09-29",
    note: "Email to the partner firm, sent outside Triangle.",
  },
  {
    kind: "email_sent",
    company: "Suport Total",
    occurredOn: "2026-09-29",
    note: "Email to the partner firm, sent outside Triangle.",
  },
] as const;

export function hanna29SeptemberPlans(agentInstanceId = "hanna"): PlannedReport[] {
  return HANNA_29_SEP_WORK.map((body) => {
    const planned = planEmployeeReport({
      employeeName: "Hanna",
      agentInstanceId,
      body,
    });
    if (!planned.ok) throw new Error(planned.error);
    return planned.planned;
  });
}

export type AvailabilityTone = "available" | "soon" | "busy" | "unknown" | "unavailable";

const STATUS_READING: Record<string, { phrase: string; tone: AvailabilityTone }> = {
  available: { phrase: "Available now", tone: "available" },
  available_soon: { phrase: "Available soon", tone: "soon" },
  busy: { phrase: "On a job", tone: "busy" },
  do_not_use: { phrase: "Do not use", tone: "busy" },
  unknown: { phrase: "Availability unknown", tone: "unknown" },
};

export interface AvailabilityReport {
  kind: string;
  occurredOn: string;
  unavailableUntil?: string | null;
}

/**
 * The words on the person's record.
 *
 * `asOf` is accepted and ignored. Fourteen days, or fourteen months, do not
 * turn a reported unavailability into "unknown". A confirmation replaces it
 * only when that confirmation is dated after the report.
 */
export function availabilityReading(input: {
  status: string | null;
  confirmedOn?: string | null;
  reports: AvailabilityReport[];
  asOf?: string;
}): { phrase: string; tone: AvailabilityTone } {
  void input.asOf;
  const status = STATUS_READING[input.status ?? "unknown"] ?? STATUS_READING.unknown;
  const latest = input.reports
    .filter((report) => report.kind === "not_available" && DATE.test(report.occurredOn.slice(0, 10)))
    .map((report) => report.occurredOn.slice(0, 10))
    .sort()
    .at(-1);
  if (!latest) return status;

  const confirmed = input.confirmedOn?.slice(0, 10);
  const positive = input.status === "available" || input.status === "available_soon" || input.status === "busy";
  if (positive && confirmed && DATE.test(confirmed) && confirmed > latest) return status;

  return {
    phrase: `Last reported unavailable, on ${formatReportDate(latest)}`,
    tone: "unavailable",
  };
}

export function accessNeededLine(employeeName: string, what: string): string {
  const who = employeeName.replace(/\s+/g, " ").trim();
  const need = what.replace(/\s+/g, " ").trim().replace(/\.+$/g, "");
  return `${who} needs ${need}`;
}

export interface AccessNeededLine {
  id: string;
  line: string;
  missionId: string | null;
}

function sameEmployee(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function isAfter(later: ReportView, earlier: ReportView): boolean {
  if (later.occurredOn !== earlier.occurredOn) return later.occurredOn > earlier.occurredOn;
  return later.createdAt > earlier.createdAt;
}

/**
 * One line per open access need. A later report from the same employee on
 * the same case means they resumed the step, and the line leaves. A second
 * report of the same need does not add a second line.
 */
export function accessNeededLines(reports: ReportView[]): AccessNeededLine[] {
  const open = reports.filter((item) => {
    if (item.kind !== "access_needed" || !item.accessWhat) return false;
    if (!item.missionId) return true;
    return !reports.some(
      (other) =>
        other.id !== item.id &&
        other.source === "employee" &&
        other.kind !== "access_needed" &&
        other.missionId === item.missionId &&
        sameEmployee(other.employeeName, item.employeeName) &&
        isAfter(other, item),
    );
  });

  const seen = new Set<string>();
  const lines: AccessNeededLine[] = [];
  const ordered = [...open].sort((a, b) => (isAfter(a, b) ? 1 : -1));
  for (const item of ordered) {
    const key = `${item.employeeName.trim().toLowerCase()}|${item.accessWhat!.trim().toLowerCase()}|${item.missionId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({
      id: item.id,
      line: accessNeededLine(item.employeeName, item.accessWhat!),
      missionId: item.missionId,
    });
  }
  return lines;
}

/**
 * A mailbox message belongs on a case when it is a later message on that
 * case's thread, or it replies to the message that opened the case.
 * The opening message itself is not a reply.
 */
export function caseReplyAttachment(input: {
  messageId: string;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  caseMessageKey: string | null;
  caseThreadKey: string | null;
}): { attach: boolean; reason: string } {
  const messageId = normalizeMessageId(input.messageId);
  if (!messageId) return { attach: false, reason: "no message id" };
  const identity = requirementIdentity({
    messageId,
    threadId: input.threadId,
  });
  if (input.caseMessageKey && identity.messageKey === input.caseMessageKey) {
    return { attach: false, reason: "opening message" };
  }
  if (input.caseThreadKey && identity.threadKey && identity.threadKey === input.caseThreadKey) {
    return { attach: true, reason: "thread" };
  }
  const openingId = input.caseMessageKey?.startsWith("message:")
    ? normalizeMessageId(input.caseMessageKey.slice("message:".length))
    : "";
  const refs = [input.inReplyTo, ...(input.references ?? [])]
    .map((value) => normalizeMessageId(value))
    .filter(Boolean);
  if (openingId && refs.includes(openingId)) return { attach: true, reason: "in-reply-to" };
  return { attach: false, reason: "different thread" };
}
