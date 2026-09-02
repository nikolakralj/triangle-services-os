import "server-only";
import { loadAgentFaces } from "@/lib/data/agent-identity";
import { countMessagesByAssignment } from "@/lib/data/assignment-threads";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export interface CaseAssignment {
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

export interface CaseEvidence {
  id: string;
  findingType: string;
  payload: Record<string, unknown>;
  sourceUrl: string | null;
  evidenceText: string | null;
  confidence: number | null;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  assignmentId: string | null;
  /**
   * Which employee filed it. Findings reach an employee through their
   * assignment; suggestions have no assignment at all, so without this the
   * only evidence a buyer contact has would appear to come from nobody.
   */
  foundBy: { name: string; emoji: string } | null;
}

export interface CaseSnapshot {
  assignments: CaseAssignment[];
  evidence: CaseEvidence[];
}

/**
 * Roadmap item 4 asks for the company-case pattern on projects, buyer
 * contacts, requirements and packages "without creating duplicate truth
 * tables". Four near-copies of this loader would be exactly that, so the
 * entity is a parameter instead. Only the join keys and the relevance test
 * differ between them.
 */
export type CaseEntityType =
  | "company"
  | "project"
  | "worker"
  | "buyer_contact"
  | "package"
  | "requirement";

interface CaseEntityConfig {
  /** agent_assignment_entities.entity_type */
  linkType: string;
  /** agent_findings.promoted_entity_type */
  promotedType: string;
  /**
   * research_suggestions.suggestion_type values that promote into this entity.
   *
   * Triangle has two proposal systems, and they promote differently. Findings
   * record `promoted_entity_id`; suggestions record `final_record_id`. Buyer
   * contacts and packages only ever arrive through the second one — four
   * contacts and three packages in the live database came that way — so a
   * loader that reads findings alone reports those cases as empty.
   */
  suggestionTypes: string[];
  /** payload keys that carry this entity's name, for the relevance test */
  nameKeys: string[];
  /** an assignment titled this way is dedicated to one entity of this kind */
  dedicatedTitlePrefix: string;
}

const CASE_ENTITIES: Record<CaseEntityType, CaseEntityConfig> = {
  company: {
    linkType: "company",
    promotedType: "company",
    suggestionTypes: [],
    nameKeys: ["company_name", "name", "company"],
    dedicatedTitlePrefix: "qualify ",
  },
  project: {
    linkType: "project",
    promotedType: "discovered_project",
    suggestionTypes: [],
    nameKeys: ["project_name", "project", "name"],
    dedicatedTitlePrefix: "qualify ",
  },
  worker: {
    linkType: "worker",
    promotedType: "worker",
    suggestionTypes: [],
    nameKeys: ["full_name", "name"],
    dedicatedTitlePrefix: "worker ",
  },
  buyer_contact: {
    linkType: "buyer_contact",
    promotedType: "buyer_contact",
    suggestionTypes: ["buyer_contact"],
    nameKeys: ["name", "full_name"],
    dedicatedTitlePrefix: "contact ",
  },
  package: {
    linkType: "package",
    promotedType: "project_package",
    suggestionTypes: ["package_opportunity"],
    nameKeys: ["package_type", "title", "name"],
    dedicatedTitlePrefix: "package ",
  },
  requirement: {
    // No proposal system promotes into a requirement yet: a human creates it.
    // Its case is therefore whatever assignments were explicitly attached.
    linkType: "requirement",
    promotedType: "commercial_requirement",
    suggestionTypes: [],
    nameKeys: ["title", "name"],
    dedicatedTitlePrefix: "qualify ",
  },
};

interface SuggestionRow {
  id: string;
  suggestion_type: string;
  payload_json: Record<string, unknown> | null;
  source_url: string | null;
  evidence_text: string | null;
  confidence: number | null;
  status: string;
  created_at: string;
  created_by_agent: string | null;
}

/** Backwards-compatible aliases — the company workspace imports these. */
export type CompanyCaseAssignment = CaseAssignment;
export type CompanyCaseEvidence = CaseEvidence;
export type CompanyCaseSnapshot = CaseSnapshot;

/**
 * Load the durable research case behind one company.
 *
 * New approvals link assignments through agent_assignment_entities. The
 * promoted finding is also inspected so companies accepted before that link
 * existed still retain their original assignment and report.
 */
export async function getEntityCase(
  entityType: CaseEntityType,
  entityId: string,
  orgId: string,
): Promise<CaseSnapshot> {
  const config = CASE_ENTITIES[entityType];
  const svc = createServiceSupabaseClient();
  if (!svc) return { assignments: [], evidence: [] };

  const [linksResult, promotedResult, suggestionResult, faces] = await Promise.all([
    svc
      .from("agent_assignment_entities")
      .select("assignment_id")
      .eq("org_id", orgId)
      .eq("entity_type", config.linkType)
      .eq("entity_id", entityId),
    svc
      .from("agent_findings")
      .select(
        "id,finding_type,payload,source_url,evidence_text,confidence,status,created_at,assignment_id",
      )
      .eq("org_id", orgId)
      .eq("promoted_entity_type", config.promotedType)
      .eq("promoted_entity_id", entityId)
      .order("created_at", { ascending: false }),
    config.suggestionTypes.length === 0
      ? Promise.resolve({ data: [] as SuggestionRow[] })
      : svc
          .from("research_suggestions")
          .select(
            "id,suggestion_type,payload_json,source_url,evidence_text,confidence,status,created_at,created_by_agent",
          )
          .eq("org_id", orgId)
          .in("suggestion_type", config.suggestionTypes)
          .eq("final_record_id", entityId)
          .order("created_at", { ascending: false }),
    loadAgentFaces(orgId),
  ]);

  const promotedRows = promotedResult.data ?? [];
  const suggestionRows = (suggestionResult.data ?? []) as SuggestionRow[];
  const assignmentIds = Array.from(
    new Set(
      [
        ...(linksResult.data ?? []).map((row) => row.assignment_id as string),
        ...promotedRows.map((row) => row.assignment_id as string | null),
      ].filter(Boolean) as string[],
    ),
  );

  const evidenceById = new Map<string, CaseEvidence>();
  const addEvidence = (row: (typeof promotedRows)[number]) => {
    evidenceById.set(row.id as string, {
      id: row.id as string,
      findingType: row.finding_type as string,
      payload: (row.payload as Record<string, unknown>) ?? {},
      sourceUrl: (row.source_url as string) ?? null,
      evidenceText: (row.evidence_text as string) ?? null,
      confidence: (row.confidence as number) ?? null,
      status: row.status as CaseEvidence["status"],
      createdAt: row.created_at as string,
      assignmentId: (row.assignment_id as string) ?? null,
      foundBy: null,
    });
  };
  promotedRows.forEach(addEvidence);

  // Second proposal system. A buyer contact or crew package never has a
  // promoted finding — it was accepted out of research_suggestions, which
  // stamps `final_record_id` instead. Reading only findings would report the
  // case of every contact Triangle has as empty.
  for (const row of suggestionRows) {
    const face = faces.fromCredentialName(
      (row.created_by_agent as string | null) ?? null,
    );
    evidenceById.set(row.id as string, {
      id: row.id as string,
      findingType: row.suggestion_type as string,
      payload: (row.payload_json as Record<string, unknown>) ?? {},
      sourceUrl: (row.source_url as string) ?? null,
      evidenceText: (row.evidence_text as string) ?? null,
      confidence: (row.confidence as number) ?? null,
      status: row.status as CaseEvidence["status"],
      createdAt: row.created_at as string,
      assignmentId: null,
      foundBy: face,
    });
  }

  const sortNewestFirst = (rows: CaseEvidence[]) =>
    rows.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  if (assignmentIds.length === 0) {
    // The normal path for a buyer contact or package: evidence but no
    // assignment, because a research run produced it rather than a job.
    return {
      assignments: [],
      evidence: sortNewestFirst(Array.from(evidenceById.values())),
    };
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
  const entityNameTokens = [
    ...promotedRows.map((row) => (row.payload as Record<string, unknown>) ?? {}),
    ...suggestionRows.map((row) => row.payload_json ?? {}),
  ].flatMap((payload) =>
    config.nameKeys
      .map((key) => payload[key])
      .filter(Boolean)
      .map((value) => String(value).toLowerCase()),
  );
  const dedicatedAssignmentIds = new Set(
    (assignmentsResult.data ?? [])
      .filter((row) =>
        row.title?.toLowerCase().startsWith(config.dedicatedTitlePrefix),
      )
      .map((row) => row.id as string),
  );
  for (const row of relatedFindingsResult.data ?? []) {
    const payloadText = JSON.stringify(row.payload ?? {}).toLowerCase();
    const aboutEntity = entityNameTokens.some((name) => payloadText.includes(name));
    if (aboutEntity || dedicatedAssignmentIds.has(row.assignment_id as string)) {
      addEvidence(row);
    }
  }

  const assignments: CaseAssignment[] = (assignmentsResult.data ?? []).map(
    (row) => {
      const agent = faces.byId.get(row.agent_instance_id as string);
      const thread = threadCounts.get(row.id as string);
      return {
        id: row.id as string,
        title: row.title as string,
        objective: row.objective as string,
        status: row.status as CaseAssignment["status"],
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

/** The original entry point, unchanged for callers. */
export async function getCompanyCase(
  companyId: string,
  orgId: string,
): Promise<CaseSnapshot> {
  return getEntityCase("company", companyId, orgId);
}

/** Named entry points, so callers do not pass entity-type strings around. */
export const getProjectCase = (id: string, orgId: string) =>
  getEntityCase("project", id, orgId);
export const getBuyerContactCase = (id: string, orgId: string) =>
  getEntityCase("buyer_contact", id, orgId);
export const getPackageCase = (id: string, orgId: string) =>
  getEntityCase("package", id, orgId);
export const getRequirementCase = (id: string, orgId: string) =>
  getEntityCase("requirement", id, orgId);

/**
 * Provenance for a whole list at once.
 *
 * A contacts panel wants "where did this come from and who found it" on every
 * row. Calling getEntityCase per row would be one round trip per contact, so
 * this fetches the evidence for all of them in a single query. Detail views
 * still use getEntityCase — they need the assignments and reports too.
 */
export async function getEntityEvidenceBatch(
  entityType: CaseEntityType,
  entityIds: string[],
  orgId: string,
): Promise<Map<string, CaseEvidence[]>> {
  const out = new Map<string, CaseEvidence[]>();
  const config = CASE_ENTITIES[entityType];
  const ids = Array.from(new Set(entityIds.filter(Boolean)));
  if (ids.length === 0 || config.suggestionTypes.length === 0) return out;

  const svc = createServiceSupabaseClient();
  if (!svc) return out;

  const [result, faces] = await Promise.all([
    svc
      .from("research_suggestions")
      .select(
        "id,suggestion_type,payload_json,source_url,evidence_text,confidence,status,created_at,created_by_agent,final_record_id",
      )
      .eq("org_id", orgId)
      .in("suggestion_type", config.suggestionTypes)
      .in("final_record_id", ids)
      .order("created_at", { ascending: false }),
    loadAgentFaces(orgId),
  ]);

  for (const row of (result.data ?? []) as (SuggestionRow & {
    final_record_id: string;
  })[]) {
    const list = out.get(row.final_record_id) ?? [];
    list.push({
      id: row.id,
      findingType: row.suggestion_type,
      payload: row.payload_json ?? {},
      sourceUrl: row.source_url,
      evidenceText: row.evidence_text,
      confidence: row.confidence,
      status: row.status as CaseEvidence["status"],
      createdAt: row.created_at,
      assignmentId: null,
      foundBy: faces.fromCredentialName(row.created_by_agent),
    });
    out.set(row.final_record_id, list);
  }
  return out;
}

/**
 * A requirement's case is inherited.
 *
 * Nobody proposes a requirement — a human writes it down after deciding the
 * demand is real. The research that justifies it lives one level up: on the
 * project it came from, and on the buyer contacts and packages found for that
 * project. Surfacing it here is the same truth shown where the decision to
 * pick up the phone is actually made, not a second copy of it.
 *
 * Own work wins when it exists: once an employee is put on a requirement
 * directly, that is the case, and the inherited context steps aside.
 */
export async function getRequirementResearchCase(
  requirementId: string,
  projectId: string | null,
  orgId: string,
): Promise<{ snapshot: CaseSnapshot; inherited: boolean }> {
  const own = await getEntityCase("requirement", requirementId, orgId);
  if (own.assignments.length > 0 || own.evidence.length > 0) {
    return { snapshot: own, inherited: false };
  }
  if (!projectId) return { snapshot: own, inherited: false };

  const svc = createServiceSupabaseClient();
  if (!svc) return { snapshot: own, inherited: false };

  const [projectCase, contacts, packages] = await Promise.all([
    getEntityCase("project", projectId, orgId),
    svc
      .from("buyer_contacts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("discovered_project_id", projectId),
    // project_packages uses project_id; buyer_contacts uses
    // discovered_project_id. Same relationship, two column names.
    svc
      .from("project_packages")
      .select("id")
      .eq("org_id", orgId)
      .eq("project_id", projectId),
  ]);

  const [contactEvidence, packageEvidence] = await Promise.all([
    getEntityEvidenceBatch(
      "buyer_contact",
      (contacts.data ?? []).map((r) => r.id as string),
      orgId,
    ),
    getEntityEvidenceBatch(
      "package",
      (packages.data ?? []).map((r) => r.id as string),
      orgId,
    ),
  ]);

  const byId = new Map(projectCase.evidence.map((e) => [e.id, e]));
  for (const list of [...contactEvidence.values(), ...packageEvidence.values()]) {
    for (const e of list) byId.set(e.id, e);
  }

  return {
    snapshot: {
      assignments: projectCase.assignments,
      evidence: Array.from(byId.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    },
    inherited: true,
  };
}
