import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { createAssignment, listWorkforce } from "@/lib/data/workforce";
import { loadEmployeeRuntime, wakeEmployee } from "@/lib/data/bot-runtime";
import { isBobRole } from "@/lib/data/ask-bob-policy";
import { isHannaEmployee } from "@/lib/data/ask-hanna-policy";
import {
  BOB_STEP,
  HANNA_STEP,
  bobStepObjective,
  decideRequirementCase,
  hannaStepObjective,
  headcountSum,
  requirementCaseTitle,
  requirementIdentity,
  requirementPlace,
  requirementStatusLine,
  requirementZone,
  sameRequirement,
  stepIdempotencyKey,
  type RequirementCaseLine,
  type RequirementIdentity,
  type RequirementOwner,
  type RequirementRoleRow,
} from "@/lib/job-intake/requirement-case";

export type { RequirementCaseLine };

// ---------------------------------------------------------------------------
// Open one recruiting case from a stored people-request, and list those
// cases for Today.
//
// Both mail paths call `afterPeopleRequestStored` after the lead row exists:
// the built-in sync and Bob's morning hand-in. A second sight of the same
// message, thread or forward returns the case that is already open and does
// not wake anyone again.
//
// Migration 050 is not applied by this code. When the table is missing the
// email stays on its reply card and the team is not started.
// ---------------------------------------------------------------------------

export interface StoredRequirement {
  missionId: string;
  jobLeadId: string | null;
  messageKey: string | null;
  threadKey: string | null;
  forwardKey: string | null;
  sourceKey: string;
}

function tableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /requirement_roles/i.test(message)
  );
}

