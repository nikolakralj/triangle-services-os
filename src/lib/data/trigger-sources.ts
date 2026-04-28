import "server-only";
import {
  createCookieSupabaseClient,
  createServiceSupabaseClient,
} from "@/lib/supabase/server";

export type TriggerSourceRow = {
  id: string;
  organization_id: string;
  sector_id: string | null;
  name: string;
  source_type: "rss" | "web" | "api" | "manual" | "web_search";
  url: string | null;
  config: Record<string, unknown>;
  is_active: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  last_results_count: number;
  total_results_count: number;
  created_at: string;
  updated_at: string;
};

export async function listTriggerSources(
  organizationId: string,
  sectorId?: string,
): Promise<TriggerSourceRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from("trigger_sources")
    .select("*")
    .eq("organization_id", organizationId);

  if (sectorId) query = query.eq("sector_id", sectorId);

  const { data, error } = await query.order("name", { ascending: true });
  if (error) {
    console.error("listTriggerSources error", error);
    return [];
  }
  return data as TriggerSourceRow[];
}

export async function getActiveTriggerSourcesForSector(
  organizationId: string,
  sectorId: string,
): Promise<TriggerSourceRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("trigger_sources")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("sector_id", sectorId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("getActiveTriggerSourcesForSector error", error);
    return [];
  }
  return data as TriggerSourceRow[];
}

export async function updateTriggerSourceRunStatus(
  id: string,
  status: string,
  message: string,
  resultsCount: number,
): Promise<boolean> {
  const service = createServiceSupabaseClient();
  if (!service) return false;

  // Get current total to increment
  const { data: current } = await service
    .from("trigger_sources")
    .select("total_results_count")
    .eq("id", id)
    .maybeSingle();

  const newTotal =
    ((current as { total_results_count: number } | null)?.total_results_count ?? 0) +
    resultsCount;

  const { error } = await service
    .from("trigger_sources")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: status,
      last_run_message: message,
      last_results_count: resultsCount,
      total_results_count: newTotal,
    })
    .eq("id", id);

  return !error;
}
