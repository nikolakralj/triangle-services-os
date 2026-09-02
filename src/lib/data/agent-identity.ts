import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Who filed this.
//
// Triangle records the author of a proposal two different ways. Findings carry
// `agent_instance_id` — a direct link to the employee. Suggestions carry
// `created_by_agent`, the free-text name of the machine credential that was
// used. Both must resolve to the SAME employee, or one person shows up under
// two names depending on which screen you are looking at.
// ---------------------------------------------------------------------------

export interface AgentFace {
  name: string;
  emoji: string;
}

/**
 * Older rows recorded which subsystem wrote them ("mcp_research_agent",
 * "research_chat_agent") rather than who filed them. Make those readable
 * rather than leaving raw identifiers in front of a manager.
 */
export function humanizeLegacyAgent(raw: string): string {
  if (!raw.includes("_")) return raw;
  const words = raw.replace(/^mcp_/, "").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface AgentFaces {
  /** agent_instances.id -> face */
  byId: Map<string, AgentFace>;
  /** machine_credentials.name -> face of the employee holding that badge */
  byCredentialName: Map<string, AgentFace>;
  /** Resolve a `created_by_agent` string, falling back to a readable label. */
  fromCredentialName(raw: string | null): AgentFace | null;
}

export async function loadAgentFaces(orgId: string): Promise<AgentFaces> {
  const byId = new Map<string, AgentFace>();
  const byCredentialName = new Map<string, AgentFace>();
  const svc = createServiceSupabaseClient();

  if (svc) {
    const [instances, creds] = await Promise.all([
      svc.from("agent_instances").select("id, display_name, emoji").eq("org_id", orgId),
      svc
        .from("machine_credentials")
        .select("name, agent_instance_id")
        .eq("org_id", orgId),
    ]);

    for (const i of instances.data ?? []) {
      byId.set(i.id as string, {
        name: i.display_name as string,
        emoji: (i.emoji as string) || "🤖",
      });
    }
    for (const c of creds.data ?? []) {
      const inst = c.agent_instance_id
        ? byId.get(c.agent_instance_id as string)
        : undefined;
      if (inst) byCredentialName.set(c.name as string, inst);
    }
  }

  return {
    byId,
    byCredentialName,
    fromCredentialName(raw) {
      if (!raw) return null;
      const known = byCredentialName.get(raw);
      if (known) return known;
      // A badge with no employee behind it still tells the manager something —
      // show the readable label rather than dropping the provenance entirely.
      return { name: humanizeLegacyAgent(raw), emoji: "🤖" };
    },
  };
}
