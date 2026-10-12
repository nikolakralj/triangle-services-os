// ---------------------------------------------------------------------------
// Pinned client tabs — the pure rules (exception approved 2026-10-12).
//
// A client the owner names during a live negotiation becomes a pinned tab.
// The bots write the page from what already reaches them: forwarded email,
// WhatsApp, voice notes, employee reports and Scout's research. The owner
// fills in nothing.
//
// Binding product rules, and where they live in this file:
//   no CRM / no forms        → every line comes from planClientTabLine (a bot)
//   no status ladder, score  → a line has text, who, when and a source. That's all
//   no accept/reject per item → composeClientTab shows what happened, with dates
//   no directory             → at most MAX_OPEN_TABS open; closed tabs fold back
//
// No I/O here, so the check script can run it without a database.
// ---------------------------------------------------------------------------

export const MAX_OPEN_TABS = 5;
/** A tab with no new line for this long reads as gone quiet. */
export const QUIET_AFTER_DAYS = 30;
export const MAX_FIRMS_SHOWN = 8;

export const LINE_KINDS = ["need", "agreed", "open", "next_step", "timeline", "firm"] as const;
export type ClientTabLineKind = (typeof LINE_KINDS)[number];

export const SOURCE_KINDS = ["email", "whatsapp", "voice_note", "call_note", "report", "web"] as const;
export type ClientTabSourceKind = (typeof SOURCE_KINDS)[number];

export const CLOSE_REASONS = ["won", "lost", "quiet"] as const;
export type ClientTabCloseReason = (typeof CLOSE_REASONS)[number];

/** The need lines every negotiation has. Missing ones read "not known yet". */
export const NEED_TOPICS = [
  { key: "trade", label: "Trade" },
  { key: "headcount", label: "Headcount" },
  { key: "dates", label: "Dates" },
  { key: "site", label: "Site" },
  { key: "rates", label: "Rates and conditions" },
] as const;
export type NeedTopic = (typeof NEED_TOPICS)[number]["key"];

export const POSTING_QUESTION =
  "Can legally post workers to Austria/Germany (A1 + Austrian ZKO/registration)";

export type PostingAnswer = "yes" | "no" | "unknown";

export interface ClientTabLine {
  id: string;
  kind: ClientTabLineKind;
  topic: string | null;
  text: string;
  saidBy: string | null;
  saidOn: string | null;
  dueOn: string | null;
  sourceKind: ClientTabSourceKind | null;
  sourceRef: string | null;
  firmName: string | null;
  postingOk: PostingAnswer | null;
  firmAnswered: boolean | null;
  replacesId: string | null;
  employeeName: string;
  createdAt: string;
}

export interface OpenTab {
  id: string;
  companyId: string | null;
  companyName: string;
  pinnedAt: string;
  /** newest line or report on this client, for "gone quiet" */
  lastActivityAt: string | null;
}

// ── Ask: "open a tab for <client>" ────────────────────────────────────────

const OPEN_TAB =
  /^\s*(?:please\s+)?(?:open|pin|start)\s+(?:a\s+|the\s+)?(?:client\s+)?tab\s+(?:for|on|with)\s+(.+?)\s*[.!]?\s*$/i;

