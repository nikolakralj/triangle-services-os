// ---------------------------------------------------------------------------
// One email asking for people → one recruiting case.
//
// Pure on purpose. Ingest, the Today line and the offline check all use
// these rules, and none of them need a database to decide. The database
// writer is `src/lib/data/requirement-case.ts`.
//
// A confident request with two or more roles opens one case and wakes Hanna
// and Bob once each. A single clear role stays on its reply card. Anything
// unsure stays on Today for a person and wakes nobody.
// ---------------------------------------------------------------------------

export const REQUIREMENT_CONFIDENCE_FLOOR = 70;

export const HANNA_STEP = "hanna" as const;
export const BOB_STEP = "bob" as const;
export type RequirementOwner = typeof HANNA_STEP | typeof BOB_STEP;

export interface RequirementRoleRow {
  title: string;
  headcount: number;
  level: string | null;
  skills: string[];
  startText: string | null;
  durationText: string | null;
  location: string | null;
  languages: string[];
  rateText: string | null;
}

export interface RequirementIdentity {
  /** Stable id for this message. */
  messageKey: string;
  /** Set when the mailbox gave us a thread. */
  threadKey: string | null;
  /** Original requester + subject, so a forward matches the request it carries. */
  forwardKey: string | null;
  /** The key the rows share. Thread, then forward, then message. */
  sourceKey: string;
}

export type RequirementDecision =
  | {
      action: "open";
      roles: RequirementRoleRow[];
      openQuestions: string[];
      reason: string;
    }
  | { action: "hold"; reason: string }
  | { action: "needs_you"; reason: string }
  | { action: "skip"; reason: string };

const LEVEL_WORDS = ["basic", "advanced", "expert", "junior", "senior", "intermediate"] as const;

const NUMBER_WORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
};

function clean(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return null;
  return text;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter((item) => item.length > 0);
  }
  const one = clean(value);
  if (!one) return [];
  return one
    .split(/[,;/]| and /i)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function headcountOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.round(value);
    return n >= 1 ? n : null;
  }
  const text = clean(value);
  if (!text) return null;
  const digits = text.match(/\d+/);
  if (digits) {
    const n = Number(digits[0]);
    return n >= 1 ? n : null;
  }
  const word = text.toLowerCase().match(/\b(two|three|four|five|six|seven|eight|nine|ten|twelve)\b/);
  if (!word) return null;
  return NUMBER_WORDS[word[1]] ?? null;
}

/** One role object from the model, or null when the row is not usable. */
export function normaliseRequirementRole(value: unknown): RequirementRoleRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const title = clean(row.title ?? row.roleTitle ?? row.role);
  const headcount = headcountOf(row.count ?? row.headcount ?? row.headcountText);
  if (!title || !headcount) return null;
  const skills = [...stringList(row.skills), ...stringList(row.tools)];
  return {
    title,
    headcount,
    level: clean(row.level),
    skills: Array.from(new Set(skills)),
    startText: clean(row.start ?? row.startText ?? row.startDateText),
    durationText: clean(row.duration ?? row.durationText),
    location: clean(row.location ?? row.city),
    languages: stringList(row.languages ?? row.language),
    rateText: clean(row.rate ?? row.rateText),
  };
}

export function normaliseRequirementRoles(value: unknown): RequirementRoleRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => normaliseRequirementRole(row))
    .filter((row): row is RequirementRoleRow => row !== null);
}

export function normaliseOpenQuestions(value: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of stringList(value)) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, 8);
}

export function headcountSum(roles: RequirementRoleRow[]): number {
  return roles.reduce((sum, role) => sum + role.headcount, 0);
}

/**
 * A number the email stated for the whole request, when it stated one.
 * "several" is plural with no number: `{ plural: true, total: null }`.
 */
