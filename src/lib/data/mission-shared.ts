// ---------------------------------------------------------------------------
// Missions, as the screens see them.
//
// Client-safe on purpose. The mission page, the tab strip, the Today screen
// and the server loaders all speak these types, and nothing here touches the
// database — the loaders are in missions.ts.
// ---------------------------------------------------------------------------

import type {
  ChannelWhose,
  MissionChannelKind,
  MissionStepRecord,
  TargetState,
} from "@/lib/ai/mission-report";

export type MissionKind = "research" | "recruiting";

/**
 * Where a mission is — read from its steps every time it is shown, never
 * stored, so the tab and the page cannot disagree.
 *
 *   queued     an instruction is waiting for the worker to pick it up
 *   working    the worker is on it now
 *   needs_you  the worker asked something only the CEO can decide
 *   ready      finished since the CEO last looked
 *   done       finished and seen; nothing is waiting on anybody
 *   blocked    it stopped: a failure, a spent budget, a run that never reported
 */
export type MissionState =
  | "queued"
  | "working"
  | "needs_you"
  | "ready"
  | "done"
  | "blocked";

export const MISSION_STATE_LABEL: Record<MissionState, string> = {
  queued: "Queued",
  working: "Working",
  needs_you: "Needs you",
  ready: "Ready",
  done: "Done",
  blocked: "Blocked",
};

/**
 * What an employee may do inside a mission without asking, and what it must
 * ask for. Shown to the CEO under "Autonomy" and given to the worker in its
 * instructions — one list, so the screen cannot promise a rule the worker was
 * never told.
 *
 * Deliberately only what is true today. "Prepare files" is not here because
 * no employee can yet.
 */
export const AUTONOMY_STANDARD = {
  name: "Standard",
  can: [
    "Search the web and read public pages",
    "Research companies, people and projects",
    "Record the companies and people it finds — marked unverified, with sources",
    "Keep what the mission holds up to date",
    "Draft what to say on a call or in an email",
  ],
  mustAsk: [
    "Sending any email or message",
    "Contacting anyone, by any channel",
    "Deleting anything",
    "Changing a commercial status",
    "Committing money, a rate, a date or a headcount",
  ],
} as const;

// ── activity ────────────────────────────────────────────────────────────────

/**
 * Something the worker did, in operational words: "Searched …", "Found Peter
 * Müller at GOLDBECK". Never its reasoning — the CEO asked for an audit trail,
 * not a transcript of pseudo-thought.
 */
export type ActivityKind =
  | "started"
  | "planned"
  | "searched"
  | "opened"
  | "looked"
  | "read"
  | "found"
  | "missing"
  | "dead"
  | "dropped"
  | "asked"
  | "progress"
  | "finished"
  | "failed"
  | "refused";

export interface ActivityEvent {
  at: string;
  kind: ActivityKind;
  text: string;
}

const ACTIVITY_KINDS = new Set<string>([
  "started",
  "planned",
  "progress",
  "searched",
  "opened",
  "looked",
  "read",
  "found",
  "missing",
  "dead",
  "dropped",
  "asked",
  "finished",
  "failed",
  "refused",
]);

/** Read the activity list off an agent_runs.metadata value, whatever is in it. */
export function parseActivity(metadata: unknown): ActivityEvent[] {
  const list = (metadata as { activity?: unknown } | null)?.activity;
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (e): e is ActivityEvent =>
        Boolean(e) &&
        typeof (e as ActivityEvent).text === "string" &&
        typeof (e as ActivityEvent).at === "string" &&
        ACTIVITY_KINDS.has(String((e as ActivityEvent).kind)),
    )
    .map((e) => ({ at: e.at, kind: e.kind, text: e.text }));
}

// ── what a mission holds ────────────────────────────────────────────────────

export interface MissionTab {
  id: string;
  title: string;
  emoji: string | null;
  kind: MissionKind;
  state: MissionState;
  /** Why it is blocked or what it is asking, in one line. */
  reason: string | null;
  updatedAt: string;
}

export interface MissionAttempt {
  /** sent | reached | no_answer | dead_end, or null when nobody wrote it down. */
  outcome: string | null;
  at: string;
  actionId: string | null;
}

export interface MissionChannel {
  kind: MissionChannelKind;
  value: string;
  whose: ChannelWhose;
}

export interface MissionCompanyRow {
  companyId: string;
  name: string;
  city: string | null;
  country: string | null;
  website: string | null;
  role: string | null;
  why: string;
  state: TargetState;
  /** A person on the team ruled it out inside this mission. */
  notForUs: { reason: string; at: string } | null;
  missing: { fact: string; owner: string } | null;
  deadReason: string | null;
  person: { contactId: string | null; name: string; title: string | null } | null;
  channel: MissionChannel | null;
  words: string | null;
  project: { name: string; evidence: string | null } | null;
  sources: Array<{ url: string; claim: string }>;
  /** Created by an employee, and nobody has confirmed it yet. */
  agentFound: boolean;
  verified: boolean;
  /** Other missions that found the same company — the company's memory. */
  alsoIn: Array<{ id: string; title: string; emoji: string | null }>;
  lastAttempt: MissionAttempt | null;
  /** Its own site has been read for the person and the door. */
  reachChecked: boolean;
  /** What reading the site did not turn up. */
  reachNote: string | null;
  foundAt: string;
  updatedAt: string;
}

