import "server-only";
import { createCookieSupabaseClient } from "@/lib/supabase/server";

export type ContactRow = {
  id: string;
  organization_id: string;
  company_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  job_title: string | null;
  role_category: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  linkedin_url: string | null;
  language: string | null;
  country: string | null;
  city: string | null;
  source_url: string | null;
  source_description: string | null;
  data_source: string | null;
  gdpr_lawful_basis: string;
  gdpr_notes: string | null;
  opt_out: boolean;
  do_not_contact: boolean;
  relationship_strength: number;
  priority: string;
  owner_id: string | null;
  last_contact_at: string | null;
  next_action_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

/**
 * Get all contacts for organization
 */
export async function listContacts(
  organizationId: string,
): Promise<ContactRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("do_not_contact", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listContacts error", error);
    return [];
  }
  return data as ContactRow[];
}

/**
 * Get contacts for a specific company
 */
export async function getContactsByCompany(
  companyId: string,
): Promise<ContactRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", companyId)
    .eq("do_not_contact", false)
    .order("relationship_strength", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getContactsByCompany error", error);
    return [];
  }
  return data as ContactRow[];
}

/**
 * Get contact by ID
 */
export async function getContactById(id: string): Promise<ContactRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getContactById error", error);
    return null;
  }
  return data as ContactRow | null;
}

/**
 * Get contacts by priority (for dashboard high-priority contacts)
 */
export async function getHighPriorityContacts(
  organizationId: string,
  limit: number = 5,
): Promise<ContactRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("do_not_contact", false)
    .in("priority", ["high", "critical"])
    .order("relationship_strength", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getHighPriorityContacts error", error);
    return [];
  }
  return data as ContactRow[];
}

/**
 * Create new contact
 */
export async function createContact(
  organizationId: string,
  data: Omit<ContactRow, "id" | "created_at" | "updated_at" | "organization_id">,
): Promise<ContactRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data: newContact, error } = await supabase
    .from("contacts")
    .insert([
      {
        ...data,
        organization_id: organizationId,
      },
    ])
    .select()
    .maybeSingle();

  if (error) {
    console.error("createContact error", error);
    return null;
  }
  return newContact as ContactRow | null;
}

/**
 * Update contact
 */
export async function updateContact(
  id: string,
  data: Partial<Omit<ContactRow, "id" | "created_at" | "organization_id">>,
): Promise<ContactRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data: updated, error } = await supabase
    .from("contacts")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("updateContact error", error);
    return null;
  }
  return updated as ContactRow | null;
}

/**
 * Record contact interaction
 */
export async function recordContactInteraction(
  contactId: string,
  nextActionAt?: string,
): Promise<boolean> {
  return updateContact(contactId, {
    last_contact_at: new Date().toISOString(),
    next_action_at: nextActionAt,
  }).then((result) => result !== null);
}
