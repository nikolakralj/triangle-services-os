import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { createProjectPackage } from "@/lib/data/project-packages";
import type { ChainRole } from "@/lib/data/contractor-chain-shared";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ResearchSuggestionType =
  | "chain_node"
  | "buyer_contact"
  | "package_opportunity"
  | "note";

export type ResearchSuggestionStatus =
  | "pending"
  | "accepted"
  | "edited_and_accepted"
  | "rejected";

export type ResearchSuggestionRow = {
  id: string;
  org_id: string;
  project_id: string;
  research_run_id: string | null;
  suggestion_type: ResearchSuggestionType;
  payload_json: Record<string, unknown>;
  confidence: number | null;
  source_url: string;
  source_date: string | null;
  evidence_text: string;
  created_by_agent: string | null;
  created_by_user_id: string | null;
  status: ResearchSuggestionStatus;
  rejection_reason: string | null;
  edited_payload_json: Record<string, unknown> | null;
  final_record_id: string | null;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  created_at: string;
};

export type ResearchRunRow = {
  id: string;
  org_id: string;
  project_id: string;
  started_by_user_id: string | null;
  status: "running" | "completed" | "failed" | "cancelled";
  research_goal: string | null;
  started_at: string;
  finished_at: string | null;
  summary: string | null;
  confidence_score: number | null;
  sources_checked: number;
  suggestions_created: number;
  created_at: string;
};

// ── Chain role helpers (mirrors contractor-chain.ts) ─────────────────────────

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner / Operator",
  developer: "Developer",
  epc: "EPC Contractor",
  gc: "General Contractor",
  mep: "MEP Contractor",
  electrical: "Electrical Contractor",
  intermediary: "Labor Intermediary",
  other: "Other",
};

const ROLE_ORDER: Record<string, number> = {
  owner: 10,
  developer: 20,
  epc: 30,
  gc: 40,
  mep: 50,
  electrical: 60,
  intermediary: 70,
  other: 80,
};

// Normalize free-form role text from AI into a valid chain_role enum value.
// AI often returns synonyms or uppercase ("MEP", "OPERATOR", "General Contractor")
// — map them all to canonical lowercase enum values.
function normalizeChainRole(input: unknown): ChainRole {
  const raw = String(input ?? "").toLowerCase().trim();
  if (raw in ROLE_ORDER) return raw as ChainRole;

  // Synonyms / variations
  const synonyms: Record<string, ChainRole> = {
    operator: "owner",
    "owner/operator": "owner",
    "owner / operator": "owner",
    client: "owner",
    "end client": "owner",
    "end-client": "owner",

    "general contractor": "gc",
    "main contractor": "gc",

    "engineering procurement construction": "epc",
    "engineering, procurement, construction": "epc",
    "epc contractor": "epc",

    "mechanical electrical plumbing": "mep",
    "mechanical, electrical, plumbing": "mep",
    "mep contractor": "mep",
    mechanical: "mep",
    hvac: "mep",
    plumbing: "mep",

    "electrical contractor": "electrical",
    electric: "electrical",

    "labor intermediary": "intermediary",
    subcontractor: "intermediary",
    sub: "intermediary",
    staffing: "intermediary",
  };

  if (raw in synonyms) return synonyms[raw];

  // Substring fallback for things like "MEP / Electrical"
  for (const [key, value] of Object.entries(synonyms)) {
    if (raw.includes(key)) return value;
  }
  for (const key of Object.keys(ROLE_ORDER)) {
    if (raw.includes(key)) return key as ChainRole;
  }

  return "other";
}

// ── Audit log ────────────────────────────────────────────────────────────────