function roleFromRow(row: Record<string, unknown>): RequirementRoleRow {
  return {
    title: String(row.title ?? ""),
    headcount: Number(row.headcount ?? 1),
    level: (row.level as string | null) ?? null,
    skills: (row.skills as string[]) ?? [],
    startText: (row.start_text as string | null) ?? null,
    durationText: (row.duration_text as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    languages: (row.languages as string[]) ?? [],
    rateText: (row.rate_text as string | null) ?? null,
  };
}

async function findStored(
  orgId: string,
  identity: RequirementIdentity,
): Promise<StoredRequirement | null | "missing"> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const [byMessage, byThread, byForward] = await Promise.all([
    svc
      .from("requirement_roles")
      .select("mission_id, job_lead_id, message_key, thread_key, forward_key, source_key")
      .eq("org_id", orgId)
      .eq("message_key", identity.messageKey)
      .limit(1),
    identity.threadKey
      ? svc
          .from("requirement_roles")
          .select("mission_id, job_lead_id, message_key, thread_key, forward_key, source_key")
          .eq("org_id", orgId)
          .eq("thread_key", identity.threadKey)
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
    identity.forwardKey
      ? svc
          .from("requirement_roles")
          .select("mission_id, job_lead_id, message_key, thread_key, forward_key, source_key")
          .eq("org_id", orgId)
          .eq("forward_key", identity.forwardKey)
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const error = byMessage.error ?? byThread.error ?? byForward.error;
  if (tableMissing(error)) return "missing";
  const row = [...(byMessage.data ?? []), ...(byThread.data ?? []), ...(byForward.data ?? [])].find(
    (candidate) =>
      sameRequirement(
        {
          messageKey: (candidate.message_key as string | null) ?? null,
          threadKey: (candidate.thread_key as string | null) ?? null,
          forwardKey: (candidate.forward_key as string | null) ?? null,
        },
        identity,
      ),
  );
  if (!row) return null;
  return {
    missionId: row.mission_id as string,
    jobLeadId: (row.job_lead_id as string | null) ?? null,
    messageKey: (row.message_key as string | null) ?? null,
    threadKey: (row.thread_key as string | null) ?? null,
    forwardKey: (row.forward_key as string | null) ?? null,
    sourceKey: row.source_key as string,
  };
}

/** Lead ids that already have a recruiting case, so Today does not also show the reply card. */
export async function requirementLeadIds(orgId: string): Promise<Set<string>> {
  const svc = createServiceSupabaseClient();
  if (!svc) return new Set();
  const { data, error } = await svc
    .from("requirement_roles")
    .select("job_lead_id")
    .eq("org_id", orgId)
    .not("job_lead_id", "is", null);
  if (error) {
    if (!tableMissing(error)) console.error("requirementLeadIds:", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((row) => row.job_lead_id as string).filter(Boolean));
}

export async function loadRequirementRoles(
  orgId: string,
  missionId: string,
): Promise<{ roles: RequirementRoleRow[]; openQuestions: string[] }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { roles: [], openQuestions: [] };
  const { data, error } = await svc
    .from("requirement_roles")
    .select(
      "position, title, headcount, level, skills, start_text, duration_text, location, languages, rate_text, open_questions",
    )
    .eq("org_id", orgId)
    .eq("mission_id", missionId)
    .order("position", { ascending: true });
  if (error) {
    if (!tableMissing(error)) console.error("loadRequirementRoles:", error.message);
    return { roles: [], openQuestions: [] };
  }
  const rows = data ?? [];
  const questions = (rows[0]?.open_questions as string[] | null) ?? [];
  return {
    roles: rows.map((row) => roleFromRow(row as Record<string, unknown>)),
    openQuestions: questions,
  };
}

export async function listRequirementCaseLines(orgId: string): Promise<RequirementCaseLine[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data: roleRows, error } = await svc
    .from("requirement_roles")
    .select(
      "mission_id, job_lead_id, position, title, headcount, level, skills, start_text, duration_text, location, languages, rate_text, open_questions",
    )
    .eq("org_id", orgId)
    .order("position", { ascending: true });
  if (error) {
    if (!tableMissing(error)) console.error("listRequirementCaseLines:", error.message);
    return [];
  }
  const byMission = new Map<string, Array<Record<string, unknown>>>();
  for (const row of roleRows ?? []) {
    const missionId = row.mission_id as string;
    const list = byMission.get(missionId) ?? [];
    list.push(row as Record<string, unknown>);
    byMission.set(missionId, list);
  }
  const missionIds = Array.from(byMission.keys());
  if (missionIds.length === 0) return [];

  const leadIds = Array.from(
    new Set(
      (roleRows ?? [])
        .map((row) => row.job_lead_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const [{ data: missions }, { data: steps }, leadsResult] = await Promise.all([
    svc
      .from("missions")
      .select("id, closed_at, last_seen_at")
      .eq("org_id", orgId)
      .in("id", missionIds),
    svc
      .from("agent_assignments")
      .select("mission_id, status, constraints, completed_at")
      .eq("org_id", orgId)
      .in("mission_id", missionIds),
    leadIds.length > 0
      ? svc
          .from("job_leads")
          .select("id, contact_name, agency_name, city, sector")
          .eq("org_id", orgId)
          .in("id", leadIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);
  const leads = leadsResult.data ?? [];

  const missionById = new Map((missions ?? []).map((row) => [row.id as string, row]));
  const leadById = new Map((leads ?? []).map((row) => [row.id as string, row]));
  const lines: RequirementCaseLine[] = [];

  for (const [missionId, rows] of byMission) {
    const mission = missionById.get(missionId);
    if (!mission || mission.closed_at) continue;
    const roles = rows.map((row) => roleFromRow(row));
    const leadId = (rows[0]?.job_lead_id as string | null) ?? null;
    const lead = leadId ? leadById.get(leadId) : undefined;
    const owned = (steps ?? []).filter((step) => step.mission_id === missionId);
    const hanna = owned.find((step) => ownerOf(step.constraints) === HANNA_STEP);
    const bob = owned.find((step) => ownerOf(step.constraints) === BOB_STEP);
    const hannaStatus = (hanna?.status as string) ?? "queued";
    const bobStatus = (bob?.status as string) ?? "queued";
    const stillOpen = (status: string) => status === "queued" || status === "active";
    let missionState = "working";
    if (!stillOpen(hannaStatus) && !stillOpen(bobStatus)) {
      const finishedAt = [hanna?.completed_at, bob?.completed_at]
        .filter((value): value is string => typeof value === "string")
        .sort()
        .at(-1);
      const seen = mission.last_seen_at as string | null;
      missionState = seen && finishedAt && seen > finishedAt ? "ready" : "needs_you";
    }
    const zone = requirementZone({
      hannaStatus,
      bobStatus,
      missionClosed: false,
      missionState,
    });
    if (zone === "hidden") continue;
    lines.push({
      missionId,
      leadId,
      title: requirementCaseTitle({
        who: (lead?.contact_name as string | null) ?? (lead?.agency_name as string | null) ?? null,
        place: requirementPlace({
          city: (lead?.city as string | null) ?? roles[0]?.location ?? null,
          sector: (lead?.sector as string | null) ?? null,
        }),
        roles,
      }),
      line: requirementStatusLine(hannaStatus, bobStatus),
      zone,
      roles,
      openQuestions: (rows[0]?.open_questions as string[]) ?? [],
    });
  }
  return lines;
}

function ownerOf(constraints: unknown): string | null {
  const value = (constraints as { requirement_owner?: unknown } | null)?.requirement_owner;
  return value === HANNA_STEP || value === BOB_STEP ? value : null;
}

interface PeopleRequest {
  orgId: string;
  leadId: string;
  inboundEmailId: string;
  messageId: string;
  threadId: string | null;
  subject: string;
  classification: string;
  confidence: number;
  lead: {
    contactName: string | null;
    contactEmail: string | null;
    city: string | null;
    sector: string | null;
    roleTitle: string;
    headcountText: string | null;
    roles: unknown;
    openQuestions: unknown;
    missingFields: string[];
  };
  bodyText: string | null;
}

/**
 * The one hook both mail paths use after a new opportunity is stored.
 * A multi-role case starts Hanna and Bob. A single role still wakes Bob
 * through the existing client-reply outbox. An unsure read wakes nobody.
 */
export async function settlePeopleRequest(
  params: PeopleRequest & { reason: string; recipientCompany: string | null },
): Promise<{ casesOpened: number }> {
  const result = await afterPeopleRequestStored(params);
  if (!result.clientReply) return { casesOpened: result.casesOpened };
  try {
    const { recordClientReplyEvent } = await import("@/lib/data/event-outbox");
    await recordClientReplyEvent({
      orgId: params.orgId,
      sourceType: "inbound_email",
      sourceId: params.leadId,
      recipientName: params.lead.contactName,
      recipientEmail: params.lead.contactEmail,
      recipientCompany: params.recipientCompany,
      subject: params.subject,
      replySummary: params.reason,
    });
  } catch (err) {
    console.error("settlePeopleRequest:", err instanceof Error ? err.message : err);
  }
  return { casesOpened: result.casesOpened };
}

/**
 * After a new opportunity is stored. Opens the case when the read is
 * confident and multi-role. Returns whether the caller should also wake Bob
 * through the client-reply outbox — single-role mail still does.
 */
export async function afterPeopleRequestStored(
  params: PeopleRequest,
): Promise<{ casesOpened: number; clientReply: boolean }> {
  const questions = [
    ...((Array.isArray(params.lead.openQuestions) ? params.lead.openQuestions : []) as unknown[]),
    ...params.lead.missingFields,
  ];
  const decision = decideRequirementCase({
    classification: params.classification,
    confidence: params.confidence,
    roles: params.lead.roles,
    openQuestions: questions,
    headcountText: params.lead.headcountText,
    text: [params.subject, params.bodyText ?? ""].filter(Boolean).join("\n"),
  });

  if (decision.action === "skip" || decision.action === "hold") {
    return { casesOpened: 0, clientReply: true };
  }
  if (decision.action === "needs_you") {
    return { casesOpened: 0, clientReply: false };
  }

  try {
    const opened = await openRequirementCase({ ...params, decision });
    return { casesOpened: opened.created ? 1 : 0, clientReply: false };
  } catch (err) {
    console.error(
      "afterPeopleRequestStored:",
      err instanceof Error ? err.message : "could not open the case",
    );
    return { casesOpened: 0, clientReply: false };
  }
}

async function openRequirementCase(
  params: PeopleRequest & {
    decision: Extract<ReturnType<typeof decideRequirementCase>, { action: "open" }>;
  },
): Promise<{ created: boolean; missionId: string | null }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { created: false, missionId: null };

  const identity = requirementIdentity({
    messageId: params.messageId,
    threadId: params.threadId,
    subject: params.subject,
    requesterEmail: params.lead.contactEmail,
  });
  const existing = await findStored(params.orgId, identity);
  if (existing === "missing") return { created: false, missionId: null };
  if (existing) {
    await pointDuplicateAtCase(params.orgId, params.leadId, existing.jobLeadId);
    await ensureSteps({
      orgId: params.orgId,
      missionId: existing.missionId,
      sourceKey: existing.sourceKey,
      leadId: existing.jobLeadId ?? params.leadId,
      roles: params.decision.roles,
      openQuestions: params.decision.openQuestions,
    });
    return { created: false, missionId: existing.missionId };
  }

  const roster = await listWorkforce(params.orgId);
  const hanna = roster.find((employee) => employee.status === "active" && isHannaEmployee(employee));
  const bobs = roster.filter((employee) => employee.status === "active" && isBobRole(employee.roleKey));
  const bob = bobs.find((employee) => employee.roleKey === "inbox_coordinator") ?? bobs[0];
  if (!hanna || !bob) {
    console.error("openRequirementCase: Hanna or Bob is not on the workforce.");
    return { created: false, missionId: null };
  }

  const place = requirementPlace({ city: params.lead.city, sector: params.lead.sector });
  const title = requirementCaseTitle({
    who: params.lead.contactName,
    place,
    roles: params.decision.roles,
  }).slice(0, 80);
  const objective = [
    `${params.lead.contactName ?? "A requester"} asked for ${headcountSum(params.decision.roles)} people${
      place ? ` — ${place}` : ""
    }.`,
    "One case. Hanna says who we put forward, per role. Bob drafts the acknowledgement and the questions only the client can answer.",
    "Nothing is sent until a person presses Send.",
  ].join(" ");

  const { data: mission, error: missionError } = await svc
    .from("missions")
    .insert({
      org_id: params.orgId,
      title,
      objective,
      kind: "recruiting",
      lead_agent_instance_id: bob.id,
      created_by: null,
      last_seen_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (missionError || !mission) {
    console.error("openRequirementCase:", missionError?.message ?? "mission was not created");
    return { created: false, missionId: null };
  }
  const missionId = mission.id as string;

  const { error: roleError } = await svc.from("requirement_roles").insert(
    params.decision.roles.map((role, index) => ({
      org_id: params.orgId,
      mission_id: missionId,
      job_lead_id: params.leadId,
      inbound_email_id: params.inboundEmailId,
      source_key: identity.sourceKey,
      message_key: identity.messageKey,
      thread_key: identity.threadKey,
      forward_key: identity.forwardKey,
      position: index + 1,
      title: role.title,
      headcount: role.headcount,
      level: role.level,
      skills: role.skills,
      start_text: role.startText,
      duration_text: role.durationText,
      location: role.location,
      languages: role.languages,
      rate_text: role.rateText,
      open_questions: params.decision.openQuestions,
    })),
  );
  if (roleError) {
    if (tableMissing(roleError)) {
      await svc.from("missions").delete().eq("id", missionId).eq("org_id", params.orgId);
      return { created: false, missionId: null };
    }
    const winner = await findStored(params.orgId, identity);
    await svc.from("missions").delete().eq("id", missionId).eq("org_id", params.orgId);
    if (winner && winner !== "missing") {
      await ensureSteps({
        orgId: params.orgId,
        missionId: winner.missionId,
        sourceKey: winner.sourceKey,
        leadId: winner.jobLeadId ?? params.leadId,
        roles: params.decision.roles,
        openQuestions: params.decision.openQuestions,
      });
      return { created: false, missionId: winner.missionId };
    }
    console.error("openRequirementCase:", roleError.message);
    return { created: false, missionId: null };
  }

  await ensureSteps({
    orgId: params.orgId,
    missionId,
    sourceKey: identity.sourceKey,
    leadId: params.leadId,
    roles: params.decision.roles,
    openQuestions: params.decision.openQuestions,
    hannaId: hanna.id,
    bobId: bob.id,
  });
  return { created: true, missionId };
}

async function pointDuplicateAtCase(
  orgId: string,
  leadId: string,
  caseLeadId: string | null,
): Promise<void> {
  if (!caseLeadId || leadId === caseLeadId) return;
  const svc = createServiceSupabaseClient();
  if (!svc) return;
  await svc
    .from("job_leads")
    .update({ duplicate_of_id: caseLeadId })
    .eq("id", leadId)
    .eq("org_id", orgId)
    .is("duplicate_of_id", null);
}

async function ensureSteps(params: {
  orgId: string;
  missionId: string;
  sourceKey: string;
  leadId: string;
  roles: RequirementRoleRow[];
  openQuestions: string[];
  hannaId?: string;
  bobId?: string;
}): Promise<void> {
  const roster = await listWorkforce(params.orgId);
  const hanna =
    params.hannaId
      ? { id: params.hannaId }
      : roster.find((employee) => employee.status === "active" && isHannaEmployee(employee));
  const bobs = roster.filter((employee) => employee.status === "active" && isBobRole(employee.roleKey));
  const bob = params.bobId
    ? { id: params.bobId }
    : (bobs.find((employee) => employee.roleKey === "inbox_coordinator") ?? bobs[0]);
  if (!hanna || !bob) return;

  await ensureOneStep({
    orgId: params.orgId,
    missionId: params.missionId,
    agentInstanceId: hanna.id,
    owner: HANNA_STEP,
    sourceKey: params.sourceKey,
    leadId: params.leadId,
    title: "Who we put forward, per role",
    objective: hannaStepObjective(params.roles, params.openQuestions),
  });
  await ensureOneStep({
    orgId: params.orgId,
    missionId: params.missionId,
    agentInstanceId: bob.id,
    owner: BOB_STEP,
    sourceKey: params.sourceKey,
    leadId: params.leadId,
    title: "Acknowledge, and ask what only the client can answer",
    objective: bobStepObjective(params.roles, params.openQuestions),
  });
}

async function ensureOneStep(params: {
  orgId: string;
  missionId: string;
  agentInstanceId: string;
  owner: RequirementOwner;
  sourceKey: string;
  leadId: string;
  title: string;
  objective: string;
}): Promise<void> {
  const svc = createServiceSupabaseClient();
  if (!svc) return;
  const key = stepIdempotencyKey(params.sourceKey, params.owner);
  const { data: prior } = await svc
    .from("agent_assignments")
    .select("id")
    .eq("org_id", params.orgId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (prior) return;

  const runtime = (await loadEmployeeRuntime(params.orgId, params.agentInstanceId)).runtime;
  const created = await createAssignment({
    orgId: params.orgId,
    agentInstanceId: params.agentInstanceId,
    title: params.title,
    objective: params.objective,
    priority: "high",
    expectedOutput:
      params.owner === HANNA_STEP
        ? "Who we put forward for each role, and why. Nothing sent."
        : "A draft acknowledgement and the questions only the client can answer. Nothing sent.",
    idempotencyKey: key,
    missionId: params.missionId,
    userId: null,
    constraints: {
      case_type: "mission_step",
      execution_mode: runtime,
      requirement_case: true,
      requirement_owner: params.owner,
      leadId: params.leadId,
      missionId: params.missionId,
    },
    entityRefs: [{ type: "job_lead", id: params.leadId, relation: "target" }],
  });
  if (!created || created.alreadyExisted) return;

  await svc.from("assignment_messages").insert({
    org_id: params.orgId,
    assignment_id: created.id,
    role: "human",
    body: params.objective,
    author_user_id: null,
    delivered_at: new Date().toISOString(),
  });

  if (runtime === "bot") {
    await wakeEmployee({
      orgId: params.orgId,
      agentInstanceId: params.agentInstanceId,
      stepId: created.id,
      missionId: params.missionId,
      event: "mission_step",
    });
  }
}

