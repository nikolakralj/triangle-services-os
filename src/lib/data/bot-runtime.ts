import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Who does a mission's work, and how to wake them.
//
// On 11 September the CEO chose the Grok bots for mission work: Scout on
// Grok's own platform, with its own computer, tools and memory, reading and
// writing Triangle through its badge. For a mission that runs on a bot,
// Triangle does not think — it stores the work, applies the rules, and wakes
// the bot. The choice is made per employee:
//
//   agent_instances.config.mission_runtime = "bot"   steps go to the badge's inbox
//   anything else                                    Triangle's own runner does them
//
// A bot only sees work when it checks in, and Triangle cannot open a Grok chat.
// But a Grok routine can start from a signed webhook, so Triangle calls it the
// moment an instruction is given:
//
//   BOT_WAKE_URL_<ROLE_KEY>   the routine's webhook URL
//   BOT_WAKE_KEY_<ROLE_KEY>   its sender key, sent as a bearer token
//
// The wake body carries ids only. The bot treats it as data and reads the work
// itself from Triangle, so nothing in the call has to be trusted, and nothing
// in it is worth stealing.
// ---------------------------------------------------------------------------

export type MissionRuntime = "bot" | "in_app";

/**
 * A bot step that has not reported for this long has stopped. A bot works at
 * its own pace on its own computer; Triangle's runner gets fifteen minutes.
 */
export const STALE_BOT_STEP_MINUTES = 120;

export async function employeeMissionRuntime(
  orgId: string,
  agentInstanceId: string,
): Promise<MissionRuntime> {
  const svc = createServiceSupabaseClient();
  if (!svc) return "in_app";
  const { data } = await svc
    .from("agent_instances")
    .select("config")
    .eq("id", agentInstanceId)
    .eq("org_id", orgId)
    .maybeSingle();
  const config = data?.config as Record<string, unknown> | null;
  return config?.mission_runtime === "bot" ? "bot" : "in_app";
}

function settingName(prefix: string, roleKey: string): string {
  return `${prefix}_${roleKey.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

export interface WakeResult {
  status: "sent" | "failed" | "not_configured";
  httpStatus: number | null;
}

/**
 * Call the employee's wake-up webhook for one step, and write down on the step
 * that it was called and what came back. Never throws; a bot that could not be
 * woken still collects the step at its next scheduled check.
 */
export async function wakeEmployee(params: {
  orgId: string;
  agentInstanceId: string;
  stepId: string;
  missionId: string;
  event: "mission_step" | "mission_retry";
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
