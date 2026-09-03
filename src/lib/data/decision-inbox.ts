import "server-only";

import { loadAgentFaces } from "@/lib/data/agent-identity";
import { listApprovals, type ApprovalItem } from "@/lib/data/approvals";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type DecisionKind =
  | "pursue"
  | "hold"
  | "reject"
  | "agent_blocked"
  | "evidence_conflict"
  | "approve_commercial_action";

export type EvidenceQuality = "high" | "medium" | "low";

export interface DecisionCase {
  id: string;
  kind: DecisionKind;
  caseLabel: string;
  title: string;
  caseHref: string | null;
  recommendation: string;
  businessImpact: string;
  unknowns: string[];
  evidenceQuality: EvidenceQuality;
  evidenceCount: number;
  averageConfidence: number | null;
  ownerLabel: string;
  nextSafeAiStep: string;
  nextHumanStep: string;
  createdAt: string;
  detail: string | null;
  approvalItems: ApprovalItem[];
}

export interface DecisionInboxSnapshot {
  decisions: DecisionCase[];
  pendingApprovalCount: number;
  blockedCount: number;
  commercialActionCount: number;
  noActionNeededCount: number;
}

function normalizedKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function groupApprovalItems(items: ApprovalItem[]): ApprovalItem[][] {
  const groups = new Map<string, ApprovalItem[]>();
  for (const item of items) {
    const key = item.projectId
      ? `project:${item.projectId}`
      : `${item.itemType}:${normalizedKey(item.headline)}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

function approvalDecision(items: ApprovalItem[]): DecisionCase {
  const first = items[0];
  const confidenceValues = items
    .map((item) => item.confidence)
    .filter((value): value is number => value !== null);
  const averageConfidence = confidenceValues.length
    ? Math.round(
        confidenceValues.reduce((total, value) => total + value, 0) /
          confidenceValues.length,
      )
    : null;
  const sourcedCount = items.filter((item) => item.sourceUrl).length;
  const sourceCoverage = sourcedCount / items.length;
  const evidenceQuality: EvidenceQuality =
    sourceCoverage === 1 && (averageConfidence ?? 0) >= 80
      ? "high"
      : sourceCoverage >= 0.5 && (averageConfidence ?? 0) >= 55
        ? "medium"
        : "low";
  const kind: DecisionKind =
    evidenceQuality === "low" && (averageConfidence ?? 100) < 35
      ? "reject"
      : evidenceQuality === "low"
        ? "hold"
        : "pursue";
  const itemTypes = new Set(items.map((item) => item.itemType));
  const isCompany = itemTypes.has("company");
  const isProject = first.projectId !== null || itemTypes.has("project");
  const title = first.projectName ?? (items.length === 1 ? first.headline : `${first.headline} case`);
  const owners = Array.from(
    new Set(
      items
        .filter((item) => item.agentName)
        .map((item) => `${item.agentEmoji ? `${item.agentEmoji} ` : ""}${item.agentName}`),
    ),
  );
  const unknowns: string[] = [];
  if (sourcedCount < items.length) {
    unknowns.push(`${items.length - sourcedCount} proposed fact${items.length - sourcedCount === 1 ? " has" : "s have"} no source URL.`);
  }
  if (averageConfidence === null) unknowns.push("The employee did not provide a confidence score.");
  else if (averageConfidence < 60) unknowns.push(`Average confidence is only ${averageConfidence}%.`);
  if (isCompany) {
    unknowns.push(
      "A named project, actual labor buyer, crew package and commercial action are not confirmed until qualification finishes.",
    );
  }

  return {
    id: `approval:${first.projectId ?? `${first.itemType}:${normalizedKey(first.headline)}`}`,
    kind,
    caseLabel: first.projectId
      ? "Project research case"
      : isCompany
        ? "Company discovery"
        : isProject
          ? "Project discovery"
          : "Research case",
    title,
    caseHref: first.projectId ? `/hunter/${first.projectId}` : null,
    recommendation:
      kind === "pursue"
        ? isCompany
          ? "Accept the sourced company lead and let the same employee qualify it automatically."
          : `Accept the supported internal evidence that advances this case.`
        : kind === "reject"
          ? "Reject this proposal unless the employee can replace it with sourced evidence."
          : "Hold this proposal and ask for stronger evidence before it enters the operating record.",
    businessImpact: isCompany
      ? "Approval starts a durable qualification case; it is not permission to contact anyone."
      : isProject
        ? "These facts determine whether Triangle can map the buyer path and build a credible crew offer."
        : "This changes the internal case record and what the AI team researches next.",
    unknowns,
    evidenceQuality,
    evidenceCount: items.length,
    averageConfidence,
    ownerLabel: owners.length ? owners.join(", ") : "Unattributed research employee",
    nextSafeAiStep: isCompany
      ? "After acceptance, continue research toward project, buyer, contact, crew package and exact next action. No outreach."
      : "Continue internal research using accepted evidence and keep unresolved claims marked as unknown.",
    nextHumanStep: `Review the ${items.length} evidence item${items.length === 1 ? "" : "s"} below and accept or reject ${items.length === 1 ? "it" : "them"}.`,
    createdAt: items
      .map((item) => item.createdAt)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0],
    detail: items.length === 1 ? first.detail : `${items.length} related proposals are grouped into this case decision.`,
    approvalItems: items,
  };
}

export async function listDecisionInbox(
  orgId: string,
): Promise<DecisionInboxSnapshot> {
  const service = createServiceSupabaseClient();
  if (!service) {
    return {
      decisions: [],
      pendingApprovalCount: 0,
      blockedCount: 0,
      commercialActionCount: 0,
      noActionNeededCount: 0,
    };
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [approvals, attentionResult, operatingResult, draftsResult] = await Promise.all([
    listApprovals(orgId, { status: "pending" }),
    service
      .from("agent_assignments")
      .select(
        "id,title,objective,status,result_summary,created_at,agent_instance_id,project_id",
      )
      .eq("org_id", orgId)
      .in("status", ["waiting_review", "failed"])
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false }),
    service
      .from("agent_assignments")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("status", ["queued", "active"]),
    service
      .from("outreach_drafts")
      .select(
        "id,project_id,buyer_contact_id,buyer_suggestion_id,project_package_id,channel,subject,body,created_by_agent,created_at",
      )
      .eq("org_id", orgId)
      .eq("status", "draft")
      .order("created_at", { ascending: false }),
  ]);

  const attentionRows = attentionResult.data ?? [];
  const draftRows = draftsResult.data ?? [];
  const faces = await loadAgentFaces(orgId);
  const assignmentIds = attentionRows.map((row) => row.id as string);
  const { data: entityRows } = assignmentIds.length
    ? await service
        .from("agent_assignment_entities")
        .select("assignment_id,entity_type,entity_id,relation")
        .eq("org_id", orgId)
        .in("assignment_id", assignmentIds)
    : { data: [] };

  const agentIds = Array.from(
    new Set(attentionRows.map((row) => row.agent_instance_id as string).filter(Boolean)),
  );
  const { data: agentRows } = agentIds.length
    ? await service
        .from("agent_instances")
        .select("id,display_name,emoji")
        .eq("org_id", orgId)
        .in("id", agentIds)
    : { data: [] };
  const agents = new Map<string, string>();
  for (const agent of agentRows ?? []) {
    agents.set(
      agent.id as string,
      `${(agent.emoji as string) || "🤖"} ${agent.display_name as string}`,
    );
  }

  const projectIds = Array.from(
    new Set(
      [
        ...attentionRows.map((row) => row.project_id as string | null),
        ...draftRows.map((row) => row.project_id as string),
        ...(entityRows ?? [])
          .filter((row) => row.entity_type === "project")
          .map((row) => row.entity_id as string),
      ].filter(Boolean) as string[],
    ),
  );
  const companyIds = Array.from(
    new Set(
      (entityRows ?? [])
        .filter((row) => row.entity_type === "company")
        .map((row) => row.entity_id as string),
    ),
  );
  const buyerIds = Array.from(
    new Set(draftRows.map((row) => row.buyer_contact_id as string | null).filter(Boolean) as string[]),
  );
  const packageIds = Array.from(
    new Set(draftRows.map((row) => row.project_package_id as string | null).filter(Boolean) as string[]),
  );

  const [projectsResult, companiesResult, buyersResult, packagesResult] = await Promise.all([
    projectIds.length
      ? service
          .from("discovered_projects")
          .select("id,project_name")
          .eq("organization_id", orgId)
          .in("id", projectIds)
      : Promise.resolve({ data: [] }),
    companyIds.length
      ? service
          .from("companies")
          .select("id,name")
          .eq("organization_id", orgId)
          .in("id", companyIds)
      : Promise.resolve({ data: [] }),
    buyerIds.length
      ? service
          .from("buyer_contacts")
          .select("id,full_name,company_name")
          .eq("organization_id", orgId)
          .in("id", buyerIds)
      : Promise.resolve({ data: [] }),
    packageIds.length
      ? service
          .from("project_packages")
          .select("id,title")
          .eq("org_id", orgId)
          .in("id", packageIds)
      : Promise.resolve({ data: [] }),
  ]);

  const projectNames = new Map<string, string>();
  for (const row of projectsResult.data ?? []) {
    projectNames.set(row.id as string, row.project_name as string);
  }
  const companyNames = new Map<string, string>();
  for (const row of companiesResult.data ?? []) {
    companyNames.set(row.id as string, row.name as string);
  }
  const buyerNames = new Map<string, string>();
  for (const row of buyersResult.data ?? []) {
    buyerNames.set(
      row.id as string,
      [row.full_name, row.company_name].filter(Boolean).join(" at ") || "Unknown buyer",
    );
  }
  const packageNames = new Map<string, string>();
  for (const row of packagesResult.data ?? []) {
    packageNames.set(row.id as string, row.title as string);
  }

  const entitiesByAssignment = new Map<
    string,
    Array<{ type: string; id: string; relation: string }>
  >();
  for (const row of entityRows ?? []) {
    const assignmentId = row.assignment_id as string;
    const existing = entitiesByAssignment.get(assignmentId) ?? [];
    existing.push({
      type: row.entity_type as string,
      id: row.entity_id as string,
      relation: (row.relation as string) ?? "context",
    });
    entitiesByAssignment.set(assignmentId, existing);
  }

  const decisions: DecisionCase[] = groupApprovalItems(approvals).map(approvalDecision);

  for (const row of attentionRows) {
    const entities = entitiesByAssignment.get(row.id as string) ?? [];
    const company = entities.find((entity) => entity.type === "company");
    const project = entities.find((entity) => entity.type === "project");
    const projectId = (row.project_id as string | null) ?? project?.id ?? null;
    const caseHref = company
      ? `/companies/${company.id}`
      : projectId
        ? `/hunter/${projectId}`
        : "/agents";
    const entityTitle = company
      ? companyNames.get(company.id)
      : projectId
        ? projectNames.get(projectId)
        : null;
    const failed = row.status === "failed";
    decisions.push({
      id: `assignment:${row.id as string}`,
      kind: failed ? "agent_blocked" : "pursue",
      caseLabel: failed ? "AI employee blocked" : "Agent result ready",
      title: entityTitle ? `${entityTitle}: ${row.title as string}` : (row.title as string),
      caseHref,
      recommendation: failed
        ? "Inspect the blocker, then coach, reassign or retire the employee if the failure is repeated."
        : "Review the employee's result and decide whether the case can advance.",
      businessImpact: failed
        ? "This case has stopped moving and will not resolve itself."
        : "The AI employee has reached a human decision boundary and is waiting.",
      unknowns: row.result_summary
        ? []
        : ["The employee did not provide a useful result or blocker summary."],
      evidenceQuality: row.result_summary ? "medium" : "low",
      evidenceCount: 0,
      averageConfidence: null,
      ownerLabel:
        agents.get(row.agent_instance_id as string) ?? "Unknown research employee",
      nextSafeAiStep: failed
        ? "Do not retry or expand scope until a human supplies direction."
        : "Wait for the human decision, then continue only the authorized internal work.",
      nextHumanStep: caseHref === "/agents"
        ? "Open Workforce and review the assignment conversation."
        : "Open the living case, read the result and answer in its persistent thread.",
      createdAt: row.created_at as string,
      detail: (row.result_summary as string | null) ?? (row.objective as string),
      approvalItems: [],
    });
  }

  const draftsByProject = new Map<string, typeof draftRows>();
  for (const row of draftRows) {
    const projectId = row.project_id as string;
    const existing = draftsByProject.get(projectId) ?? [];
    existing.push(row);
    draftsByProject.set(projectId, existing);
  }

  for (const [projectId, projectDrafts] of draftsByProject) {
    const buyerIdsForProject = Array.from(
      new Set(
        projectDrafts
          .map((row) => row.buyer_contact_id as string | null)
          .filter(Boolean) as string[],
      ),
    );
    const packageIdsForProject = Array.from(
      new Set(
        projectDrafts
          .map((row) => row.project_package_id as string | null)
          .filter(Boolean) as string[],
      ),
    );
    const missingBuyerCount = projectDrafts.filter(
      (row) => !row.buyer_contact_id && !row.buyer_suggestion_id,
    ).length;
    const missingPackageCount = projectDrafts.filter(
      (row) => !row.project_package_id,
    ).length;
    const unknowns: string[] = [];
    if (missingBuyerCount > 0) {
      unknowns.push(`${missingBuyerCount} draft${missingBuyerCount === 1 ? " has" : "s have"} no attached buyer.`);
    }
    if (missingPackageCount > 0) {
      unknowns.push(`${missingPackageCount} draft${missingPackageCount === 1 ? " has" : "s have"} no specific crew package.`);
    }
    const subjects = Array.from(
      new Set(
        projectDrafts.map((row) => String(row.subject || row.channel || "Outreach draft")),
      ),
    );
    // Drafts store the raw credential name. Shown as-is it put
    // "research_chat_agent" in front of the CEO under the heading
    // "responsible employee" — a machine identifier where a colleague's name
    // belongs. Resolve it the same way every other screen does.
    const owners = Array.from(
      new Set(
        projectDrafts
          .map((row) => {
            const face = faces.fromCredentialName(
              (row.created_by_agent as string | null) ?? null,
            );
            return face ? `${face.emoji} ${face.name}` : null;
          })
          .filter(Boolean) as string[],
      ),
    );
    const latestCreatedAt = projectDrafts
      .map((row) => row.created_at as string)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    decisions.push({
      id: `outreach-project:${projectId}`,
      kind: "approve_commercial_action",
      caseLabel: "External action approval",
      title: `${projectNames.get(projectId) ?? "Project"}: ${projectDrafts.length} outreach draft${projectDrafts.length === 1 ? "" : "s"} awaiting a human choice`,
      caseHref: `/hunter/${projectId}`,
      recommendation: projectDrafts.length === 1
        ? "Verify the buyer, claims and package; edit or approve the draft before sending it manually."
        : "Choose one useful variant, reject the noise, then verify the buyer, claims and package before sending manually.",
      businessImpact: "This message leaves Triangle and can create or damage a real buyer relationship.",
      unknowns,
      evidenceQuality: unknowns.length === 0 ? "high" : "medium",
      evidenceCount: 0,
      averageConfidence: null,
      ownerLabel: owners.length ? owners.join(", ") : "AI outreach employee",
      nextSafeAiStep: "AI may improve the draft from verified case evidence but cannot send it.",
      nextHumanStep: `Open the project and compare the full draft${projectDrafts.length === 1 ? "" : " variants"}${buyerIdsForProject.length ? ` for ${buyerIdsForProject.map((id) => buyerNames.get(id) ?? "the buyer").join(", ")}` : ""}${packageIdsForProject.length ? ` against ${packageIdsForProject.map((id) => packageNames.get(id) ?? "the crew package").join(", ")}` : ""}. Copy and send only the approved version yourself.`,
      createdAt: latestCreatedAt,
      detail: subjects.slice(0, 4).join(" · ") + (subjects.length > 4 ? ` · +${subjects.length - 4} more` : ""),
      approvalItems: [],
    });
  }

  const priority: Record<DecisionKind, number> = {
    agent_blocked: 0,
    evidence_conflict: 1,
    approve_commercial_action: 2,
    hold: 3,
    reject: 4,
    pursue: 5,
  };
  decisions.sort((a, b) => {
    const byPriority = priority[a.kind] - priority[b.kind];
    return byPriority || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return {
    decisions,
    pendingApprovalCount: approvals.length,
    blockedCount: attentionRows.filter((row) => row.status === "failed").length,
    commercialActionCount: draftRows.length,
    noActionNeededCount: operatingResult.count ?? 0,
  };
}

export async function countDecisionAttention(orgId: string): Promise<number> {
  const service = createServiceSupabaseClient();
  if (!service) return 0;
  const head = { count: "exact" as const, head: true };
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [suggestions, findings, assignments, drafts] = await Promise.all([
    service.from("research_suggestions").select("id", head).eq("org_id", orgId).eq("status", "pending"),
    service.from("agent_findings").select("id", head).eq("org_id", orgId).eq("status", "pending"),
    service
      .from("agent_assignments")
      .select("id", head)
      .eq("org_id", orgId)
      .in("status", ["waiting_review", "failed"])
      .gte("created_at", thirtyDaysAgo),
    service.from("outreach_drafts").select("id", head).eq("org_id", orgId).eq("status", "draft"),
  ]);
  return (suggestions.count ?? 0) + (findings.count ?? 0) + (assignments.count ?? 0) + (drafts.count ?? 0);
}
