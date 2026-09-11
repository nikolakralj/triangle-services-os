import "server-only";
import { z } from "zod";
import { verifyMachineToken, type MachineAccess } from "@/lib/auth/machine";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { addAgentMessage } from "@/lib/data/assignment-threads";
import { completeAssignment } from "@/lib/data/workforce";
import { listSupplyPartners } from "@/lib/data/supply-partners";
import { fileMissionTargets } from "@/lib/data/mission-records";
import {
  activity,
  appendMissionActivity,
  finishMissionRun,
  startMissionRun,
} from "@/lib/data/mission-runs";
import {
  describeMissionState,
  normaliseQuote,
  recordDecision,
  supersedeDecisions,
} from "@/lib/data/mission-memory";
import { loadMissionPlan, saveMissionPlan } from "@/lib/data/mission-plan";
import { evaluateProgress, progressSentence, settlePlan } from "@/lib/data/mission-progress";
import { loadMissionHoldings, loadMissionRunContext, touchMission } from "@/lib/data/missions";
import {
  citesASource,
  cleanTargets,
  companyKey,
  domainOf,
  missionTargetSchema,
  siteOfEmail,
  type MissionStepRecord,
  type MissionTarget,
} from "@/lib/ai/mission-report";
import type {
  ActivityKind,
  DecisionKind,
  MissionCompanyRow,
  MissionDecision,
} from "@/lib/data/mission-shared";

// ---------------------------------------------------------------------------
// A mission, worked by a bot on its own platform.
//
// Scout on Grok has its own computer, search, memory and judgement. Triangle
// keeps the record and the rules. So the bot reads a mission from here, files
// what it finds through here, and finishes the step here — through the same
// filing path, the same finding contract and the same decision checks the
// in-app worker goes through. A bot's research lands on Companies and People
// exactly as Triangle's own does: agent-found, unverified, with its sources.
//
// The badge decides who it is. A bot may read and write only its own open
// mission steps; everything else is refused before a row is touched.
// ---------------------------------------------------------------------------

type Svc = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;

/** Scopes a badge may hold to work its own mission steps. Ownership of the step is the real guard. */
const WRITE_SCOPES = ["mission.work", "research.suggestion.create", "worker.propose"];
const READ_SCOPES = [...WRITE_SCOPES, "research.read"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How many targets one call may file, like one in-app step. */
const TARGETS_PER_CALL = 12;

const BOT_ACTIVITY_KINDS = new Set<ActivityKind>([
  "searched",
  "opened",
  "looked",
  "read",
  "found",
  "missing",
  "dead",
  "dropped",
  "asked",
]);

function clip(text: string | null | undefined, max: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// ── who may touch which step ────────────────────────────────────────────────

export interface BotStep {
  id: string;
  orgId: string;
  missionId: string;
  agentInstanceId: string;
  status: string;
  title: string;
  constraints: Record<string, unknown>;
}

export type BotAuth =
  | { ok: true; machine: MachineAccess; step: BotStep }
  | { ok: false; status: number; error: string };

export function machineMayReadMissions(machine: MachineAccess): boolean {
  return machine.scopes.includes("admin") || READ_SCOPES.some((s) => machine.scopes.includes(s));
}

export async function authorizeBotStep(
  request: Request,
  missionId: string,
  assignmentId: string | null | undefined,
  opts: { write: boolean },
): Promise<BotAuth> {
  const machine = await verifyMachineToken(request);
  if (!machine) return { ok: false, status: 401, error: "Machine credential required (tri_mc_… token)." };
  if (!machine.agentInstanceId) {
    return { ok: false, status: 403, error: "This badge is not linked to an employee." };
  }
  const allowed = opts.write ? WRITE_SCOPES : READ_SCOPES;
  if (!machine.scopes.includes("admin") && !allowed.some((s) => machine.scopes.includes(s))) {
    return {
      ok: false,
      status: 403,
      error: `Credential "${machine.name}" may not ${opts.write ? "write to" : "read"} missions.`,
    };
  }
  if (!UUID.test(missionId) || !assignmentId || !UUID.test(assignmentId)) {
    return {
      ok: false,
      status: 400,
      error: "Send the assignmentId of your mission step, with its missionId in the path.",
    };
  }

  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, status: 503, error: "Database unavailable." };
  const { data } = await svc
    .from("agent_assignments")
    .select("id, org_id, mission_id, agent_instance_id, status, title, constraints")
    .eq("id", assignmentId)
    .eq("org_id", machine.orgId)
    .maybeSingle();
  if (!data || data.mission_id !== missionId || data.agent_instance_id !== machine.agentInstanceId) {
    return { ok: false, status: 404, error: "No mission step with that id belongs to this employee." };
  }
  const constraints = (data.constraints as Record<string, unknown> | null) ?? {};
  if (constraints.case_type !== "mission_step" || constraints.execution_mode !== "bot") {
    return { ok: false, status: 409, error: "This step is worked inside Triangle, not by a bot." };
  }
  if (opts.write && !["queued", "active"].includes(data.status as string)) {
    return {
      ok: false,
      status: 409,
      error: `This step is ${data.status as string}; nothing more can be written to it.`,
    };
  }
  return {
    ok: true,
    machine,
    step: {
      id: data.id as string,
      orgId: machine.orgId,
      missionId,
      agentInstanceId: machine.agentInstanceId,
      status: data.status as string,
      title: data.title as string,
      constraints,
    },
  };
}

/** A plain inbox result would close a mission step without its reply and brief. */
export async function isBotMissionStep(orgId: string, assignmentId: string): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc || !UUID.test(assignmentId)) return false;
  const { data } = await svc
    .from("agent_assignments")
    .select("constraints")
    .eq("id", assignmentId)
    .eq("org_id", orgId)
    .maybeSingle();
  const c = (data?.constraints as Record<string, unknown> | null) ?? {};
  return c.case_type === "mission_step" && c.execution_mode === "bot";
}

