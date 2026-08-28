"use server";

import { requireSession } from "@/lib/auth/session";
import { deleteDiscoveredProject } from "@/lib/data/discovered-projects";
import { revalidatePath } from "next/cache";

export async function deleteProjectAction(projectId: string) {
  await requireSession();
  const success = await deleteDiscoveredProject(projectId);
  if (!success) {
    throw new Error("Failed to delete project");
  }
  revalidatePath("/hunter");
}
