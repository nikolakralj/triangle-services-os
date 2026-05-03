import "server-only";
import {
  createCookieSupabaseClient,
  createServiceSupabaseClient,
} from "@/lib/supabase/server";

export type DiscoveredProjectRow = {
  id: string;
  organization_id: string;
  sector_id: string | null;
  project_name: string;
  client_company: string | null;
  general_contractor: string | null;
  country: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  project_type: string | null;
  capacity: string | null;
  estimated_value_eur: number | null;
  phase: string | null;
  phase_confidence: number | null;
  estimated_start_date: string | null;
  estimated_completion_date: string | null;
  peak_workforce_month: string | null;
  estimated_crew_size: number | null;
  crew_breakdown: Record<string, number> | null;
  source_url: string | null;
  source_type: string | null;
  source_text: string | null;
  source_date: string | null;
  trigger_source_id: string | null;
  ai_summary: string | null;
  ai_opportunity_score: number | null;
  ai_match_score: number | null;
  ai_match_reasoning: string | null;
  ai_next_actions: string[];
  ai_extracted_at: string | null;
  ai_model: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  promoted_to_opportunity_id: string | null;
  promoted_at: string | null;
  promoted_by: string | null;
  fingerprint: string | null;
  created_at: string;
  updated_at: string;
};

export type DiscoveredProject = {
  id: string;
  sectorId?: string;
  projectName: string;
  clientCompany?: string;
  generalContractor?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
  projectType?: string;
  capacity?: string;
  estimatedValueEur?: number;
  phase?: string;
  phaseConfidence?: number;
  estimatedStartDate?: string;
  estimatedCompletionDate?: string;
  peakWorkforceMonth?: string;
  estimatedCrewSize?: number;
  crewBreakdown?: Record<string, number>;
  sourceUrl?: string;
  sourceType?: string;
  sourceText?: string;
  sourceDate?: string;
  aiSummary?: string;
  aiOpportunityScore?: number;
  aiMatchScore?: number;
  aiMatchReasoning?: string;
  aiNextActions: string[];
  aiExtractedAt?: string;
  aiModel?: string;
  status: string;
  promotedToOpportunityId?: string;
  createdAt: string;
};

export function rowToDiscoveredProject(
  row: DiscoveredProjectRow,
): DiscoveredProject {
  return {
    id: row.id,
    sectorId: row.sector_id ?? undefined,
    projectName: row.project_name,
    clientCompany: row.client_company ?? undefined,
    generalContractor: row.general_contractor ?? undefined,
    country: row.country ?? undefined,
    countryCode: row.country_code ?? undefined,
    region: row.region ?? undefined,
    city: row.city ?? undefined,
    projectType: row.project_type ?? undefined,
    capacity: row.capacity ?? undefined,
    estimatedValueEur: row.estimated_value_eur ?? undefined,
    phase: row.phase ?? undefined,
    phaseConfidence: row.phase_confidence ?? undefined,
    estimatedStartDate: row.estimated_start_date ?? undefined,
    estimatedCompletionDate: row.estimated_completion_date ?? undefined,
    peakWorkforceMonth: row.peak_workforce_month ?? undefined,
    estimatedCrewSize: row.estimated_crew_size ?? undefined,
    crewBreakdown: row.crew_breakdown ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    sourceType: row.source_type ?? undefined,
    sourceText: row.source_text ?? undefined,
    sourceDate: row.source_date ?? undefined,
    aiSummary: row.ai_summary ?? undefined,
    aiOpportunityScore: row.ai_opportunity_score ?? undefined,
    aiMatchScore: row.ai_match_score ?? undefined,
    aiMatchReasoning: row.ai_match_reasoning ?? undefined,
    aiNextActions: row.ai_next_actions ?? [],
    aiExtractedAt: row.ai_extracted_at ?? undefined,
    aiModel: row.ai_model ?? undefined,
    status: row.status,
    promotedToOpportunityId: row.promoted_to_opportunity_id ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listDiscoveredProjects(
  organizationId: string,
  options: {
    sectorId?: string;
    status?: string;
    countryCode?: string;
    limit?: number;
  } = {},
): Promise<DiscoveredProjectRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from("discovered_projects")
    .select("*")
    .eq("organization_id", organizationId);

  if (options.sectorId) query = query.eq("sector_id", options.sectorId);
  if (options.status) query = query.eq("status", options.status);
  if (options.countryCode) query = query.eq("country_code", options.countryCode);

  query = query
    .order("ai_opportunity_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) {
    console.error("listDiscoveredProjects error", error);
    return [];
  }
  return data as DiscoveredProjectRow[];
}

export async function getDiscoveredProjectById(
  id: string,
): Promise<DiscoveredProjectRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("discovered_projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getDiscoveredProjectById error", error);
    return null;
  }
  return data as DiscoveredProjectRow | null;
}

