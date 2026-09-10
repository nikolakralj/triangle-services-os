import "server-only";
import {
  createReachabilityAgent,
  createScoutQualificationAgent,
  getScoutModelId,
} from "@/lib/ai/scout-agent";
import {
  describeChannel,
  serializeReachabilityReport,
} from "@/lib/ai/reachability-report";
import {
  serializeScoutCaseReport,
  findingStateOf,
  contractViolation,
} from "@/lib/ai/scout-case-report";
import { addAgentMessage, takeThreadForBot } from "@/lib/data/assignment-threads";
import { logAgentRun } from "@/lib/data/agents";
import { createFinding } from "@/lib/data/findings";
import { getOrganizationOperatingProfile } from "@/lib/data/organization-profile";
import { completeAssignment } from "@/lib/data/workforce";
import { recordRefusal } from "@/lib/data/refusals";
import { withinBudget } from "@/lib/data/agent-budget";
import { listSupplyPartners } from "@/lib/data/supply-partners";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type ClaimedAssignment = {
  id: string;
  orgId: string;
  agentInstanceId: string;
  title: string;
  objective: string;
  expectedOutput: string | null;
  constraints: Record<string, unknown>;
};

/**
 * How long a `bot` job waits for its provider runtime before this executor
 * takes it. Long enough that a bot polling a few times a day still gets first
 * refusal; short enough that nothing sits over a weekend.
 */
const STALL_HOURS = Number(process.env.AGENT_STALL_HOURS ?? 6);

/** A job this runner has already handed back is not offered to it again. */
const REFUSED_MARKER = JSON.stringify({ runner_refused: true });

/**
 * The contract's evidence, copied onto a finding's payload.
 *
 * A finding is read on its own in the queue, not alongside the report that
 * produced it, so "why is this dead" has to travel with the row. Migration 041
 * checks these exact keys.
 */
function stateFields(
  report: { deadReason: string | null; unknowns: string[]; missingOwner: string | null },
  state: "reachable" | "one_thing_missing" | "dead",
): Record<string, unknown> {
  if (state === "dead") {
    return { dead_reason: report.deadReason ?? "Refused during qualification." };
  }
  if (state === "one_thing_missing") {
    return {
      missing: report.unknowns[0] ?? "",
      missing_owner: report.missingOwner ?? "",
    };
  }
  return {};
}

export type ScoutWorkResult =
  | { status: "idle" }
  | { status: "completed"; assignmentId: string; headline: string }
  | { status: "failed"; assignmentId: string; error: string }
  /** Claimed, understood to be out of scope, and handed back untouched. */
  | { status: "refused"; assignmentId: string; reason: string };

