import "server-only";
import { answerAboutTalent } from "@/lib/ai/talent-answer";
import { ensureMissionPlan } from "@/lib/ai/mission-planner";
import { noteInstructionDecisions } from "@/lib/ai/mission-memory";
import {
  createCompanyReachAgent,
  createMissionScoutAgent,
  getScoutModelId,
} from "@/lib/ai/scout-agent";
import {
  citesASource,
  cleanTargets,
  companyKey,
  domainOf,
  mergeReach,
  siteOfEmail,
  type CleanTarget,
  type MissionStepRecord,
} from "@/lib/ai/mission-report";
import {
  listAvailableSupply,
  type ClaimedAssignment,
  type ScoutWorkResult,
} from "@/lib/ai/scout-executor";
import { addAgentMessage } from "@/lib/data/assignment-threads";
import { withinBudget } from "@/lib/data/agent-budget";
import { fileMissionTargets } from "@/lib/data/mission-records";
import {
  activity,
  appendMissionActivity,
  finishMissionRun,
  searchActivityOf,
  startMissionRun,
} from "@/lib/data/mission-runs";
import type {
  ActivityEvent,
  MissionChannel,
  MissionCompanyRow,
  MissionDecision,
} from "@/lib/data/mission-shared";
import { describeMissionState } from "@/lib/data/mission-memory";
import {
  describeHoldings,
  loadMissionHoldings,
  loadMissionRunContext,
  nextQueuedStep,
  STALE_STEP_MINUTES,
  touchMission,
  type MissionHoldings,
  type MissionRunContext,
} from "@/lib/data/missions";
import { loadMissionPlan, type MissionPlanRows } from "@/lib/data/mission-plan";
import {
  describeProgress,
  evaluateProgress,
  metricLabel,
  progressSentence,
  type MissionFacts,
} from "@/lib/data/mission-progress";
import {
  getOrganizationOperatingProfile,
  type OrganizationOperatingProfile,
} from "@/lib/data/organization-profile";
import { completeAssignment } from "@/lib/data/workforce";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// One step of a mission, run.
//
// The step is an ordinary assignment, claimed the ordinary atomic way and
// counted against the employee's ordinary budget. What is new is what the
// worker is handed and what it hands back:
//
//   in   the objective, the conversation so far, everything the mission holds
//        (with what the CEO ruled out and who was already contacted), supply,
//        and the one instruction this step carries
//   out  a reply in the conversation, a brief on the mission as a whole, and
//        each company it found written onto Companies and People with its
//        evidence — the CEO approves actions, not the facts themselves
//
// A research step works in two passes. The first finds the companies. The
// second opens the own site of every company still missing a person or a door
// — the first real missions filed twenty companies without one person to
// call, because a step searched once, opened no page, and filed what the
// search snippets said. Companies the mission already holds, whose site
// nobody has read, join that pass while there is room.
//
// Steps of one mission run one at a time. A second instruction must read what
// the first one filed, or the mission is a set of parallel strangers again.
// ---------------------------------------------------------------------------

/** How many company sites one step reads. */
const REACH_LIMIT = 6;
/** How many sites are read at once. */
const REACH_CONCURRENCY = 3;
/**
 * How much of the conversation a step reads. The mission's memory carries
 * what must outlast it — the CEO's decisions, and what the records say — so
 * the conversation is only the recent exchange, not the whole history.
 */
const RECENT_MESSAGES = 6;