/** The client named in "open a tab for X" / "pin a tab for X", or null. */
export function parseOpenTabIntent(text: string): string | null {
  const match = OPEN_TAB.exec(text);
  if (!match) return null;
  const name = match[1].replace(/^["'“”]+|["'“”]+$/g, "").trim();
  if (name.length < 2 || name.length > 120) return null;
  return name;
}

export function sameClient(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return norm(a) !== "" && norm(a) === norm(b);
}

export type PinPlan =
  | { ok: true; alreadyOpen: OpenTab | null }
  | { ok: false; error: string };

export function planPin(openTabs: readonly OpenTab[], companyName: string): PinPlan {
  const name = companyName.trim();
  if (!name) return { ok: false, error: "Name the client first." };
  const existing = openTabs.find((tab) => sameClient(tab.companyName, name)) ?? null;
  if (existing) return { ok: true, alreadyOpen: existing };
  if (openTabs.length >= MAX_OPEN_TABS) {
    return {
      ok: false,
      error: `${MAX_OPEN_TABS} client tabs are already open. Close one (won, lost or gone quiet) first.`,
    };
  }
  return { ok: true, alreadyOpen: null };
}

export function tabIsQuiet(tab: Pick<OpenTab, "pinnedAt" | "lastActivityAt">, now = new Date()): boolean {
  const last = Date.parse(tab.lastActivityAt ?? tab.pinnedAt);
  if (Number.isNaN(last)) return false;
  return now.getTime() - last > QUIET_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

// ── A bot writes a line ───────────────────────────────────────────────────

export interface PlannedClientTabLine {
  companyId: string | null;
  companyName: string;
  kind: ClientTabLineKind;
  topic: string | null;
  text: string;
  saidBy: string | null;
  saidOn: string | null;
  dueOn: string | null;
  sourceKind: ClientTabSourceKind | null;
  sourceRef: string | null;
  firmName: string | null;
  postingOk: PostingAnswer | null;
  firmAnswered: boolean | null;
  replacesId: string | null;
  idempotencyKey: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function date(value: unknown): string | null | "bad" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !DATE.test(value.slice(0, 10))) return "bad";
  return value.slice(0, 10);
}

/** FNV-1a, enough to make a retried POST land once. */
function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function planClientTabLine(
  body: unknown,
): { ok: true; planned: PlannedClientTabLine } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Send a JSON object." };
  const b = body as Record<string, unknown>;

  const kind = b.kind;
  if (typeof kind !== "string" || !(LINE_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: `kind must be one of: ${LINE_KINDS.join(", ")}.` };
  }
  const companyName = str(b.company, 200);
  const companyId = typeof b.companyId === "string" && UUID.test(b.companyId) ? b.companyId : null;
  if (!companyName && !companyId) return { ok: false, error: "Name the client: company or companyId." };

  const text = str(b.text, 600);
  if (!text) return { ok: false, error: "text is required: one line, in plain words." };

  const saidOn = date(b.saidOn);
  const dueOn = date(b.dueOn);
  if (saidOn === "bad" || dueOn === "bad") return { ok: false, error: "Dates are YYYY-MM-DD." };

  const sourceKindRaw = b.sourceKind;
  let sourceKind: ClientTabSourceKind | null = null;
  if (sourceKindRaw !== undefined && sourceKindRaw !== null) {
    if (typeof sourceKindRaw !== "string" || !(SOURCE_KINDS as readonly string[]).includes(sourceKindRaw)) {
      return { ok: false, error: `sourceKind must be one of: ${SOURCE_KINDS.join(", ")}.` };
    }
    sourceKind = sourceKindRaw as ClientTabSourceKind;
  }
  const sourceRef = str(b.sourceRef, 500);
  const saidBy = str(b.saidBy, 120);

  let topic = str(b.topic, 60)?.toLowerCase() ?? null;
  if (kind === "need") {
    if (!topic) return { ok: false, error: "A need names its topic: trade, headcount, dates, site, rates." };
    if (!NEED_TOPICS.some((t) => t.key === topic)) {
      return { ok: false, error: "topic must be one of: trade, headcount, dates, site, rates." };
    }
  } else {
    topic = null;
  }

  // A line that claims something was said must say who said it, when, and
  // where. Otherwise the page looks complete and is wrong.
  if (kind === "need" || kind === "agreed" || kind === "timeline") {
    if (!saidOn) return { ok: false, error: `${kind} lines need saidOn (YYYY-MM-DD).` };
    if (!sourceKind) return { ok: false, error: `${kind} lines need sourceKind.` };
  }
  if (kind === "next_step" && !dueOn) {
    return { ok: false, error: "The next step needs a date: dueOn (YYYY-MM-DD)." };
  }

  let firmName: string | null = null;
  let postingOk: PostingAnswer | null = null;
  let firmAnswered: boolean | null = null;
  if (kind === "firm") {
    firmName = str(b.firmName, 200);
    if (!firmName) return { ok: false, error: "A firm line needs firmName." };
    if (!sourceRef) return { ok: false, error: "A firm line needs sourceRef (where Scout found it)." };
    const posting = b.postingOk ?? "unknown";
    if (posting !== "yes" && posting !== "no" && posting !== "unknown") {
      return { ok: false, error: "postingOk is yes, no or unknown." };
    }
    postingOk = posting;
    firmAnswered = b.answered === true;
  }

  if ("score" in b || "status" in b || "stage" in b) {
    return { ok: false, error: "Client tabs carry no scores and no status. Write what happened, with a date." };
  }

  const replacesId = typeof b.replacesId === "string" && UUID.test(b.replacesId) ? b.replacesId : null;
  const key = [
    companyId ?? companyName?.toLowerCase(),
    kind,
    topic ?? "",
    firmName?.toLowerCase() ?? "",
    text.toLowerCase(),
    saidOn ?? "",
    dueOn ?? "",
    sourceRef ?? "",
  ].join("|");

  return {
    ok: true,
    planned: {
      companyId,
      companyName: companyName ?? "",
      kind: kind as ClientTabLineKind,
      topic,
      text,
      saidBy,
      saidOn,
      dueOn,
      sourceKind,
      sourceRef,
      firmName,
      postingOk,
      firmAnswered,
      replacesId,
      idempotencyKey: `ctl:${hash(key)}:${hash(key.split("").reverse().join(""))}`,
    },
  };
}

// ── The page, composed ─────────────────────────────────────────────────────

export interface ReportLike {
  id: string;
  occurredOn: string;
  employeeName: string;
  sentence: string;
  evidenceUrl: string | null;
}

export interface TabLineView {
  id: string;
  text: string;
  who: string | null;
  when: string | null;
  sourceLabel: string | null;
  sourceHref: string | null;
}

export interface NeedView {
  topic: string;
  label: string;
  lines: TabLineView[];
  /** true when no bot has written this topic yet */
  notKnownYet: boolean;
}

export interface FirmView {
  id: string;
  name: string;
  reason: string;
  posting: PostingAnswer;
  answered: boolean;
  sourceLabel: string | null;
  sourceHref: string | null;
  when: string;
}

export interface ClientTabView {
  nextStep: (TabLineView & { dueOn: string }) | null;
  open: TabLineView[];
  needs: NeedView[];
  agreed: TabLineView[];
  timeline: (TabLineView & { kind: ClientTabSourceKind | "report" })[];
  firms: FirmView[];
  lastActivityAt: string | null;
}

const SOURCE_LABEL: Record<ClientTabSourceKind, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  voice_note: "Voice note",
  call_note: "Call note",
  report: "Report",
  web: "Web",
};

