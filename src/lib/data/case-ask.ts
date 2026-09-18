import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { listWorkforce } from "@/lib/data/workforce";
import { askBob } from "@/lib/data/ask-bob";
import { askHanna, resolveWorker } from "@/lib/data/ask-hanna";
import {
  COMMERCIAL_FOLLOW_THROUGH_CASE_TYPE,
  isBobEmployee,
} from "@/lib/data/ask-bob-policy";
import { askHannaTitle, isHannaEmployee } from "@/lib/data/ask-hanna-policy";
import { addHumanMessage } from "@/lib/data/assignment-threads";
import {
  DEFAULT_PACK_INTENT,
  PUT_FORWARD_CASE_TYPE,
  explicitPackIntent,
  isPackIntent,
  packIntentLabel,
  type PackIntent,
} from "@/lib/data/put-forward";
import { routeCaseAsk, routedSentence } from "@/lib/data/case-ask-routing";

// ---------------------------------------------------------------------------
// One Ask on the case — the server half.
//
// A person writes what they want once. Triangle decides which employees it is
// for (`routeCaseAsk`) and gives it to them on this same case:
//
//   - an employee who already has a thread on this case gets the words in
//     that thread, which wakes them — a second Ask never opens a second job,
//     and never goes quietly missing the way a same-day Ask Bob did;
//   - otherwise the employee's own path opens the job (`askBob`, `askHanna`),
//     with everything those paths already guarantee: the badge check, the
//     case ids, the first message, the wake-up.
//
// When the words change who we put forward or in which form, Hanna's case is
// rebound and its approval is cleared. The send gate reads the person and the
// form from the case at send time, so an approval given for one person must
// never carry over to another.
//
// Nothing here sends anything outside Triangle.
// ---------------------------------------------------------------------------

export interface CaseAskContext {
  who?: string | null;
  about?: string | null;
  leadId?: string | null;
  contactId?: string | null;
  personId?: string | null;
  companyId?: string | null;
  missionId?: string | null;
  channelKind?: string | null;
  value?: string | null;
  also?: Array<{ leadId?: string | null; contactId?: string | null; personId?: string | null }> | null;
  /** The thread the words were typed in, when they were typed in one. */
  fromAssignmentId?: string | null;
}

export interface CaseAskHanded {
  employee: string;
  half: "chase" | "put_forward";
  assignmentId: string;
  /** "new": a job opened. "thread": the words went into the thread already on this case. */
  how: "new" | "thread";
  notice: string;
  /** What the words changed on Hanna's case, in plain words. */
  changed: string[];
}

export type CaseAskResult =
  | {
      ok: true;
      handed: CaseAskHanded[];
      refused: Array<{ employee: string; error: string }>;
      /** Names the words could have meant, when more than one person matched. */
      ambiguous: string[];
      sentence: string;
    }
  | { ok: false; error: string; status: number };

/** How far back a case's thread still counts as the thread on this case. */
const RECENT_DAYS = 30;

type Half = "chase" | "put_forward";

interface CaseWork {
  id: string;
  status: string;
  constraints: Record<string, unknown>;
}

