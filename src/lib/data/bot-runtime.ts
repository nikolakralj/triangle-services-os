import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Who does a mission's work, and how to wake them.
//
// On 11 September the CEO chose the Grok bots for mission work: Scout on
// Grok's own platform, with its own computer, tools and memory, reading and
// writing Triangle through its badge. For a mission that runs on a bot,
// Triangle does not think — it stores the work, applies the rules, and wakes
// the bot. The choice is made per employee, except Scout (project_researcher),
// who is always the bot — there is no in-app OpenAI stand-in:
//
//   agent_instances.config.mission_runtime = "bot"   steps go to the badge's inbox
//   Scout (any config)                               same — always the bot
//   anything else                                    Triangle's own runner does them
//
// A bot only sees work when it checks in, and Triangle cannot open a Grok chat.
// But a Grok routine can start from a signed webhook, so Triangle calls it
// when an instruction, retry, colleague request, returned request, a new
// non-mission assignment, or a human follow-up on the assignment thread is
// recorded:
//
//   BOT_WAKE_URL_<ROLE_KEY>   the routine's webhook URL
//   BOT_WAKE_KEY_<ROLE_KEY>   its sender key, sent as a bearer token
//
// The wake body carries ids only. The bot treats it as data and reads the work
// itself from Triangle, so nothing in the call has to be trusted, and nothing
// in it is worth stealing.
// ---------------------------------------------------------------------------

export type MissionRuntime = "bot" | "in_app";

/** Scout's role_key. Always bot-owned; there is no in-app OpenAI stand-in. */
export const SCOUT_ROLE_KEY = "project_researcher";

/**
 * A bot step that has not reported for this long has stopped. A bot works at
 * its own pace on its own computer; Triangle's runner gets fifteen minutes.
 */
export const STALE_BOT_STEP_MINUTES = 120;

/**
 * Where this employee works. Scout is always the Grok bot. Everyone else
 * follows `agent_instances.config.mission_runtime`.
 */
export function employeeRuntimeOf(
  roleKey: string | null | undefined,
  config: Record<string, unknown> | null | undefined,
): MissionRuntime {
  if (roleKey === SCOUT_ROLE_KEY) return "bot";
  return config?.mission_runtime === "bot" ? "bot" : "in_app";
}

export function isScoutRole(roleKey: string | null | undefined): boolean {
  return roleKey === SCOUT_ROLE_KEY;
}

export async function loadEmployeeRuntime(
  orgId: string,
  agentInstanceId: string,
): Promise<{ roleKey: string | null; runtime: MissionRuntime }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { roleKey: null, runtime: "in_app" };
  const { data } = await svc
    .from("agent_instances")
    .select("role_key, config")
    .eq("id", agentInstanceId)
    .eq("org_id", orgId)
    .maybeSingle();
  const roleKey = (data?.role_key as string | undefined) ?? null;
  return {
    roleKey,
    runtime: employeeRuntimeOf(
      roleKey,
      (data?.config as Record<string, unknown> | null) ?? null,
    ),
  };
}

export async function employeeMissionRuntime(
  orgId: string,
  agentInstanceId: string,
): Promise<MissionRuntime> {
  return (await loadEmployeeRuntime(orgId, agentInstanceId)).runtime;
}

/** An employee's settings: where it runs, and which messages it may send itself. */
export async function employeeConfig(
  orgId: string,
  agentInstanceId: string,
): Promise<Record<string, unknown> | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data } = await svc
    .from("agent_instances")
    .select("config")
    .eq("id", agentInstanceId)
    .eq("org_id", orgId)
    .maybeSingle();
  return (data?.config as Record<string, unknown> | null) ?? null;
}

function settingName(prefix: string, roleKey: string): string {
  return `${prefix}_${roleKey.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

export type WakeEvent =
  | "mission_step"
  | "mission_retry"
  | "requested"
  | "request_returned"
  | "human_followup"
  | "assignment";

export interface WakeResult {
  status: "sent" | "failed" | "not_configured";
  httpStatus: number | null;
}

/**
 * Call the employee's wake-up webhook for one assignment (a mission step, a
 * colleague request, a new non-mission assignment, or a human follow-up on
 * the thread), and write down on that assignment that it was called and what
 * came back. Never throws; a bot that could not be woken still collects the
 * work at its next scheduled check.
 *
 * `missionId` is null when the assignment is not inside a mission; the bot
 * still gets `assignmentId` and reads the thread from its inbox.
 */
export async function wakeEmployee(params: {
  orgId: string;
  agentInstanceId: string;
  stepId: string;
  missionId: string | null;
  event: WakeEvent;
}): Promise<WakeResult> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { status: "failed", httpStatus: null };

  const { data: employee } = await svc
    .from("agent_instances")
    .select("role_key, display_name")
    .eq("id", params.agentInstanceId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  const roleKey = (employee?.role_key as string | undefined) ?? "";
  const url = roleKey ? process.env[settingName("BOT_WAKE_URL", roleKey)] : undefined;
  const key = roleKey ? process.env[settingName("BOT_WAKE_KEY", roleKey)] : undefined;

  let result: WakeResult;
  if (!url || !key) {
    result = { status: "not_configured", httpStatus: null };
  } else {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "X-Automation-Key": key,
        },
        body: JSON.stringify({
          event: params.event,
          assignmentId: params.stepId,
          missionId: params.missionId,
          employee: (employee?.display_name as string | undefined) ?? null,
          at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      result = { status: res.ok ? "sent" : "failed", httpStatus: res.status };
    } catch {
      result = { status: "failed", httpStatus: null };
    }
  }

  // On the step, so the mission can say whether the bot was called and whether
  // its webhook answered — never the URL or the key.
  const { data: step } = await svc
    .from("agent_assignments")
    .select("constraints")
    .eq("id", params.stepId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  if (step) {
    await svc
      .from("agent_assignments")
      .update({
        constraints: {
          ...((step.constraints as Record<string, unknown> | null) ?? {}),
          wake: {
            at: new Date().toISOString(),
            event: params.event,
            status: result.status,
            http_status: result.httpStatus,
          },
        },
      })
      .eq("id", params.stepId)
      .eq("org_id", params.orgId);
  }
  if (result.status === "failed") {
    console.error(`wakeEmployee: the ${roleKey} webhook answered ${result.httpStatus ?? "nothing"}`);
  }
  return result;
}

/** What the mission says while a bot step waits, from what the wake call recorded. */
export function botWaitingReason(constraints: Record<string, unknown> | null | undefined): string {
  const wake = constraints?.wake as { status?: string; at?: string } | undefined;
  if (wake?.status === "sent") return "The bot was woken and has not started yet.";
  if (wake?.status === "failed") {
    return "The bot's wake-up webhook did not answer. It picks this up at its next scheduled check.";
  }
  if (wake?.status === "not_configured") {
    return "No wake-up webhook is set, so the bot picks this up at its next scheduled check.";
  }
  return "Waiting for the bot to pick this up.";
}

/**
 * What the assignment thread says after a human follow-up: queued, not
 * delivered. Same honesty as `botWaitingReason` when a wake was attempted.
 */
export function followUpPickupNotice(wake: WakeResult | null, reopened: boolean): string {
  const head = reopened ? "Reopened. Queued." : "Queued.";
  if (!wake) return `${head} Waiting for pickup.`;
  return `${head} ${botWaitingReason({ wake })}`;
}

/** What the manager sees after handing a bot employee a new assignment. */
export function assignmentQueuedNotice(wake: WakeResult | null): string {
  if (!wake) return "Queued. Waiting for pickup.";
  return `Queued. ${botWaitingReason({ wake })}`;
}
