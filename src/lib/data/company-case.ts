import "server-only";
import { countMessagesByAssignment } from "@/lib/data/assignment-threads";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export interface CompanyCaseAssignment {
  id: string;
  title: string;
  objective: string;
  status: "queued" | "active" | "waiting_review" | "completed" | "failed" | "cancelled";
  resultSummary: string | null;
  createdAt: string;
  completedAt: string | null;
  agentName: string;
  agentEmoji: string;
  messageCount: number;
  awaitingAgent: number;
}

export interface CompanyCaseEvidence {
  id: string;
  findingType: string;
  payload: Record<string, unknown>;
  sourceUrl: string | null;
  evidenceText: string | null;
  confidence: number | null;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  assignmentId: string | null;
}

export interface CompanyCaseSnapshot {
  assignments: CompanyCaseAssignment[];
  evidence: CompanyCaseEvidence[];
}

/**
 * Load the durable research case behind one company.
 *
 * New approvals link assignments through agent_assignment_entities. The
 * promoted finding is also inspected so companies accepted before that link
 * existed still retain their original assignment and report.
 */
export async function getCompanyCase(
  companyId: string,
  orgId: string,
): Promise<CompanyCaseSnapshot> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { assignments: [], evidence: [] };

  const [linksResult, promotedResult] = await Promise.all([
    svc
      .from("agent_assignment_entities")
      .select("assignment_id")
      .eq("org_id", orgId)
      .eq("entity_type", "company")
      .eq("entity_id", companyId),
    svc
      .from("agent_findings")
      .select(
        "id,finding_type,payload,source_url,evidence_text,confidence,status,created_at,assignment_id",
      )
      .eq("org_id", orgId)
      .eq("promoted_entity_type", "company")
      .eq("promoted_entity_id", companyId)
      .order("created_at", { ascending: false }),
  ]);

  const promotedRows = promotedResult.data ?? [];
  const assignmentIds = Array.from(
    new Set(
      [
        ...(linksResult.data ?? []).map((row) => row.assignment_id as string),
        ...promotedRows.map((row) => row.assignment_id as string | null),
      ].filter(Boolean) as string[],
    ),
  );

  const evidenceById = new Map<string, CompanyCaseEvidence>();
  const addEvidence = (row: (typeof promotedRows)[number]) => {
    evidenceById.set(row.id as string, {
      id: row.id as string,
      findingType: row.finding_type as string,
      payload: (row.payload as Record<string, unknown>) ?? {},
      sourceUrl: (row.source_url as string) ?? null,
      evidenceText: (row.evidence_text as string) ?? null,
      confidence: (row.confidence as number) ?? null,
      status: row.status as CompanyCaseEvidence["status"],
      createdAt: row.created_at as string,
      assignmentId: (row.assignment_id as string) ?? null,
    });
  };
  promotedRows.forEach(addEvidence);

  if (assignmentIds.length === 0) {
    return { assignments: [], evidence: Array.from(evidenceById.values()) };
  }

  const [assignmentsResult, relatedFindingsResult, threadCounts] = await Promise.all([
    svc
      .from("agent_assignments")
      .select(
        "id,agent_instance_id,title,objective,status,result_summary,created_at,completed_at",
      )
      .eq("org_id", orgId)
      .in("id", assignmentIds)
      .order("created_at", { ascending: false }),
    svc
      .from("agent_findings")
      .select(
        "id,finding_type,payload,source_url,evidence_text,confidence,status,created_at,assignment_id",
      )
      .eq("org_id", orgId)
      .in("assignment_id", assignmentIds)
      .order("created_at", { ascending: false }),
    countMessagesByAssignment(assignmentIds, orgId),
  ]);

  // Only include related findings that are about this company or are outputs
  // of a dedicated company-qualification assignment. Broad source assignments
  // often discover six companies at once; showing all six on every case is
  // the same information dumping the CEO asked us to remove.
  const companyNameTokens = promotedRows
    .flatMap((row) => {
      const payload = (row.payload as Record<string, unknown>) ?? {};
      return [payload.company_name, payload.name, payload.company]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
    });
  const dedicatedAssignmentIds = new Set(
    (assignmentsResult.data ?? [])
      .filter((row) => row.title?.toLowerCase().startsWith("qualify "))
      .map((row) => row.id as string),
  );
  for (const row of relatedFindingsResult.data ?? []) {
    const payloadText = JSON.stringify(row.payload ?? {}).toLowerCase();
    const aboutCompany = companyNameTokens.some((name) => payloadText.includes(name));
    if (aboutCompany || dedicatedAssignmentIds.has(row.assignment_id as string)) {
      addEvidence(row);
    }
  }

  const agentIds = Array.from(
    new Set(
      (assignmentsResult.data ?? []).map((row) => row.agent_instance_id as string),
    ),
  );
  const agents = new Map<string, { name: string; emoji: string }>();
  if (agentIds.length > 0) {
    const { data } = await svc
      .from("agent_instances")
      .select("id,display_name,emoji")
      .eq("org_id", orgId)
      .in("id", agentIds);
    for (const agent of data ?? []) {
      agents.set(agent.id as string, {
        name: agent.display_name as string,
        emoji: (agent.emoji as string) || "🤖",
      });
    }
  }

  const assignments: CompanyCaseAssignment[] = (assignmentsResult.data ?? []).map(
    (row) => {
      const agent = agents.get(row.agent_instance_id as string);
      const thread = threadCounts.get(row.id as string);
      return {
        id: row.id as string,
        title: row.title as string,
        objective: row.objective as string,
        status: row.status as CompanyCaseAssignment["status"],
        resultSummary: (row.result_summary as string) ?? null,
        createdAt: row.created_at as string,
        completedAt: (row.completed_at as string) ?? null,
        agentName: agent?.name ?? "Research employee",
        agentEmoji: agent?.emoji ?? "🤖",
        messageCount: thread?.total ?? 0,
        awaitingAgent: thread?.awaitingAgent ?? 0,
      };
    },
  );

  return {
    assignments,
    evidence: Array.from(evidenceById.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  };
}
