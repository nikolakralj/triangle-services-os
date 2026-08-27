import "server-only";
import { createHash } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Scoped machine credentials.
//
// External agents (Grok bots, scripts) authenticate with a per-bot token
// carrying explicit scopes — Bob can ingest email and nothing else; Scout
// can propose research and nothing else. This is blast-radius containment:
// a leaked bot token can only do that bot's one job.
//
// Tokens look like `tri_mc_<hex>`. Only the SHA-256 hash is stored, so a
// database leak yields nothing usable. The plaintext is printed once by
// scripts/create-machine-credential.mjs and never persisted anywhere.
//
// The legacy MCP_API_KEY env var (admin) still works via requireApiAccess —
// kept for human/dev use. Bots should never receive it.
// ---------------------------------------------------------------------------

export interface MachineAccess {
  orgId: string;
  credentialId: string;
  name: string;
  scopes: string[];
  /** The durable employee this badge belongs to (null for unlinked legacy badges). */
  agentInstanceId: string | null;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Try to authenticate the request as a machine credential.
 * Returns null when there is no bearer token or it isn't a machine token —
 * callers then fall back to session/legacy auth. Returns `{ revoked: true }`
 * style failure only implicitly: a revoked credential simply doesn't match.
 */
export async function verifyMachineToken(
  request: Request,
): Promise<MachineAccess | null> {
  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7).trim() : null;
  if (!token || !token.startsWith("tri_mc_")) return null;

  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data } = await svc
    .from("machine_credentials")
    .select("id, org_id, name, scopes, status, agent_instance_id")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!data || data.status !== "active") return null;

  // Best-effort usage stamp; never blocks the request.
  void svc
    .from("machine_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => undefined);

  return {
    orgId: data.org_id as string,
    credentialId: data.id as string,
    name: data.name as string,
    scopes: Array.isArray(data.scopes) ? (data.scopes as string[]) : [],
    agentInstanceId: (data.agent_instance_id as string) ?? null,
  };
}

export function hasScope(access: MachineAccess, scope: string): boolean {
  return access.scopes.includes(scope) || access.scopes.includes("admin");
}
