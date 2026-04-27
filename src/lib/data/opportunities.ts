import "server-only";
import { createCookieSupabaseClient } from "@/lib/supabase/server";
import type { PipelineStage, Opportunity } from "@/lib/types";

export type PipelineStageRow = {
  id: string;
  organization_id: string;
  key: string;
  name: string;
  description: string | null;
  sort_order: number;
  color: string | null;
  is_default: boolean;
  is_won: boolean;
  is_lost: boolean;
  created_at: string;
  updated_at: string;
};

export type OpportunityRow = {
  id: string;
  organization_id: string;
  company_id: string | null;
  primary_contact_id: string | null;
  stage_id: string | null;
  title: string;
  opportunity_type: string | null;
  sector: string | null;
  country: string | null;
  city: string | null;
  site_location: string | null;
  estimated_value: number | null;
  estimated_monthly_value: number | null;
  currency: string;
  probability: number;
  estimated_crew_size: number | null;
  estimated_supervisors: number | null;
  expected_start_date: string | null;
  expected_end_date: string | null;
  expected_duration_weeks: number | null;
  scope_summary: string | null;
  client_need: string | null;
  pain_points: string | null;
  required_documents: string | null;
  language_requirements: string | null;
  certification_requirements: string | null;
  pricing_notes: string | null;
  risk_notes: string | null;
  next_step: string | null;
  owner_id: string | null;
  next_action_at: string | null;
  status: string;
  lost_reason: string | null;
  won_at: string | null;
  lost_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

/**
 * Convert database row to UI type for PipelineStage
 */
export function rowToPipelineStage(row: PipelineStageRow): PipelineStage {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description ?? "",
    sortOrder: row.sort_order,
    color: row.color ?? "#94a3b8",
    isWon: row.is_won,
    isLost: row.is_lost,
  };
}

/**
 * Convert database row to UI type for Opportunity
 */
export function rowToOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    companyId: row.company_id ?? "",
    primaryContactId: row.primary_contact_id ?? undefined,
    stageId: row.stage_id ?? "",
    title: row.title,
    opportunityType: row.opportunity_type ?? "general",
    sector: row.sector ?? "",
    country: row.country ?? "",
    city: row.city ?? undefined,
    siteLocation: row.site_location ?? undefined,
    estimatedValue: row.estimated_value ?? undefined,
    estimatedMonthlyValue: row.estimated_monthly_value ?? undefined,
    currency: (row.currency as Opportunity["currency"]) ?? "EUR",
    probability: row.probability ?? 0,
    estimatedCrewSize: row.estimated_crew_size ?? undefined,
    estimatedSupervisors: row.estimated_supervisors ?? undefined,
    expectedStartDate: row.expected_start_date ?? undefined,
    expectedDurationWeeks: row.expected_duration_weeks ?? undefined,
    scopeSummary: row.scope_summary ?? undefined,
    clientNeed: row.client_need ?? undefined,
    nextStep: row.next_step ?? undefined,
    ownerId: row.owner_id ?? undefined,
    ownerName: undefined, // Set separately by caller if available
    nextActionAt: row.next_action_at ?? undefined,
    status: (row.status as Opportunity["status"]) ?? "open",
  };
}

/**
 * Get all pipeline stages for organization
 */
export async function listPipelineStages(
  organizationId: string,
): Promise<PipelineStageRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("listPipelineStages error", error);
    return [];
  }
  return data as PipelineStageRow[];
}

/**
 * Get all opportunities for organization
 */
export async function listOpportunities(
  organizationId: string,
): Promise<OpportunityRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listOpportunities error", error);
    return [];
  }
  return data as OpportunityRow[];
}

/**
 * Get opportunity by ID with company details
 */
export async function getOpportunityById(
  id: string,
): Promise<(OpportunityRow & { company?: { name: string } }) | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("opportunities")
    .select(
      `
      *,
      company:company_id(name)
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getOpportunityById error", error);
    return null;
  }
  return data as (OpportunityRow & { company?: { name: string } }) | null;
}

/**
 * Move opportunity to different stage
 */
export async function moveOpportunityToStage(
  opportunityId: string,
  stageId: string,
): Promise<boolean> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from("opportunities")
    .update({
      stage_id: stageId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunityId);

  if (error) {
    console.error("moveOpportunityToStage error", error);
    return false;
  }
  return true;
}

/**
 * Create new opportunity
 */
export async function createOpportunity(
  organizationId: string,
  data: Omit<OpportunityRow, "id" | "created_at" | "updated_at" | "organization_id">,
): Promise<OpportunityRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data: newOpp, error } = await supabase
    .from("opportunities")
    .insert([
      {
        ...data,
        organization_id: organizationId,
      },
    ])
    .select()
    .maybeSingle();

  if (error) {
    console.error("createOpportunity error", error);
    return null;
  }
  return newOpp as OpportunityRow | null;
}

/**
 * Get opportunities by stage (for Kanban grouping)
 */
export async function getOpportunitiesByStage(
  organizationId: string,
): Promise<
  Map<
    string,
    Array<OpportunityRow & { company_name?: string }>
  >
> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return new Map();

  const { data, error } = await supabase
    .from("opportunities")
    .select(
      `
      *,
      company:company_id(name)
    `,
    )
    .eq("organization_id", organizationId)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getOpportunitiesByStage error", error);
    return new Map();
  }

  const grouped = new Map<
    string,
    Array<OpportunityRow & { company_name?: string }>
  >();

  if (Array.isArray(data)) {
    data.forEach((opp: unknown) => {
      const typedOpp = opp as OpportunityRow & { company?: { name: string } };
      const stageId = typedOpp.stage_id || "no-stage";
      if (!grouped.has(stageId)) {
        grouped.set(stageId, []);
      }
      grouped.get(stageId)!.push({
        ...typedOpp,
        company_name: typedOpp.company?.name,
      });
    });
  }

  return grouped;
}
