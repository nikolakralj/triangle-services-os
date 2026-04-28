import "server-only";
import {
  createCookieSupabaseClient,
  createServiceSupabaseClient,
} from "@/lib/supabase/server";

export type HuntRunRow = {
  id: string;
  organization_id: string;
  sector_id: string | null;
  trigger_source_id: string | null;
  triggered_by: "manual" | "cron" | "api";
  triggered_by_user_id: string | null;
  status: "running" | "success" | "failed" | "partial";
  sources_queried: number;
  raw_results_count: number;
  ai_classified_count: number;
  duplicates_filtered: number;
  new_projects_inserted: number;
  ai_tokens_used: number;
  ai_cost_usd: number | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  log_summary: string | null;
  created_at: string;
};

export type HuntRun = {
  id: string;
  sectorId?: string;
  triggeredBy: string;
  status: string;
  sourcesQueried: number;
  rawResultsCount: number;
  aiClassifiedCount: number;
  duplicatesFiltered: number;
  newProjectsInserted: number;
  aiTokensUsed: number;
  aiCostUsd?: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  errorMessage?: string;
  logSummary?: string;
};

export function rowToHuntRun(row: HuntRunRow): HuntRun {
  return {
    id: row.id,
    sectorId: row.sector_id ?? undefined,
    triggeredBy: row.triggered_by,
    status: row.status,
    sourcesQueried: row.sources_queried ?? 0,
    rawResultsCount: row.raw_results_count ?? 0,
    aiClassifiedCount: row.ai_classified_count ?? 0,
    duplicatesFiltered: row.duplicates_filtered ?? 0,
    newProjectsInserted: row.new_projects_inserted ?? 0,
    aiTokensUsed: row.ai_tokens_used ?? 0,
    aiCostUsd: row.ai_cost_usd ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    errorMessage: row.error_message ?? undefined,
    logSummary: row.log_summary ?? undefined,
  };
}

export async function listHuntRuns(
  organizationId: string,
  options: { sectorId?: string; limit?: number } = {},
): Promise<HuntRunRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from("hunt_runs")
    .select("*")
    .eq("organization_id", organizationId);

  if (options.sectorId) query = query.eq("sector_id", options.sectorId);

  query = query.order("started_at", { ascending: false });
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) {
    console.error("listHuntRuns error", error);
    return [];
  }
  return data as HuntRunRow[];
}

export async function startHuntRun(params: {
  organizationId: string;
  sectorId?: string;
  triggeredBy: "manual" | "cron" | "api";
  triggeredByUserId?: string;
}): Promise<HuntRunRow | null> {
  const service = createServiceSupabaseClient();
  if (!service) return null;

  const { data, error } = await service
    .from("hunt_runs")
    .insert([
      {
        organization_id: params.organizationId,
        sector_id: params.sectorId ?? null,
        triggered_by: params.triggeredBy,
        triggered_by_user_id: params.triggeredByUserId ?? null,
        status: "running",
      },
    ])
    .select()
    .maybeSingle();

  if (error) {
    console.error("startHuntRun error", error);
    return null;
  }
  return data as HuntRunRow | null;
}

export async function completeHuntRun(
  id: string,
  result: {
    status: "success" | "failed" | "partial";
    sourcesQueried?: number;
    rawResultsCount?: number;
    aiClassifiedCount?: number;
    duplicatesFiltered?: number;
    newProjectsInserted?: number;
    aiTokensUsed?: number;
    aiCostUsd?: number;
    errorMessage?: string;
    logSummary?: string;
    startedAt: string;
  },
): Promise<boolean> {
  const service = createServiceSupabaseClient();
  if (!service) return false;

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - new Date(result.startedAt).getTime();

  const { error } = await service
    .from("hunt_runs")
    .update({
      status: result.status,
      sources_queried: result.sourcesQueried ?? 0,
      raw_results_count: result.rawResultsCount ?? 0,
      ai_classified_count: result.aiClassifiedCount ?? 0,
      duplicates_filtered: result.duplicatesFiltered ?? 0,
      new_projects_inserted: result.newProjectsInserted ?? 0,
      ai_tokens_used: result.aiTokensUsed ?? 0,
      ai_cost_usd: result.aiCostUsd ?? null,
      error_message: result.errorMessage ?? null,
      log_summary: result.logSummary ?? null,
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
    })
    .eq("id", id);

  return !error;
}
