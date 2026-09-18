import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { createAssignment, listWorkforce, nextAttemptKey } from "@/lib/data/workforce";
import { loadEmployeeRuntime, wakeEmployee } from "@/lib/data/bot-runtime";
import {
  PUT_FORWARD_CASE_TYPE,
  PUT_FORWARD_SOURCE,
  type PackIntent,
} from "@/lib/data/put-forward";
import {
  askHannaExpectedOutput,
  askHannaObjective,
  askHannaTitle,
  hannaPickupNotice,
  hannaPutForwardBlockedReason,
  isHannaEmployee,
  type AskHannaContext,
} from "@/lib/data/ask-hanna-policy";

export {
  askHannaObjective,
  askHannaTitle,
  hannaPickupNotice,
  hannaPutForwardBlockedReason,
  isHannaEmployee,
  isHannaRole,
  HANNA_ROLE_KEYS,
  WORKER_PROPOSE_SCOPE,
  type AskHannaContext,
} from "@/lib/data/ask-hanna-policy";

// ---------------------------------------------------------------------------
// Ask Hanna from the case Bob is already on.
//
// The same shape as `askBob`, deliberately: an assignment carrying the case
// ids, a first human message, and nothing sent. The one difference is who
// wakes whom — `createAssignment` wakes Scout and Bob because they are always
// bot-owned, and leaves Hanna to her own handoff path. This is that path.
// ---------------------------------------------------------------------------

function utcDayKey(from = new Date()): string {
  return from.toISOString().slice(0, 10);
}

export interface AskHannaResult {
  ok: true;
  assignmentId: string;
  alreadyOut: boolean;
  hannaName: string;
  intent: PackIntent;
  /** The worker bound to the case, when the words named somebody real. */
  worker: { id: string; name: string } | null;
  /** Names the ask could have meant, when more than one person matched. */
  ambiguous: string[];
  notice: string;
}

