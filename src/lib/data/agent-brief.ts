import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// The brief, served from Triangle rather than pasted into a provider chat.
//
// Until now, changing how Scout works meant editing `agents/scout.md` and then
// remembering to paste it into the Grok bot by hand. Two copies, one of them
// authoritative and the other the one actually running. The constitution says
// Triangle is truth and agent memory is context; a role file that only exists
// in a provider's system prompt is the opposite of that.
//
// An agent now receives its current role file, the constitution, the list of
// steps it may take unattended and the list that needs a human — every time it
// checks in. Edit the markdown, commit, and the next check-in has it. There is
// no second copy to forget.
//
// Read from disk at request time rather than bundled: these files are edited
// far more often than the app is deployed, and a brief that needs a build to
// take effect is a brief that goes stale.
// ---------------------------------------------------------------------------

/** Which file belongs to which role. Unknown roles get the constitution only. */
const ROLE_FILES: Record<string, string> = {
  project_researcher: "scout.md",
  scout: "scout.md",
  hr: "hanna.md",
  triangle_hr: "hanna.md",
  inbox_courier: "bob.md",
  bob: "bob.md",
};

async function readAgentDoc(file: string): Promise<string | null> {
  try {
    return await readFile(path.join(process.cwd(), "agents", file), "utf8");
  } catch {
    // A missing brief is worth knowing about but must not stop an agent
    // collecting its work.
    return null;
  }
}

export interface AgentBrief {
  /** The role file, verbatim. */
  role: string | null;
  roleFile: string | null;
  /** The constitution every agent is bound by, verbatim. */
  constitution: string | null;
}

/**
 * Resolved from agent_instances.role_key, not from the badge name.
 *
 * The badge is a credential and can be reissued under any name — a probe badge
 * called triangle_scout_test matched nothing and silently served no brief at
 * all. The employee's role is the durable fact; the badge is just how it signs
 * in.
 */
export async function getAgentBrief(
  orgId: string,
  agentInstanceId: string | null,
): Promise<AgentBrief> {
  let roleKey: string | null = null;
  if (agentInstanceId) {
    const { createServiceSupabaseClient } = await import("@/lib/supabase/server");
    const svc = createServiceSupabaseClient();
    const { data } = svc
      ? await svc
          .from("agent_instances")
          .select("role_key")
          .eq("id", agentInstanceId)
          .eq("org_id", orgId)
          .maybeSingle()
      : { data: null };
    roleKey = (data?.role_key as string | undefined) ?? null;
  }
  const file = roleKey ? ROLE_FILES[roleKey] : undefined;
  const [role, constitution] = await Promise.all([
    file ? readAgentDoc(file) : Promise.resolve(null),
    readAgentDoc("shared-constitution.md"),
  ]);
  return { role, roleFile: file ?? null, constitution };
}
