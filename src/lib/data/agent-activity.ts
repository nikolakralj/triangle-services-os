// ---------------------------------------------------------------------------
// Previous-day activity for a morning summary.
//
// Hanna (and any other badge) reads what every bot in the organisation did,
// then tells Ralph. This module decides the window, the caps, and the shape.
// It does not read or write the database.
//
// The company calendar is Europe/Zagreb, the same clock as employee reports.
// A calendar day runs from local midnight inclusive to the next midnight
// exclusive, including the 23-hour and 25-hour days when the clocks change.
// ---------------------------------------------------------------------------

export const ZAGREB = "Europe/Zagreb";

/** One list (assignments, messages, …) never returns more than this. */
export const ACTIVITY_ITEMS_PER_LIST = 20;

/** Free text is collapsed and cut to this many characters, ellipsis included. */
export const ACTIVITY_TEXT_MAX = 180;

/** Rows fetched per query before the per-list cap. Newest first. */
export const ACTIVITY_QUERY_LIMIT = 200;

/** A requested window may not exceed this. Thirty-one calendar days, plus one for the clock change. */
const MAX_WINDOW_MS = 32 * 24 * 60 * 60 * 1000;

const WHATSAPP_STATUSES = new Set(["sent", "delivered", "read"]);

const FINDING_LABEL_KEYS = [
  "summary",
  "name",
  "company_name",
  "company",
  "project_name",
  "full_name",
  "title",
  "role",
] as const;

export interface ActivityWindow {
  since: string;
  until: string;
  timeZone: typeof ZAGREB;
}