// ── picking a step up ───────────────────────────────────────────────────────

async function employeeName(svc: Svc, orgId: string, agentInstanceId: string): Promise<string> {
  const { data } = await svc
    .from("agent_instances")
    .select("display_name")
    .eq("id", agentInstanceId)
    .eq("org_id", orgId)
    .maybeSingle();
  return (data?.display_name as string | undefined) ?? "The bot";
}

/** The step's open run, or a new one. The mission page reads activity from it. */
async function openBotRun(svc: Svc, step: BotStep): Promise<string | null> {
  const { data: runs } = await svc
    .from("agent_runs")
    .select("id, status")
    .eq("org_id", step.orgId)
    .eq("assignment_id", step.id)
    .order("started_at", { ascending: false })
    .limit(1);
  const current = runs?.[0];
  if (current && current.status === "running") return current.id as string;
  return startMissionRun({
    orgId: step.orgId,
    missionId: step.missionId,
    assignmentId: step.id,
    agentInstanceId: step.agentInstanceId,
    agentName: await employeeName(svc, step.orgId, step.agentInstanceId),
    provider: "grok",
    model: "grok-bot",
    first: activity("started", `Picked up on Grok: “${clip(step.title, 90)}”`),
  });
}

/**
 * The bot has the step: mark it active and open its run, once. Reading the
 * mission or collecting it from the inbox both count, so the CEO sees the
 * moment it was picked up.
 */
export async function pickUpBotStep(step: BotStep): Promise<string | null> {
  const svc = createServiceSupabaseClient();
  if (!svc || !["queued", "active"].includes(step.status)) return null;
  if (step.status === "queued") {
    await svc
      .from("agent_assignments")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("id", step.id)
      .eq("org_id", step.orgId)
      .eq("status", "queued");
    step.status = "active";
  }
  return openBotRun(svc, step);
}

// ── what a bot is handed ────────────────────────────────────────────────────

function holdingForBot(c: MissionCompanyRow) {
  return {
    companyId: c.companyId,
    name: c.name,
    city: c.city,
    country: c.country,
    website: c.website,
    role: c.role,
    state: c.state,
    person: c.person ? { name: c.person.name, title: c.person.title } : null,
    channel: c.channel,
    words: c.words,
    project: c.project,
    missing: c.missing?.fact ?? null,
    missingOwner: c.missing?.owner ?? null,
    deadReason: c.deadReason,
    ruledOutByCeo: c.notForUs?.reason ?? null,
    verifiedByPerson: c.verified,
    contacted: c.lastAttempt ? { outcome: c.lastAttempt.outcome, at: c.lastAttempt.at } : null,
    ownSiteRead: c.reachChecked,
  };
}

