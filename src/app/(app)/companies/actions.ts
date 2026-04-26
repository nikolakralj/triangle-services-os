"use server";

import { revalidatePath } from "next/cache";
import { requireSession, capabilities } from "@/lib/auth/session";
import {
  createCompany,
  updateCompany,
  deleteCompany,
  type CompanyInput,
} from "@/lib/data/companies";

export async function createCompanyAction(input: CompanyInput) {
  const session = await requireSession();
  if (!capabilities(session.role).canWrite) {
    return { ok: false as const, error: "Your role does not allow writes." };
  }

  const result = await createCompany(session.organizationId, session.userId, input);
  if (result.ok) revalidatePath("/companies");
  return result;
}

export async function updateCompanyAction(id: string, patch: Partial<CompanyInput>) {
  const session = await requireSession();
  if (!capabilities(session.role).canWrite) {
    return { ok: false as const, error: "Your role does not allow writes." };
  }
  const result = await updateCompany(id, session.userId, patch);
  if (result.ok) revalidatePath("/companies");
  return result;
}

export async function deleteCompanyAction(id: string) {
  const session = await requireSession();
  if (!capabilities(session.role).canDelete) {
    return { ok: false as const, error: "Only admins can delete." };
  }
  const result = await deleteCompany(id);
  if (result.ok) revalidatePath("/companies");
  return result;
}
