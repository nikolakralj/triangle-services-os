import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Project notes — a single freeform "memory" note per discovered project.
// The user writes context (required documents, buyer quirks, client
// preferences) that the Project Agent reads on every run.
// ---------------------------------------------------------------------------

export interface ProjectNote {
  body: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

const MAX_BODY_LENGTH = 20_000;

/**
 * Returns the project's note, or null if none has been written yet.
 */
export async function getProjectNote(
  projectId: string,
  orgId: string,
): Promise<ProjectNote | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data, error } = await svc
    .from("project_notes")
    .select("body, updated_at, updated_by")
    .eq("project_id", projectId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    body: data.body ?? "",
    updatedAt: data.updated_at ?? null,
    updatedBy: data.updated_by ?? null,
  };
}

/**
 * Creates or updates the project's note (one row per project). Returns the
 * saved note, or null if the write failed.
 */
export async function upsertProjectNote(params: {
  projectId: string;
  orgId: string;
  body: string;
  userId: string | null;
}): Promise<ProjectNote | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const body = (params.body ?? "").slice(0, MAX_BODY_LENGTH);

  const { data, error } = await svc
    .from("project_notes")
    .upsert(
      {
        org_id: params.orgId,
        project_id: params.projectId,
        body,
        updated_by: params.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    )
    .select("body, updated_at, updated_by")
    .maybeSingle();

  if (error || !data) return null;

  return {
    body: data.body ?? "",
    updatedAt: data.updated_at ?? null,
    updatedBy: data.updated_by ?? null,
  };
}