/**
 * What Triangle can field, as capability.
 *
 * People are counted by trade, never named: research needs to know that two
 * PLC engineers can work in Germany from October, not who they are. Names and
 * rates stay inside Triangle; a job that needs named people is a recruiting
 * step.
 */
async function supplyCapability(svc: Svc, orgId: string) {
  const [people, partners] = await Promise.all([
    svc
      .from("workers")
      .select("role, skills, certificates, work_authorisation, availability_status, available_from")
      .eq("organization_id", orgId)
      .neq("status", "blacklisted")
      .limit(300),
    listSupplyPartners(orgId),
  ]);

  const byRole = new Map<
    string,
    {
      role: string;
      people: number;
      skills: Set<string>;
      certificates: Set<string>;
      canWorkIn: Set<string>;
      availableNowOrSoon: number;
      earliestAvailableFrom: string | null;
    }
  >();
  const list = (value: unknown) => (Array.isArray(value) ? value.map(String).filter(Boolean) : []);
  for (const w of (people.data ?? []) as Record<string, unknown>[]) {
    const role = String(w.role ?? "").trim() || "Role not recorded";
    const key = role.toLowerCase();
    const entry =
      byRole.get(key) ??
      {
        role,
        people: 0,
        skills: new Set<string>(),
        certificates: new Set<string>(),
        canWorkIn: new Set<string>(),
        availableNowOrSoon: 0,
        earliestAvailableFrom: null,
      };
    entry.people += 1;
    list(w.skills).forEach((s) => entry.skills.add(s));
    list(w.certificates).forEach((s) => entry.certificates.add(s));
    list(w.work_authorisation).forEach((s) => entry.canWorkIn.add(s));
    if (w.availability_status === "available" || w.availability_status === "available_soon") {
      entry.availableNowOrSoon += 1;
    }
    const from = typeof w.available_from === "string" ? w.available_from : null;
    if (from && (!entry.earliestAvailableFrom || from < entry.earliestAvailableFrom)) {
      entry.earliestAvailableFrom = from;
    }
    byRole.set(key, entry);
  }

  return {
    note: "Capability only. Our people are counted by trade, never named; a job that needs named people is a recruiting step. Partner firms count only while a person confirmed their capacity within 14 days.",
    trades: Array.from(byRole.values()).map((r) => ({
      role: r.role,
      people: r.people,
      availableNowOrSoon: r.availableNowOrSoon,
      earliestAvailableFrom: r.earliestAvailableFrom,
      skills: Array.from(r.skills).slice(0, 15),
      certificates: Array.from(r.certificates).slice(0, 15),
      canWorkIn: Array.from(r.canWorkIn).slice(0, 20),
    })),
    partnerFirms: partners
      .filter((p) => p.sellable)
      .map((p) => ({
        name: p.name,
        country: p.country,
        trades: p.trades,
        crewSize: p.crewSize,
        canPostTo: p.canPostTo,
        availability: p.availabilityStatus,
        availableFrom: p.availableFrom,
        capacityConfirmedDaysAgo: p.confirmedDaysAgo,
      })),
  };
}

