import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Agent findings — net-new discoveries with nowhere to live yet.
//
// Why this exists: every research MCP tool requires a project_id, so Scout
// could only ever enrich projects that already existed. On his first real run
// he said so plainly: "Triangle has no German auto plant record to attach a
// new finding to. Someone needs to create those project rows first." That is
// backwards for a business-development researcher, whose main job is finding
// things Triangle has never heard of.
//
// A finding is a proposal. Accepting one PROMOTES it into a real domain
// record (today: discovered_projects). Agents can never promote their own.
// ---------------------------------------------------------------------------

export type FindingType = "project" | "company" | "contact" | "other";

export interface AgentFinding {
  id: string;
  findingType: string;
  payload: Record<string, unknown>;
  sourceUrl: string | null;
  sourceDate: string | null;
  evidenceText: string | null;
  confidence: number | null;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  agentName: string | null;
  agentEmoji: string | null;
  assignmentTitle: string | null;
  promotedEntityType: string | null;
  promotedEntityId: string | null;
}

export async function createFinding(params: {
  orgId: string;
  agentInstanceId: string | null;
  assignmentId?: string | null;
  findingType: string;
  payload: Record<string, unknown>;
  sourceUrl?: string | null;
  sourceDate?: string | null;
  evidenceText?: string | null;
  confidence?: number | null;
  idempotencyKey?: string | null;
}): Promise<{ id: string; duplicate: boolean } | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  // Re-submitting the same discovery must be harmless — agents retry.
  if (params.idempotencyKey) {
    const { data: existing } = await svc
      .from("agent_findings")
      .select("id")
      .eq("org_id", params.orgId)
      .eq("idempotency_key", params.idempotencyKey)
      .maybeSingle();
    if (existing) return { id: existing.id as string, duplicate: true };
  }

  const { data, error } = await svc
    .from("agent_findings")
    .insert({
      org_id: params.orgId,
      agent_instance_id: params.agentInstanceId,
      assignment_id: params.assignmentId ?? null,
      finding_type: params.findingType,
      payload: params.payload,
      source_url: params.sourceUrl ?? null,
      source_date: params.sourceDate ?? null,
      evidence_text: params.evidenceText ?? null,
      confidence: params.confidence ?? null,
      idempotency_key: params.idempotencyKey ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id as string, duplicate: false };
}

export async function listFindings(
  orgId: string,
  opts: { status?: string; limit?: number } = {},
): Promise<AgentFinding[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  let q = svc
    .from("agent_findings")
    .select(
      "id, finding_type, payload, source_url, source_date, evidence_text, confidence, status, created_at, agent_instance_id, assignment_id, promoted_entity_type, promoted_entity_id",
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.status) q = q.eq("status", opts.status);

  const { data } = await q;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const agentIds = Array.from(
    new Set(rows.map((r) => r.agent_instance_id).filter(Boolean) as string[]),
  );
  const agents = new Map<string, { name: string; emoji: string }>();
  if (agentIds.length > 0) {
    const { data: ags } = await svc
      .from("agent_instances")
      .select("id, display_name, emoji")
      .in("id", agentIds);
    for (const a of ags ?? []) {
      agents.set(a.id as string, {
        name: a.display_name as string,
        emoji: (a.emoji as string) || "🤖",
      });
    }
  }

  const assignmentIds = Array.from(
    new Set(rows.map((r) => r.assignment_id).filter(Boolean) as string[]),
  );
  const assignments = new Map<string, string>();
  if (assignmentIds.length > 0) {
    const { data: asg } = await svc
      .from("agent_assignments")
      .select("id, title")
      .in("id", assignmentIds);
    for (const a of asg ?? []) assignments.set(a.id as string, a.title as string);
  }

  return rows.map((r) => {
    const ag = r.agent_instance_id
      ? agents.get(r.agent_instance_id as string)
      : undefined;
    return {
      id: r.id as string,
      findingType: r.finding_type as string,
      payload: (r.payload as Record<string, unknown>) ?? {},
      sourceUrl: (r.source_url as string) ?? null,
      sourceDate: (r.source_date as string) ?? null,
      evidenceText: (r.evidence_text as string) ?? null,
      confidence: (r.confidence as number) ?? null,
      status: r.status as AgentFinding["status"],
      createdAt: r.created_at as string,
      agentName: ag?.name ?? null,
      agentEmoji: ag?.emoji ?? null,
      assignmentTitle: r.assignment_id
        ? assignments.get(r.assignment_id as string) ?? null
        : null,
      promotedEntityType: (r.promoted_entity_type as string) ?? null,
      promotedEntityId: (r.promoted_entity_id as string) ?? null,
    };
  });
}

/**
 * Accept a finding. A `project` finding becomes a real discovered_project,
 * which is what unblocks the agent: from then on it can enrich that project
 * with the normal research tools.
 */
export async function acceptFinding(params: {
  findingId: string;
  orgId: string;
  userId: string | null;
}): Promise<{ promotedTo: string | null; entityId: string | null } | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data: finding } = await svc
    .from("agent_findings")
    .select("id, finding_type, payload, source_url, evidence_text, status")
    .eq("id", params.findingId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  if (!finding || finding.status !== "pending") return null;

  const payload = (finding.payload as Record<string, unknown>) ?? {};
  let promotedTo: string | null = null;
  let entityId: string | null = null;

  if (finding.finding_type === "project") {
    const name = String(payload.project_name ?? payload.name ?? "").trim();
    if (!name) return null;
    const { data: project } = await svc
      .from("discovered_projects")
      .insert({
        organization_id: params.orgId,
        project_name: name.slice(0, 300),
        country: payload.country ? String(payload.country) : null,
        city: payload.city ? String(payload.city) : null,
        project_type: payload.project_type ? String(payload.project_type) : null,
        client_company: payload.client_company
          ? String(payload.client_company)
          : null,
        general_contractor: payload.general_contractor
          ? String(payload.general_contractor)
          : null,
        source_url: (finding.source_url as string) ?? null,
        ai_summary:
          (finding.evidence_text as string) ??
          (payload.summary ? String(payload.summary) : null),
        status: "new",
      })
      .select("id")
      .maybeSingle();
    if (project) {
      promotedTo = "discovered_project";
      entityId = project.id as string;
    }
  }

  await svc
    .from("agent_findings")
    .update({
      status: "accepted",
      reviewed_by: params.userId,
      reviewed_at: new Date().toISOString(),
      promoted_entity_type: promotedTo,
      promoted_entity_id: entityId,
    })
    .eq("id", params.findingId)
    .eq("org_id", params.orgId);

  return { promotedTo, entityId };
}

export async function rejectFinding(params: {
  findingId: string;
  orgId: string;
  userId: string | null;
}): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;
  const { data, error } = await svc
    .from("agent_findings")
    .update({
      status: "rejected",
      reviewed_by: params.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.findingId)
    .eq("org_id", params.orgId)
    .eq("status", "pending")
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}