export interface MissionPersonRow {
  contactId: string;
  name: string;
  title: string | null;
  companyId: string | null;
  companyName: string | null;
  channel: MissionChannel | null;
  words: string | null;
  state: TargetState;
  missing: string | null;
  notForUs: boolean;
  agentFound: boolean;
  verified: boolean;
  lastAttempt: MissionAttempt | null;
  sourceUrl: string | null;
}

export interface MissionProjectRow {
  name: string;
  evidence: string | null;
  companyId: string;
  companyName: string;
  sourceUrl: string | null;
  at: string;
}

export interface MissionSourceRow {
  url: string;
  host: string;
  claims: string[];
  /** The records this source supports. */
  about: string[];
  firstAt: string;
}

export interface MissionMessage {
  id: string;
  role: "human" | "agent";
  body: string;
  at: string;
  stepId: string;
}

export interface MissionStepView {
  id: string;
  status: string;
  instruction: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  record: MissionStepRecord | null;
  /** The sentence a failed step stored instead of a record. */
  error: string | null;
  activity: ActivityEvent[];
}

export interface MissionCandidate {
  workerId: string;
  name: string;
  role: string | null;
  status: string;
  availability: string | null;
  availableFrom: string | null;
  based: string | null;
  certificates: string[];
}

export interface MissionPartner {
  partnerId: string;
  name: string;
  trades: string[];
  crewSize: number | null;
  country: string | null;
  sellable: boolean;
  confirmedDaysAgo: number | null;
}

// ── the finish line ─────────────────────────────────────────────────────────

/**
 * What a mission's progress is counted in. Each is a question the records
 * answer on their own — never a number the worker reports about itself.
 */
export type MissionMetric =
  | "companies_found"
  | "companies_in_play"
  | "named_buyers"
  | "contact_routes"
  | "project_evidence"
  | "reachable"
  | "candidates_named"
  | "candidates_available"
  | "partners_confirmed";

/**
 * The kinds of work one worker does inside a mission. Named now so that a pass
 * can later run — or be handed to another employee — on its own, without the
 * mission changing shape.
 */
export type MissionPass =
  | "discover"
  | "research"
  | "verify"
  | "qualify"
  | "rank"
  | "prepare"
  | "match";

/** When the mission is finished: "20 companies still in play". */
export interface MissionCriterion {
  metric: MissionMetric;
  target: number;
  setBy: "agent" | "human";
}

/** How it gets there: "Name the buyer at each", done when its metric says so. */
export interface MissionPlanStep {
  position: number;
  pass: MissionPass;
  title: string;
  metric: MissionMetric;
}

export interface CriterionProgress extends MissionCriterion {
  actual: number;
  met: boolean;
  /** "20 companies still in play" — from the metric, never from a model. */
  label: string;
}

export interface PlanStepProgress extends MissionPlanStep {
  target: number;
  actual: number;
  done: boolean;
}

/** Counted from the records every time it is shown, like the state. */
export interface MissionProgress {
  criteria: CriterionProgress[];
  plan: PlanStepProgress[];
  /** 0–100: how much of each criterion is reached, averaged. 100 only when all are met. */
  percent: number;
  met: boolean;
  stepsDone: number;
  /** The first plan step not yet done. */
  current: PlanStepProgress | null;
}

export interface MissionWorkspace {
  mission: {
    id: string;
    title: string;
    emoji: string | null;
    objective: string;
    kind: MissionKind;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    lastSeenAt: string | null;
  };
  lead: { id: string; name: string; emoji: string; role: string | null } | null;
  state: MissionState;
  stateReason: string | null;
  tabs: MissionTab[];
  /** Newest first. */
  steps: MissionStepView[];
  /** The newest step that finished with a record. */
  latest: MissionStepRecord | null;
  /** Oldest first — a conversation reads top to bottom. */
  messages: MissionMessage[];
  companies: MissionCompanyRow[];
  people: MissionPersonRow[];
  projects: MissionProjectRow[];
  sources: MissionSourceRow[];
  candidates: MissionCandidate[];
  partners: MissionPartner[];
  /** Null until the mission has a finish line. */
  progress: MissionProgress | null;
  counts: {
    researched: number;
    qualified: number;
    callable: number;
    dead: number;
    notForUs: number;
  };
}

/** A person found in a mission who can be contacted today and has not been. */
export interface ReadyToContact {
  contactId: string;
  name: string;
  title: string | null;
  companyId: string | null;
  companyName: string | null;
  channel: MissionChannel;
  words: string | null;
  sourceUrl: string | null;
  mission: { id: string; title: string; emoji: string | null };
  verified: boolean;
}

// ── small words ─────────────────────────────────────────────────────────────

/** "just now", "8 min ago", "3 h ago", "yesterday", "4 d ago", "2 Sep". */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} d ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}