export async function missionPayloadForStep(orgId: string, missionId: string, stepId: string) {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const ctx = await loadMissionRunContext(orgId, missionId, stepId);
  if (!ctx) return null;

  const progress = evaluateProgress(ctx.criteria, ctx.plan, {
    companies: ctx.holdings.companies,
    candidates: [],
    partners: [],
  });
  const base = `/api/agent/missions/${missionId}`;

  return {
    version: 1,
    missionId,
    assignmentId: stepId,
    title: ctx.mission.title,
    kind: ctx.mission.kind,
    objective: ctx.mission.objective,
    instruction: ctx.instruction,
    missionState: describeMissionState({
      holdings: ctx.holdings,
      decisions: ctx.decisions,
      criteria: ctx.criteria,
      progress,
      lastQuestion: ctx.lastQuestion,
    }),
    finishLine: progress
      ? {
          percent: progress.percent,
          met: progress.met,
          criteria: progress.criteria.map((c) => ({
            metric: c.metric,
            label: c.label,
            target: c.target,
            actual: c.actual,
            met: c.met,
            setBy: c.setBy,
          })),
          plan: progress.plan.map((s) => ({
            position: s.position,
            pass: s.pass,
            title: s.title,
            metric: s.metric,
            target: s.target,
            actual: s.actual,
            done: s.done,
            next: progress.current?.position === s.position,
          })),
        }
      : null,
    decisions: ctx.decisions.map((d) => ({ id: d.id, kind: d.kind, text: d.text, quote: d.quote })),
    holdings: ctx.holdings.companies.slice(0, 80).map(holdingForBot),
    recentConversation: ctx.conversation.slice(-6).map((m) => ({
      from: m.role === "human" ? "ceo" : "agent",
      text: clip(m.body, 1_200),
      at: m.at,
    })),
    lastQuestionToCeo: ctx.lastQuestion,
    supply: await supplyCapability(svc, orgId),
    idempotencyPrefix: `mission:${stepId}:`,
    report: {
      read: `GET ${base}?assignmentId=${stepId}`,
      lookup: "GET /api/agent/lookup?q=<name or domain>&type=company|contact",
      fileTargets: `POST ${base}/targets`,
      activity: `POST ${base}/activity`,
      decisions: `POST ${base}/decisions`,
      finishLine: `POST ${base}/plan`,
      complete: `POST ${base}/complete`,
    },
  };
}

export type BotMissionPayload = NonNullable<Awaited<ReturnType<typeof missionPayloadForStep>>>;

/** For the inbox: pick the step up and hand over its mission. */
export async function botMissionForInbox(
  orgId: string,
  agentInstanceId: string,
  assignment: { id: string; title: string; missionId: string | null; constraints: Record<string, unknown> },
): Promise<BotMissionPayload | null> {
  if (!assignment.missionId || assignment.constraints.execution_mode !== "bot") return null;
  await pickUpBotStep({
    id: assignment.id,
    orgId,
    missionId: assignment.missionId,
    agentInstanceId,
    // listOpenAssignmentsForInstance has already marked it active.
    status: "active",
    title: assignment.title,
    constraints: assignment.constraints,
  });
  return missionPayloadForStep(orgId, assignment.missionId, assignment.id);
}

// ── writing ─────────────────────────────────────────────────────────────────

const channelKinds = ["phone", "email", "linkedin", "contact_form"] as const;
const text = (max: number) => z.string().trim().max(max).nullish();

/** What a bot may send for one target. Missing optional fields are read as null. */
const botTargetSchema = z.object({
  company: z.string().trim().min(1).max(160),
  website: text(300),
  city: text(120),
  country: text(80),
  role: text(120),
  why: text(400),
  person: text(160),
  personTitle: text(160),
  channelKind: z.enum(channelKinds).nullish(),
  channelValue: text(300),
  channelWhose: z.enum(["person", "department", "switchboard"]).nullish(),
  words: text(700),
  project: text(200),
  projectEvidence: text(400),
  state: z.enum(["reachable", "one_thing_missing", "dead"]),
  missing: text(240),
  missingOwner: text(160),
  deadReason: text(400),
  sources: z
    .array(z.object({ url: z.string().trim().min(1).max(500), claim: text(300) }))
    .max(3)
    .default([]),
});

function toMissionTarget(t: z.infer<typeof botTargetSchema>): MissionTarget {
  return {
    company: t.company,
    website: t.website ?? null,
    city: t.city ?? null,
    country: t.country ?? null,
    role: t.role ?? null,
    why: t.why ?? "",
    person: t.person ?? null,
    personTitle: t.personTitle ?? null,
    channelKind: t.channelKind ?? null,
    channelValue: t.channelValue ?? null,
    channelWhose: t.channelWhose ?? null,
    words: t.words ?? null,
    project: t.project ?? null,
    projectEvidence: t.projectEvidence ?? null,
    state: t.state,
    missing: t.missing ?? null,
    missingOwner: t.missingOwner ?? null,
    deadReason: t.deadReason ?? null,
    sources: t.sources.map((s) => ({ url: s.url, claim: s.claim ?? "" })),
  };
}

function channelWords(channel: { kind: string; value: string; whose: string } | null): string {
  if (!channel) return "no published way in";
  const whose = channel.whose === "person" ? "" : ` (${channel.whose})`;
  if (channel.kind === "phone") return `phone ${channel.value}${whose}`;
  if (channel.kind === "email") return `email ${channel.value}${whose}`;
  if (channel.kind === "linkedin") return "LinkedIn profile";
  return "contact form";
}

