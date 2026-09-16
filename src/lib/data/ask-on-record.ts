import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { createAssignment, listWorkforce, nextAttemptKey } from "@/lib/data/workforce";
import { employeeMissionRuntime } from "@/lib/data/bot-runtime";
import { isBobEmployee } from "@/lib/data/ask-bob-policy";

// ---------------------------------------------------------------------------
// Ask with page context (DEV-010).
//
// "Scout, check who the MEP contractor is" said while looking at a project is
// not a new Mission. It is one job on that project: a missionless assignment
// (mission_id null) bound to the record through agent_assignment_entities, so
// the answer comes back on the record's case — EntityCase — and the person
// never leaves the situation. Ask Bob from a Today card is the special case
// this generalizes.
//
// No new table. The link vocabulary is the existing check constraint on
// agent_assignment_entities.entity_type: worker, job_lead, project,
// project_package, company, contact, crew, other. A requirement is linked as
// `other` plus its project, so its page shows the work through the project
// case it already inherits.
// ---------------------------------------------------------------------------

export type AskRecordType =
  | "job_lead"
  | "requirement"
  | "company"
  | "project"
  | "worker"
  | "contact";

export interface AskRecordContext {
  type: AskRecordType;
  id: string;
  label?: string | null;
  projectId?: string | null;
  companyId?: string | null;
}

export const ASK_ON_RECORD_SOURCE = "ask_on_record";

const RECORD_TABLES: Record<
  AskRecordType,
  { table: string; orgColumn: string; nameColumn: string; projectColumn?: string }
> = {
  job_lead: { table: "job_leads", orgColumn: "org_id", nameColumn: "role_title" },
  requirement: {
    table: "commercial_requirements",
    orgColumn: "org_id",
    nameColumn: "title",
    projectColumn: "discovered_project_id",
  },
  company: { table: "companies", orgColumn: "organization_id", nameColumn: "name" },
  project: { table: "discovered_projects", orgColumn: "organization_id", nameColumn: "project_name" },
  worker: { table: "workers", orgColumn: "organization_id", nameColumn: "full_name" },
  contact: {
    table: "buyer_contacts",
    orgColumn: "organization_id",
    nameColumn: "full_name",
    projectColumn: "discovered_project_id",
  },
};

/**
 * Who leads work asked about this record. People and firms in the pool are
 * Hanna's; a lead, requirement, company, project or buyer contact is Scout's
 * unless the words are plainly about our own people. Kept as a readable rule,
 * like the pool-question test: no naming call, so the box answers at once.
 */
export function leadRoleForAsk(type: AskRecordType, question: string): "hr" | "project_researcher" {
  if (type === "worker") return "hr";
  const ours =
    /\b(our (people|bench|pool|engineers|crew|workers)|from (our|the) (pool|bench)|candidates?|cvs?|who (can|could) (start|go)|available (people|engineers|crew))\b/i.test(
      question,
    );
  return ours ? "hr" : "project_researcher";
}

/** "Check who the MEP contractor is — Stahlwerk Linz", at most 120 characters. */
export function askOnRecordTitle(question: string, label: string | null | undefined): string {
  const first = question.trim().split(/(?<=[.!?])\s+|\n/)[0]?.trim() || question.trim();
  const head = first.length > 90 ? `${first.slice(0, 87).trimEnd()}…` : first;
  return label ? `${head} — ${label}`.slice(0, 120) : head.slice(0, 120);
}

const RECORD_WORD: Record<AskRecordType, string> = {
  job_lead: "job lead",
  requirement: "requirement",
  company: "company",
  project: "project",
  worker: "person in the talent pool",
  contact: "buyer contact",
};

export function askOnRecordObjective(params: {
  question: string;
  type: AskRecordType;
  id: string;
  label: string | null | undefined;
}): string {
  return [
    params.question.trim(),
    "",
    `This is about one ${RECORD_WORD[params.type]}: ${params.label ?? params.id} (${params.type} ${params.id}). Work only this record; do not widen it into a market survey.`,
    "Report back on this record's case. File what you find as findings with their source; a person accepts them. Do not send anything outside Triangle.",
  ].join("\n");
}

export async function askOnRecord(params: {
  orgId: string;
  userId: string;
  question: string;
  context: AskRecordContext;
  /** Whether the caller may put work on the talent pool. */
  canSeeWorkers: boolean;
}): Promise<
  | {
      ok: true;
      assignmentId: string;
      alreadyOut: boolean;
      lead: { id: string; name: string; emoji: string };
      label: string;
      notice: string;
    }
  | { ok: false; error: string; status: number }