async function claimNextAssignment(orgId: string): Promise<ClaimedAssignment | null> {
  const service = createServiceSupabaseClient();
  if (!service) return null;

  const { data: scouts } = await service
    .from("agent_instances")
    .select("id")
    .eq("org_id", orgId)
    .eq("role_key", "project_researcher")
    .eq("status", "active");
  const scoutIds = (scouts ?? []).map((row) => row.id as string);
  if (scoutIds.length === 0) return null;

  // Two kinds of queued work are claimable here.
  //
  // `execution_mode: in_app` is ours outright. `bot` belongs to the Scout
  // running on a provider platform — but that Scout only ever POLLS, because
  // Triangle cannot push to it. If nobody opens the bot, a job sits queued
  // forever and the company simply stops, which is what "the AI should work,
  // not the human" fails to mean in practice.
  //
  // So the bot gets first refusal for STALL_HOURS, and after that this
  // executor picks the job up rather than letting it rot.
  const stalledBefore = new Date(
    Date.now() - STALL_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const [ours, stalled] = await Promise.all([
    service
      .from("agent_assignments")
      .select(
        "id,org_id,agent_instance_id,title,objective,expected_output,constraints,status,created_at",
      )
      .eq("org_id", orgId)
      .in("agent_instance_id", scoutIds)
      .eq("status", "queued")
      .contains("constraints", { execution_mode: "in_app" })
      .not("constraints", "cs", REFUSED_MARKER)
      .order("created_at")
      .limit(5),
    service
      .from("agent_assignments")
      .select(
        "id,org_id,agent_instance_id,title,objective,expected_output,constraints,status,created_at",
      )
      .eq("org_id", orgId)
      .in("agent_instance_id", scoutIds)
      .eq("status", "queued")
      .contains("constraints", { execution_mode: "bot" })
      .not("constraints", "cs", REFUSED_MARKER)
      .lt("created_at", stalledBefore)
      .order("created_at")
      .limit(5),
  ]);

  // Ours first: work explicitly addressed to this runtime should never wait
  // behind a job the bot may still be about to collect.
  const candidates = [...(ours.data ?? []), ...(stalled.data ?? [])];

  for (const row of candidates) {
    const { data: claimed } = await service
      .from("agent_assignments")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("id", row.id as string)
      .eq("org_id", orgId)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    return {
      id: row.id as string,
      orgId: row.org_id as string,
      agentInstanceId: row.agent_instance_id as string,
      title: row.title as string,
      objective: row.objective as string,
      expectedOutput: (row.expected_output as string) ?? null,
      constraints: (row.constraints as Record<string, unknown>) ?? {},
    };
  }

  return null;
}

/** Claim exactly this row, if it is queued work for an active Scout in this org. */
async function claimAssignmentById(
  orgId: string,
  assignmentId: string,
): Promise<ClaimedAssignment | null> {
  const service = createServiceSupabaseClient();
  if (!service) return null;

  const { data: scouts } = await service
    .from("agent_instances")
    .select("id")
    .eq("org_id", orgId)
    .eq("role_key", "project_researcher")
    .eq("status", "active");
  const scoutIds = (scouts ?? []).map((row) => row.id as string);
  if (scoutIds.length === 0) return null;

  // The same atomic queued -> active step the queue runner uses, so a job can
  // never be run twice by two callers racing for it.
  const { data: claimed } = await service
    .from("agent_assignments")
    .update({ status: "active", started_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .eq("org_id", orgId)
    .eq("status", "queued")
    .in("agent_instance_id", scoutIds)
    .select("id,org_id,agent_instance_id,title,objective,expected_output,constraints")
    .maybeSingle();
  if (!claimed) return null;

  return {
    id: claimed.id as string,
    orgId: claimed.org_id as string,
    agentInstanceId: claimed.agent_instance_id as string,
    title: claimed.title as string,
    objective: claimed.objective as string,
    expectedOutput: (claimed.expected_output as string) ?? null,
    constraints: (claimed.constraints as Record<string, unknown>) ?? {},
  };
}

async function buildAssignmentContext(assignment: ClaimedAssignment) {
  const service = createServiceSupabaseClient();
  if (!service) throw new Error("Database unavailable");

  const { data: entityLinks } = await service
    .from("agent_assignment_entities")
    .select("entity_type,entity_id,relation")
    .eq("org_id", assignment.orgId)
    .eq("assignment_id", assignment.id);
  const companyId = (entityLinks ?? []).find(
    (row) => row.entity_type === "company",
  )?.entity_id as string | undefined;
  if (!companyId) throw new Error("Company qualification has no company attached");

  const [companyResult, evidenceResult, linkedAssignmentsResult, profile, threadMap] =
    await Promise.all([
      service
        .from("companies")
        .select(
          "id,name,legal_name,company_type,company_status,country,region,city,website,linkedin_url,source_url,sectors,description,pain_points,notes,do_not_contact",
        )
        .eq("organization_id", assignment.orgId)
        .eq("id", companyId)
        .maybeSingle(),
      service
        .from("agent_findings")
        .select("finding_type,payload,source_url,evidence_text,confidence,status")
        .eq("org_id", assignment.orgId)
        .eq("promoted_entity_type", "company")
        .eq("promoted_entity_id", companyId)
        .order("created_at", { ascending: false })
        .limit(10),
      service
        .from("agent_assignment_entities")
        .select("assignment_id")
        .eq("org_id", assignment.orgId)
        .eq("entity_type", "company")
        .eq("entity_id", companyId),
      getOrganizationOperatingProfile(assignment.orgId),
      takeThreadForBot([assignment.id], assignment.orgId),
    ]);

  if (!companyResult.data) throw new Error("Company record not found");

  const linkedIds = Array.from(
    new Set(
      (linkedAssignmentsResult.data ?? [])
        .map((row) => row.assignment_id as string)
        .filter((id) => id !== assignment.id),
    ),
  );
  const { data: backgroundAssignments } = linkedIds.length
    ? await service
        .from("agent_assignments")
        .select("id,title,objective,result_summary,status")
        .eq("org_id", assignment.orgId)
        .in("id", linkedIds)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] };

  const { data: backgroundMessages } = linkedIds.length
    ? await service
        .from("assignment_messages")
        .select("assignment_id,role,body,created_at")
        .eq("org_id", assignment.orgId)
        .in("assignment_id", linkedIds)
        .order("created_at")
        .limit(30)
    : { data: [] };

  return {
    seller: profile,
    company: companyResult.data,
    acceptedEvidence: evidenceResult.data ?? [],
    assignment: {
      title: assignment.title,
      objective: assignment.objective,
      expectedOutput: assignment.expectedOutput,
      constraints: assignment.constraints,
    },
    currentConversation: threadMap.get(assignment.id) ?? {
      thread: [],
      newQuestions: [],
    },
    backgroundResearch: (backgroundAssignments ?? []).map((row) => ({
      title: row.title,
      status: row.status,
      objective: String(row.objective ?? "").slice(0, 2_000),
      result: String(row.result_summary ?? "").slice(0, 5_000),
    })),
    backgroundQuestions: backgroundMessages ?? [],
  };
}

export async function runNextScoutAssignment(orgId: string): Promise<ScoutWorkResult> {
  const assignment = await claimNextAssignment(orgId);
  if (!assignment) return { status: "idle" };
  return runClaimedAssignment(assignment);
}

/**
 * Run one specific assignment, now.
 *
 * The Ask box created a job and then called runNextScoutAssignment, which
 * claims the OLDEST queued job — so a question typed today could be answered
 * by a job queued last week while the question itself waited. The screen said
 * so in small print, which was honest about the bug rather than free of it.
 * This claims the row it is given, or nothing.
 */
export async function runScoutAssignmentById(
  orgId: string,
  assignmentId: string,
): Promise<ScoutWorkResult> {
  const assignment = await claimAssignmentById(orgId, assignmentId);
  if (!assignment) return { status: "idle" };
  return runClaimedAssignment(assignment);
}

async function runClaimedAssignment(
  assignment: ClaimedAssignment,
): Promise<ScoutWorkResult> {
  // Checked after claiming rather than before, so the ceiling is enforced per
  // employee rather than per organisation — and the job goes straight back to
  // the queue for tomorrow rather than being lost.
  const budget = await withinBudget(assignment.orgId, assignment.agentInstanceId);
  if (!budget.canRun) {
    const service = createServiceSupabaseClient();
    if (service) {
      await service
        .from("agent_assignments")
        .update({ status: "queued" })
        .eq("id", assignment.id)
        .eq("org_id", assignment.orgId);
    }
    await addAgentMessage({
      assignmentId: assignment.id,
      orgId: assignment.orgId,
      agentInstanceId: assignment.agentInstanceId,
      body: `Not started: ${budget.summary}`,
    });
    return { status: "refused", assignmentId: assignment.id, reason: budget.summary };
  }

  // Scout has more than one job now, and the constraint says which one.
  //
  // This used to read "anything unlabelled is a company qualification", which
  // was true on the day it was written and stopped being true the moment a
  // play could be turned into an assignment. Choosing an agent option on a
  // play files work with constraints of {execution_mode, no_outreach,
  // from_play} and no case_type at all — so an assignment whose objective was
  // "ask ANDRITZ Metals for an introduction" was handed to the qualifier and
  // prompted to "qualify this company into a project-to-placement commercial
  // case". It would answer a question nobody asked, file the report, and the
  // assignment would be marked completed.
  //
  // A job done wrong and recorded as done is the failure this whole product
  // exists to refuse. So the fallback is no longer a guess: an assignment
  // whose kind is not handled here is put back for a human, with the reason
  // written down, and nothing is claimed to have been done.
  const caseType =
    typeof assignment.constraints.case_type === "string"
      ? assignment.constraints.case_type
      : null;

  // A step inside a mission reads the mission — its objective, the
  // conversation and everything it already holds — before it works. Imported
  // on use, because the mission executor reads supply from this file.
  if (caseType === "mission_step") {
    const { runClaimedMissionStep } = await import("@/lib/ai/mission-executor");
    return runClaimedMissionStep(assignment);
  }

  if (caseType === "contact_reachability") {
    return runReachabilityAssignment(assignment);
  }

  // `open_research` had to be named here.
  //
  // This dispatcher recognised open research only as the ABSENCE of a case
  // type, while migration 041's trigger, the Ask box on Today, and the "send
  // Scout back for it" action all call that same kind of work
  // "open_research". One name with two meanings in two files — the identical
  // shape of the two-Scouts bug — so the first question typed into the new
  // screen was refused with "the unattended runner has no handler for
  // open_research", by the handler that exists to run it.
  //
  // Named explicitly now. `null` still maps here for the play-derived and
  // older rows that carry no type at all.
  if (caseType === "open_research") {
    return runOpenResearchAssignment(assignment);
  }

  if (caseType !== null && caseType !== "company_qualification") {
    return refuseUnknownAssignment(assignment, caseType);
  }
  // An assignment with no case_type is only a company qualification when it
  // actually names a company. A play-derived job does not.
  if (caseType === null && assignment.constraints.from_play) {
    return refuseUnknownAssignment(assignment, "a play with no case type");
  }

  // Neither does a question somebody typed into the cockpit. "Find HVAC
  // subcontractors in Frankfurt" has no company attached and never will, and
  // the qualifier throws on it — which is what happened the first time the new
  // command bar was used: the job ran, failed in nine seconds, and the whole
  // promise of asking an employee in plain language died on it.
  //
  // A brief with no case entity is an open research question. That is a
  // legitimate kind of work, not an error, and it needs its own handler rather
  // than a refusal.
  if (caseType === null && !(await hasCompanyAttached(assignment))) {
    return runOpenResearchAssignment(assignment);
  }

  const startedAt = new Date();
  const model = getScoutModelId();
  try {
    const context = await buildAssignmentContext(assignment);
    const agent = createScoutQualificationAgent();
    const result = await agent.generate({
      prompt: [
        "Qualify this company into a project-to-placement commercial case.",
        "Answer every new human question inside the report, but do not perform outreach.",
        "The CEO needs a short strategy: where the door is, who buys, what Triangle should offer, what proof is missing, and the next human action.",
        "Do not repeat a broad company list. This is one durable company case.",
        `Case context JSON:\n${JSON.stringify(context, null, 2)}`,
      ].join("\n\n"),
    });
    if (!result.output) throw new Error("Scout returned no structured report");

    const report = result.output;
    await addAgentMessage({
      assignmentId: assignment.id,
      orgId: assignment.orgId,
      agentInstanceId: assignment.agentInstanceId,
      body: [
        `Manager report submitted: ${report.headline}`,
        report.questionsAnswered.length > 0
          ? `Questions answered:\n${report.questionsAnswered.map((item) => `- ${item}`).join("\n")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    // What this research actually produced, decided from what the report
    // carries rather than from the label the model chose for itself.
    const state = findingStateOf(report);
    const violation = contractViolation(report, state);
    if (violation) {
      // Refuse rather than file a hedge. The assignment stays queued and the
      // reason reaches the thread, which is the same shape as every other
      // refusal in this system: "I could not do this" is an answer.
      throw new Error(violation);
    }

    const completed = await completeAssignment({
      assignmentId: assignment.id,
      orgId: assignment.orgId,
      agentInstanceId: assignment.agentInstanceId,
      resultSummary: serializeScoutCaseReport(report),
      findingState: state,
    });
    if (typeof completed === "object" && "refused" in completed) {
      throw new Error(completed.refused);
    }
    if (!completed) throw new Error("Assignment changed before Scout could submit it");

    if (report.namedProject && report.sources[0]) {
      await createFinding({
        orgId: assignment.orgId,
        agentInstanceId: assignment.agentInstanceId,
        assignmentId: assignment.id,
        findingType: "project",
        payload: {
          project_name: report.namedProject.name,
          city: report.namedProject.location,
          client_company: report.namedProject.owner,
          summary: report.namedProject.evidence,
          source: "in_app_scout_qualification",
          // The contract wants the reason on the row, not only in the parent
          // report — a finding is read on its own in the queue.
          ...stateFields(report, state),
        },
        sourceUrl: report.sources[0].url,
        evidenceText: report.namedProject.evidence,
        confidence: report.confidence,
        idempotencyKey: `in-app-scout:${assignment.id}:project`,
        // A project discovered inside a case that could not name a buyer is
        // exactly as unactionable as that case was, so it inherits the state
        // rather than being filed as if it stood on its own.
        findingState: state,
      });
    }

    await logAgentRun({
      orgId: assignment.orgId,
      agentName: "Scout",
      source: "in_app_executor",
      summary: {
        assignmentId: assignment.id,
        status: "completed",
        verdict: report.verdict,
        confidence: report.confidence,
        durationMs: Date.now() - startedAt.getTime(),
        model,
      },
      agentInstanceId: assignment.agentInstanceId,
      assignmentId: assignment.id,
      provider: "openai",
      model,
      status: "completed",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      metadata: {
        verdict: report.verdict,
        confidence: report.confidence,
      },
    });

    return {
      status: "completed",
      assignmentId: assignment.id,
      headline: report.headline,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scout execution failed";
    await completeAssignment({
      assignmentId: assignment.id,
      orgId: assignment.orgId,
      agentInstanceId: assignment.agentInstanceId,
      resultSummary: `Scout could not complete this case: ${message}`,
      failed: true,
    });
    await logAgentRun({
      orgId: assignment.orgId,
      agentName: "Scout",
      source: "in_app_executor",
      summary: {
        assignmentId: assignment.id,
        status: "failed",
        error: message,
        durationMs: Date.now() - startedAt.getTime(),
      },
      agentInstanceId: assignment.agentInstanceId,
      assignmentId: assignment.id,
      provider: "openai",
      model,
      status: "failed",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      error: message,
    });
    return { status: "failed", assignmentId: assignment.id, error: message };
  }
}

// ---------------------------------------------------------------------------
// Reachability: send an employee to find the door.
// ---------------------------------------------------------------------------

async function runReachabilityAssignment(
  assignment: ClaimedAssignment,
): Promise<ScoutWorkResult> {
  const startedAt = new Date();
  const model = getScoutModelId();
  const service = createServiceSupabaseClient();
  if (!service) {
    return { status: "failed", assignmentId: assignment.id, error: "Database unavailable" };
  }

  try {
    const contactId = String(assignment.constraints.buyer_contact_id ?? "");
    const { data: contact } = await service
      .from("buyer_contacts")
      .select("id, full_name, job_title, company_name, buyer_role, notes")
      .eq("organization_id", assignment.orgId)
      .eq("id", contactId)
      .maybeSingle();
    if (!contact) throw new Error("Reachability job has no buyer contact attached");

    const [profile, threadMap] = await Promise.all([
      getOrganizationOperatingProfile(assignment.orgId),
      takeThreadForBot([assignment.id], assignment.orgId),
    ]);

    const agent = createReachabilityAgent();
    const result = await agent.generate({
      prompt: [
        "Find a published, legitimate way to reach this person, or the desk that owns their work.",
        "Do not contact them. Do not submit a form. Find the door only.",
        `Person: ${contact.full_name}`,
        contact.job_title ? `Title: ${contact.job_title}` : null,
        contact.company_name ? `Company: ${contact.company_name}` : null,
        contact.buyer_role ? `Why they matter: ${contact.buyer_role}` : null,
        profile?.companyProfile
          ? `What Triangle would be asking them about: ${profile.companyProfile}`
          : null,
        (threadMap.get(assignment.id)?.thread.length ?? 0) > 0
          ? `Notes from the manager:\n${threadMap
              .get(assignment.id)!
              .thread.map((m) => `- ${m.from}: ${m.text}`)
              .join("\n")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    if (!result.output) throw new Error("Reachability job returned no structured report");

    const report = result.output;

    await addAgentMessage({
      assignmentId: assignment.id,
      orgId: assignment.orgId,
      agentInstanceId: assignment.agentInstanceId,
      body: report.found
        ? `Found ${report.channels.length} way(s) to reach ${contact.full_name}: ${report.channels
            .map(describeChannel)
            .join("; ")}`
        : `No published channel found for ${contact.full_name}. ${report.notFoundReason ?? ""}`.trim(),
    });

    // A reachability job lands in only two of the three states. It cannot be
    // one_thing_missing, because finding the door WAS the one missing thing —
    // either it was found, or there is no published door and that is a sourced
    // absence worth recording. Per the house rule: a company with no named
    // person and no published channel is UNREACHABLE, and is filed as such
    // rather than presented as an opportunity.
    const reachState =
      report.found && report.channels.length > 0 && report.howToOpen.trim()
        ? "reachable"
        : "dead";

    if (reachState === "dead" && !report.notFoundReason?.trim()) {
      throw new Error(
        "No published channel was found, which is a legitimate result — but it has to say why, or the same company comes back next week. Write notFoundReason: what was checked and what was not there.",
      );
    }

    const completed = await completeAssignment({
      assignmentId: assignment.id,
      orgId: assignment.orgId,
      agentInstanceId: assignment.agentInstanceId,
      resultSummary: serializeReachabilityReport(report),
      findingState: reachState,
    });
    if (typeof completed === "object" && "refused" in completed) {
      throw new Error(completed.refused);
    }
    if (!completed) {
      throw new Error("Assignment changed before the reachability report could be submitted");
    }

    // One finding per channel. They are separate decisions: a manager may
    // accept the switchboard and reject a shaky personal address, and each
    // carries its own source and quoted line.
    for (const [index, channel] of report.channels.entries()) {
      await createFinding({
        orgId: assignment.orgId,
        agentInstanceId: assignment.agentInstanceId,
        assignmentId: assignment.id,
        findingType: "contact_channel",
        payload: {
          buyer_contact_id: contact.id,
          full_name: contact.full_name,
          company: contact.company_name,
          kind: channel.kind,
          value: channel.value,
          scope: channel.scope,
          belongs_to: channel.belongsTo,
          how_to_open: report.howToOpen,
          impressum_url: report.impressumUrl,
          company_website: report.companyWebsite,
        },
        sourceUrl: channel.sourceUrl,
        evidenceText: channel.evidence,
        confidence: channel.confidence,
        idempotencyKey: `reachability:${assignment.id}:${index}`,
        // A published channel with the person's name and the words to say IS
        // reachable — this loop only runs when the door was found.
        findingState: "reachable",
      });
    }

    await logAgentRun({
      orgId: assignment.orgId,
      agentName: "Scout",
      source: "in_app_executor",
      summary: {
        assignmentId: assignment.id,
        status: "completed",
        caseType: "contact_reachability",
        found: report.found,
        channels: report.channels.length,
        durationMs: Date.now() - startedAt.getTime(),
        model,
      },
      agentInstanceId: assignment.agentInstanceId,
      assignmentId: assignment.id,
      provider: "openai",
      model,
      status: "completed",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });

    return {
      status: "completed",
      assignmentId: assignment.id,
      headline: report.headline,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reachability job failed";
    await service
      .from("agent_assignments")
      .update({ status: "failed", result_summary: message })
      .eq("id", assignment.id)
      .eq("org_id", assignment.orgId);
    await logAgentRun({
      orgId: assignment.orgId,
      agentName: "Scout",
      source: "in_app_executor",
      summary: { assignmentId: assignment.id, status: "failed", caseType: "contact_reachability" },
      agentInstanceId: assignment.agentInstanceId,
      assignmentId: assignment.id,
      provider: "openai",
      model,
      status: "failed",
      error: message,
    });
    return { status: "failed", assignmentId: assignment.id, error: message };
  }
}

// ---------------------------------------------------------------------------

/**
 * Hand back a job this executor does not know how to do.
 *
 * Deliberately not a failure and not a completion. The assignment goes back to
 * queued so a capable agent — or the bot on its provider platform — can still
 * take it, and the reason is written to the refusal ledger and onto the thread
 * so a human can see why nothing happened rather than watching it sit there.
 *
 * The alternative, which is what this code used to do, is to run the only
 * prompt it has and mark the work complete. That is worse than doing nothing:
 * nothing is visible, and a wrong answer filed under a completed assignment
 * is not.
 */
async function refuseUnknownAssignment(
  assignment: ClaimedAssignment,
  caseType: string,
): Promise<ScoutWorkResult> {
  const reason =
    `The unattended runner has no handler for "${caseType}". ` +
    `It can qualify a company and it can find a way to reach a contact. ` +
    `This job — "${assignment.title}" — is neither, and running it as a ` +
    `company qualification would answer a question nobody asked.`;

  const service = createServiceSupabaseClient();
  if (service) {
    // Back to queued, not failed: nobody has established that this cannot be
    // done, only that this executor cannot do it. The bot on its provider
    // platform may well be able to.
    //
    // Marked as it goes back, because a job returned to the queue is a job
    // this loop would claim again on its very next turn — it would spend every
    // iteration refusing the same assignment, and no other work would move.
    await service
      .from("agent_assignments")
      .update({
        status: "queued",
        constraints: {
          ...assignment.constraints,
          runner_refused: true,
          runner_refused_at: new Date().toISOString(),
        },
      })
      .eq("id", assignment.id)
      .eq("org_id", assignment.orgId);
  }

  await addAgentMessage({
    assignmentId: assignment.id,
    orgId: assignment.orgId,
    agentInstanceId: assignment.agentInstanceId,
    body: reason,
  });

  await recordRefusal({
    orgId: assignment.orgId,
    surface: "Unattended agent run",
    reason,
    agentName: "Scout",
    entityType: "agent_assignment",
    entityId: assignment.id,
    // Stated outright: this is a refusal by construction, not a database
    // error that happens to read like one.
    kind: "boundary",
    details: { caseType, title: assignment.title },
  });

  await logAgentRun({
    orgId: assignment.orgId,
    agentName: "Scout",
    source: "in_app_executor",
    summary: { assignmentId: assignment.id, status: "refused", caseType },
    agentInstanceId: assignment.agentInstanceId,
    assignmentId: assignment.id,
    provider: "openai",
    model: getScoutModelId(),
    status: "failed",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error: reason,
  });

  return { status: "refused", assignmentId: assignment.id, reason };
}

// ---------------------------------------------------------------------------

/** Is there a company on this assignment's case, or is it an open question? */
async function hasCompanyAttached(assignment: ClaimedAssignment): Promise<boolean> {
  const service = createServiceSupabaseClient();
  if (!service) return false;
  const { data } = await service
    .from("agent_assignment_entities")
    .select("entity_id")
    .eq("org_id", assignment.orgId)
    .eq("assignment_id", assignment.id)
    .eq("entity_type", "company")
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * A question typed in plain language, answered in the same shape as everything
 * else so it renders as a manager report rather than a wall of prose.
 *
 * The brief is the whole input. Triangle's own operating profile goes with it,
 * because "find contractors who need what we sell" is unanswerable without
 * knowing what Triangle sells, and the supply-first rule in the constitution
 * is not optional here — an answer naming forty electricians Triangle does not
 * have is worse than no answer.
 */
async function runOpenResearchAssignment(
  assignment: ClaimedAssignment,
): Promise<ScoutWorkResult> {
  const startedAt = new Date();
  const model = getScoutModelId();
  try {
    const [profile, supply] = await Promise.all([
      getOrganizationOperatingProfile(assignment.orgId),
      listAvailableSupply(assignment.orgId),
    ]);

    const agent = createScoutQualificationAgent();
    const result = await agent.generate({
      prompt: [
        "Answer this question for the commercial manager. It is an open research brief, not a company case.",
        "Do not invent a company case around it, and do not return a list of links.",
        "Name real organisations and, wherever the evidence allows, a real person who buys subcontract labour there — a company with no named person and no published channel is UNREACHABLE and must be reported as such rather than presented as an opportunity.",
        "Ground every recommendation in who Triangle can actually supply. If the answer requires people Triangle does not have, say so plainly; that is the useful answer.",
        "",
        `THE BRIEF:\n${assignment.objective}`,
        "",
        `WHO TRIANGLE IS:\n${JSON.stringify(profile, null, 2)}`,
        "",
        [
          "WHO TRIANGLE CAN SUPPLY RIGHT NOW.",
          "Supply is two things: Triangle's own people, and partner firms whose capacity a human has confirmed within the last 14 days. A partner firm is how a crew larger than the bench gets fielded — treat its confirmed crew_size as real supply for the trades listed, in the countries listed under can_post_to.",
          "Anything absent from both lists is not supply. Do not assume a partner exists for a trade that is not here.",
          "",
          `Triangle's own people (${supply.ownPeople.length}):`,
          supply.ownPeople.length
            ? JSON.stringify(supply.ownPeople, null, 2)
            : "None on the bench.",
          "",
          `Partner firms with confirmed capacity (${supply.partnerFirms.length}):`,
          supply.partnerFirms.length
            ? JSON.stringify(supply.partnerFirms, null, 2)
            : "None on file. Triangle can currently field only the people listed above.",
        ].join("\n"),
      ].join("\n"),
    });
    if (!result.output) throw new Error("Scout returned no structured report");

    const report = result.output;
    await addAgentMessage({
      assignmentId: assignment.id,
      orgId: assignment.orgId,
      agentInstanceId: assignment.agentInstanceId,
      body: `Answered: ${report.headline}`,
    });

    // This is the path that produced "Hold until the missing commercial proof
    // is found · 60% sure · 3 sources". It now has to land somewhere.
    const state = findingStateOf(report);
    const violation = contractViolation(report, state);
    if (violation) throw new Error(violation);

    const completed = await completeAssignment({
      assignmentId: assignment.id,
      orgId: assignment.orgId,
      agentInstanceId: assignment.agentInstanceId,
      resultSummary: serializeScoutCaseReport(report),
      findingState: state,
    });
    if (typeof completed === "object" && "refused" in completed) {
      throw new Error(completed.refused);
    }
    if (!completed) throw new Error("Assignment changed before Scout could submit it");

    await logAgentRun({
      orgId: assignment.orgId,
      agentName: "Scout",
      source: "in_app_executor",
      summary: {
        assignmentId: assignment.id,
        status: "completed",
        kind: "open_research",
        durationMs: Date.now() - startedAt.getTime(),
        model,
      },
      agentInstanceId: assignment.agentInstanceId,
      assignmentId: assignment.id,
      provider: "openai",
      model,
      status: "completed",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
    });

    return { status: "completed", assignmentId: assignment.id, headline: report.headline };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research failed";
    await completeAssignment({
      assignmentId: assignment.id,
      orgId: assignment.orgId,
      agentInstanceId: assignment.agentInstanceId,
      resultSummary: `Scout could not answer this: ${message}`,
      failed: true,
    });
    return { status: "failed", assignmentId: assignment.id, error: message };
  }
}

/** The bench, as the constitution's supply-first rule requires it to be read. */
/**
 * Everything Triangle can put on a site: its own people AND its partner firms.
 *
 * This read only ever returned individuals, which made the supply-first house
 * rule mean "refuse anything two people cannot do". A crew of eight comes from
 * a firm that already employs eight, and until supply_partners existed the
 * system could not say so.
 *
 * Both halves are returned even when empty, with their counts stated. An agent
 * told "partner firms: none on file" refuses honestly; an agent told nothing
 * about partners invents them.
 */
export async function listAvailableSupply(orgId: string) {
  const service = createServiceSupabaseClient();
  if (!service) return { ownPeople: [], partnerFirms: [] };

  const [people, partners] = await Promise.all([
    service
      .from("workers")
      .select(
        "full_name, role, status, country, nationality, work_authorisation, skills, industries, availability_status",
      )
      .eq("organization_id", orgId)
      .neq("status", "blacklisted")
      .limit(50),
    listSupplyPartners(orgId),
  ]);

  return {
    ownPeople: people.data ?? [],
    // Only the firms whose capacity a human has actually confirmed recently.
    // An unconfirmed partner is a lead on supply, not supply, and handing one
    // to a research agent as capacity is how a package gets promised against
    // people nobody has spoken to.
    partnerFirms: partners
      .filter((p) => p.sellable)
      .map((p) => ({
        name: p.name,
        country: p.country,
        trades: p.trades,
        crew_size: p.crewSize,
        can_post_to: p.canPostTo,
        availability: p.availabilityStatus,
        available_from: p.availableFrom,
        capacity_confirmed_days_ago: p.confirmedDaysAgo,
      })),
  };
}
