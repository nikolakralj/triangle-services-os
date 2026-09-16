import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  createAssignment,
  listWorkforce,
  type WorkforceEmployee,
} from "@/lib/data/workforce";
import { loadEmployeeRuntime, wakeEmployee, type WakeResult } from "@/lib/data/bot-runtime";
import { getJobLead, type JobLead } from "@/lib/data/job-intake";
import type { ContextualType, NamedRole, HumanBrief } from "@/lib/data/contextual-work-shared";
export type { ContextualType, NamedRole, HumanBrief, ContextualAssignmentView } from "@/lib/data/contextual-work-shared";

// ---------------------------------------------------------------------------
// Contextual agent work — an assignment attached to something real.
//
// A Mission is a durable objective. "Investigate this email" is not one.
// agent_assignments.mission_id is already optional; this module is the
// product rule that /api/ask must not start a mission when the CEO is
// speaking from a commercial context.
// ---------------------------------------------------------------------------

export interface ContextualAssignment {
  id: string;
  title: string;
  objective: string;
  status: string;
  employeeName: string;
  employeeRole: string;
  agentInstanceId: string;
  resultSummary: string | null;
  createdAt: string;
  completedAt: string | null;
  wake: WakeResult | null;
  brief: HumanBrief | null;
  suggestMission: string | null;
}

export interface ContextWorkspace {
  kind: ContextualType;
  lead: JobLead | null;
  assignments: ContextualAssignment[];
}

const ROLE_KEYS: Record<NamedRole, string[]> = {
  scout: ["project_researcher"],
  hanna: ["hr", "triangle_hr", "talent_pool"],
  bob: ["inbox_coordinator", "commercial_ops", "operations"],
};

const EXPECTED_OUTPUT =
  "Return a short human brief, not a tool log. Use these headings:\n" +
  "WHAT CHANGED:\nWHY IT MATTERS:\nRECOMMEND:\nNEED FROM YOU:\nEVIDENCE:\n" +
  "SUGGEST MISSION: (only if this is larger than the original request; otherwise omit)\n" +
  "File companies, people and projects as findings against this assignment. " +
  "Do not create a Mission. Do not send anything externally.";

export function parseNamedRole(text: string): NamedRole | null {
  const t = text.toLowerCase();
  if (/\bscout\b/.test(t)) return "scout";
  if (/\bhanna\b/.test(t)) return "hanna";
  if (/\bbob\b/.test(t)) return "bob";
  return null;
}

export function inferNamedRole(text: string): NamedRole {
  const named = parseNamedRole(text);
  if (named) return named;
  const t = text.toLowerCase();
  if (
    /\b(availab|workers?|engineers?|crew|pool|candidates?|who can we)\b/.test(t)
  ) {
    return "hanna";
  }
  if (/\b(reply|draft|write back|respond|ask (them|her|him) for|rate|start date)\b/.test(t)) {
    return "bob";
  }
  if (/\b(investigat|research|end[- ]?client|project|buyer|who is this|what is this)\b/.test(t)) {
    return "scout";
  }
  return "bob";
}