/**
 * A source reference becomes a link when it can be one: a URL as it is, an
 * id to the record the app already draws. Anything else is shown as text.
 */
export function sourceHref(kind: ClientTabSourceKind | null, ref: string | null): string | null {
  if (!ref) return null;
  if (/^https?:\/\//i.test(ref)) return ref;
  if (ref.startsWith("/")) return ref;
  if (UUID.test(ref)) {
    if (kind === "email" || kind === "report") return `/missions/${ref}`;
  }
  return null;
}

function lineView(line: ClientTabLine): TabLineView {
  return {
    id: line.id,
    text: line.text,
    who: line.saidBy ?? line.employeeName ?? null,
    when: line.saidOn ?? line.createdAt.slice(0, 10),
    sourceLabel: line.sourceKind ? SOURCE_LABEL[line.sourceKind] : null,
    sourceHref: sourceHref(line.sourceKind, line.sourceRef),
  };
}

function newestFirst<T extends { when: string | null; id: string }>(a: T, b: T): number {
  return (b.when ?? "").localeCompare(a.when ?? "") || b.id.localeCompare(a.id);
}

export function composeClientTab(input: {
  lines: readonly ClientTabLine[];
  reports: readonly ReportLike[];
}): ClientTabView {
  const replaced = new Set(input.lines.map((l) => l.replacesId).filter(Boolean) as string[]);
  const live = input.lines
    .filter((l) => !replaced.has(l.id))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const next = live.find((l) => l.kind === "next_step" && l.dueOn) ?? null;

  const needs: NeedView[] = NEED_TOPICS.map((topic) => {
    const lines = live.filter((l) => l.kind === "need" && l.topic === topic.key).map(lineView);
    return { topic: topic.key, label: topic.label, lines, notKnownYet: lines.length === 0 };
  });

  const timeline = [
    ...live
      .filter((l) => l.kind === "timeline")
      .map((l) => ({ ...lineView(l), kind: (l.sourceKind ?? "report") as ClientTabSourceKind | "report" })),
    ...input.reports.map((r) => ({
      id: `report:${r.id}`,
      text: r.sentence,
      who: r.employeeName,
      when: r.occurredOn,
      sourceLabel: r.evidenceUrl ? "Evidence" : "Report",
      sourceHref: r.evidenceUrl,
      kind: "report" as const,
    })),
  ].sort(newestFirst);

  // One line per firm: the newest thing Scout wrote about it.
  const seen = new Set<string>();
  const firms: FirmView[] = [];
  for (const l of live) {
    if (l.kind !== "firm" || !l.firmName) continue;
    const key = l.firmName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    firms.push({
      id: l.id,
      name: l.firmName,
      reason: l.text,
      posting: l.postingOk ?? "unknown",
      answered: Boolean(l.firmAnswered),
      sourceLabel: l.sourceKind ? SOURCE_LABEL[l.sourceKind] : "Source",
      sourceHref: sourceHref(l.sourceKind, l.sourceRef),
      when: l.createdAt.slice(0, 10),
    });
    if (firms.length >= MAX_FIRMS_SHOWN) break;
  }

  const stamps = [
    ...input.lines.map((l) => l.createdAt),
    ...input.reports.map((r) => r.occurredOn),
  ].filter(Boolean);

  return {
    nextStep: next ? { ...lineView(next), dueOn: next.dueOn as string } : null,
    open: live.filter((l) => l.kind === "open").map(lineView),
    needs,
    agreed: live.filter((l) => l.kind === "agreed").map(lineView).sort(newestFirst),
    timeline,
    firms,
    lastActivityAt: stamps.length ? stamps.sort().at(-1) ?? null : null,
  };
}

export function postingLabel(answer: PostingAnswer): string {
  return answer === "yes" ? "yes" : answer === "no" ? "no" : "unknown";
}
