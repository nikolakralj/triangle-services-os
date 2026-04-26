import "server-only";
import { redirect } from "next/navigation";
import { createCookieSupabaseClient } from "@/lib/supabase/server";

export type SessionContext = {
  userId: string;
  email: string;
  organizationId: string;
  role: "admin" | "partner" | "researcher" | "viewer";
};

/**
 * Resolves the active user + their primary org membership.
 * Returns null if not authenticated or not yet a member of any org.
 * Use requireSession() for protected pages.
 */
export async function getSession(): Promise<SessionContext | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!member) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    organizationId: member.organization_id as string,
    role: member.role as SessionContext["role"],
  };
}

export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/** Throws redirect if user lacks one of the required roles. */
export async function requireRole(
  ...allowed: SessionContext["role"][]
): Promise<SessionContext> {
  const session = await requireSession();
  if (!allowed.includes(session.role)) {
    redirect("/dashboard?error=forbidden");
  }
  return session;
}

export const ROLE_CAPABILITIES = {
  admin: { canWrite: true, canDelete: true, canInvite: true, canSeeFinancials: true, canSeeWorkers: true },
  partner: { canWrite: true, canDelete: false, canInvite: false, canSeeFinancials: true, canSeeWorkers: true },
  researcher: { canWrite: true, canDelete: false, canInvite: false, canSeeFinancials: false, canSeeWorkers: false },
  viewer: { canWrite: false, canDelete: false, canInvite: false, canSeeFinancials: true, canSeeWorkers: true },
} as const;

export function capabilities(role: SessionContext["role"]) {
  return ROLE_CAPABILITIES[role];
}