/** Where a held company lives on the web: its site, or its email's domain. */
function knownSite(c: MissionCompanyRow): string | null {
  return c.website ?? (c.channel?.kind === "email" ? siteOfEmail(c.channel.value) : null);
}

export async function fileBotTargets(step: BotStep, raw: unknown) {
  const ctx = await loadMissionRunContext(step.orgId, step.missionId, step.id);
  if (!ctx) return { error: "The mission could not be read." } as const;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "Send `targets` as a list of one to twelve companies." } as const;
  }
  if (raw.length > TARGETS_PER_CALL) {
    return { error: `At most ${TARGETS_PER_CALL} targets per call; send the rest in another.` } as const;
  }

  const invalid: Array<{ index: number; company: string | null; error: string }> = [];
  const parsed: MissionTarget[] = [];
  raw.forEach((item, index) => {
    const result = botTargetSchema.safeParse(item);
    if (!result.success) {
      invalid.push({
        index,
        company: typeof (item as { company?: unknown })?.company === "string" ? (item as { company: string }).company : null,
        error: result.error.issues.map((i) => `${i.path.join(".") || "target"}: ${i.message}`).join("; "),
      });
      return;
    }
    const target = toMissionTarget(result.data);
    const strict = missionTargetSchema.safeParse(target);
    if (!strict.success) {
      invalid.push({ index, company: target.company, error: strict.error.issues[0]?.message ?? "invalid" });
      return;
    }
    parsed.push(strict.data);
  });

  // The same preparation an in-app step gets: a held company named again with
  // nothing citable is a reference, not a lead; a held company is filed onto
  // its own record, with its known site.
  const holdingByKey = new Map(ctx.holdings.companies.map((c) => [companyKey(c.name), c]));
  const fresh = parsed.filter((t) => !(holdingByKey.has(companyKey(t.company)) && !citesASource(t)));
  const cleaned = cleanTargets(fresh);
  const kept = cleaned.kept.map((t) => {
    const holding = holdingByKey.get(t.companyKey);
    if (!holding) return t;
    const website = t.website ?? knownSite(holding);
    return { ...t, knownCompanyId: holding.companyId, website, domain: domainOf(website) };
  });

  const filed = await fileMissionTargets(
    {
      orgId: step.orgId,
      missionId: step.missionId,
      missionTitle: ctx.mission.title,
      stepId: step.id,
      agentInstanceId: step.agentInstanceId,
      agentName: ctx.agentName,
      createdBy: ctx.mission.createdBy,
    },
    kept,
  );

  const svc = createServiceSupabaseClient();
  const runId = svc ? await openBotRun(svc, step) : null;
  await appendMissionActivity(runId, [
    ...filed.map((f) => {
      const t = f.target;
      if (f.refused) return activity("failed", `Could not file ${t.company}: ${clip(f.refused, 140)}`);
      if (t.state === "reachable") return activity("found", `${t.person} at ${t.company} — ${channelWords(t.channel)}`);
      if (t.state === "dead") return activity("dead", `${t.company}: not worth chasing — ${clip(t.deadReason, 120)}`);
      return activity("missing", `${t.company}: ${clip(t.missing, 140)}`);
    }),
    ...cleaned.dropped.map((d) => activity("dropped", `Left out ${d.company}: ${d.reason}`)),
  ]);

  return {
    filed: filed.map((f) => ({
      company: f.target.company,
      state: f.target.state,
      companyId: f.companyId,
      contactId: f.contactId,
      newCompany: f.companyIsNew,
      refused: f.refused,
    })),
    dropped: cleaned.dropped,
    invalid,
  } as const;
}

export async function logBotActivity(step: BotStep, raw: unknown) {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "Send `events` as a list." } as const;
  const events = raw
    .slice(0, 20)
    .map((e) => e as { kind?: unknown; text?: unknown })
    .filter((e) => typeof e.kind === "string" && BOT_ACTIVITY_KINDS.has(e.kind as ActivityKind))
    .filter((e) => typeof e.text === "string" && e.text.trim().length > 0)
    .map((e) => activity(e.kind as ActivityKind, String(e.text)));
  if (events.length === 0) {
    return {
      error: `No usable events. Each needs a kind (${Array.from(BOT_ACTIVITY_KINDS).join(", ")}) and a text.`,
    } as const;
  }
  const svc = createServiceSupabaseClient();
  const runId = svc ? await openBotRun(svc, step) : null;
  await appendMissionActivity(runId, events);
  return { logged: events.length } as const;
}