function clip(text: string | null | undefined, max: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function channelWords(channel: MissionChannel | null): string {
  if (!channel) return "no published way in";
  const whose = channel.whose === "person" ? "" : ` (${channel.whose})`;
  if (channel.kind === "phone") return `phone ${channel.value}${whose}`;
  if (channel.kind === "email") return `email ${channel.value}${whose}`;
  if (channel.kind === "linkedin") return "LinkedIn profile";
  return "contact form";
}

function finishedLine(record: MissionStepRecord): string {
  const f = record.filed;
  if (f.companies === 0) return "Finished — nothing new to file.";
  const parts = [
    `${f.reachable} with someone to reach`,
    f.oneThingMissing ? `${f.oneThingMissing} missing one thing` : null,
    f.dead ? `${f.dead} ruled out` : null,
  ].filter(Boolean);
  return `Filed ${f.companies} ${f.companies === 1 ? "company" : "companies"} — ${parts.join(", ")}`;
}

function firstSentence(text: string, max: number): string {
  const match = text.trim().match(/^(.+?[.!?])(\s|$)/);
  return clip(match ? match[1] : text, max);
}

/** Still missing a person, a door, or the words — and not already ruled dead. */
function needsReach(t: CleanTarget): boolean {
  return t.state !== "dead" && !(t.person && t.channel && t.words);
}

/** Where a held company lives on the web: its site, or its email's domain. */
function knownSite(c: MissionCompanyRow): string | null {
  return c.website ?? (c.channel?.kind === "email" ? siteOfEmail(c.channel.value) : null);
}

/** A company the mission already holds, as a target the reach pass can read. */
function holdingToTarget(c: MissionCompanyRow): CleanTarget {
  const website = knownSite(c);
  return {
    knownCompanyId: c.companyId,
    company: c.name,
    companyKey: companyKey(c.name),
    website,
    domain: domainOf(website),
    city: c.city,
    country: c.country,
    role: c.role,
    why: c.why || "Already held by the mission.",
    person: c.person?.name ?? null,
    personTitle: c.person?.title ?? null,
    channel: c.channel,
    words: c.words,
    project: c.project,
    state: c.state,
    missing: c.missing?.fact ?? null,
    missingOwner: c.missing?.owner ?? null,
    deadReason: c.deadReason,
    sources: c.sources.slice(0, 3),
  };
}

/** What a mission holds, as the progress counter reads it. */
function factsOf(holdings: MissionHoldings): MissionFacts {
  return { companies: holdings.companies, candidates: [], partners: [] };
}

/**
 * Before the first piece of work: a finish line and a route, when the mission
 * has none. Never blocks the step — a mission that cannot be planned is worked
 * the way it was before.
 */
async function planFirst(
  assignment: ClaimedAssignment,
  ctx: MissionRunContext,
  runId: string | null,
  profile: OrganizationOperatingProfile | null,
): Promise<MissionPlanRows> {
  if (ctx.criteria.length > 0) return { criteria: ctx.criteria, plan: ctx.plan };
  try {
    const planned = await ensureMissionPlan({
      orgId: assignment.orgId,
      missionId: ctx.mission.id,
      kind: ctx.mission.kind,
      objective: ctx.mission.objective,
      instructions: [
        ...ctx.conversation.filter((m) => m.role === "human").map((m) => m.body),
        ctx.instruction,
      ],
      org: { name: profile?.name || "the company", companyProfile: profile?.companyProfile || null },
    });
    if (planned.wrote && planned.criteria.length > 0) {
      await appendMissionActivity(runId, [
        activity(
          "planned",
          `Set the finish line: ${planned.criteria.map((c) => metricLabel(c.metric, c.target)).join(" · ")}`,
        ),
      ]);
    }
    return { criteria: planned.criteria, plan: planned.plan };
  } catch (error) {
    console.error("planFirst:", error instanceof Error ? error.message : error);
    return { criteria: [], plan: [] };
  }
}

/**
 * What the CEO decided in this instruction, written down before the work so
 * it still holds when the instruction has left the conversation. Returns the
 * decisions in force and the finish line as they stand afterwards.
 */
async function noteDecisions(
  assignment: ClaimedAssignment,
  ctx: MissionRunContext,
  runId: string | null,
  planRows: MissionPlanRows,
): Promise<{ decisions: MissionDecision[]; planRows: MissionPlanRows }> {
  try {
    const noted = await noteInstructionDecisions({
      orgId: assignment.orgId,
      missionId: ctx.mission.id,
      stepId: assignment.id,
      agentInstanceId: assignment.agentInstanceId,
      kind: ctx.mission.kind,
      objective: ctx.mission.objective,
      instruction: ctx.instruction,
      messageId: ctx.instructionMessageId,
      authorUserId: ctx.instructionAuthor,
      lastQuestion: ctx.lastQuestion,
      inForce: ctx.decisions,
      criteria: planRows.criteria,
    });
    await appendMissionActivity(runId, [
      ...noted.added.map((d) => activity("noted", `Noted your decision: ${d.text}`)),
      ...noted.replaced.map((d) => activity("noted", `No longer in force: ${d.text}`)),
      ...noted.moved.map((m) =>
        activity("planned", `Moved the finish line as you said: ${metricLabel(m.metric, m.target)}`),
      ),
    ]);
    const replaced = new Set(noted.replaced.map((d) => d.id));
    return {
      decisions: [...ctx.decisions.filter((d) => !replaced.has(d.id)), ...noted.added],
      planRows:
        noted.moved.length > 0 ? await loadMissionPlan(assignment.orgId, ctx.mission.id) : planRows,
    };
  } catch (error) {
    console.error("noteDecisions:", error instanceof Error ? error.message : error);
    return { decisions: ctx.decisions, planRows };
  }
}

// ── claiming ────────────────────────────────────────────────────────────────

async function siblingRunning(orgId: string, missionId: string, stepId: string): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;
  const since = new Date(Date.now() - STALE_STEP_MINUTES * 60_000).toISOString();
  const { data } = await svc
    .from("agent_assignments")
    .select("id")
    .eq("org_id", orgId)
    .eq("mission_id", missionId)
    .eq("status", "active")
    .neq("id", stepId)
    .gte("started_at", since)
    .limit(1);
  return (data ?? []).length > 0;
}