export function statedHeadcount(text: string | null | undefined): {
  plural: boolean;
  total: number | null;
} {
  const raw = (text ?? "").trim().toLowerCase();
  if (!raw) return { plural: false, total: null };
  if (/\b(several|multiple|various|a range of|roles)\b/.test(raw) && !/\d/.test(raw)) {
    return { plural: true, total: null };
  }
  const digits = raw.match(/\d+/);
  if (digits) {
    const total = Number(digits[0]);
    return { plural: total >= 2, total: total >= 1 ? total : null };
  }
  const word = raw.match(/\b(two|three|four|five|six|seven|eight|nine|ten|twelve)\b/);
  if (!word) return { plural: false, total: null };
  const total = NUMBER_WORDS[word[1]] ?? null;
  return { plural: (total ?? 0) >= 2, total };
}

/** Distinct seniority words in the email. Two of them means more than one role. */
export function distinctLevels(text: string | null | undefined): string[] {
  const raw = (text ?? "").toLowerCase();
  return LEVEL_WORDS.filter((word) => new RegExp(`\\b${word}\\b`).test(raw));
}

export function requirementIdentity(input: {
  messageId: string;
  threadId?: string | null;
  subject?: string | null;
  requesterEmail?: string | null;
}): RequirementIdentity {
  const messageKey = `message:${input.messageId.trim()}`;
  const thread = (input.threadId ?? "").trim();
  const threadKey = thread ? `thread:${thread}` : null;
  const forwardKey = forwardIdentity(input.requesterEmail ?? null, input.subject ?? null);
  return {
    messageKey,
    threadKey,
    forwardKey,
    sourceKey: threadKey ?? forwardKey ?? messageKey,
  };
}

export function normaliseSubject(subject: string | null | undefined): string {
  let text = (subject ?? "").trim().toLowerCase();
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text.replace(/^(fwd|fw|wg|re|aw)\s*:\s*/, "").trim();
  }
  return text.replace(/\s+/g, " ");
}

function forwardIdentity(email: string | null, subject: string | null): string | null {
  const who = (email ?? "").trim().toLowerCase();
  const about = normaliseSubject(subject);
  if (!who || !about) return null;
  return `forward:${who}|${about}`;
}

export function sameRequirement(
  stored: { messageKey: string | null; threadKey: string | null; forwardKey: string | null },
  incoming: RequirementIdentity,
): boolean {
  if (stored.messageKey && stored.messageKey === incoming.messageKey) return true;
  if (incoming.threadKey && stored.threadKey && stored.threadKey === incoming.threadKey) return true;
  if (incoming.forwardKey && stored.forwardKey && stored.forwardKey === incoming.forwardKey) {
    return true;
  }
  return false;
}

export function decideRequirementCase(input: {
  classification: string;
  confidence: number;
  roles: unknown;
  openQuestions?: unknown;
  headcountText?: string | null;
  /** Subject plus body, so a collapsed extraction can still be seen as unsure. */
  text?: string | null;
}): RequirementDecision {
  if (input.classification !== "job_opportunity") {
    return { action: "skip", reason: "This email is not a request for people." };
  }

  const roles = normaliseRequirementRoles(input.roles);
  const questions = normaliseOpenQuestions(input.openQuestions);
  const stated = statedHeadcount(input.headcountText);
  const levels = distinctLevels(input.text);
  const confident = input.confidence >= REQUIREMENT_CONFIDENCE_FLOOR;

  if (!confident) {
    return {
      action: "needs_you",
      reason: "The read of this email is not confident enough to start the team.",
    };
  }

  if (levels.length >= 2 && roles.length < 2) {
    return {
      action: "needs_you",
      reason: "The email names more than one level, and the roles did not come out cleanly.",
    };
  }

  if (roles.length >= 2) {
    if (stated.total !== null && stated.total !== headcountSum(roles)) {
      return {
        action: "needs_you",
        reason: "The role counts do not add up to the number the email stated.",
      };
    }
    return {
      action: "open",
      roles,
      openQuestions: questions,
      reason: `${roles.length} roles, read confidently.`,
    };
  }

  if (stated.plural && roles.length < 2) {
    return {
      action: "needs_you",
      reason: "The email asks for more than one person, and the roles did not come out as separate rows.",
    };
  }

  if (roles.length === 1) {
    return { action: "hold", reason: "One role. The reply card stays." };
  }

  return {
    action: "hold",
    reason: "A people request with a single role. The reply card stays.",
  };
}