export async function logAiToolCall(params: {
  orgId: string;
  userId: string;
  agentName: string;
  toolName: string;
  inputJson: unknown;
  outputJson: unknown;
  projectId?: string | null;
  success: boolean;
  errorMessage?: string;
  durationMs?: number;
}): Promise<void> {
  const svc = createServiceSupabaseClient();
  if (!svc) return;

  await svc.from("ai_tool_calls").insert({
    org_id: params.orgId,
    user_id: params.userId,
    agent_name: params.agentName,
    tool_name: params.toolName,
    input_json: params.inputJson ?? {},
    output_json: params.outputJson ?? {},
    project_id: params.projectId ?? null,
    success: params.success,
    error_message: params.errorMessage ?? null,
    duration_ms: params.durationMs ?? null,
  });
  // fire-and-forget — never throw
}

// ── Research sources ─────────────────────────────────────────────────────────

export async function logResearchSource(params: {
  projectId: string;
  orgId: string;
  sourceUrl: string;
  sourceTitle?: string;
  sourceType?: string;
  sourceDate?: string;
  extractedText?: string;
  relevanceScore?: number;
  researchRunId?: string;
}): Promise<{ id: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) throw new Error("Database unavailable");

  const { data, error } = await svc
    .from("research_sources")
    .insert({
      org_id: params.orgId,
      project_id: params.projectId,
      research_run_id: params.researchRunId ?? null,
      source_url: params.sourceUrl,
      source_title: params.sourceTitle ?? null,
      source_type: params.sourceType ?? null,
      source_date: params.sourceDate ?? null,
      extracted_text: params.extractedText ?? null,
      relevance_score: params.relevanceScore ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return { id: data!.id };
}

export async function listResearchSources(
  projectId: string,
  orgId: string,
): Promise<
  Array<{
    id: string;
    project_id: string;
    org_id: string;
    source_url: string;
    source_title: string | null;
    source_type: string | null;
    source_date: string | null;
    extracted_text: string | null;
    relevance_score: number | null;
    created_at: string;
  }>
> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const { data, error } = await svc
    .from("research_sources")
    .select(
      "id, project_id, org_id, source_url, source_title, source_type, source_date, extracted_text, relevance_score, created_at",
    )
    .eq("project_id", projectId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return [];
  return (data ?? []) as Array<{
    id: string;
    project_id: string;
    org_id: string;
    source_url: string;
    source_title: string | null;
    source_type: string | null;
    source_date: string | null;
    extracted_text: string | null;
    relevance_score: number | null;
    created_at: string;
  }>;
}

// ── Research suggestions ─────────────────────────────────────────────────────

export async function createResearchSuggestion(params: {
  projectId: string;
  orgId: string;
  suggestionType: ResearchSuggestionType;
  payload: Record<string, unknown>;
  confidence?: number;
  sourceUrl: string;
  sourceDate?: string;
  evidenceText: string;
  createdByAgent?: string;
  researchRunId?: string;
}): Promise<{ id: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) throw new Error("Database unavailable");

  const { data, error } = await svc
    .from("research_suggestions")
    .insert({
      org_id: params.orgId,
      project_id: params.projectId,
      research_run_id: params.researchRunId ?? null,
      suggestion_type: params.suggestionType,
      payload_json: params.payload,
      confidence: params.confidence ?? null,
      source_url: params.sourceUrl,
      source_date: params.sourceDate ?? null,
      evidence_text: params.evidenceText,
      created_by_agent: params.createdByAgent ?? null,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return { id: data!.id };
}

export async function listResearchSuggestions(
  projectId: string,
  orgId: string,
  status?: ResearchSuggestionStatus,
): Promise<ResearchSuggestionRow[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  let q = svc
    .from("research_suggestions")
    .select("*")
    .eq("project_id", projectId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as ResearchSuggestionRow[];
}

// ── Accept a suggestion — writes payload into final table ────────────────────

export async function acceptResearchSuggestion(params: {
  suggestionId: string;
  orgId: string;
  userId: string;
  editedPayload?: Record<string, unknown>;
}): Promise<{ ok: boolean; finalRecordId?: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) throw new Error("Database unavailable");

  // Fetch the suggestion (verify org ownership)
  const { data: suggestion, error: fetchErr } = await svc
    .from("research_suggestions")
    .select("*")
    .eq("id", params.suggestionId)
    .eq("org_id", params.orgId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!suggestion) throw new Error("Suggestion not found");
  if (suggestion.status !== "pending") {
    return { ok: true, finalRecordId: suggestion.final_record_id ?? undefined };
  }

  const row = suggestion as ResearchSuggestionRow;
  const payload = params.editedPayload ?? row.payload_json;
  const now = new Date().toISOString();
  const finalStatus = params.editedPayload ? "edited_and_accepted" : "accepted";

  let finalRecordId: string | undefined;

  // Write into final table based on suggestion type
  if (row.suggestion_type === "chain_node") {
    const normalizedRole = normalizeChainRole(payload.role);
    // Preserve the original AI label (e.g. "OPERATOR", "MEP / Electrical") for
    // display, while storing a valid enum in the role column.
    const originalRoleText = String(payload.role ?? "").trim();
    const displayLabel =
      originalRoleText && originalRoleText.toLowerCase() !== normalizedRole
        ? originalRoleText
        : ROLE_LABELS[normalizedRole];

    const companyName = String(payload.company ?? "").trim();
    let companyId: string | null = null;

    if (companyName && companyName.toLowerCase() !== "unknown" && companyName !== "?") {
      // Create or find company in CRM
      const { createCompany, searchAndFilterCompanies } = await import("./companies");
      const existingCompanies = await searchAndFilterCompanies(row.org_id, { search: companyName });
      const exactMatch = existingCompanies.find(c => c.name.toLowerCase() === companyName.toLowerCase());
      
      if (exactMatch) {
        companyId = exactMatch.id;
      } else {
        const result = await createCompany(row.org_id, params.userId, {
          name: companyName,
          company_status: "research",
          priority: "medium",
          sectors: [normalizedRole],
          source_url: row.source_url ?? undefined,
        });
        if (result.ok) {
          companyId = result.id;
        }
      }
    }

    const { upsertChainNode } = await import("./contractor-chain");
    const inserted = await upsertChainNode(
      row.org_id,
      row.project_id,
      {
        role: normalizedRole as ChainRole,
        label: displayLabel,
        company_name: companyName,
        company_id: companyId,
        level: "known",
        confidence: row.confidence ?? null,
        rationale: row.evidence_text.substring(0, 500),
        sort_order: ROLE_ORDER[normalizedRole],
        notes: null,
        created_by: params.userId,
      },
      params.userId
    );

    if (!inserted) {
      throw new Error("Failed to upsert chain node");
    }
    finalRecordId = inserted.id;
  }

  if (row.suggestion_type === "buyer_contact") {
    const { data: inserted, error: insertErr } = await svc
      .from("buyer_contacts")
      .insert({
        organization_id: row.org_id,
        discovered_project_id: row.project_id,
        full_name: String(payload.name ?? ""),
        company_name: payload.company ? String(payload.company) : null,
        job_title: payload.title ? String(payload.title) : null,
        email: payload.email ? String(payload.email) : null,
        linkedin_url: payload.linkedin_url ? String(payload.linkedin_url) : null,
        buyer_role: payload.role_reason ? String(payload.role_reason) : null,
        notes: row.evidence_text.substring(0, 1000),
        created_by: params.userId,
      })
      .select("id")
      .maybeSingle();

    if (insertErr) {
      const { data: existing } = await svc
        .from("buyer_contacts")
        .select("id")
        .eq("organization_id", row.org_id)
        .eq("discovered_project_id", row.project_id)
        .ilike("full_name", String(payload.name ?? ""))
        .ilike("company_name", String(payload.company ?? ""))
        .limit(1);
      if (existing && existing.length > 0) {
        finalRecordId = existing[0].id as string;
      } else {
        throw new Error(insertErr.message);
      }
    } else {
      finalRecordId = inserted?.id;
    }
  }

  if (row.suggestion_type === "package_opportunity") {
    const { id: insertedId } = (await createProjectPackage({
      orgId: row.org_id,
      projectId: row.project_id,
      title: String(payload.title || "Discovered Package"),
      summary: String(payload.summary || row.evidence_text),
      roles: Array.isArray(payload.roles) ? payload.roles.map(String) : [],
      estimatedCrewSize: typeof payload.size === "number" ? payload.size : undefined,
      confidence: row.confidence ?? undefined,
      sourceSuggestionId: row.id,
      contractorNodeId: typeof payload.contractor_node_id === "string" ? payload.contractor_node_id : undefined,
      status: "active",
    })) || {};
    finalRecordId = insertedId;
  }

  // note stays in research_suggestions as the record of truth

  // Update suggestion row
  const { error: updateErr } = await svc
    .from("research_suggestions")
    .update({
      status: finalStatus,
      reviewed_at: now,
      reviewed_by_user_id: params.userId,
      edited_payload_json: params.editedPayload ?? null,
      final_record_id: finalRecordId ?? null,
    })
    .eq("id", params.suggestionId);

  if (updateErr) throw new Error(updateErr.message);

  return { ok: true, finalRecordId };
}

// ── Reject a suggestion ───────────────────────────────────────────────────────

export async function rejectResearchSuggestion(params: {
  suggestionId: string;
  orgId: string;
  userId: string;
  reason: string;
}): Promise<{ ok: boolean }> {
  const svc = createServiceSupabaseClient();
  if (!svc) throw new Error("Database unavailable");

  const { data: suggestion, error: fetchErr } = await svc
    .from("research_suggestions")
    .select("id, org_id, status")
    .eq("id", params.suggestionId)
    .eq("org_id", params.orgId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!suggestion) throw new Error("Suggestion not found");
  if (suggestion.status !== "pending") {
    throw new Error(`Suggestion is already ${suggestion.status}`);
  }

  const { error: updateErr } = await svc
    .from("research_suggestions")
    .update({
      status: "rejected",
      rejection_reason: params.reason.substring(0, 1000),
      reviewed_at: new Date().toISOString(),
      reviewed_by_user_id: params.userId,
    })
    .eq("id", params.suggestionId);

  if (updateErr) throw new Error(updateErr.message);
  return { ok: true };
}

// ── Research runs ─────────────────────────────────────────────────────────────

export async function startResearchRun(params: {
  orgId: string;
  projectId: string;
  userId: string;
  researchGoal?: string;
}): Promise<ResearchRunRow> {
  const svc = createServiceSupabaseClient();
  if (!svc) throw new Error("Database unavailable");

  const { data, error } = await svc
    .from("research_runs")
    .insert({
      org_id: params.orgId,
      project_id: params.projectId,
      started_by_user_id: params.userId,
      research_goal: params.researchGoal ?? null,
      status: "running",
    })
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as ResearchRunRow;
}

export async function completeResearchRun(
  id: string,
  result: {
    status: "completed" | "failed" | "cancelled";
    summary?: string;
    confidenceScore?: number;
    sourcesChecked?: number;
    suggestionsCreated?: number;
  },
): Promise<void> {
  const svc = createServiceSupabaseClient();
  if (!svc) return;

  await svc
    .from("research_runs")
    .update({
      status: result.status,
      finished_at: new Date().toISOString(),
      summary: result.summary ?? null,
      confidence_score: result.confidenceScore ?? null,
      sources_checked: result.sourcesChecked ?? 0,
      suggestions_created: result.suggestionsCreated ?? 0,
    })
    .eq("id", id);
}

export async function listResearchRuns(
  projectId: string,
  orgId: string,
): Promise<ResearchRunRow[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const { data, error } = await svc
    .from("research_runs")
    .select("*")
    .eq("project_id", projectId)
    .eq("org_id", orgId)
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) return [];
  return (data ?? []) as ResearchRunRow[];
}