/** Run this step now, if it is queued and nothing else in its mission is running. */
export async function runMissionStepById(orgId: string, stepId: string): Promise<ScoutWorkResult> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { status: "idle" };

  const { data: row } = await svc
    .from("agent_assignments")
    .select("id, agent_instance_id, title, objective, expected_output, constraints, mission_id, status")
    .eq("id", stepId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!row || row.status !== "queued" || !row.mission_id) return { status: "idle" };

  const { data: agent } = await svc
    .from("agent_instances")
    .select("status")
    .eq("id", row.agent_instance_id as string)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!agent || agent.status !== "active") return { status: "idle" };

  const missionId = row.mission_id as string;
  if (await siblingRunning(orgId, missionId, stepId)) return { status: "idle" };

  const assignment: ClaimedAssignment = {
    id: row.id as string,
    orgId,
    agentInstanceId: row.agent_instance_id as string,
    title: row.title as string,
    objective: row.objective as string,
    expectedOutput: (row.expected_output as string | null) ?? null,
    constraints: (row.constraints as Record<string, unknown> | null) ?? {},
  };

  const budget = await withinBudget(orgId, assignment.agentInstanceId);
  if (!budget.canRun) {
    // Marked on the row, so the tab says "blocked until tomorrow" instead of
    // showing an instruction that seems to be waiting for nothing.
    await svc
      .from("agent_assignments")
      .update({
        constraints: { ...assignment.constraints, budget_refused_at: new Date().toISOString() },
      })
      .eq("id", stepId)
      .eq("org_id", orgId);
    return { status: "refused", assignmentId: stepId, reason: budget.summary };
  }

  // The same atomic queued -> active step every runner uses, so two callers
  // can never run one step twice.
  const { data: claimed } = await svc
    .from("agent_assignments")
    .update({ status: "active", started_at: new Date().toISOString() })
    .eq("id", stepId)
    .eq("org_id", orgId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (!claimed) return { status: "idle" };

  return runStep(assignment, missionId);
}

/** A step the workforce pulse already claimed and budgeted. */
export async function runClaimedMissionStep(
  assignment: ClaimedAssignment,
): Promise<ScoutWorkResult> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { status: "idle" };
  const { data } = await svc
    .from("agent_assignments")
    .select("mission_id")
    .eq("id", assignment.id)
    .eq("org_id", assignment.orgId)
    .maybeSingle();
  const missionId = (data?.mission_id as string | null) ?? null;
  if (!missionId) {
    const error = "This step belongs to no mission.";
    await failStep(assignment, error, null);
    return { status: "failed", assignmentId: assignment.id, error };
  }
  if (await siblingRunning(assignment.orgId, missionId, assignment.id)) {
    await svc
      .from("agent_assignments")
      .update({ status: "queued", started_at: null })
      .eq("id", assignment.id)
      .eq("org_id", assignment.orgId);
    return { status: "idle" };
  }
  return runStep(assignment, missionId);
}