export function requirementPlace(input: {
  city?: string | null;
  sector?: string | null;
}): string | null {
  const city = clean(input.city);
  const sector = clean(input.sector);
  if (city && sector) {
    if (sector.toLowerCase().includes(city.toLowerCase())) return sector;
    return `${city} ${sector}`;
  }
  return city ?? sector;
}

/**
 * The Today sentence. The number is how many people were asked for, which is
 * how the plan names Ralph's line ("6 roles"); the table is one row per role.
 */
export function requirementCaseTitle(input: {
  who: string | null;
  place: string | null;
  roles: RequirementRoleRow[];
}): string {
  const who = clean(input.who) ?? "A request";
  const people = headcountSum(input.roles);
  const count = `${people} ${people === 1 ? "role" : "roles"}`;
  const place = clean(input.place);
  return place ? `${who} · ${place} · ${count}` : `${who} · ${count}`;
}

export function requirementStatusLine(hannaStatus: string, bobStatus: string): string {
  const hannaWorking = hannaStatus === "queued" || hannaStatus === "active";
  const bobDrafted = bobStatus === "completed" || bobStatus === "waiting_review";
  const bobWorking = bobStatus === "queued" || bobStatus === "active";
  if (hannaWorking && bobDrafted) return "Hanna sourcing, reply drafted";
  if (hannaWorking && bobWorking) return "Hanna sourcing, Bob drafting the reply";
  if (bobDrafted) return "Reply drafted";
  if (hannaStatus === "failed" || bobStatus === "failed") return "Stopped — needs a look";
  return "Hanna and Bob are on it";
}

export function requirementZone(input: {
  hannaStatus: string;
  bobStatus: string;
  missionClosed: boolean;
  missionState: string;
}): "needs_you" | "in_progress" | "hidden" {
  if (input.missionClosed || input.missionState === "done" || input.missionState === "ready") {
    return "hidden";
  }
  const bobDrafted = input.bobStatus === "completed" || input.bobStatus === "waiting_review";
  if (bobDrafted || input.missionState === "needs_you" || input.missionState === "blocked") {
    return "needs_you";
  }
  if (input.hannaStatus === "failed" || input.bobStatus === "failed") return "needs_you";
  return "in_progress";
}

export interface RequirementCaseLine {
  missionId: string;
  leadId: string | null;
  title: string;
  line: string;
  zone: "needs_you" | "in_progress";
  roles: RequirementRoleRow[];
  openQuestions: string[];
}

export interface MemoryCase {
  missionId: string;
  messageKey: string;
  threadKey: string | null;
  forwardKey: string | null;
  roles: RequirementRoleRow[];
  steps: RequirementOwner[];
}

/**
 * The idempotency rule the database writer follows.
 * A second sight of the same message, thread or forward wakes nobody.
 */
export function fileRequirementCase(
  memory: MemoryCase[],
  input: {
    identity: RequirementIdentity;
    decision: RequirementDecision;
    missionId: string;
  },
): { created: boolean; missionId: string | null; wake: RequirementOwner[] } {
  if (input.decision.action !== "open") {
    return { created: false, missionId: null, wake: [] };
  }
  const found = memory.find((row) => sameRequirement(row, input.identity));
  if (found) return { created: false, missionId: found.missionId, wake: [] };
  memory.push({
    missionId: input.missionId,
    messageKey: input.identity.messageKey,
    threadKey: input.identity.threadKey,
    forwardKey: input.identity.forwardKey,
    roles: input.decision.roles,
    steps: [HANNA_STEP, BOB_STEP],
  });
  return { created: true, missionId: input.missionId, wake: [HANNA_STEP, BOB_STEP] };
}

