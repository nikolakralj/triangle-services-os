import "server-only";
import { createCookieSupabaseClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";

export type CompanyRow = {
  id: string;
  organization_id: string;
  name: string;
  legal_name: string | null;
  company_type: string | null;
  company_status: string;
  country: string | null;
  region: string | null;
  city: string | null;
  website: string | null;
  website_domain: string | null;
  linkedin_url: string | null;
  source_url: string | null;
  sectors: string[] | null;
  target_countries: string[] | null;
  priority: string;
  lead_score: number;
  lead_score_reason: string | null;
  owner_id: string | null;
  description: string | null;
  pain_points: string | null;
  notes: string | null;
  research_status: string;
  do_not_contact: boolean;
  last_contact_at: string | null;
  next_action_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function listCompanies(
  organizationId: string,
): Promise<CompanyRow[]> {
  const { createServiceSupabaseClient } = await import("@/lib/supabase/server");
  const supabase = createServiceSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listCompanies error", error);
    return [];
  }
  return data as CompanyRow[];
}

export async function getCompanyById(id: string): Promise<CompanyRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getCompanyById error", error);
    return null;
  }
  return data as CompanyRow | null;
}

function extractDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const url = input.startsWith("http") ? input : `https://${input}`;
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export type CompanyInput = Partial<CompanyRow> & { name: string };

export function rowToCompany(r: CompanyRow): Company {
  return {
    id: r.id,
    name: r.name,
    legalName: r.legal_name ?? undefined,
    companyType: r.company_type ?? "other",
    status: (r.company_status as Company["status"]) ?? "research",
    country: r.country ?? "",
    region: r.region ?? undefined,
    city: r.city ?? "",
    website: r.website ?? "",
    websiteDomain: r.website_domain ?? "",
    linkedinUrl: r.linkedin_url ?? undefined,
    sourceUrl: r.source_url ?? undefined,
    sectors: r.sectors ?? [],
    targetCountries: r.target_countries ?? [],
    priority: (r.priority as Company["priority"]) ?? "medium",
    leadScore: r.lead_score ?? 0,
    leadScoreReason: r.lead_score_reason ?? "",
    ownerId: r.owner_id ?? undefined,
    description: r.description ?? "",
    painPoints: r.pain_points ?? undefined,
    notes: r.notes ?? undefined,
    researchStatus:
      (r.research_status as Company["researchStatus"]) ?? "not_reviewed",
    doNotContact: r.do_not_contact ?? false,
    lastContactAt: r.last_contact_at ?? undefined,
    nextActionAt: r.next_action_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Search and filter companies
 */
export async function searchAndFilterCompanies(
  organizationId: string,
  options: {
    search?: string;
    status?: string;
    sector?: string;
    country?: string;
    priority?: string;
    ownerId?: string;
  },
): Promise<CompanyRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from("companies")
    .select("*")
    .eq("organization_id", organizationId);

  // Apply filters
  if (options.status && options.status !== "all") {
    query = query.eq("company_status", options.status);
  }
  if (options.sector && options.sector !== "all") {
    query = query.contains("sectors", [options.sector]);
  }
  if (options.country && options.country !== "all") {
    query = query.eq("country", options.country);
  }
  if (options.priority && options.priority !== "all") {
    query = query.eq("priority", options.priority);
  }
  if (options.ownerId && options.ownerId !== "all") {
    query = query.eq("owner_id", options.ownerId);
  }

  // Apply search
  if (options.search && options.search.trim()) {
    const searchTerm = options.search.toLowerCase();
    query = query.or(
      `name.ilike.%${searchTerm}%,legal_name.ilike.%${searchTerm}%,website_domain.ilike.%${searchTerm}%`,
    );
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("searchAndFilterCompanies error", error);
    return [];
  }
  return data as CompanyRow[];
}

/**
 * Get unique company statuses for filter dropdown
 */
export async function getCompanyStatuses(
  organizationId: string,
): Promise<string[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("companies")
    .select("company_status")
    .eq("organization_id", organizationId)
    .not("company_status", "is", null);

  if (error) {
    console.error("getCompanyStatuses error", error);
    return [];
  }

  return [
    ...new Set((data as { company_status: string }[]).map((c) => c.company_status)),
  ].sort();
}

/**
 * Get unique sectors for filter dropdown
 */
export async function getCompanySectors(
  organizationId: string,
): Promise<string[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("companies")
    .select("sectors")
    .eq("organization_id", organizationId)
    .not("sectors", "is", null);

  if (error) {
    console.error("getCompanySectors error", error);
    return [];
  }

  const sectors = new Set<string>();
  (data as { sectors: string[] | null }[]).forEach((row) => {
    row.sectors?.forEach((s) => sectors.add(s));
  });
  return Array.from(sectors).sort();
}

/**
 * Get unique countries for filter dropdown
 */
export async function getCompanyCountries(
  organizationId: string,
): Promise<string[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("companies")
    .select("country")
    .eq("organization_id", organizationId)
    .not("country", "is", null);

  if (error) {
    console.error("getCompanyCountries error", error);
    return [];
  }

  return [
    ...new Set((data as { country: string }[]).map((c) => c.country)),
  ].sort();
}

export async function createCompany(
  organizationId: string,
  userId: string,
  input: CompanyInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase not configured" };

  const domain = extractDomain(input.website ?? input.website_domain);

  // Dedupe by domain within the same org
  if (domain) {
    const { data: existing } = await supabase
      .from("companies")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("website_domain", domain)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return { ok: false, error: `Company already exists: ${existing.name}` };
    }
  }

  const { data, error } = await supabase
    .from("companies")
    .insert({
      ...input,
      website_domain: domain,
      organization_id: organizationId,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export async function updateCompany(
  id: string,
  userId: string,
  patch: Partial<CompanyRow>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase not configured" };

  const updates: Partial<CompanyRow> & { updated_by: string } = {
    ...patch,
    updated_by: userId,
  };

  if (patch.website) {
    updates.website_domain = extractDomain(patch.website);
  }

  const { error } = await supabase
    .from("companies")
    .update(updates)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteCompany(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
