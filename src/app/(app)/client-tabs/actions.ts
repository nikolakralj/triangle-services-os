"use server";

import { revalidatePath } from "next/cache";
import { capabilities, requireSession } from "@/lib/auth/session";
import { closeClientTab, pinClientTab } from "@/lib/data/client-tabs";
import { CLOSE_REASONS, type ClientTabCloseReason } from "@/lib/data/client-tab-policy";

// The owner's two actions on a client tab: pin it, and close it when it is
// won, lost or gone quiet. Everything else on the page is written by bots.

export async function pinClientTabAction(companyId: string) {
  const session = await requireSession();
  if (!capabilities(session.role).canWrite) {
    return { ok: false as const, error: "Your role does not allow writes." };
  }
  const result = await pinClientTab({ orgId: session.organizationId, userId: session.userId, companyId });
  revalidatePath("/", "layout");
  return result.ok ? { ok: true as const, companyId: result.companyId } : { ok: false as const, error: result.error };
}

export async function closeClientTabAction(tabId: string, reason: ClientTabCloseReason) {
  const session = await requireSession();
  if (!capabilities(session.role).canWrite) {
    return { ok: false as const, error: "Your role does not allow writes." };
  }
  if (!(CLOSE_REASONS as readonly string[]).includes(reason)) {
    return { ok: false as const, error: "Close as won, lost or gone quiet." };
  }
  const result = await closeClientTab({ orgId: session.organizationId, tabId, reason });
  revalidatePath("/", "layout");
  return result.ok ? { ok: true as const } : { ok: false as const, error: result.error ?? "Could not close." };
}