/**
 * Work through a mission's waiting instructions in order. Called after a
 * response has been sent, so the CEO lands on the mission while it runs.
 */
export async function runMissionQueue(orgId: string, missionId: string, maxSteps = 3): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    const next = await nextQueuedStep(orgId, missionId);
    if (!next) return;
    const result = await runMissionStepById(orgId, next);
    if (result.status !== "completed") return;
  }
}

// ── running ─────────────────────────────────────────────────────────────────

async function runStep(assignment: ClaimedAssignment, missionId: string): Promise<ScoutWorkResult> {
  const ctx = await loadMissionRunContext(assignment.orgId, missionId, assignment.id);
  if (!ctx) {
    const error = "The mission this step belongs to could not be read.";
    await failStep(assignment, error, null);
    return { status: "failed", assignmentId: assignment.id, error };
  }
  return ctx.mission.kind === "recruiting"
    ? runRecruitingStep(assignment, ctx)
    : runResearchStep(assignment, ctx);
}

function conversationBlock(ctx: MissionRunContext, limit: number): string {
  const all = ctx.conversation;
  if (all.length === 0) return "CONVERSATION SO FAR: none — this is the first instruction.";
  const recent = all.slice(-limit);
  const omitted = all.length - recent.length;
  return [
    `RECENT CONVERSATION (oldest first${
      omitted > 0 ? `; ${omitted} earlier messages left out — what they decided is in the MISSION STATE` : ""
    }):`,
    ...recent.map(
      (m) =>
        `[${m.role === "human" ? "CEO" : ctx.agentName} · ${m.at.slice(0, 16).replace("T", " ")}] ${clip(m.body, 600)}`,
    ),
  ].join("\n");
}

function reachPrompt(t: CleanTarget, ctx: MissionRunContext, whoIsAsking: string): string {
  return [
    `COMPANY: ${t.company}`,
    t.website
      ? `WEBSITE: ${t.website} — read this site. A company with a similar name elsewhere is a different company.`
      : "WEBSITE: not known — find the company's own official site first.",
    t.city || t.country ? `LOCATION: ${[t.city, t.country].filter(Boolean).join(", ")}` : null,
    `WHY THE MISSION CHOSE IT: ${t.why}`,
    t.person
      ? `ALREADY NAMED: ${t.person}${t.personTitle ? `, ${t.personTitle}` : ""} — confirm them on the company's own pages and find their published way in.`
      : null,
    `THE MISSION: ${ctx.mission.objective}`,
    `WHO IS ASKING: ${whoIsAsking}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Open the own site of each company still missing a person or a door.
 *
 * A few at a time, each in its own short run, so one slow site cannot hold
 * the others and the whole pass stays inside a request's lifetime. A site
 * read in an earlier step is not read again.
 */
async function reachPass(
  targets: CleanTarget[],
  ctx: MissionRunContext,
  runId: string | null,
  alreadyRead: Set<string>,
  whoIsAsking: string,
): Promise<CleanTarget[]> {
  const needs = targets
    .map((target, index) => ({ target, index }))
    .filter(({ target }) => needsReach(target) && !alreadyRead.has(target.companyKey))
    .slice(0, REACH_LIMIT);
  if (needs.length === 0) return targets;

  await appendMissionActivity(runId, [
    activity(
      "read",
      `Opening the sites of ${needs.length} ${needs.length === 1 ? "company" : "companies"} for the person to ask for and the published way in`,
    ),
  ]);

  const out = [...targets];
  let cursor = 0;
  const worker = async () => {
    while (cursor < needs.length) {
      const { target, index } = needs[cursor++];
      try {
        const agent = createCompanyReachAgent();
        const result = await agent.generate({
          prompt: reachPrompt(target, ctx, whoIsAsking),
          onStepFinish: async (step) => {
            await appendMissionActivity(runId, searchActivityOf(step));
          },
          timeout: 75_000,
        });
        if (result.output) out[index] = mergeReach(target, result.output);
      } catch (error) {
        await appendMissionActivity(runId, [
          activity(
            "failed",
            `Could not read ${target.company}'s site: ${clip(error instanceof Error ? error.message : "unknown error", 110)}`,
          ),
        ]);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(REACH_CONCURRENCY, needs.length) }, worker));
  return out;
}

