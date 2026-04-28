import "server-only";
import { createCookieSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase/server";

export type ChainKnowledgeLevel = "known" | "inferred" | "unknown";

export type ChainRole =
  | "owner"
  | "developer"
  | "epc"
  | "gc"
  | "mep"
  | "electrical"
  | "intermediary"
  | "other";

export type ContractorChainNodeRow = {
  id: string;
  organization_id: string;
  discovered_project_id: string;
  role: ChainRole;
  label: string;
  company_name: string | null;
  company_id: string | null;
  level: ChainKnowledgeLevel;
  confidence: number | null;
  rationale: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type BuyerContactRow = {
  id: string;
  organization_id: string;
  discovered_project_id: string;
  chain_node_id: string | null;
  contact_id: string | null;
  full_name: string | null;
  job_title: string | null;
  company_name: string | null;
  email: string | null;
  linkedin_url: string | null;
  buyer_role: string | null;
  priority: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

// ─── Role display labels ───────────────────────────────────────────────────

export const CHAIN_ROLE_LABELS: Record<ChainRole, string> = {
  owner: "Owner / operator",
  developer: "Developer",
  epc: "EPC contractor",
  gc: "General contractor",
  mep: "MEP contractor",
  electrical: "Electrical contractor",
  intermediary: "Labor intermediary",
  other: "Other",
};

// Default sort order per role
export const CHAIN_ROLE_ORDER: Record<ChainRole, number> = {
  owner: 0,
  developer: 1,
  epc: 2,
  gc: 3,
  mep: 4,
  electrical: 5,
  intermediary: 6,
  other: 7,
};

// ─── Contractor chain CRUD ─────────────────────────────────────────────────

export async function getChainNodes(
  discoveredProjectId: string,
): Promise<ContractorChainNodeRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("contractor_chain_nodes")
    .select("*")
    .eq("discovered_project_id", discoveredProjectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getChainNodes error", error);
    return [];
  }
  return data as ContractorChainNodeRow[];
}

export async function upsertChainNode(
  organizationId: string,
  discoveredProjectId: string,
  node: Omit<ContractorChainNodeRow, "id" | "created_at" | "updated_at" | "organization_id" | "discovered_project_id">,
  createdBy?: string,
): Promise<ContractorChainNodeRow | null> {
  const service = createServiceSupabaseClient();
  if (!service) return null;

  const { data, error } = await service
    .from("contractor_chain_nodes")
    .insert({
      ...node,
      organization_id: organizationId,
      discovered_project_id: discoveredProjectId,
      created_by: createdBy ?? null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error("upsertChainNode error", error);
    return null;
  }
  return data as ContractorChainNodeRow | null;
}

export async function updateChainNode(
  id: string,
  organizationId: string,
  updates: Partial<Pick<ContractorChainNodeRow, "company_name" | "company_id" | "level" | "confidence" | "rationale" | "notes" | "label">>,
): Promise<boolean> {
  const service = createServiceSupabaseClient();
  if (!service) return false;

  const { error } = await service
    .from("contractor_chain_nodes")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("updateChainNode error", error);
    return false;
  }
  return true;
}

export async function deleteChainNode(
  id: string,
  organizationId: string,
): Promise<boolean> {
  const service = createServiceSupabaseClient();
  if (!service) return false;

  const { error } = await service
    .from("contractor_chain_nodes")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("deleteChainNode error", error);
    return false;
  }
  return true;
}

// ─── Seed from AI inference ────────────────────────────────────────────────

/**
 * Called once after a hunt run to seed inferred chain nodes from AI output.
 * Only inserts roles not already present.
 */
export async function seedChainFromAI(
  organizationId: string,
  discoveredProjectId: string,
  seeds: Array<{
    role: ChainRole;
    companyName?: string;
    level: ChainKnowledgeLevel;
    confidence?: number;
    rationale?: string;
  }>,
  createdBy?: string,
): Promise<void> {
  const service = createServiceSupabaseClient();
  if (!service) return;

  // Get existing roles to avoid duplicates
  const { data: existing } = await service
    .from("contractor_chain_nodes")
    .select("role")
    .eq("discovered_project_id", discoveredProjectId);

  const existingRoles = new Set((existing ?? []).map((r: { role: string }) => r.role));

  const toInsert = seeds
    .filter((s) => !existingRoles.has(s.role) && (s.companyName || s.level !== "unknown"))
    .map((s) => ({
      organization_id: organizationId,
      discovered_project_id: discoveredProjectId,
      role: s.role,
      label: CHAIN_ROLE_LABELS[s.role],
      company_name: s.companyName ?? null,
      level: s.level,
      confidence: s.confidence ?? null,
      rationale: s.rationale ?? null,
      notes: null,
      sort_order: CHAIN_ROLE_ORDER[s.role],
      created_by: createdBy ?? null,
    }));

  if (toInsert.length === 0) return;

  const { error } = await service.from("contractor_chain_nodes").insert(toInsert);

  if (error) {
    console.error("seedChainFromAI error", error);
  }
}

// ─── Buyer contacts CRUD ───────────────────────────────────────────────────

export async function getBuyerContacts(
  discoveredProjectId: string,
): Promise<BuyerContactRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("buyer_contacts")
    .select("*")
    .eq("discovered_project_id", discoveredProjectId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getBuyerContacts error", error);
    return [];
  }
  return data as BuyerContactRow[];
}

export async function createBuyerContact(
  organizationId: string,
  discoveredProjectId: string,
  contact: Omit<BuyerContactRow, "id" | "created_at" | "updated_at" | "organization_id" | "discovered_project_id">,
  createdBy?: string,
): Promise<BuyerContactRow | null> {
  const service = createServiceSupabaseClient();
  if (!service) return null;

  const { data, error } = await service
    .from("buyer_contacts")
    .insert({
      ...contact,
      organization_id: organizationId,
      discovered_project_id: discoveredProjectId,
      created_by: createdBy ?? null,
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error("createBuyerContact error", error);
    return null;
  }
  return data as BuyerContactRow | null;
}

export async function deleteBuyerContact(
  id: string,
  organizationId: string,
): Promise<boolean> {
  const service = createServiceSupabaseClient();
  if (!service) return false;

  const { error } = await service
    .from("buyer_contacts")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("deleteBuyerContact error", error);
    return false;
  }
  return true;
}
