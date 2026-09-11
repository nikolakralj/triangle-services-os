import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { metricsFor, type SettledPlan } from "@/lib/data/mission-progress";
import type {
  MissionCriterion,
  MissionKind,
  MissionMetric,
  MissionPass,
  MissionPlanStep,
} from "@/lib/data/mission-shared";

// ---------------------------------------------------------------------------
// A mission's finish line and route, as rows (migration 044).
//
// Only the definitions are stored. How far along the mission is gets counted
// in mission-progress.ts from what the mission holds, every time.
// ---------------------------------------------------------------------------

export interface MissionPlanRows {
  criteria: MissionCriterion[];
  plan: MissionPlanStep[];
}

/** The finish line and the route — or nothing, also on a database without 044. */
export async function loadMissionPlan(orgId: string, missionId: string): Promise<MissionPlanRows> {
  const empty: MissionPlanRows = { criteria: [], plan: [] };
  const svc = createServiceSupabaseClient();
  if (!svc) return empty;

  const [criteria, steps] = await Promise.all([
    svc
      .from("mission_criteria")
      .select("metric, target, set_by, position")
      .eq("org_id", orgId)
      .eq("mission_id", missionId)
      .order("position"),
    svc
      .from("mission_plan_steps")
      .select("position, pass, title, metric")
      .eq("org_id", orgId)
      .eq("mission_id", missionId)
      .order("position"),
  ]);
  if (criteria.error || steps.error) return empty;

  return {
    criteria: (criteria.data ?? []).map((c) => ({
      metric: c.metric as MissionMetric,
      target: Number(c.target),
      setBy: c.set_by === "human" ? "human" : "agent",
    })),
    plan: (steps.data ?? []).map((s) => ({
      position: Number(s.position),
      pass: s.pass as MissionPass,
      title: s.title as string,
      metric: s.metric as MissionMetric,
    })),
  };
}

/**
 * Store a plan when the mission has none. In one transaction under a lock on
 * the mission, so two planners that overlap cannot interleave two plans.
 * True when this call wrote it.
 */
export async function saveMissionPlan(params: {
  orgId: string;
  missionId: string;
  plan: SettledPlan;
}): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;
  const { data, error } = await svc.rpc("save_mission_plan", {
    p_org_id: params.orgId,
    p_mission_id: params.missionId,
    p_criteria: params.plan.criteria,
    p_plan: params.plan.plan,
  });
  if (error) {
    console.error("saveMissionPlan:", error.message);
    return false;
  }
  return data === true;
}

/**
 * The CEO moves the finish line.
 *
 * Only criteria the mission already has, and every target is checked before
 * any is written. A moved target is marked as the person's, so the worker
 * never quietly moves it back.
 */
export async function setCriteriaTargets(params: {
  orgId: string;
  missionId: string;
  userId: string;
  targets: Record<string, number>;
}): Promise<{ ok: true; changed: number } | { error: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { error: "Database unavailable." };

  const { data: mission } = await svc
    .from("missions")
    .select("kind")
    .eq("id", params.missionId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  if (!mission) return { error: "That mission does not exist." };

  const entries = Object.entries(params.targets);
  if (entries.length === 0) return { error: "Nothing to change." };
  const allowed = new Set<string>(metricsFor(mission.kind as MissionKind));
  for (const [metric, target] of entries) {
    if (!allowed.has(metric)) return { error: "That is not something this mission counts." };
    if (!Number.isInteger(target) || target < 1 || target > 500) {
      return { error: "A target is a whole number from 1 to 500." };
    }
  }

  const { data: existing, error } = await svc
    .from("mission_criteria")
    .select("metric, target")
    .eq("org_id", params.orgId)
    .eq("mission_id", params.missionId);
  if (error) return { error: error.message };
  const current = new Map((existing ?? []).map((c) => [c.metric as string, Number(c.target)]));
  if (entries.some(([metric]) => !current.has(metric))) {
    return { error: "This mission has no such criterion to move." };
  }

  let changed = 0;
  for (const [metric, target] of entries) {
    if (current.get(metric) === target) continue;
    const { error: updateError } = await svc
      .from("mission_criteria")
      .update({ target, set_by: "human", set_by_user_id: params.userId })
      .eq("org_id", params.orgId)
      .eq("mission_id", params.missionId)
      .eq("metric", metric);
    if (updateError) return { error: updateError.message };
    changed++;
  }
  return { ok: true, changed };
}