const decisionInput = z.object({
  kind: z.enum(["exclude", "focus", "prefer", "limit", "other"]),
  text: z.string().trim().min(3).max(200),
  quote: z.string().trim().min(2).max(300),
});

/** The CEO's standing decisions, as the bot read them from the instruction — each checked against the words. */
export async function recordBotDecisions(step: BotStep, raw: { decisions?: unknown; replaces?: unknown }) {
  const ctx = await loadMissionRunContext(step.orgId, step.missionId, step.id);
  if (!ctx) return { error: "The mission could not be read." } as const;
  if (!ctx.instructionMessageId) return { error: "This step has no instruction to quote from." } as const;
  const list = Array.isArray(raw.decisions) ? raw.decisions.slice(0, 8) : [];
  if (list.length === 0) return { error: "Send `decisions` as a list." } as const;

  const said = normaliseQuote(ctx.instruction);
  const recorded: MissionDecision[] = [];
  const refused: Array<{ text: string | null; reason: string }> = [];
  for (const item of list) {
    const parsed = decisionInput.safeParse(item);
    if (!parsed.success) {
      refused.push({ text: null, reason: parsed.error.issues[0]?.message ?? "invalid decision" });
      continue;
    }
    const d = parsed.data;
    if (!said.includes(normaliseQuote(d.quote))) {
      refused.push({ text: d.text, reason: "The quote is not in the CEO's instruction, word for word." });
      continue;
    }
    if (d.quote.trim().endsWith("?")) {
      refused.push({ text: d.text, reason: "A question is not a decision." });
      continue;
    }
    const row = await recordDecision({
      orgId: step.orgId,
      missionId: step.missionId,
      stepId: step.id,
      messageId: ctx.instructionMessageId,
      decidedBy: ctx.instructionAuthor,
      agentInstanceId: step.agentInstanceId,
      kind: d.kind as DecisionKind,
      text: d.text,
      quote: d.quote,
    });
    if (row) recorded.push(row);
    else refused.push({ text: d.text, reason: "Already written down, or refused by the database." });
  }

  const inForce = new Set(ctx.decisions.map((d) => d.id));
  const replaceIds = (Array.isArray(raw.replaces) ? raw.replaces : [])
    .map(String)
    .filter((id) => inForce.has(id));
  const replaced =
    recorded.length > 0 && replaceIds.length > 0
      ? await supersedeDecisions({
          orgId: step.orgId,
          missionId: step.missionId,
          ids: replaceIds,
          by: recorded[0].id,
        })
      : [];

  const svc = createServiceSupabaseClient();
  const runId = svc ? await openBotRun(svc, step) : null;
  await appendMissionActivity(runId, [
    ...recorded.map((d) => activity("noted", `Noted your decision: ${d.text}`)),
    ...replaced.map((d) => activity("noted", `No longer in force: ${d.text}`)),
  ]);
  return {
    recorded: recorded.map((d) => ({ id: d.id, kind: d.kind, text: d.text })),
    replaced: replaced.map((d) => d.id),
    refused,
  } as const;
}

