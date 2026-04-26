import "server-only";
import { redirect } from "next/navigation";
import { createCookieSupabaseClient } from "@/lib/supabase/server";

export type SessionContext = {
  userId: string;
  email: string;
  organizationId: string;
  role: "admin" | "partner" | "researcher" | "viewer";
};

type OrgMembershipRow = {
  organization_id: string;
  role: SessionContext["role"];
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

  // Use a security-definer RPC so the query bypasses RLS on organization_members
  // (the RLS policy itself calls is_org_member which can fail when auth.uid()
  // isn't fully propagated in server-component cookie-based requests).
  const { data: member } = await supabase
    .rpc("get_my_org_membership")
    .maybeSingle();

  if (!member) return null;
  const typedMember = member as OrgMembershipRow;

  return {
    userId: user.id,
    email: user.email ?? "",
    organizationId: typedMember.organization_id,
    role: typedMember.role,
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