export function stepIdempotencyKey(sourceKey: string, owner: RequirementOwner): string {
  return `requirement-case:${sourceKey}:${owner}`;
}

export function hannaStepObjective(roles: RequirementRoleRow[], openQuestions: string[]): string {
  return [
    "Who we put forward, per role.",
    "This is one recruiting case. Propose who we put forward for each role, and why.",
    "When the requester is an agency, use anonymised bios. A person releases a name.",
    "Do not contact anyone. Do not send.",
    "",
    "Roles:",
    ...roles.map((role, index) => roleLine(role, index)),
    openQuestions.length > 0 ? "" : null,
    openQuestions.length > 0 ? `Still unanswered: ${openQuestions.join("; ")}.` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function bobStepObjective(roles: RequirementRoleRow[], openQuestions: string[]): string {
  return [
    "Acknowledge, and ask what only the client can answer.",
    "Draft the reply on this case. Do not send it. A person sends.",
    "Ask only for what the email left open. Do not invent a rate, a date or a headcount.",
    "",
    "Roles:",
    ...roles.map((role, index) => roleLine(role, index)),
    openQuestions.length > 0 ? "" : null,
    openQuestions.length > 0 ? `Ask about: ${openQuestions.join("; ")}.` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function roleLine(role: RequirementRoleRow, index: number): string {
  const bits = [
    `${index + 1}. ${role.title} — ${role.headcount}`,
    role.level,
    role.skills.length > 0 ? role.skills.join(", ") : null,
    role.location,
    role.startText ? `from ${role.startText}` : null,
    role.durationText,
    role.languages.length > 0 ? role.languages.join(", ") : null,
    role.rateText,
  ].filter(Boolean);
  return bits.join(" — ");
}

/**
 * Ralph's Cologne request, as the plan describes it: an agency forward for
 * six commissioning engineers, three levels, one case.
 */
export const COLOGNE_AGENCY_REQUEST = {
  classification: "job_opportunity" as const,
  confidence: 92,
  messageId: "<ralph-cologne-commissioning@agency.example>",
  threadId: "thread-ralph-cologne",
  subject: "Fwd: Commissioning engineers — data centre near Cologne",
  requesterEmail: "ralph@agency.example",
  contactName: "Ralph",
  city: "Cologne",
  sector: "data centre",
  headcountText: "6",
  text: [
    "Fwd: Commissioning engineers — data centre near Cologne",
    "Need 6 commissioning engineers for a data centre near Cologne.",
    "3 Basic, 2 Advanced, 1 Expert.",
    "Desigo CC, PXC, ABT. Start November–December 2026.",
    "English required, German desirable.",
  ].join("\n"),
  roles: [
    {
      title: "Commissioning engineer",
      count: 3,
      level: "Basic",
      skills: ["Desigo CC", "PXC", "ABT"],
      start: "November 2026",
      duration: null,
      location: "near Cologne",
      languages: ["English", "German desirable"],
      rate: null,
    },
    {
      title: "Commissioning engineer",
      count: 2,
      level: "Advanced",
      skills: ["Desigo CC", "PXC"],
      start: "November 2026",
      duration: null,
      location: "near Cologne",
      languages: ["English"],
      rate: null,
    },
    {
      title: "Commissioning engineer",
      count: 1,
      level: "Expert",
      skills: ["Desigo CC"],
      start: "December 2026",
      duration: null,
      location: "near Cologne",
      languages: ["English"],
      rate: null,
    },
  ],
  openQuestions: ["rate"],
};

/** One named role, the shape Henry's and Oliver's mail already takes. */
export const SINGLE_ROLE_REQUEST = {
  classification: "job_opportunity" as const,
  confidence: 88,
  headcountText: "1",
  text: "One Siemens automation engineer, Ireland, 12 months.",
  roles: [
    {
      title: "Siemens automation engineer",
      count: 1,
      level: null,
      skills: ["PCS7"],
      start: null,
      location: "Ireland",
    },
  ],
  openQuestions: ["rate"],
};