/** A finish line and route the bot proposes, when the mission has none. */
export async function setBotPlan(step: BotStep, raw: { criteria?: unknown; plan?: unknown }) {
  const ctx = await loadMissionRunContext(step.orgId, step.missionId, step.id);
  if (!ctx) return { error: "The mission could not be read." } as const;
  if (ctx.criteria.length > 0) return { error: "This mission already has a finish line.", status: 409 } as const;

  const criteria = (Array.isArray(raw.criteria) ? raw.criteria : [])
    .map((c) => c as { metric?: unknown; target?: unknown })
    .map((c) => ({ metric: String(c.metric ?? ""), target: Number(c.target) }));
  const plan = (Array.isArray(raw.plan) ? raw.plan : [])
    .map((s) => s as { pass?: unknown; title?: unknown; metric?: unknown })
    .map((s) => ({ pass: String(s.pass ?? ""), title: String(s.title ?? ""), metric: String(s.metric ?? "") }));
  const settled = settlePlan(ctx.mission.kind, { criteria, plan });
  if (!settled) {
    return {
      error: "No usable criteria. Use the metrics listed for this kind of mission, each with a whole-number target.",
    } as const;
  }
  const wrote = await saveMissionPlan({ orgId: step.orgId, missionId: step.missionId, plan: settled });
  if (!wrote) return { error: "This mission already has a finish line.", status: 409 } as const;

  const svc = createServiceSupabaseClient();
  const runId = svc ? await openBotRun(svc, step) : null;
  await appendMissionActivity(runId, [
    activity("planned", `Set the finish line: ${settled.criteria.map((c) => `${c.target} ${c.metric.replace(/_/g, " ")}`).join(" · ")}`),
  ]);
  return { criteria: settled.criteria, plan: settled.plan } as const;
}

const completeInput = z.object({
  reply: z.string().trim().min(1).max(900),
  brief: z.object({
    headline: z.string().trim().min(1).max(220),
    summary: z.string().trim().max(700).default(""),
    recommended: z.string().trim().max(400).nullish(),
  }),
  questionForCeo: z.string().trim().max(300).nullish(),
  suggestedNext: z
    .array(z.object({ label: z.string().trim().min(1).max(40), instruction: z.string().trim().min(1).max(300) }))
    .max(3)
    .default([]),
});

function finishedLine(filed: MissionStepRecord["filed"]): string {
  if (filed.companies === 0) return "Finished — nothing new filed in this step.";
  const parts = [
    `${filed.reachable} with someone to reach`,
    filed.oneThingMissing ? `${filed.oneThingMissing} missing one thing` : null,
    filed.dead ? `${filed.dead} ruled out` : null,
  ].filter(Boolean);
  return `Filed ${filed.companies} ${filed.companies === 1 ? "company" : "companies"} — ${parts.join(", ")}`;
}

/** What this step actually filed, counted from its findings rather than from the bot's report. */
async function filedByStep(svc: Svc, step: BotStep): Promise<MissionStepRecord["filed"]> {
  const { data } = await svc
    .from("agent_findings")
    .select("finding_type, finding_state, promoted_entity_id, created_at")
    .eq("org_id", step.orgId)
    .eq("mission_id", step.missionId)
    .eq("assignment_id", step.id)
    .order("created_at", { ascending: false });
  const companies = new Map<string, string>();
  const people = new Set<string>();
  for (const f of (data ?? []) as Record<string, unknown>[]) {
    const id = f.promoted_entity_id as string | null;
    if (!id) continue;
    if (f.finding_type === "company" && !companies.has(id)) companies.set(id, String(f.finding_state ?? ""));
    if (f.finding_type === "contact") people.add(id);
  }
  const states = Array.from(companies.values());
  return {
    companies: companies.size,
    people: people.size,
    reachable: states.filter((s) => s === "reachable").length,
    oneThingMissing: states.filter((s) => s === "one_thing_missing").length,
    dead: states.filter((s) => s === "dead").length,
    dropped: 0,
  };
}