/**
 * Insert a discovered project (used by the Hunter).
 * Uses service client because hunter runs server-side without user session.
 */
export async function insertDiscoveredProject(
  organizationId: string,
  data: Partial<DiscoveredProjectRow> & { project_name: string },
): Promise<DiscoveredProjectRow | null> {
  const service = createServiceSupabaseClient();
  if (!service) return null;

  const { data: inserted, error } = await service
    .from("discovered_projects")
    .insert([{ ...data, organization_id: organizationId }])
    .select()
    .maybeSingle();

  if (error) {
    console.error("insertDiscoveredProject error", error);
    return null;
  }
  return inserted as DiscoveredProjectRow | null;
}

/**
 * Check if a project with this fingerprint already exists (dedup)
 */
export async function findByFingerprint(
  organizationId: string,
  fingerprint: string,
): Promise<DiscoveredProjectRow | null> {
  const service = createServiceSupabaseClient();
  if (!service) return null;

  const { data, error } = await service
    .from("discovered_projects")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (error) {
    console.error("findByFingerprint error", error);
    return null;
  }
  return data as DiscoveredProjectRow | null;
}

export async function updateDiscoveredProjectStatus(
  id: string,
  status: string,
): Promise<boolean> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from("discovered_projects")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  return !error;
}

export async function getDiscoveredProjectStats(
  organizationId: string,
  sectorId?: string,
): Promise<{
  total: number;
  newCount: number;
  qualifiedCount: number;
  pursuingCount: number;
  wonCount: number;
}> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) {
    return { total: 0, newCount: 0, qualifiedCount: 0, pursuingCount: 0, wonCount: 0 };
  }

  let query = supabase
    .from("discovered_projects")
    .select("status")
    .eq("organization_id", organizationId);

  if (sectorId) query = query.eq("sector_id", sectorId);

  const { data, error } = await query;
  if (error || !data) {
    return { total: 0, newCount: 0, qualifiedCount: 0, pursuingCount: 0, wonCount: 0 };
  }

  const rows = data as { status: string }[];
  return {
    total: rows.length,
    newCount: rows.filter((r) => r.status === "new").length,
    qualifiedCount: rows.filter((r) => r.status === "qualified").length,
    pursuingCount: rows.filter((r) => r.status === "pursuing").length,
    wonCount: rows.filter((r) => r.status === "won").length,
  };
}

/**
 * Get names + countries of all already-known projects for a sector.
 * Used to build the exclusion list in Hunter prompts.
 */
export async function getKnownProjectNames(
  organizationId: string,
  sectorId?: string,
): Promise<Array<{ name: string; country: string | null }>> {
  const service = createServiceSupabaseClient();
  if (!service) return [];

  let query = service
    .from("discovered_projects")
    .select("project_name, country")
    .eq("organization_id", organizationId)
    .not("status", "eq", "duplicate");

  if (sectorId) query = query.eq("sector_id", sectorId);

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as { project_name: string; country: string | null }[]).map((r) => ({
    name: r.project_name,
    country: r.country,
  }));
}
