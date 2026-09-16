import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// How an employee works, in the CEO's own words.
//
// A mission decision holds for one mission. These hold for the employee: read
// on every run — the bot's wake-up payload, its inbox, and Triangle's own
// worker — so the same instructions apply whoever does the work, and survive
// swapping the model underneath.
//
// Saved as versions (migration 046), because "why does it write like this now"
// is a question about a change, and the answer is worthless once the previous
// words are gone. Instructions, never permissions: what an employee may do is
// enforced by scopes, the finding contract and the API.
// ---------------------------------------------------------------------------

export interface HouseRules {
  body: string;
  version: number;
  setAt: string;
  setBy: string | null;
}

function rowToRules(row: Record<string, unknown>): HouseRules {
  return {
    body: String(row.body ?? ""),
    version: Number(row.version ?? 1),
    setAt: String(row.created_at ?? ""),
    setBy: (row.set_by as string | null) ?? null,
  };
}

/** The rules in force for one employee. Cleared rules are a version, not an instruction. */
export async function loadHouseRules(
  orgId: string,
  agentInstanceId: string,
): Promise<HouseRules | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data } = await svc
    .from("agent_house_rules")
    .select("body, version, created_at, set_by")
    .eq("org_id", orgId)
    .eq("agent_instance_id", agentInstanceId)
    .order("version", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  const rules = rowToRules(row as Record<string, unknown>);
  return rules.body.trim() ? rules : null;
}

/** The rules in force for several employees at once, for the Workforce page. */
export async function loadHouseRulesByEmployee(
  orgId: string,
  agentInstanceIds: string[],
): Promise<Map<string, HouseRules>> {
  const out = new Map<string, HouseRules>();
  const svc = createServiceSupabaseClient();
  if (!svc || agentInstanceIds.length === 0) return out;
  const { data } = await svc
    .from("agent_house_rules")
    .select("agent_instance_id, body, version, created_at, set_by")
    .eq("org_id", orgId)
    .in("agent_instance_id", agentInstanceIds)
    .order("version", { ascending: false });
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const id = String(row.agent_instance_id);
    // Newest version first, so the first row for an employee is the one in force.
    if (out.has(id)) continue;
    const rules = rowToRules(row);
    if (rules.body.trim()) out.set(id, rules);
  }
  return out;
}

/** What the CEO typed becomes the next version — unless it is the same words. */
export async function saveHouseRules(params: {
  orgId: string;
  agentInstanceId: string;
  body: string;
  userId: string | null;
}): Promise<HouseRules | { error: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { error: "Database unavailable." };
  const body = params.body.replace(/\r\n/g, "\n").trim().slice(0, 4_000);
  const { data, error } = await svc.rpc("save_house_rules", {
    p_org_id: params.orgId,
    p_agent_instance_id: params.agentInstanceId,
    p_body: body,
    p_user_id: params.userId,
  });
  if (error) {
    return {
      error: error.message.includes("No such employee")
        ? "No such employee."
        : "Could not save how this employee works.",
    };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { error: "Could not save how this employee works." };
  return rowToRules(row as Record<string, unknown>);
}

/**
 * Append or add a rule to an employee's existing house rules.
 * If existing rules exist, appends the new rule as a numbered or bulleted entry.
 */
export async function appendHouseRule(params: {
  orgId: string;
  agentInstanceId: string;
  newRule: string;
  userId: string | null;
}): Promise<HouseRules | { error: string }> {
  const current = await loadHouseRules(params.orgId, params.agentInstanceId);
  const trimmedRule = params.newRule.trim();
  if (!trimmedRule) return { error: "Rule text cannot be empty." };

  const currentBody = current?.body?.trim() ?? "";
  const combined = currentBody
    ? `${currentBody}\n- ${trimmedRule}`
    : `- ${trimmedRule}`;

  return saveHouseRules({
    orgId: params.orgId,
    agentInstanceId: params.agentInstanceId,
    body: combined,
    userId: params.userId,
  });
}

/**
 * Resolves the agent instance id and display name for a role key (e.g. inbox_coordinator, project_researcher).
 */
export async function resolveEmployeeByRole(
  orgId: string,
  roleKey: string,
): Promise<{ id: string; name: string; roleKey: string } | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data } = await svc
    .from("agent_instances")
    .select("id, display_name, role_key")
    .eq("org_id", orgId)
    .eq("role_key", roleKey)
    .eq("status", "active")
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id as string,
    name: (data.display_name as string) ?? "Employee",
    roleKey: (data.role_key as string) ?? roleKey,
  };
}

/**
 * The block a worker is handed. Named and dated on purpose: an employee that
 * says "your rule from version 4" is one the CEO can correct.
 */
export function houseRulesForPrompt(rules: HouseRules | null): string | null {
  const body = rules?.body.trim();
  if (!body || !rules) return null;
  return `HOW THE CEO WANTS YOU TO WORK — standing instructions (version ${rules.version}). They hold for every job, on top of this mission's decisions:\n${body}`;
}
