import "server-only";
import { createCookieSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase/server";

export * from "./contractor-chain-shared";

// ─── Contractor chain CRUD ─────────────────────────────────────────────────

export async function getChainNodes(
  discoveredProjectId: string,
  organizationId?: string,
): Promise<ContractorChainNodeRow[]> {
  const supabase = organizationId
    ? createServiceSupabaseClient()
    : await createCookieSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from("contractor_chain_nodes")
    .select("*")
    .eq("discovered_project_id", discoveredProjectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;

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

  // Find existing node to prevent duplicates
  let query = service
    .from("contractor_chain_nodes")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("discovered_project_id", discoveredProjectId)
    .eq("role", node.role);

  if (node.company_name) {
    query = query.eq("company_name", node.company_name);
  } else {
    query = query.is("company_name", null);
  }

  const { data: existing } = await query.limit(1).maybeSingle();

  if (existing) {
    const { data, error } = await service
      .from("contractor_chain_nodes")
      .update({
        ...node,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("upsertChainNode update error", error);
      return null;
    }
    return data as ContractorChainNodeRow | null;
  }

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
    console.error("upsertChainNode insert error", error);
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
  organizationId?: string,
): Promise<BuyerContactRow[]> {
  const supabase = organizationId
    ? createServiceSupabaseClient()
    : await createCookieSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from("buyer_contacts")
    .select("*")
    .eq("discovered_project_id", discoveredProjectId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;

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