export async function completeBotStep(step: BotStep, raw: unknown) {
  const svc = createServiceSupabaseClient();
  if (!svc) return { error: "Database unavailable.", status: 503 } as const;
  const runId = await openBotRun(svc, step);

  const failure = raw as { failed?: unknown; reason?: unknown };
  if (failure?.failed === true) {
    const reason = typeof failure.reason === "string" ? failure.reason.trim().slice(0, 600) : "";
    if (reason.length < 3) return { error: "Say why the step could not be done in `reason`.", status: 400 } as const;
    const name = await employeeName(svc, step.orgId, step.agentInstanceId);
    await addAgentMessage({
      assignmentId: step.id,
      orgId: step.orgId,
      agentInstanceId: step.agentInstanceId,
      body: `I could not finish this: ${reason}`,
    });
    await completeAssignment({
      assignmentId: step.id,
      orgId: step.orgId,
      agentInstanceId: step.agentInstanceId,
      resultSummary: `${name} could not finish this: ${reason}`,
      failed: true,
    });
    await finishMissionRun(runId, { status: "failed", events: [activity("failed", clip(reason, 200))], error: reason });
    await touchMission(step.orgId, step.missionId);
    return { ok: true, failed: true } as const;
  }

  const parsed = completeInput.safeParse(raw);
  if (!parsed.success) {
    return {
      error: `The step report is incomplete: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      status: 400,
    } as const;
  }
  const input = parsed.data;
  const filed = await filedByStep(svc, step);
  const question = input.questionForCeo?.trim() || null;
  const record: MissionStepRecord = {
    kind: "mission_step",
    version: 1,
    reply: input.reply,
    brief: {
      headline: input.brief.headline,
      summary: input.brief.summary,
      recommended: input.brief.recommended?.trim() || null,
    },
    questionForCeo: question,
    suggestedNext: input.suggestedNext,
    filed,
  };

  const posted = await addAgentMessage({
    assignmentId: step.id,
    orgId: step.orgId,
    agentInstanceId: step.agentInstanceId,
    body: record.reply,
  });
  if (!posted) return { error: "The reply could not be posted to the mission.", status: 500 } as const;

  const completed = await completeAssignment({
    assignmentId: step.id,
    orgId: step.orgId,
    agentInstanceId: step.agentInstanceId,
    resultSummary: JSON.stringify(record),
  });
  if (typeof completed === "object" && "refused" in completed) {
    return { error: completed.refused, status: 409 } as const;
  }
  if (!completed) return { error: "The step changed before it could be reported.", status: 409 } as const;

  // How far the mission moved, counted from what is now on file.
  const [planRows, holdings] = await Promise.all([
    loadMissionPlan(step.orgId, step.missionId),
    loadMissionHoldings(step.orgId, step.missionId),
  ]);
  const progress = evaluateProgress(planRows.criteria, planRows.plan, {
    companies: holdings.companies,
    candidates: [],
    partners: [],
  });
  await finishMissionRun(runId, {
    status: "completed",
    events: [
      ...(question ? [activity("asked", `Waiting for you: ${clip(question, 160)}`)] : []),
      ...(progress
        ? [
            activity(
              "progress",
              progress.met
                ? `Finish line reached — ${progressSentence(progress)}`
                : `Finish line: ${progressSentence(progress)}${progress.current ? ` · next: ${progress.current.title}` : ""}`,
            ),
          ]
        : []),
      activity("finished", finishedLine(filed)),
    ],
    summary: { filed, progress: progress ? { percent: progress.percent, met: progress.met } : null },
  });
  await touchMission(step.orgId, step.missionId);
  return { ok: true, filed, progress: progress ? { percent: progress.percent, met: progress.met } : null } as const;
}

// ── looking before filing ───────────────────────────────────────────────────

/** What Triangle already has under a name or a domain, so a bot does not file it twice. */
export async function lookupRecords(orgId: string, query: string, type: "company" | "contact") {
  const svc = createServiceSupabaseClient();
  const q = query.trim().replace(/[%_,()]/g, " ").slice(0, 80).trim();
  if (!svc || q.length < 2) return [];
  if (type === "contact") {
    const { data } = await svc
      .from("contacts")
      .select("id, full_name, job_title, company_id, found_in_mission_id, verified_at")
      .eq("organization_id", orgId)
      .ilike("full_name", `%${q}%`)
      .limit(10);
    return (data ?? []).map((c) => ({
      id: c.id as string,
      name: c.full_name as string,
      title: (c.job_title as string | null) ?? null,
      companyId: (c.company_id as string | null) ?? null,
      inMission: (c.found_in_mission_id as string | null) ?? null,
      verifiedByPerson: Boolean(c.verified_at),
    }));
  }
  const { data } = await svc
    .from("companies")
    .select("id, name, website, website_domain, city, country, company_status, found_in_mission_id, verified_at")
    .eq("organization_id", orgId)
    .or(`name.ilike.%${q}%,website_domain.ilike.%${q}%`)
    .limit(10);
  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    website: (c.website as string | null) ?? null,
    city: (c.city as string | null) ?? null,
    country: (c.country as string | null) ?? null,
    status: (c.company_status as string | null) ?? null,
    inMission: (c.found_in_mission_id as string | null) ?? null,
    verifiedByPerson: Boolean(c.verified_at),
  }));
}