export interface ActivityAssignmentRow {
  id: string;
  agentInstanceId: string | null;
  title: string;
  status: string;
  resultSummary: string | null;
  missionId: string | null;
  missionTitle: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ActivityMissionRow {
  id: string;
  leadAgentInstanceId: string | null;
  title: string;
  kind: string;
  objective: string;
  createdAt: string;
}

export interface ActivityWhatsAppRow {
  id: string;
  agentInstanceId: string | null;
  toNumber: string;
  status: string;
  body: string | null;
  direction: string;
  sentAt: string | null;
  waTimestamp: string | null;
  updatedAt: string | null;
}

export interface ActivityReportRow {
  id: string;
  agentInstanceId: string | null;
  employeeName: string | null;
  kind: string;
  personName: string | null;
  companyName: string | null;
  note: string | null;
  createdAt: string;
}

export interface ActivityFindingRow {
  id: string;
  agentInstanceId: string | null;
  findingType: string;
  status: string;
  evidenceText: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface ActivityBotIdentity {
  id: string;
  name: string;
  role: string | null;
  badge: string | null;
}

export interface ActivityItem {
  id: string;
  at: string;
}

export interface ActivityAssignment extends ActivityItem {
  title: string;
  missionTitle: string | null;
  status: string;
  events: Array<"created" | "completed" | "failed">;
  resultSummary: string | null;
}

export interface ActivityMission extends ActivityItem {
  title: string;
  kind: string;
  objective: string | null;
}

export interface ActivityWhatsApp extends ActivityItem {
  to: string;
  status: string;
  text: string | null;
}

export interface ActivityReport extends ActivityItem {
  kind: string;
  personName: string | null;
  companyName: string | null;
  note: string | null;
}

export interface ActivityFinding extends ActivityItem {
  findingType: string;
  status: string;
  summary: string | null;
}

export interface ActivityBotGroup {
  agentInstanceId: string | null;
  name: string;
  role: string | null;
  badge: string | null;
  assignments: ActivityAssignment[];
  missions: ActivityMission[];
  whatsapp: ActivityWhatsApp[];
  reports: ActivityReport[];
  findings: ActivityFinding[];
  omitted: {
    assignments: number;
    missions: number;
    whatsapp: number;
    reports: number;
    findings: number;
  };
}

export interface ActivityBody {
  window: ActivityWindow;
  caps: { itemsPerList: number; text: number };
  truncated: boolean;
  bots: ActivityBotGroup[];
  note: string;
}

export function zagrebCalendarDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZAGREB,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** UTC milliseconds of the same wall-clock reading in Europe/Zagreb. */
function zagrebWallClockUtc(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZAGREB,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  let hour = value("hour");
  if (hour === 24) hour = 0;
  return Date.UTC(value("year"), value("month") - 1, value("day"), hour, value("minute"), value("second"));
}

/** UTC instant of 00:00:00 on that calendar date in Europe/Zagreb. */
export function zagrebMidnightUtc(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offsetMinutes = Math.round((zagrebWallClockUtc(guess) - guess.getTime()) / 60000);
  let instant = new Date(guess.getTime() - offsetMinutes * 60000);
  const corrected = Math.round((zagrebWallClockUtc(instant) - instant.getTime()) / 60000);
  if (corrected !== offsetMinutes) instant = new Date(guess.getTime() - corrected * 60000);
  return instant;
}

export function previousZagrebDay(now = new Date()): { since: string; until: string } {
  const today = zagrebCalendarDate(now);
  const yesterday = addCalendarDays(today, -1);
  return {
    since: zagrebMidnightUtc(yesterday).toISOString(),
    until: zagrebMidnightUtc(today).toISOString(),
  };
}

function parseIso(value: string): Date | null {
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function parseActivityWindow(
  sinceRaw: string | null,
  untilRaw: string | null,
  now = new Date(),
): { ok: true; window: ActivityWindow } | { ok: false; error: string } {
  const sinceGiven = Boolean(sinceRaw?.trim());
  const untilGiven = Boolean(untilRaw?.trim());
  if (!sinceGiven && !untilGiven) {
    return {
      ok: true,
      window: { ...previousZagrebDay(now), timeZone: ZAGREB },
    };
  }
  if (!sinceGiven || !untilGiven) {
    return {
      ok: false,
      error: "Send both since and until, or neither to use the previous day in Europe/Zagreb.",
    };
  }
  const since = parseIso(sinceRaw ?? "");
  const until = parseIso(untilRaw ?? "");
  if (!since || !until) {
    return { ok: false, error: "since and until must be ISO-8601 datetimes." };
  }
  if (since.getTime() >= until.getTime()) {
    return { ok: false, error: "since must be earlier than until." };
  }
  if (until.getTime() - since.getTime() > MAX_WINDOW_MS) {
    return { ok: false, error: "since and until can cover at most 31 days." };
  }
  return {
    ok: true,
    window: { since: since.toISOString(), until: until.toISOString(), timeZone: ZAGREB },
  };
}

export function inWindow(iso: string | null | undefined, since: string, until: string): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  return time >= new Date(since).getTime() && time < new Date(until).getTime();
}

/** Last four digits only. Shorter values stay fully masked. */
export function maskPhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••${digits.slice(-4)}`;
}

export function clipText(value: string | null | undefined, max = ACTIVITY_TEXT_MAX): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function badgeLabel(credentials: Array<{ name: string; status: string }>): string | null {
  const active = credentials
    .filter((credential) => credential.status === "active")
    .map((credential) => credential.name.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  if (!active.length) return null;
  return active.join(", ");
}

function byNewest<T extends ActivityItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const time = Date.parse(b.at) - Date.parse(a.at);
    if (time !== 0) return time;
    return a.id.localeCompare(b.id);
  });
}

function capList<T>(items: T[]): { items: T[]; omitted: number } {
  if (items.length <= ACTIVITY_ITEMS_PER_LIST) return { items, omitted: 0 };
  return {
    items: items.slice(0, ACTIVITY_ITEMS_PER_LIST),
    omitted: items.length - ACTIVITY_ITEMS_PER_LIST,
  };
}

function findingSummary(row: ActivityFindingRow): string | null {
  const payload = row.payload ?? {};
  let label: string | null = null;
  for (const key of FINDING_LABEL_KEYS) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      label = value.trim();
      break;
    }
  }
  const evidence = (row.evidenceText ?? "").replace(/\s+/g, " ").trim();
  const combined = [label, evidence && evidence !== label ? evidence : null].filter(Boolean).join(" — ");
  return clipText(combined);
}

function whatsappAt(row: ActivityWhatsAppRow, since: string, until: string): string | null {
  if (row.direction !== "outbound") return null;
  if (!WHATSAPP_STATUSES.has(row.status)) return null;
  if (inWindow(row.sentAt, since, until)) return row.sentAt;
  if (!row.sentAt && inWindow(row.waTimestamp, since, until)) return row.waTimestamp;
  if ((row.status === "delivered" || row.status === "read") && inWindow(row.updatedAt, since, until)) {
    return row.updatedAt;
  }
  return null;
}

interface Bucket {
  agentInstanceId: string | null;
  name: string;
  role: string | null;
  badge: string | null;
  assignments: ActivityAssignment[];
  missions: ActivityMission[];
  whatsapp: ActivityWhatsApp[];
  reports: ActivityReport[];
  findings: ActivityFinding[];
}

export function shapeActivity(input: {
  window: ActivityWindow;
  assignments: ActivityAssignmentRow[];
  missions: ActivityMissionRow[];
  whatsapp: ActivityWhatsAppRow[];
  reports: ActivityReportRow[];
  findings: ActivityFindingRow[];
  bots: ActivityBotIdentity[];
  truncated: boolean;
}): ActivityBody {
  const { since, until } = input.window;
  const known = new Map(input.bots.map((bot) => [bot.id, bot]));
  const buckets = new Map<string, Bucket>();

  const bucketFor = (agentInstanceId: string | null, fallbackName: string | null): Bucket => {
    if (agentInstanceId) {
      const key = agentInstanceId;
      const existing = buckets.get(key);
      if (existing) return existing;
      const bot = known.get(agentInstanceId);
      const created: Bucket = {
        agentInstanceId,
        name: clipText(bot?.name) ?? clipText(fallbackName) ?? "Unknown employee",
        role: clipText(bot?.role ?? null),
        badge: clipText(bot?.badge ?? null),
        assignments: [],
        missions: [],
        whatsapp: [],
        reports: [],
        findings: [],
      };
      buckets.set(key, created);
      return created;
    }
    const name = clipText(fallbackName) ?? "Unattributed";
    const key = `name:${name.toLowerCase()}`;
    const existing = buckets.get(key);
    if (existing) return existing;
    const created: Bucket = {
      agentInstanceId: null,
      name,
      role: null,
      badge: null,
      assignments: [],
      missions: [],
      whatsapp: [],
      reports: [],
      findings: [],
    };
    buckets.set(key, created);
    return created;
  };

  for (const row of input.assignments) {
    const events: ActivityAssignment["events"] = [];
    if (inWindow(row.createdAt, since, until)) events.push("created");
    if (inWindow(row.completedAt, since, until) && row.status === "completed") events.push("completed");
    if (inWindow(row.completedAt, since, until) && row.status === "failed") events.push("failed");
    if (!events.length) continue;
    const at = events.includes("completed") || events.includes("failed") ? row.completedAt ?? row.createdAt : row.createdAt;
    const finished = events.includes("completed") || events.includes("failed");
    bucketFor(row.agentInstanceId, null).assignments.push({
      id: row.id,
      title: clipText(row.title) ?? "",
      missionTitle: clipText(row.missionTitle),
      status: row.status,
      events,
      resultSummary: finished ? clipText(row.resultSummary) : null,
      at,
    });
  }

  for (const row of input.missions) {
    if (!inWindow(row.createdAt, since, until)) continue;
    bucketFor(row.leadAgentInstanceId, null).missions.push({
      id: row.id,
      title: clipText(row.title) ?? "",
      kind: row.kind,
      objective: clipText(row.objective),
      at: row.createdAt,
    });
  }

  for (const row of input.whatsapp) {
    const at = whatsappAt(row, since, until);
    if (!at) continue;
    bucketFor(row.agentInstanceId, null).whatsapp.push({
      id: row.id,
      to: maskPhone(row.toNumber),
      status: row.status,
      text: clipText(row.body),
      at,
    });
  }

  for (const row of input.reports) {
    if (!inWindow(row.createdAt, since, until)) continue;
    bucketFor(row.agentInstanceId, row.employeeName).reports.push({
      id: row.id,
      kind: row.kind,
      personName: clipText(row.personName),
      companyName: clipText(row.companyName),
      note: clipText(row.note),
      at: row.createdAt,
    });
  }

  for (const row of input.findings) {
    if (!inWindow(row.createdAt, since, until)) continue;
    bucketFor(row.agentInstanceId, null).findings.push({
      id: row.id,
      findingType: row.findingType,
      status: row.status,
      summary: findingSummary(row),
      at: row.createdAt,
    });
  }

  const bots = [...buckets.values()]
    .map((bucket) => {
      const assignments = capList(byNewest(bucket.assignments));
      const missions = capList(byNewest(bucket.missions));
      const whatsapp = capList(byNewest(bucket.whatsapp));
      const reports = capList(byNewest(bucket.reports));
      const findings = capList(byNewest(bucket.findings));
      return {
        agentInstanceId: bucket.agentInstanceId,
        name: bucket.name,
        role: bucket.role,
        badge: bucket.badge,
        assignments: assignments.items,
        missions: missions.items,
        whatsapp: whatsapp.items,
        reports: reports.items,
        findings: findings.items,
        omitted: {
          assignments: assignments.omitted,
          missions: missions.omitted,
          whatsapp: whatsapp.omitted,
          reports: reports.omitted,
          findings: findings.omitted,
        },
      };
    })
    .filter(
      (bot) =>
        bot.assignments.length +
          bot.missions.length +
          bot.whatsapp.length +
          bot.reports.length +
          bot.findings.length >
        0,
    )
    .sort((a, b) => {
      const named = Number(a.agentInstanceId == null) - Number(b.agentInstanceId == null);
      if (named !== 0) return named;
      const name = a.name.localeCompare(b.name);
      if (name !== 0) return name;
      return (a.agentInstanceId ?? "").localeCompare(b.agentInstanceId ?? "");
    });

  return {
    window: { since, until, timeZone: ZAGREB },
    caps: { itemsPerList: ACTIVITY_ITEMS_PER_LIST, text: ACTIVITY_TEXT_MAX },
    truncated: input.truncated,
    bots,
    note:
      "Activity for this organisation between since (inclusive) and until (exclusive). " +
      "With no query, that is the previous calendar day in Europe/Zagreb. " +
      "Each list is capped. WhatsApp numbers show the last four digits. This call only reads.",
  };
}
