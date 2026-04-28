import "server-only";
import { createCookieSupabaseClient } from "@/lib/supabase/server";

export type SectorRow = {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  responsible_user_id: string | null;
  search_keywords: string[];
  excluded_keywords: string[];
  target_countries: string[];
  typical_roles: string[];
  created_at: string;
  updated_at: string;
};

export type Sector = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  isActive: boolean;
  responsibleUserId?: string;
  searchKeywords: string[];
  excludedKeywords: string[];
  targetCountries: string[];
  typicalRoles: string[];
};

export function rowToSector(row: SectorRow): Sector {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    icon: row.icon ?? "briefcase",
    color: row.color ?? "#0ea5e9",
    isActive: row.is_active,
    responsibleUserId: row.responsible_user_id ?? undefined,
    searchKeywords: row.search_keywords ?? [],
    excludedKeywords: row.excluded_keywords ?? [],
    targetCountries: row.target_countries ?? [],
    typicalRoles: row.typical_roles ?? [],
  };
}

export async function listSectors(
  organizationId: string,
): Promise<SectorRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("sectors")
    .select("*")
    .eq("organization_id", organizationId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    console.error("listSectors error", error);
    return [];
  }
  return data as SectorRow[];
}

export async function listActiveSectors(
  organizationId: string,
): Promise<SectorRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("sectors")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("listActiveSectors error", error);
    return [];
  }
  return data as SectorRow[];
}

export async function getSectorBySlug(
  organizationId: string,
  slug: string,
): Promise<SectorRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("sectors")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("getSectorBySlug error", error);
    return null;
  }
  return data as SectorRow | null;
}

export async function getSectorById(id: string): Promise<SectorRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("sectors")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getSectorById error", error);
    return null;
  }
  return data as SectorRow | null;
}
