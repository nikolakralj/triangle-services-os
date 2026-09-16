import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { createAssignment, listWorkforce, nextAttemptKey } from "@/lib/data/workforce";
import { assignmentQueuedNotice, loadEmployeeRuntime, wakeEmployee } from "@/lib/data/bot-runtime";
import {
  askBobObjective,
  askBobTitle,
  bobFollowThroughBlockedReason,
  isBobEmployee,
  type AskBobContext,
} from "@/lib/data/ask-bob-policy";

export {
  askBobObjective,
  askBobTitle,
  bobFollowThroughBlockedReason,
  isBobEmployee,
  BOB_ROLE_KEYS,
  MISSION_WORK_SCOPE,
  type AskBobContext,
} from "@/lib/data/ask-bob-policy";

// ---------------------------------------------------------------------------
// Ask Bob from a Today mail card.
//
// Bob is Commercial Ops. A short instruction plus the card's entity ids is
// the whole hand-off. If his badge cannot take mission work (DEV-004), we
// refuse honestly — a queued row he cannot pick up would be pretending.
// ---------------------------------------------------------------------------

function utcDayKey(from = new Date()): string {
  return from.toISOString().slice(0, 10);
}

export async function askBob(params: {
  orgId: string;
  userId: string;
  context: AskBobContext;
}): Promise<
  | {
      ok: true;
      assignmentId: string;
      alreadyOut: boolean;
      bobName: string;
      notice: string;
    }
  | { ok: false; error: string; status: number }
> {
  const instruction = params.context.instruction.trim();
  if (instruction.length < 2) {
    return { ok: false, error: "Write what Bob should do.", status: 400 };
  }

  const roster = await listWorkforce(params.orgId);
  const bobRow = roster.find((e) => e.status === "active" && isBobEmployee(e)) ?? null;
  const bob = bobRow ? { id: bobRow.id, name: bobRow.displayName } : null;

  const svc = createServiceSupabaseClient();
  const scopes: string[] = [];
  if (svc && bob) {
    const { data: badges } = await svc
      .from("machine_credentials")
      .select("scopes")
      .eq("org_id", params.orgId)
      .eq("agent_instance_id", bob.id)
      .eq("status", "active");
    for (const badge of badges ?? []) {
      if (Array.isArray(badge.scopes)) {
        for (const scope of badge.scopes as string[]) scopes.push(scope);
      }
    }
  }

  const runtime = bob
    ? (await loadEmployeeRuntime(params.orgId, bob.id)).runtime
    : "in_app";

  const blocked = bobFollowThroughBlockedReason({ bob, scopes, runtime });
  if (blocked || !bob) {
    return { ok: false, error: blocked ?? "Nobody named Bob is on the workforce.", status: 409 };
  }

  const subject =
    params.context.leadId ||
    params.context.contactId ||
    params.context.personId ||
    params.context.missionId ||
    "card";
  const baseKey = `ask-bob:${bob.id}:${subject}:${utcDayKey()}`;
  const attempt = await nextAttemptKey(params.orgId, baseKey);
  if ("openAssignmentId" in attempt) {
    return {
      ok: true,
      assignmentId: attempt.openAssignmentId,
      alreadyOut: true,
      bobName: bob.name,
      notice: `${bob.name} already has this — the answer will land on Workforce.`,
    };
  }

  const entityRefs: Array<{
    type: "job_lead" | "contact" | "other";
    id: string;
    relation: "target" | "context";
  }> = [];
  if (params.context.leadId) {
    entityRefs.push({ type: "job_lead", id: params.context.leadId, relation: "target" });
  }
  if (params.context.contactId) {
    entityRefs.push({ type: "contact", id: params.context.contactId, relation: "target" });
  }
  if (params.context.personId) {
    entityRefs.push({ type: "contact", id: params.context.personId, relation: "target" });
  }
  if (params.context.missionId) {
    entityRefs.push({ type: "other", id: params.context.missionId, relation: "context" });
  }

  const created = await createAssignment({
    orgId: params.orgId,
    agentInstanceId: bob.id,
    title: askBobTitle(instruction, params.context.who),
    objective: askBobObjective(params.context),
    priority: "high",
    expectedOutput:
      "A draft of the next commercial move, or the decision only a person can make. Do not send.",
    constraints: {
      execution_mode: "bot",
      source: "today_ask_bob",
      leadId: params.context.leadId ?? null,
      contactId: params.context.contactId ?? null,
      personId: params.context.personId ?? null,
      missionId: params.context.missionId ?? null,
      channelKind: params.context.channelKind ?? null,
      value: params.context.value ?? null,
    },
    entityRefs,
    idempotencyKey: attempt.key,
    userId: params.userId,
  });
  if (!created) {
    return { ok: false, error: "Could not hand that to Bob.", status: 500 };
  }

  if (svc) {
    await svc.from("assignment_messages").insert({
      org_id: params.orgId,
      assignment_id: created.id,
      role: "human",
      body: instruction,
      author_user_id: params.userId,
      delivered_at: new Date().toISOString(),
    });
  }

  // createAssignment only wakes Scout for non-mission work. Bob is woken here
  // when the gate has already confirmed he runs on a bot.
  const wake = await wakeEmployee({
    orgId: params.orgId,
    agentInstanceId: bob.id,
    stepId: created.id,
    missionId: params.context.missionId ?? null,
    event: "assignment",
  });

  return {
    ok: true,
    assignmentId: created.id,
    alreadyOut: false,
    bobName: bob.name,
    notice: assignmentQueuedNotice(wake),
  };
}
