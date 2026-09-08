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

/**
 * Where a role file lives, by convention: agents/<role_key>.md.
 *
 * This was a hardcoded map of six entries, which meant hiring a new employee
 * needed a code change and a deploy before it could read its own brief — and
 * would silently receive none until then. There will be more of them; the
 * filename is derived so a new employee only needs the markdown.
 *
 * The aliases remain for the roles whose file name does not match their key.
 */
const ROLE_ALIASES: Record<string, string> = {
  project_researcher: "scout",
  triangle_hr: "hanna",
  hr: "hanna",
  inbox_courier: "bob",
};

function roleFileFor(roleKey: string): string {
  const base = ROLE_ALIASES[roleKey] ?? roleKey;
  // Only ever a bare filename under agents/ — never a path from a caller.
  return `${base.replace(/[^a-z0-9_-]/gi, "")}.md`;
}

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
  const file = roleKey ? roleFileFor(roleKey) : undefined;
  const [role, constitution] = await Promise.all([
    file ? readAgentDoc(file) : Promise.resolve(null),
    readAgentDoc("shared-constitution.md"),
  ]);
  // A role with no markdown yet gets the constitution and nothing else, which
  // is honest — better than serving another employee's brief.
  return { role, roleFile: role ? (file ?? null) : null, constitution };
}
