import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type ProjectPackageStatus = "draft" | "active" | "archived";

export type ProjectPackageRow = {
  id: string;
  org_id: string;
  project_id: string;
  title: string;
  summary: string | null;
  roles: string[];
  estimated_crew_size: number | null;
  confidence: number | null;
  source_suggestion_id: string | null;
  contractor_node_id: string | null;
  status: ProjectPackageStatus;
  created_at: string;
  updated_at: string;
};

export async function listProjectPackages(
  projectId: string,
  orgId: string
): Promise<ProjectPackageRow[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const { data, error } = await svc
    .from("project_packages")
    .select("*")
    .eq("project_id", projectId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error listing project packages:", error);
    return [];
  }

  return (data ?? []) as ProjectPackageRow[];
}

export async function createProjectPackage(params: {
  orgId: string;
  projectId: string;
  title: string;
  summary?: string;
  roles?: string[];
  estimatedCrewSize?: number;
  confidence?: number;
  sourceSuggestionId?: string;
  contractorNodeId?: string;
  status?: ProjectPackageStatus;
}): Promise<{ id: string } | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data, error } = await svc
    .from("project_packages")
    .insert({
      org_id: params.orgId,
      project_id: params.projectId,
      title: params.title,
      summary: params.summary ?? null,
      roles: params.roles ?? [],
      estimated_crew_size: params.estimatedCrewSize ?? null,
      confidence: params.confidence ?? null,
      source_suggestion_id: params.sourceSuggestionId ?? null,
      contractor_node_id: params.contractorNodeId ?? null,
      status: params.status ?? "draft",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Error creating project package:", error);
    return null;
  }

  return data;
}

export async function updateProjectPackage(
  id: string,
  orgId: string,
  updates: Partial<Omit<ProjectPackageRow, "id" | "org_id" | "project_id" | "created_at" | "updated_at">>
): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;

  const { error } = await svc
    .from("project_packages")
    .update(updates)
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) {
    console.error("Error updating project package:", error);
    return false;
  }

  return true;
}

export async function deleteProjectPackage(id: string, orgId: string): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;

  const { error } = await svc
    .from("project_packages")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) {
    console.error("Error deleting project package:", error);
    return false;
  }

  return true;
}