function caseIds(ctx: CaseAskContext): string[] {
  const all = [
    ctx.leadId,
    ctx.contactId,
    ctx.personId,
    ...(ctx.also ?? []).flatMap((item) => [item.leadId, item.contactId, item.personId]),
  ];
  return [...new Set(all.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

/** The words without the recipient's own name, so "reply to Oliver" never binds a worker called Oliver. */
function withoutRecipient(text: string, who: string | null | undefined): string {
  let out = ` ${text} `;
  for (const part of (who ?? "").split(/\s+/).filter((p) => p.length >= 3)) {
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ");
  }
  return out.trim();
}

/** The newest thread this employee has on this case, for the given half. */
async function latestCaseWork(
  orgId: string,
  employeeId: string,
  ids: string[],
  half: Half,
): Promise<CaseWork | null> {
  const svc = createServiceSupabaseClient();
  if (!svc || ids.length === 0) return null;
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();
  const { data } = await svc
    .from("agent_assignments")
    .select("id, status, constraints, created_at")
    .eq("org_id", orgId)
    .eq("agent_instance_id", employeeId)
    .neq("status", "cancelled")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  for (const row of data ?? []) {
    const c = (row.constraints as Record<string, unknown> | null) ?? {};
    const caseType = String(c.case_type ?? "");
    const fits =
      half === "put_forward"
        ? caseType === PUT_FORWARD_CASE_TYPE
        : caseType === COMMERCIAL_FOLLOW_THROUGH_CASE_TYPE || c.source === "today_ask_bob";
    if (!fits) continue;
    const rowIds = [c.leadId, c.contactId, c.personId].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (rowIds.some((id) => ids.includes(id))) {
      return { id: row.id as string, status: row.status as string, constraints: c };
    }
  }
  return null;
}

/**
 * Rebind Hanna's case to the person or form the words asked for, and clear
 * the approval that was given for what it was before.
 */
async function rebindPutForward(params: {
  orgId: string;
  work: CaseWork;
  worker: { id: string; name: string } | null;
  intent: PackIntent | null;
  who: string | null | undefined;
}): Promise<string[]> {
  const c = params.work.constraints;
  const currentIntent: PackIntent = isPackIntent(c.pack_intent) ? c.pack_intent : DEFAULT_PACK_INTENT;
  const changes: Record<string, unknown> = {};
  const changed: string[] = [];
  if (params.intent && params.intent !== currentIntent) {
    changes.pack_intent = params.intent;
    changed.push(`form: ${packIntentLabel(params.intent).toLowerCase()}`);
  }
  if (params.worker && params.worker.id !== c.worker_id) {
    changes.worker_id = params.worker.id;
    changes.worker_name = params.worker.name;
    changed.push(`person: ${params.worker.name}`);
  }
  if (changed.length === 0) return [];

  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const next = { ...c, ...changes };
  await svc
    .from("agent_assignments")
    .update({
      constraints: next,
      title: askHannaTitle({
        intent: isPackIntent(next.pack_intent) ? next.pack_intent : DEFAULT_PACK_INTENT,
        workerName: typeof next.worker_name === "string" ? next.worker_name : null,
        who: params.who ?? null,
      }),
      review_outcome: null,
      review_note: null,
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq("id", params.work.id)
    .eq("org_id", params.orgId);
  if (params.worker && params.worker.id !== c.worker_id) {
    // So her inbox hydrates the record of the person she is now asked about.
    await svc.from("agent_assignment_entities").insert({
      org_id: params.orgId,
      assignment_id: params.work.id,
      entity_type: "worker",
      entity_id: params.worker.id,
      relation: "input",
    });
  }
  return changed;
}

/**
 * Hanna's half: the words go into her thread on this case, rebinding the
 * person or the form when they changed it, or open her job when there is none.
 */
async function giveHanna(params: {
  orgId: string;
  userId: string;
  text: string;
  ctx: CaseAskContext;
  ids: string[];
  worker: { id: string; name: string } | null;
  hanna: { id: string; name: string } | null;
  chaseThread: string | null;
}): Promise<CaseAskHanded | { employee: string; error: string }> {
  const { ctx } = params;
  const intent = explicitPackIntent(params.text);
  const work = params.hanna
    ? await latestCaseWork(params.orgId, params.hanna.id, params.ids, "put_forward")
    : null;
  if (params.hanna && work) {
    const changed = await rebindPutForward({
      orgId: params.orgId,
      work,
      worker: params.worker,
      intent,
      who: ctx.who,
    });
    const sent = await addHumanMessage({
      assignmentId: work.id,
      orgId: params.orgId,
      userId: params.userId,
      body: params.text,
    });
    if (!sent.ok) {
      return { employee: params.hanna.name, error: sent.error ?? "The thread did not take it." };
    }
    return {
      employee: params.hanna.name,
      half: "put_forward",
      assignmentId: work.id,
      how: "thread",
      notice: sent.notice,
      changed,
    };
  }

  const asked = await askHanna({
    orgId: params.orgId,
    userId: params.userId,
    context: {
      instruction: params.text,
      intent: intent ?? DEFAULT_PACK_INTENT,
      who: ctx.who ?? null,
      about: ctx.about ?? null,
      workerId: params.worker?.id ?? null,
      workerName: params.worker?.name ?? null,
      leadId: ctx.leadId ?? null,
      contactId: ctx.contactId ?? null,
      personId: ctx.personId ?? null,
      companyId: ctx.companyId ?? null,
      missionId: ctx.missionId ?? null,
      fromAssignmentId: params.chaseThread,
    },
  });
  if (!asked.ok) {
    return { employee: params.hanna?.name ?? "Hanna", error: asked.error };
  }
  return {
    employee: asked.hannaName,
    half: "put_forward",
    assignmentId: asked.assignmentId,
    how: asked.alreadyOut ? "thread" : "new",
    notice: asked.notice,
    changed: [],
  };
}

/**
 * Words typed in Bob's thread on a case that are about who we put forward
 * reach Hanna on the same case — the person does not have to know whose half
 * it is. Returns null when the words are Bob's alone, or the thread is not a
 * case's conversation.
 */
export async function routeThreadWords(params: {
  orgId: string;
  userId: string;
  assignmentId: string;
  text: string;
}): Promise<CaseAskHanded | { employee: string; error: string } | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data: row } = await svc
    .from("agent_assignments")
    .select("id, agent_instance_id, constraints")
    .eq("id", params.assignmentId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  if (!row) return null;
  const c = (row.constraints as Record<string, unknown> | null) ?? {};
  const isChase =
    c.case_type === COMMERCIAL_FOLLOW_THROUGH_CASE_TYPE || c.source === "today_ask_bob";
  if (!isChase) return null;

  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const ctx: CaseAskContext = {
    leadId: str(c.leadId),
    contactId: str(c.contactId),
    personId: str(c.personId),
    companyId: str(c.companyId),
    missionId: str(c.missionId),
    fromAssignmentId: params.assignmentId,
  };
  const ids = caseIds(ctx);
  if (ids.length === 0) return null;

  const named = await resolveWorker({ orgId: params.orgId, workerId: null, text: params.text });
  const route = routeCaseAsk(params.text, {
    namesSomeoneOnTheBooks: Boolean(named.worker) || named.ambiguous.length > 0,
  });
  if (!route.hanna) return null;

  const roster = await listWorkforce(params.orgId);
  const hanna = roster.find((e) => e.status === "active" && isHannaEmployee(e)) ?? null;
  if (hanna && hanna.id === row.agent_instance_id) return null;
  return giveHanna({
    orgId: params.orgId,
    userId: params.userId,
    text: params.text,
    ctx,
    ids,
    worker: named.worker,
    hanna: hanna ? { id: hanna.id, name: hanna.displayName } : null,
    chaseThread: params.assignmentId,
  });
}

export async function askTheTeam(params: {
  orgId: string;
  userId: string;
  text: string;
  context: CaseAskContext;
}): Promise<CaseAskResult> {
  const text = params.text.trim();
  if (text.length < 2) {
    return { ok: false, error: "Write what the team should do.", status: 400 };
  }
  const ctx = params.context;
  const ids = caseIds(ctx);
  if (ids.length === 0) {
    return { ok: false, error: "This card carries no case to hand over.", status: 400 };
  }

  const named = await resolveWorker({
    orgId: params.orgId,
    workerId: null,
    text: withoutRecipient(text, ctx.who),
  });
  const route = routeCaseAsk(text, {
    namesSomeoneOnTheBooks: Boolean(named.worker) || named.ambiguous.length > 0,
  });

  const roster = await listWorkforce(params.orgId);
  const bob = roster.find((e) => e.status === "active" && isBobEmployee(e)) ?? null;
  const hanna = roster.find((e) => e.status === "active" && isHannaEmployee(e)) ?? null;

  const handed: CaseAskHanded[] = [];
  const refused: Array<{ employee: string; error: string }> = [];
  let chaseThread: string | null = null;

  if (route.bob) {
    const work = bob ? await latestCaseWork(params.orgId, bob.id, ids, "chase") : null;
    if (bob && work) {
      const sent = await addHumanMessage({
        assignmentId: work.id,
        orgId: params.orgId,
        userId: params.userId,
        body: text,
      });
      if (sent.ok) {
        chaseThread = work.id;
        handed.push({
          employee: bob.displayName,
          half: "chase",
          assignmentId: work.id,
          how: "thread",
          notice: sent.notice,
          changed: [],
        });
      } else {
        refused.push({ employee: bob.displayName, error: sent.error ?? "The thread did not take it." });
      }
    } else {
      const asked = await askBob({
        orgId: params.orgId,
        userId: params.userId,
        context: {
          instruction: text,
          who: ctx.who ?? null,
          about: ctx.about ?? null,
          leadId: ctx.leadId ?? null,
          contactId: ctx.contactId ?? null,
          personId: ctx.personId ?? null,
          companyId: ctx.companyId ?? null,
          missionId: ctx.missionId ?? null,
          channelKind: ctx.channelKind ?? null,
          value: ctx.value ?? null,
          also: (ctx.also ?? []).map((item) => ({
            leadId: item.leadId ?? undefined,
            contactId: item.contactId ?? undefined,
            personId: item.personId ?? undefined,
          })),
        },
      });
      if (asked.ok) {
        chaseThread = asked.assignmentId;
        handed.push({
          employee: asked.bobName,
          half: "chase",
          assignmentId: asked.assignmentId,
          how: asked.alreadyOut ? "thread" : "new",
          notice: asked.notice,
          changed: [],
        });
      } else {
        refused.push({ employee: bob?.displayName ?? "Bob", error: asked.error });
      }
    }
  }

  if (route.hanna) {
    const given = await giveHanna({
      orgId: params.orgId,
      userId: params.userId,
      text,
      ctx,
      ids,
      worker: named.worker,
      hanna: hanna ? { id: hanna.id, name: hanna.displayName } : null,
      chaseThread: chaseThread ?? ctx.fromAssignmentId ?? null,
    });
    if ("error" in given) refused.push(given);
    else handed.push(given);
  }

  if (handed.length === 0) {
    return {
      ok: false,
      error: refused.map((r) => `${r.employee}: ${r.error}`).join(" ") || "Nobody on the team could take that.",
      status: 409,
    };
  }

  return {
    ok: true,
    handed,
    refused,
    ambiguous: named.ambiguous,
    sentence: routedSentence(handed.map((h) => h.employee)),
  };
}
