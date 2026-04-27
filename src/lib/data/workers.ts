import "server-only";
import { createCookieSupabaseClient } from "@/lib/supabase/server";
import type { Worker } from "@/lib/types";

export type WorkerRow = {
  id: string;
  organization_id: string;
  full_name: string;
  role: string;
  worker_type: string;
  email: string | null;
  phone: string | null;
  country: string;
  city: string | null;
  languages: string[];
  skills: string[];
  certificates: string[];
  industries: string[];
  availability_status: "available" | "available_soon" | "busy" | "unknown" | "do_not_use";
  available_from: string | null;
  preferred_countries: string[];
  hourly_rate_expectation: number | null;
  daily_rate_expectation: number | null;
  currency: "EUR";
  reliability_score: number;
  quality_score: number;
  safety_score: number;
  has_a1_possible: boolean;
  has_own_tools: boolean;
  has_car: boolean;
  status: "active" | "inactive" | "blacklisted" | "candidate";
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

/**
 * Convert database row to UI type for Worker
 */
export function rowToWorker(row: WorkerRow): Worker {
  return {
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    workerType: row.worker_type,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    country: row.country,
    city: row.city ?? undefined,
    languages: row.languages,
    skills: row.skills,
    certificates: row.certificates,
    industries: row.industries,
    availabilityStatus: row.availability_status,
    availableFrom: row.available_from ?? undefined,
    preferredCountries: row.preferred_countries,
    hourlyRateExpectation: row.hourly_rate_expectation ?? undefined,
    dailyRateExpectation: row.daily_rate_expectation ?? undefined,
    currency: row.currency,
    reliabilityScore: row.reliability_score,
    qualityScore: row.quality_score,
    safetyScore: row.safety_score,
    hasA1Possible: row.has_a1_possible,
    hasOwnTools: row.has_own_tools,
    hasCar: row.has_car,
    status: row.status,
  };
}

/**
 * Get all workers for organization
 */
export async function listWorkers(
  organizationId: string,
): Promise<WorkerRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("listWorkers error", error);
    return [];
  }
  return data as WorkerRow[];
}

/**
 * Get worker by ID
 */
export async function getWorkerById(id: string): Promise<WorkerRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getWorkerById error", error);
    return null;
  }
  return data as WorkerRow | null;
}

/**
 * Get available workers
 */
export async function getAvailableWorkers(
  organizationId: string,
): Promise<WorkerRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("availability_status", ["available", "available_soon"])
    .order("reliability_score", { ascending: false })
    .order("full_name", { ascending: true });

  if (error) {
    console.error("getAvailableWorkers error", error);
    return [];
  }
  return data as WorkerRow[];
}

/**
 * Get workers by skill
 */
export async function getWorkersBySkill(
  organizationId: string,
  skill: string,
): Promise<WorkerRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .contains("skills", [skill])
    .order("reliability_score", { ascending: false });

  if (error) {
    console.error("getWorkersBySkill error", error);
    return [];
  }
  return data as WorkerRow[];
}

/**
 * Get workers by country
 */
export async function getWorkersByCountry(
  organizationId: string,
  country: string,
): Promise<WorkerRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("country", country)
    .eq("status", "active")
    .order("reliability_score", { ascending: false });

  if (error) {
    console.error("getWorkersByCountry error", error);
    return [];
  }
  return data as WorkerRow[];
}

/**
 * Create new worker
 */
export async function createWorker(
  organizationId: string,
  data: Omit<WorkerRow, "id" | "created_at" | "updated_at" | "organization_id">,
): Promise<WorkerRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data: newWorker, error } = await supabase
    .from("workers")
    .insert([
      {
        ...data,
        organization_id: organizationId,
      },
    ])
    .select()
    .maybeSingle();

  if (error) {
    console.error("createWorker error", error);
    return null;
  }
  return newWorker as WorkerRow | null;
}

/**
 * Update worker
 */
export async function updateWorker(
  id: string,
  data: Partial<Omit<WorkerRow, "id" | "created_at" | "organization_id">>,
): Promise<WorkerRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data: updated, error } = await supabase
    .from("workers")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("updateWorker error", error);
    return null;
  }
  return updated as WorkerRow | null;
}