export async function askHanna(params: {
  orgId: string;
  userId: string;
  context: AskHannaContext;
}): Promise<AskHannaResult | { ok: false; error: string; status: number }> {
  const instruction = params.context.instruction.trim();
  if (instruction.length < 2) {
    return { ok: false, error: "Write what Hanna should prepare.", status: 400 };
  }

  const roster = await listWorkforce(params.orgId);
  const row = roster.find((e) => e.status === "active" && isHannaEmployee(e)) ?? null;
  const hanna = row ? { id: row.id, name: row.displayName } : null;

  const svc = createServiceSupabaseClient();
  const scopes: string[] = [];
  if (svc && hanna) {
    const { data: badges } = await svc
      .from("machine_credentials")
      .select("scopes")
      .eq("org_id", params.orgId)
      .eq("agent_instance_id", hanna.id)
      .eq("status", "active");
    for (const badge of badges ?? []) {
      if (Array.isArray(badge.scopes)) {
        for (const scope of badge.scopes as string[]) scopes.push(scope);
      }
    }
  }

  const blocked = hannaPutForwardBlockedReason({ hanna, scopes });
  if (blocked || !hanna) {
    return { ok: false, error: blocked ?? "Nobody named Hanna is on the workforce.", status: 409 };
  }

  // Who the words meant, resolved against the books. Never invented: an ask
  // naming somebody Triangle has no record of binds nobody, and Hanna's
  // objective then asks her to name candidates from the pool instead.
  const resolved = await resolveWorker({
    orgId: params.orgId,
    workerId: params.context.workerId ?? null,
    text: [params.context.workerName, instruction].filter(Boolean).join(" \n "),
  });

  const subject =
    params.context.leadId ||
    params.context.contactId ||
    params.context.personId ||
    params.context.missionId ||
    "case";
  const baseKey = `ask-hanna:${hanna.id}:${subject}:${params.context.intent}:${utcDayKey()}`;
  const attempt = await nextAttemptKey(params.orgId, baseKey);
  if ("openAssignmentId" in attempt) {
    return {
      ok: true,
      assignmentId: attempt.openAssignmentId,
      alreadyOut: true,
      hannaName: hanna.name,
      intent: params.context.intent,
      worker: resolved.worker,
      ambiguous: resolved.ambiguous,
      notice: `${hanna.name} already has this — Open thread on this case.`,
    };
  }

  const entityRefs: Array<{
    type: "job_lead" | "contact" | "company" | "other";
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
  if (params.context.companyId) {
    entityRefs.push({ type: "company", id: params.context.companyId, relation: "context" });
  }
  if (params.context.missionId) {
    entityRefs.push({ type: "other", id: params.context.missionId, relation: "context" });
  }

  const context: AskHannaContext = {
    ...params.context,
    instruction,
    workerId: resolved.worker?.id ?? null,
    workerName: resolved.worker?.name ?? params.context.workerName ?? null,
  };

  const created = await createAssignment({
    orgId: params.orgId,
    agentInstanceId: hanna.id,
    title: askHannaTitle({
      intent: context.intent,
      workerName: context.workerName,
      who: context.who,
    }),
    objective: askHannaObjective(context),
    priority: "high",
    expectedOutput: askHannaExpectedOutput(context.intent),
    constraints: {
      // Deliberately no execution_mode: Hanna's inbox filter drops rows marked
      // in_app, and this case must reach her whichever runtime she is on.
      case_type: PUT_FORWARD_CASE_TYPE,
      source: PUT_FORWARD_SOURCE,
      pack_intent: context.intent,
      worker_id: context.workerId ?? null,
      worker_name: context.workerName ?? null,
      leadId: context.leadId ?? null,
      contactId: context.contactId ?? null,
      personId: context.personId ?? null,
      companyId: context.companyId ?? null,
      missionId: context.missionId ?? null,
      from_assignment_id: context.fromAssignmentId ?? null,
    },
    // Hydrates the worker record into Hanna's inbox, so she reads the facts
    // Triangle holds rather than the sentence a human typed.
    workerIds: context.workerId ? [context.workerId] : undefined,
    entityRefs,
    idempotencyKey: attempt.key,
    userId: params.userId,
  });
  if (!created) {
    return { ok: false, error: "Could not hand that to Hanna.", status: 500 };
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

  // `createAssignment` wakes Scout and Bob and leaves Hanna alone, because her
  // mission steps are woken by the mission handoff. A Today case is not a
  // mission step, so it is woken here — once.
  const { runtime } = await loadEmployeeRuntime(params.orgId, hanna.id);
  const wake =
    runtime === "bot"
      ? await wakeEmployee({
          orgId: params.orgId,
          agentInstanceId: hanna.id,
          stepId: created.id,
          missionId: null,
          event: "assignment",
        })
      : null;

  return {
    ok: true,
    assignmentId: created.id,
    alreadyOut: false,
    hannaName: hanna.name,
    intent: context.intent,
    worker: resolved.worker,
    ambiguous: resolved.ambiguous,
    notice: hannaPickupNotice({ hannaName: hanna.name, runtime, wake }),
  };
}

/**
 * The person the ask meant, from the org's own worker rows.
 *
 * "prepare a bio with matej cv" has to reach Matej's record or the packet is
 * about nobody. Matching is on the names Triangle already holds — a first
 * name is enough when exactly one person on the books answers to it, and two
 * Matejs bind nobody and come back as a question.
 */
export async function resolveWorker(params: {
  orgId: string;
  workerId: string | null;
  text: string;
}): Promise<{ worker: { id: string; name: string } | null; ambiguous: string[] }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { worker: null, ambiguous: [] };

  if (params.workerId) {
    const { data } = await svc
      .from("workers")
      .select("id, full_name")
      .eq("organization_id", params.orgId)
      .eq("id", params.workerId)
      .maybeSingle();
    if (data) {
      return {
        worker: { id: data.id as string, name: (data.full_name as string) || "Unnamed" },
        ambiguous: [],
      };
    }
  }

  const haystack = normalise(params.text);
  if (!haystack) return { worker: null, ambiguous: [] };

  const { data: rows } = await svc
    .from("workers")
    .select("id, full_name")
    .eq("organization_id", params.orgId)
    .in("status", ["active", "candidate"])
    .limit(1_000);

  const hits: Array<{ id: string; name: string; score: number }> = [];
  for (const row of rows ?? []) {
    const name = String(row.full_name ?? "").trim();
    if (!name) continue;
    const score = nameScore(haystack, name);
    if (score > 0) hits.push({ id: row.id as string, name, score });
  }
  if (hits.length === 0) return { worker: null, ambiguous: [] };

  hits.sort((a, b) => b.score - a.score);
  const best = hits[0];
  const tied = hits.filter((h) => h.score === best.score);
  if (tied.length > 1) {
    return { worker: null, ambiguous: tied.map((h) => h.name).slice(0, 6) };
  }
  return { worker: { id: best.id, name: best.name }, ambiguous: [] };
}

/** Lowercase, accents folded, punctuation to spaces. "Pavlović" ~ "pavlovic". */
function normalise(value: string): string {
  return ` ${value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/**
 * 2 for the whole name, 1 for one name part of three letters or more. Short
 * parts are ignored so "de" or "van" cannot bind a person.
 */
function nameScore(haystack: string, fullName: string): number {
  const name = normalise(fullName).trim();
  if (!name) return 0;
  if (haystack.includes(` ${name} `)) return 2;
  const parts = name.split(" ").filter((part) => part.length >= 3);
  return parts.some((part) => haystack.includes(` ${part} `)) ? 1 : 0;
}
