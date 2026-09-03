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
import { serializeScoutCaseReport } from "@/lib/ai/scout-case-report";
import { addAgentMessage, takeThreadForBot } from "@/lib/data/assignment-threads";
import { logAgentRun } from "@/lib/data/agents";
import { createFinding } from "@/lib/data/findings";
import { getOrganizationOperatingProfile } from "@/lib/data/organization-profile";
import { completeAssignment } from "@/lib/data/workforce";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type ClaimedAssignment = {
  id: string;
  orgId: string;
  agentInstanceId: string;
  title: string;
  objective: string;
  expectedOutput: string | null;
  constraints: Record<string, unknown>;
};

export type ScoutWorkResult =
  | { status: "idle" }
  | { status: "completed"; assignmentId: string; headline: string }
  | { status: "failed"; assignmentId: string; error: string };

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

  const { data: candidates } = await service
    .from("agent_assignments")
    .select(
      "id,org_id,agent_instance_id,title,objective,expected_output,constraints,status",
    )
    .eq("org_id", orgId)
    .in("agent_instance_id", scoutIds)
    .eq("status", "queued")
    .contains("constraints", { execution_mode: "in_app" })
    .order("created_at")
    .limit(5);

  for (const row of candidates ?? []) {
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

  // Scout has more than one job now. The constraint says which one; anything
  // unlabelled is a company qualification, which is what every existing
  // assignment is.
  if (assignment.constraints.case_type === "contact_reachability") {
    return runReachabilityAssignment(assignment);
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

    const completed = await completeAssignment({
      assignmentId: assignment.id,
      orgId: assignment.orgId,
      agentInstanceId: assignment.agentInstanceId,
      resultSummary: serializeScoutCaseReport(report),
    });
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
        },
        sourceUrl: report.sources[0].url,
        evidenceText: report.namedProject.evidence,
        confidence: report.confidence,
        idempotencyKey: `in-app-scout:${assignment.id}:project`,
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

    const completed = await completeAssignment({
      assignmentId: assignment.id,
      orgId: assignment.orgId,
      agentInstanceId: assignment.agentInstanceId,
      resultSummary: serializeReachabilityReport(report),
    });
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
