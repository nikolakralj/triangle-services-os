import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { type ResearchMessageRow, type ResearchConversationRow } from "./research-chat";

const GLOBAL_PROJECT_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Find or create a global conversation for an organization
 */
export async function getOrCreateGlobalConversation(params: {
  orgId: string;
  userId: string;
}): Promise<ResearchConversationRow> {
  const svc = createServiceSupabaseClient();
  if (!svc) throw new Error("Database unavailable");

  const { data: existing } = await svc
    .from("research_conversations")
    .select("*")
    .eq("project_id", GLOBAL_PROJECT_ID)
    .eq("org_id", params.orgId)
    .order("last_active_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as ResearchConversationRow;

  const { data: created, error } = await svc
    .from("research_conversations")
    .insert({
      org_id: params.orgId,
      project_id: GLOBAL_PROJECT_ID,
      started_by: params.userId,
      title: "Global Scout Chat",
    })
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return created as ResearchConversationRow;
}