> {
  const question = params.question.trim();
  if (question.length < 8) {
    return { ok: false, error: "Ask a fuller question.", status: 400 };
  }
  const spec = RECORD_TABLES[params.context.type];
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, error: "Database not configured.", status: 503 };

  // The record must be this organization's. Service role bypasses RLS, so the
  // org filter is the authorization.
  const columns = [spec.nameColumn, spec.projectColumn].filter(Boolean).join(", ");
  const { data: record } = await svc
    .from(spec.table)
    .select(columns)
    .eq("id", params.context.id)
    .eq(spec.orgColumn, params.orgId)
    .maybeSingle();
  if (!record) {
    return { ok: false, error: "That record is not in your organization.", status: 404 };
  }
  const row = record as unknown as Record<string, unknown>;
  const label =
    params.context.label?.trim() ||
    (typeof row[spec.nameColumn] === "string" ? (row[spec.nameColumn] as string) : null) ||
    params.context.type;
  const projectId =
    params.context.type === "project"
      ? params.context.id
      : params.context.projectId ||
        (spec.projectColumn && typeof row[spec.projectColumn] === "string"
          ? (row[spec.projectColumn] as string)
          : null);

  const leadRole = leadRoleForAsk(params.context.type, question);
  if (leadRole === "hr" && !params.canSeeWorkers) {
    return {
      ok: false,
      error: "Your role cannot start work on the company's people.",
      status: 403,
    };
  }
  const roster = await listWorkforce(params.orgId);
  const lead =
    leadRole === "hr"
      ? roster.find((e) => (e.roleKey === "hr" || e.roleKey === "triangle_hr") && e.status === "active")
      : roster.find((e) => e.roleKey === "project_researcher" && e.status === "active");
  if (!lead) {
    return {
      ok: false,
      error:
        leadRole === "hr"
          ? "Nobody on the team reads the talent pool right now."
          : "No active researcher on the team to take this.",
      status: 400,
    };
  }
  if (isBobEmployee(lead)) {
    return { ok: false, error: "Bob is asked from the card, not from here.", status: 400 };
  }

  // One open job per record and day for the same lead; a second Ask on the
  // same record reopens the thread instead of queueing a twin.
  const baseKey = `ask-record:${lead.id}:${params.context.type}:${params.context.id}:${new Date()
    .toISOString()
    .slice(0, 10)}`;
  const attempt = await nextAttemptKey(params.orgId, baseKey);
  if ("openAssignmentId" in attempt) {
    return {
      ok: true,
      assignmentId: attempt.openAssignmentId,
      alreadyOut: true,
      lead: { id: lead.id, name: lead.displayName, emoji: lead.emoji },
      label,
      notice: `${lead.displayName} already has this record — the thread is on its case.`,
    };
  }

  const entityRefs: NonNullable<Parameters<typeof createAssignment>[0]["entityRefs"]> = [];
  switch (params.context.type) {
    case "requirement":
      entityRefs.push({ type: "other", id: params.context.id, relation: "target" });
      break;
    default:
      entityRefs.push({ type: params.context.type, id: params.context.id, relation: "target" });
  }
  if (projectId && params.context.type !== "project") {
    entityRefs.push({ type: "project", id: projectId, relation: "context" });
  }
  if (params.context.companyId && params.context.type !== "company") {
    entityRefs.push({ type: "company", id: params.context.companyId, relation: "context" });
  }

  const runtime = await employeeMissionRuntime(params.orgId, lead.id);
  const created = await createAssignment({
    orgId: params.orgId,
    agentInstanceId: lead.id,
    title: askOnRecordTitle(question, label),
    objective: askOnRecordObjective({
      question,
      type: params.context.type,
      id: params.context.id,
      label,
    }),
    priority: "normal",
    expectedOutput:
      "Findings on this record with sources, and a short report on its case. Nothing sent outside Triangle.",
    constraints: {
      execution_mode: runtime,
      source: ASK_ON_RECORD_SOURCE,
      context_type: params.context.type,
      context_id: params.context.id,
      context_label: label,
      projectId: projectId ?? null,
      companyId: params.context.companyId ?? null,
    },
    entityRefs,
    projectId: projectId ?? null,
    missionId: null,
    idempotencyKey: attempt.key,
    userId: params.userId,
  });
  if (!created) {
    return { ok: false, error: "Could not hand that out.", status: 500 };
  }

  await svc.from("assignment_messages").insert({
    org_id: params.orgId,
    assignment_id: created.id,
    role: "human",
    body: question,
    author_user_id: params.userId,
    delivered_at: new Date().toISOString(),
  });

  return {
    ok: true,
    assignmentId: created.id,
    alreadyOut: false,
    lead: { id: lead.id, name: lead.displayName, emoji: lead.emoji },
    label,
    notice: created.notice,
  };
}