async function runResearchStep(
  assignment: ClaimedAssignment,
  ctx: MissionRunContext,
): Promise<ScoutWorkResult> {
  const model = getScoutModelId();
  const events: ActivityEvent[] = [];
  const runId = await startMissionRun({
    orgId: assignment.orgId,
    missionId: ctx.mission.id,
    assignmentId: assignment.id,
    agentInstanceId: assignment.agentInstanceId,
    agentName: ctx.agentName,
    provider: "openai",
    model,
    first: activity("started", `Started: “${clip(ctx.instruction, 90)}”`),
  });

  try {
    const [supply, profile] = await Promise.all([
      listAvailableSupply(assignment.orgId),
      getOrganizationOperatingProfile(assignment.orgId),
    ]);
    // Who is asking, from the company's own profile rather than a name
    // written into this file.
    const whoIsAsking =
      [profile?.name, profile?.companyProfile ? clip(profile.companyProfile, 300) : null]
        .filter(Boolean)
        .join(" — ") || "a supplier of industrial crews to contractors";
    // Before the work: when the mission is finished and how it gets there,
    // and what the CEO decided in this instruction.
    const planned = await planFirst(assignment, ctx, runId, profile);
    const { decisions, planRows } = await noteDecisions(assignment, ctx, runId, planned);
    const before = evaluateProgress(planRows.criteria, planRows.plan, factsOf(ctx.holdings));
    const prompt = [
      `MISSION: ${[ctx.mission.emoji, ctx.mission.title].filter(Boolean).join(" ")}`,
      `OBJECTIVE: ${ctx.mission.objective}`,
      "",
      describeMissionState({
        holdings: ctx.holdings,
        decisions,
        criteria: planRows.criteria,
        progress: before,
        lastQuestion: ctx.lastQuestion,
      }),
      ...(before ? ["", describeProgress(before)] : []),
      "",
      "WHAT THIS MISSION ALREADY HOLDS (do not re-file a company unless you learned something new about it):",
      describeHoldings(ctx.holdings),
      "",
      conversationBlock(ctx, RECENT_MESSAGES),
      "",
      "WHO TRIANGLE CAN SUPPLY RIGHT NOW.",
      "Supply is Triangle's own people and partner firms whose capacity a human confirmed within the last 14 days. Anything absent from both lists is not supply.",
      `Own people (${supply.ownPeople.length}): ${
        supply.ownPeople.length ? JSON.stringify(supply.ownPeople) : "none on the bench."
      }`,
      `Partner firms with confirmed capacity (${supply.partnerFirms.length}): ${
        supply.partnerFirms.length ? JSON.stringify(supply.partnerFirms) : "none on file."
      }`,
      "",
      "THE LATEST INSTRUCTION — carry this out now:",
      ctx.instruction,
    ].join("\n");

    const agent = createMissionScoutAgent();
    const result = await agent.generate({
      prompt,
      // What was searched and read, written while it happens, so a step that
      // is still working shows what it has done so far.
      onStepFinish: async (step) => {
        await appendMissionActivity(runId, searchActivityOf(step));
      },
      timeout: 120_000,
    });
    const report = result.output;
    if (!report) throw new Error(`${ctx.agentName} returned no structured report.`);

    // A company the mission already holds, named again with nothing new
    // attached, is the worker referring back to it — not a lead it dropped.
    const holdingByKey = new Map(ctx.holdings.companies.map((c) => [companyKey(c.name), c]));
    const fresh = report.targets.filter(
      // The same test cleanTargets applies, or a held company cited with an
      // unusable link comes back as "left out: no source to cite".
      (t) => !(holdingByKey.has(companyKey(t.company)) && !citesASource(t)),
    );
    const cleaned = cleanTargets(fresh);
    const dropped = cleaned.dropped;
    // A target the mission already holds IS that record, with its known site —
    // never a lookalike found again by name.
    const kept = cleaned.kept.map((t) => {
      const holding = holdingByKey.get(t.companyKey);
      if (!holding) return t;
      const website = t.website ?? knownSite(holding);
      return { ...t, knownCompanyId: holding.companyId, website, domain: domainOf(website) };
    });

    // A site read in an earlier step is not read again.
    const alreadyRead = new Set(
      ctx.holdings.companies.filter((c) => c.reachChecked).map((c) => companyKey(c.name)),
    );
    // Companies the mission holds that still miss a person or a door, and
    // whose own site nobody has read, ride along in the same pass while there
    // is room. The CEO should not have to name each one to get it done.
    const inStep = new Set(kept.map((t) => t.companyKey));
    const room = Math.max(
      0,
      REACH_LIMIT - kept.filter((t) => needsReach(t) && !alreadyRead.has(t.companyKey)).length,
    );
    const backlog = ctx.holdings.companies
      .filter(
        (c) =>
          !c.notForUs &&
          c.state === "one_thing_missing" &&
          !c.reachChecked &&
          !inStep.has(companyKey(c.name)),
      )
      .slice(0, room)
      .map(holdingToTarget);

    const reached = await reachPass([...kept, ...backlog], ctx, runId, alreadyRead, whoIsAsking);
    // A held company is filed again only when its site was actually read —
    // otherwise there is nothing new to say about it.
    const backlogKeys = new Set(backlog.map((t) => t.companyKey));
    const toFile = reached.filter((t) => !backlogKeys.has(t.companyKey) || t.reachChecked);

    const filed = await fileMissionTargets(
      {
        orgId: assignment.orgId,
        missionId: ctx.mission.id,
        missionTitle: ctx.mission.title,
        stepId: assignment.id,
        agentInstanceId: assignment.agentInstanceId,
        agentName: ctx.agentName,
        createdBy: ctx.mission.createdBy,
      },
      toFile,
    );

    for (const f of filed) {
      const t = f.target;
      if (f.refused) {
        events.push(activity("failed", `Could not file ${t.company}: ${clip(f.refused, 140)}`));
      } else if (t.state === "reachable") {
        events.push(activity("found", `${t.person} at ${t.company} — ${channelWords(t.channel)}`));
      } else if (t.state === "dead") {
        events.push(activity("dead", `${t.company}: not worth chasing — ${clip(t.deadReason, 120)}`));
      } else {
        events.push(
          activity(
            "missing",
            `${t.company}: ${clip(t.missing, 110)}${t.reachNote ? ` — site read: ${clip(t.reachNote, 90)}` : ""}`,
          ),
        );
      }
    }
    for (const d of dropped) {
      events.push(activity("dropped", `Left out ${d.company}: ${d.reason}`));
    }

    const ok = filed.filter((f) => !f.refused);
    const question = report.questionForCeo?.trim() || null;
    if (question) events.push(activity("asked", `Waiting for you: ${clip(question, 160)}`));

    const record: MissionStepRecord = {
      kind: "mission_step",
      version: 1,
      reply: report.reply.trim(),
      brief: {
        headline: report.brief.headline.trim(),
        summary: report.brief.summary.trim(),
        recommended: report.brief.recommended?.trim() || null,
      },
      questionForCeo: question,
      suggestedNext: report.suggestedNext
        .map((s) => ({ label: s.label.trim(), instruction: s.instruction.trim() }))
        .filter((s) => s.label && s.instruction)
        .slice(0, 3),
      filed: {
        companies: ok.length,
        people: ok.filter((f) => f.contactId).length,
        reachable: ok.filter((f) => f.target.state === "reachable").length,
        oneThingMissing: ok.filter((f) => f.target.state === "one_thing_missing").length,
        dead: ok.filter((f) => f.target.state === "dead").length,
        dropped: dropped.length + (filed.length - ok.length),
      },
    };

    // The reply was written before the sites were read. When reading them
    // changed the picture, say so in the conversation rather than leave a
    // reply that undersells what is now on file.
    const upgraded = ok.filter(
      (f) =>
        f.target.state === "reachable" &&
        !kept.some((k) => k.companyKey === f.target.companyKey && k.state === "reachable"),
    );
    const ruledOut = ok.filter(
      (f) =>
        f.target.state === "dead" &&
        f.target.reachChecked &&
        !kept.some((k) => k.companyKey === f.target.companyKey && k.state === "dead"),
    );
    const replyBody = [
      record.reply || record.brief.headline || finishedLine(record),
      upgraded.length > 0
        ? `After opening their sites: ${upgraded
            .slice(0, 4)
            .map((f) => `${f.target.person} at ${f.target.company}`)
            .join(", ")}${upgraded.length > 4 ? ` and ${upgraded.length - 4} more` : ""} ${
            upgraded.length === 1 ? "is" : "are"
          } now reachable.`
        : null,
      ruledOut.length > 0
        ? `Their own sites ruled out ${ruledOut
            .slice(0, 3)
            .map((f) => `${f.target.company} (${clip(f.target.deadReason, 80)})`)
            .join("; ")}.`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    await addAgentMessage({
      assignmentId: assignment.id,
      orgId: assignment.orgId,
      agentInstanceId: assignment.agentInstanceId,
      body: replyBody,
    });

    const completed = await completeAssignment({
      assignmentId: assignment.id,
      orgId: assignment.orgId,
      agentInstanceId: assignment.agentInstanceId,
      resultSummary: JSON.stringify(record),
    });
    if (typeof completed === "object" && "refused" in completed) throw new Error(completed.refused);
    if (!completed) throw new Error("The step changed before it could be reported.");

    // How far the mission moved, counted again from what is now on file.
    const progressAfter = before
      ? evaluateProgress(
          planRows.criteria,
          planRows.plan,
          factsOf(await loadMissionHoldings(assignment.orgId, ctx.mission.id)),
        )
      : null;
    if (before && progressAfter) {
      events.push(
        activity(
          "progress",
          progressAfter.met
            ? `Finish line reached — ${progressSentence(progressAfter)}`
            : `Finish line: ${progressSentence(progressAfter)}${
                progressAfter.percent !== before.percent ? ` (was ${before.percent}%)` : ""
              }${progressAfter.current ? ` · next: ${progressAfter.current.title}` : ""}`,
        ),
      );
    }
    events.push(activity("finished", finishedLine(record)));
    await finishMissionRun(runId, {
      status: "completed",
      events,
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
      summary: {
        filed: record.filed,
        sitesRead: reached.filter((t) => t.reachChecked).length,
        heldCompaniesRead: backlog.length,
        progress: progressAfter ? { percent: progressAfter.percent, met: progressAfter.met } : null,
        memory: {
          decisionsInForce: decisions.length,
          conversationMessages: Math.min(ctx.conversation.length, RECENT_MESSAGES),
        },
      },
    });
    await touchMission(assignment.orgId, ctx.mission.id);
    return { status: "completed", assignmentId: assignment.id, headline: record.brief.headline };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The step failed.";
    await failStep(assignment, message, ctx.agentName);
    events.push(activity("failed", clip(message, 200)));
    await finishMissionRun(runId, { status: "failed", events, error: message });
    await touchMission(assignment.orgId, ctx.mission.id);
    return { status: "failed", assignmentId: assignment.id, error: message };
  }
}

/**
 * A recruiting step: the pool, read by the employee who reads it.
 *
 * The same shell as research — conversation, activity, brief, a surface of
 * records — filled with the people and partner firms Triangle can field
 * instead of companies it could sell to.
 */
async function runRecruitingStep(
  assignment: ClaimedAssignment,
  ctx: MissionRunContext,
): Promise<ScoutWorkResult> {
  const events: ActivityEvent[] = [];
  const runId = await startMissionRun({
    orgId: assignment.orgId,
    missionId: ctx.mission.id,
    assignmentId: assignment.id,
    agentInstanceId: assignment.agentInstanceId,
    agentName: ctx.agentName,
    provider: "openai",
    model: "gpt-4.1-mini",
    first: activity("started", `Started: “${clip(ctx.instruction, 90)}”`),
  });

  try {
    const profile = await getOrganizationOperatingProfile(assignment.orgId);
    const planned = await planFirst(assignment, ctx, runId, profile);
    const { decisions, planRows } = await noteDecisions(assignment, ctx, runId, planned);
    const question = [
      `WHAT THIS PIECE OF WORK IS FOR: ${ctx.mission.objective}`,
      planRows.criteria.length > 0
        ? `IT IS FINISHED WHEN THERE ARE: ${planRows.criteria.map((c) => metricLabel(c.metric, c.target)).join("; ")}.`
        : null,
      decisions.length > 0
        ? `THE CEO HAS DECIDED (apply every one): ${decisions.map((d) => d.text).join(" ")}`
        : null,
      ctx.conversation.length > 0 ? conversationBlock(ctx, RECENT_MESSAGES) : null,
      `WHAT THE CEO ASKS NOW: ${ctx.instruction}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const answer = await answerAboutTalent(assignment.orgId, question);
    if ("error" in answer) throw new Error(answer.error);

    events.push(activity("read", "Read Triangle's own people and the partner firms with confirmed capacity"));
    for (const p of answer.people.slice(0, 8)) {
      events.push(activity("found", `${p.name}${p.role ? ` — ${p.role}` : ""}`));
    }
    for (const p of answer.partners.slice(0, 4)) {
      events.push(
        activity("found", `${p.name} — partner firm${p.crewSize !== null ? `, up to ${p.crewSize}` : ""}`),
      );
    }
    for (const b of answer.blockers.slice(0, 5)) events.push(activity("missing", clip(b, 200)));

    const record: MissionStepRecord = {
      kind: "mission_step",
      version: 1,
      reply: clip(answer.answer, 900),
      brief: {
        headline: firstSentence(answer.answer, 220),
        summary: clip(answer.answer, 700),
        recommended: null,
      },
      questionForCeo: null,
      suggestedNext: [
        {
          label: "What's not recorded",
          instruction:
            "For each person you named, what is not recorded that a client will ask for — certificates, right to work, availability?",
        },
        {
          label: "Partner capacity",
          instruction:
            "Which partner firms could field the rest of this crew, and whose capacity needs confirming first?",
        },
      ],
      filed: {
        companies: 0,
        people: answer.people.length,
        reachable: 0,
        oneThingMissing: 0,
        dead: 0,
        dropped: 0,
      },
      candidates: {
        workerIds: answer.people.map((p) => p.id),
        partnerIds: answer.partners.map((p) => p.id),
        blockers: answer.blockers,
        missing: answer.missing,
      },
    };

    await addAgentMessage({
      assignmentId: assignment.id,
      orgId: assignment.orgId,
      agentInstanceId: assignment.agentInstanceId,
      body: record.reply || "Done.",
    });
    const completed = await completeAssignment({
      assignmentId: assignment.id,
      orgId: assignment.orgId,
      agentInstanceId: assignment.agentInstanceId,
      resultSummary: JSON.stringify(record),
    });
    if (typeof completed === "object" && "refused" in completed) throw new Error(completed.refused);
    if (!completed) throw new Error("The step changed before it could be reported.");

    events.push(
      activity(
        "finished",
        `Named ${answer.people.length} ${answer.people.length === 1 ? "person" : "people"} and ${answer.partners.length} partner ${answer.partners.length === 1 ? "firm" : "firms"}`,
      ),
    );
    await finishMissionRun(runId, { status: "completed", events });
    await touchMission(assignment.orgId, ctx.mission.id);
    return { status: "completed", assignmentId: assignment.id, headline: record.brief.headline };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The step failed.";
    await failStep(assignment, message, ctx.agentName);
    events.push(activity("failed", clip(message, 200)));
    await finishMissionRun(runId, { status: "failed", events, error: message });
    await touchMission(assignment.orgId, ctx.mission.id);
    return { status: "failed", assignmentId: assignment.id, error: message };
  }
}

/**
 * Close a step as failed, and say so in the conversation. A thread that ends
 * on the CEO's instruction with nothing after it reads as "still thinking".
 */
async function failStep(
  assignment: ClaimedAssignment,
  message: string,
  agentName: string | null,
): Promise<void> {
  await addAgentMessage({
    assignmentId: assignment.id,
    orgId: assignment.orgId,
    agentInstanceId: assignment.agentInstanceId,
    body: `I could not finish this: ${clip(message, 600)}`,
  });
  await completeAssignment({
    assignmentId: assignment.id,
    orgId: assignment.orgId,
    agentInstanceId: assignment.agentInstanceId,
    resultSummary: `${agentName ?? "The employee"} could not finish this: ${message}`,
    failed: true,
  });
}
