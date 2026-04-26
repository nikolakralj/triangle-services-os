import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/env";

export function createServiceSupabaseClient() {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createRequestSupabaseClient(authorization?: string | null) {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    global: authorization
      ? {
          headers: {
            Authorization: authorization,
          },
        }
      : undefined,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function createCookieSupabaseClient() {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server components cannot always write cookies. Route handlers can.
        }
      },
    },
  });
}

export async function requireApiAccess(request: Request) {
  const { isConfigured } = getSupabaseConfig();

  if (!isConfigured) {
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEMO_MODE !== "true") {
      return { ok: false as const, status: 503, error: "Supabase is not configured." };
    }
    return {
      ok: true as const,
      demo: true,
      userId: "demo-user",
      organizationId: "00000000-0000-0000-0000-000000000001",
      role: "admin",
    };
  }

  const authorization = request.headers.get("authorization");
  const supabase = authorization
    ? createRequestSupabaseClient(authorization)
    : await createCookieSupabaseClient();
  if (!supabase) {
    return { ok: false as const, status: 500, error: "Supabase is not configured." };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!member) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return {
    ok: true as const,
    demo: false,
    userId: user.id,
    organizationId: member.organization_id as string,
    role: member.role as string,
  };
}

export async function requireApiRole(
  request: Request,
  allowedRoles: Array<"admin" | "partner" | "researcher" | "viewer">,
) {
  const access = await requireApiAccess(request);
  if (!access.ok) return access;
  if (!allowedRoles.includes(access.role as "admin" | "partner" | "researcher" | "viewer")) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return access;
}
