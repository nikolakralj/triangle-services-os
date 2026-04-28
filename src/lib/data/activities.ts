import "server-only";
import { createCookieSupabaseClient } from "@/lib/supabase/server";
import type { Activity } from "@/lib/types";

export type ActivityRow = {
  id: string;
  organization_id: string;
  activity_type: "note" | "call" | "email" | "meeting" | "linkedin_message" | "document_sent" | "document_received" | "ai_generation" | "status_change" | "task_completed" | "import" | "other";
  title: string;
  summary: string;
  company_id: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  worker_id: string | null;
  occurred_at: string;
  created_at: string;
  created_by: string | null;
};

/**
 * Convert database row to UI type for Activity
 */
export function rowToActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    activityType: row.activity_type,
    title: row.title,
    summary: row.summary,
    companyId: row.company_id ?? undefined,
    contactId: row.contact_id ?? undefined,
    opportunityId: row.opportunity_id ?? undefined,
    workerId: row.worker_id ?? undefined,
    occurredAt: row.occurred_at,
    createdById: row.created_by ?? undefined,
    createdByName: undefined, // Set separately by caller if available
  };
}

/**
 * Get all activities for organization
 */
export async function listActivities(
  organizationId: string,
  limit: number = 50,
): Promise<ActivityRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("organization_id", organizationId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listActivities error", error);
    return [];
  }
  return data as ActivityRow[];
}

/**
 * Get activities for a specific company
 */
export async function getActivitiesByCompany(
  companyId: string,
  limit: number = 25,
): Promise<ActivityRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("company_id", companyId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getActivitiesByCompany error", error);
    return [];
  }
  return data as ActivityRow[];
}

/**
 * Get activities for a specific contact
 */
export async function getActivitiesByContact(
  contactId: string,
  limit: number = 25,
): Promise<ActivityRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("contact_id", contactId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getActivitiesByContact error", error);
    return [];
  }
  return data as ActivityRow[];
}

/**
 * Get activities for a specific opportunity
 */
export async function getActivitiesByOpportunity(
  opportunityId: string,
  limit: number = 25,
): Promise<ActivityRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getActivitiesByOpportunity error", error);
    return [];
  }
  return data as ActivityRow[];
}

/**
 * Get activities of a specific type
 */
export async function getActivitiesByType(
  organizationId: string,
  activityType: ActivityRow["activity_type"],
  limit: number = 25,
): Promise<ActivityRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("activity_type", activityType)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getActivitiesByType error", error);
    return [];
  }
  return data as ActivityRow[];
}

/**
 * Get activities for a specific worker
 */
export async function getActivitiesByWorker(
  workerId: string,
  limit: number = 25,
): Promise<ActivityRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("worker_id", workerId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getActivitiesByWorker error", error);
    return [];
  }
  return data as ActivityRow[];
}

/**
 * Get activity by ID
 */
export async function getActivityById(id: string): Promise<ActivityRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getActivityById error", error);
    return null;
  }
  return data as ActivityRow | null;
}

/**
 * Create new activity
 */
export async function createActivity(
  organizationId: string,
  data: Omit<ActivityRow, "id" | "created_at" | "organization_id">,
): Promise<ActivityRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data: newActivity, error } = await supabase
    .from("activities")
    .insert([
      {
        ...data,
        organization_id: organizationId,
      },
    ])
    .select()
    .maybeSingle();

  if (error) {
    console.error("createActivity error", error);
    return null;
  }
  return newActivity as ActivityRow | null;
}

/**
 * Get recent activities (dashboard feed)
 */
export async function getRecentActivities(
  organizationId: string,
  hours: number = 24,
  limit: number = 20,
): Promise<ActivityRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("organization_id", organizationId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getRecentActivities error", error);
    return [];
  }
  return data as ActivityRow[];
}

/**
 * Get activity summary count by type
 */
export async function getActivityTypeCount(
  organizationId: string,
  hours: number = 24,
): Promise<Record<ActivityRow["activity_type"], number>> {
  const emptyCounts: Record<ActivityRow["activity_type"], number> = {
    note: 0,
    call: 0,
    email: 0,
    meeting: 0,
    linkedin_message: 0,
    document_sent: 0,
    document_received: 0,
    ai_generation: 0,
    status_change: 0,
    task_completed: 0,
    import: 0,
    other: 0,
  };

  const supabase = await createCookieSupabaseClient();
  if (!supabase) return emptyCounts;

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("activities")
    .select("activity_type")
    .eq("organization_id", organizationId)
    .gte("occurred_at", since);

  if (error) {
    console.error("getActivityTypeCount error", error);
    return emptyCounts;
  }

  const counts: Record<ActivityRow["activity_type"], number> = {
    note: 0,
    call: 0,
    email: 0,
    meeting: 0,
    linkedin_message: 0,
    document_sent: 0,
    document_received: 0,
    ai_generation: 0,
    status_change: 0,
    task_completed: 0,
    import: 0,
    other: 0,
  };

  (data as ActivityRow[]).forEach((activity) => {
    counts[activity.activity_type]++;
  });

  return counts;
}