export function parseHumanBrief(summary: string | null): HumanBrief | null {
  if (!summary?.trim()) return null;
  const pick = (label: string): string | null => {
    const re = new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=\\n[A-Z][A-Z ]+:|$)`, "i");
    const m = summary.match(re);
    const value = m?.[1]?.trim();
    return value || null;
  };
  const brief: HumanBrief = {
    whatChanged: pick("WHAT CHANGED"),
    whyItMatters: pick("WHY IT MATTERS"),
    recommend: pick("RECOMMEND"),
    needFromYou: pick("NEED FROM YOU"),
    evidence: pick("EVIDENCE"),
  };
  if (Object.values(brief).every((v) => !v)) {
    return {
      whatChanged: summary.trim(),
      whyItMatters: null,
      recommend: null,
      needFromYou: null,
      evidence: null,
    };
  }
  return brief;
}

export function parseSuggestMission(summary: string | null): string | null {
  if (!summary) return null;
  const m = summary.match(/SUGGEST(?:ED)? MISSION\s*:\s*(.+)/i);
  const title = m?.[1]?.trim();
  if (!title || /^(none|n\/a|omit|no)\b/i.test(title)) return null;
  return title.slice(0, 200);
}

function pickEmployee(
  roster: WorkforceEmployee[],
  role: NamedRole,
): WorkforceEmployee | null {
  const keys = ROLE_KEYS[role];
  return (
    roster.find((e) => e.status === "active" && keys.includes(e.roleKey.toLowerCase())) ??
    null
  );
}

function titleFor(role: NamedRole, lead: JobLead | null, instruction: string): string {
  const about =
    lead?.roleTitle ||
    lead?.agencyName ||
    lead?.contactName ||
    instruction.slice(0, 80);
  if (role === "scout") return `Investigate: ${about}`;
  if (role === "hanna") return `Workforce check: ${about}`;
  return `Commercial: ${about}`;
}

export async function createContextualAssignment(params: {
  orgId: string;
  userId: string | null;
  instruction: string;
  contextType: ContextualType;
  contextId: string;
}): Promise<
  | {
      assignmentId: string;
      employeeName: string;
      employeeRole: NamedRole;
      missionCreated: false;
      wake: WakeResult | null;
      notice: string;
    }
  | { error: string }
> {
  const instruction = params.instruction.trim();
  if (instruction.length < 4) return { error: "Say what you need." };

  const roster = await listWorkforce(params.orgId);
  const role = inferNamedRole(instruction);
  const employee = pickEmployee(roster, role);
  if (!employee) {
    return {
      error:
        role === "hanna"
          ? "Nobody on the workforce reads the talent pool right now."
          : role === "scout"
            ? "No active researcher to take this."
            : "No commercial employee (Bob) is active.",
    };
  }

  const lead =
    params.contextType === "job_lead"
      ? await getJobLead(params.contextId, params.orgId)
      : null;
  if (params.contextType === "job_lead" && !lead) {
    return { error: "That commercial item is gone." };
  }

  const entityType =
    params.contextType === "job_lead"
      ? "job_lead"
      : params.contextType === "project"
        ? "project"
        : params.contextType === "worker"
          ? "worker"
          : params.contextType === "contact"
            ? "contact"
            : "company";

  const who = lead
    ? [lead.contactName, lead.agencyName, lead.clientCompany].filter(Boolean).join(" / ")
    : params.contextType;
  const facts = lead
    ? [
        lead.roleTitle && `Role: ${lead.roleTitle}`,
        lead.country && `Country: ${lead.country}`,
        lead.startDateText && `Start: ${lead.startDateText}`,
        lead.rateText && `Rate: ${lead.rateText}`,
        lead.headcountText && `Headcount: ${lead.headcountText}`,
        lead.contactEmail && `Contact: ${lead.contactEmail}`,
        lead.subject && `Subject: ${lead.subject}`,
      ]
        .filter(Boolean)
        .join(". ")
    : "";

  const objective =
    `${instruction}\n\n` +
    `This is contextual work, not a Mission. Stay attached to ${who || "this item"}. ` +
    (facts ? `Known facts — ${facts}. ` : "") +
    (lead?.emailBody ? `Original message:\n${lead.emailBody.slice(0, 4_000)}` : "");

  const created = await createAssignment({
    orgId: params.orgId,
    agentInstanceId: employee.id,
    title: titleFor(role, lead, instruction),
    objective,
    expectedOutput: EXPECTED_OUTPUT,
    priority: "high",
    userId: params.userId,
    idempotencyKey: `ctx:${params.contextType}:${params.contextId}:${employee.id}:${instruction.slice(0, 80)}`,
    entityRefs: [{ type: entityType, id: params.contextId, relation: "target" }],
    constraints: {
      case_type: "contextual_work",
      context: { type: params.contextType, id: params.contextId },
      named_role: role,
      execution_mode: "bot",
    },
  });
  if (!created) return { error: "Could not create the assignment." };

  // createAssignment already wakes Scout. Bob and Hanna need the same
  // webhook for contextual work — they are not mission steps.
  let wake = created.wake;
  const { runtime } = await loadEmployeeRuntime(params.orgId, employee.id);
  if (!wake && runtime === "bot") {
    wake = await wakeEmployee({
      orgId: params.orgId,
      agentInstanceId: employee.id,
      stepId: created.id,
      missionId: null,
      event: "assignment",
    });
  }

  return {
    assignmentId: created.id,
    employeeName: employee.displayName,
    employeeRole: role,
    missionCreated: false,
    wake,
    notice: created.notice,
  };
}

export async function listWorkForContext(
  orgId: string,
  contextType: ContextualType,
  contextId: string,
): Promise<ContextualAssignment[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const { data: links } = await svc
    .from("agent_assignment_entities")
    .select("assignment_id")
    .eq("org_id", orgId)
    .eq("entity_type", contextType)
    .eq("entity_id", contextId);

  const ids = Array.from(new Set((links ?? []).map((r) => r.assignment_id as string)));
  if (ids.length === 0) return [];

  const { data: rows } = await svc
    .from("agent_assignments")
    .select(
      "id, title, objective, status, result_summary, created_at, completed_at, agent_instance_id, constraints",
    )
    .eq("org_id", orgId)
    .in("id", ids)
    .order("created_at", { ascending: false });

  const instanceIds = Array.from(
    new Set((rows ?? []).map((r) => r.agent_instance_id as string).filter(Boolean)),
  );
  const { data: instances } = instanceIds.length
    ? await svc
        .from("agent_instances")
        .select("id, display_name, role_key")
        .eq("org_id", orgId)
        .in("id", instanceIds)
    : { data: [] };
  const byId = new Map((instances ?? []).map((i) => [i.id as string, i]));

  return (rows ?? [])
    .filter((r) => {
      const c = (r.constraints as Record<string, unknown> | null) ?? {};
      const ctx = c.context as { type?: string; id?: string } | undefined;
      return (
        c.case_type === "contextual_work" ||
        ctx?.id === contextId ||
        ctx?.type === contextType
      );
    })
    .map((r) => {
      const emp = byId.get(r.agent_instance_id as string);
      const summary = (r.result_summary as string | null) ?? null;
      const wake = ((r.constraints as Record<string, unknown> | null)?.wake as WakeResult) ?? null;
      return {
        id: r.id as string,
        title: (r.title as string) ?? "",
        objective: (r.objective as string) ?? "",
        status: (r.status as string) ?? "queued",
        employeeName: (emp?.display_name as string) ?? "Employee",
        employeeRole: (emp?.role_key as string) ?? "",
        agentInstanceId: (r.agent_instance_id as string) ?? "",
        resultSummary: summary,
        createdAt: (r.created_at as string) ?? "",
        completedAt: (r.completed_at as string | null) ?? null,
        wake,
        brief: parseHumanBrief(summary),
        suggestMission: parseSuggestMission(summary),
      };
    });
}

export async function loadLeadWorkspace(
  orgId: string,
  leadId: string,
): Promise<ContextWorkspace | null> {
  const lead = await getJobLead(leadId, orgId);
  if (!lead) return null;
  const assignments = await listWorkForContext(orgId, "job_lead", leadId);
  return { kind: "job_lead", lead, assignments };
}
