import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { type WorkerRow } from "./workers";

export type CompanySearchMatch = {
  id: string;
  name: string;
  company_type: string | null;
  city: string | null;
  country: string | null;
};

/**
 * Search CRM for companies matching a query (name, industry, location)
 */
export async function searchCrmCompanies(params: {
  orgId: string;
  query: string;
}): Promise<CompanySearchMatch[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const { data, error } = await svc
    .from("companies")
    .select("id, name, company_type, city, country")
    .eq("organization_id", params.orgId)
    .or(`name.ilike.%${params.query}%,company_type.ilike.%${params.query}%,city.ilike.%${params.query}%`)
    .limit(10);

  if (error) {
    console.error("searchCrmCompanies error:", error);
    return [];
  }

  return (data ?? []) as CompanySearchMatch[];
}

/**
 * Search talent pool for workers matching skills, languages, or location
 */
export async function searchTalent(params: {
  orgId: string;
  skills?: string[];
  languages?: string[];
  country?: string;
  limit?: number;
}): Promise<WorkerRow[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  let q = svc
    .from("workers")
    .select("*")
    .eq("organization_id", params.orgId)
    .eq("status", "active");

  if (params.skills && params.skills.length > 0) {
    // Search for workers that have at least one of these skills
    q = q.overlaps("skills", params.skills);
  }

  if (params.languages && params.languages.length > 0) {
    q = q.overlaps("languages", params.languages);
  }

  if (params.country) {
    q = q.ilike("country", `%${params.country}%`);
  }

  const { data, error } = await q
    .order("reliability_score", { ascending: false })
    .limit(params.limit ?? 10);

  if (error) {
    console.error("searchTalent error:", error);
    return [];
  }

  return (data ?? []) as WorkerRow[];
}
