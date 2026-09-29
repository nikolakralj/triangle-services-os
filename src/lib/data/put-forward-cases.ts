import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { countMessagesByAssignment } from "@/lib/data/assignment-threads";
import { packFilename } from "@/lib/data/anonymised-cv-filename";
import { buildWorkerCv } from "@/lib/data/worker-cv";
import { matchesIds, type HandoffIds } from "@/lib/data/today-handoff";
import {
  isPackIntent,
  mayAttachPack,
  packApprovalOf,
  packDisplayName,
  packIntentLabel,
  packIntentSentence,
  packIntentVerb,
  PACK_APPROVED_OUTCOME,
  PACK_NOT_APPROVED,
  PACK_NOT_USED_OUTCOME,
  PACK_SUPERSEDED,
  PACK_WRONG_CASE,
  PUT_FORWARD_CASE_TYPE,
  type PackIntent,
  type PutForwardCase,
  type PutForwardPack,
} from "@/lib/data/put-forward";

export type { PutForwardCase, PutForwardPack };

// ---------------------------------------------------------------------------
// Who we put forward, on the case the human is already looking at.
//
// The point of this file is that the case is never empty while Hanna thinks.
// Triangle already holds the facts and already renders the document; what
// Hanna adds is whether those facts are true for this country, this ticket and
// this week. So the packet is read straight out of the worker record and shown
// the moment the case is hers, marked as Triangle's own record — not as
// something Hanna said. Attributing a generated summary to an employee who has
// not answered yet is the same lie as a queued row that nobody picks up.
//
// Nothing here sends. The PDF link is the same human-only route the Talent
// page uses, and the attach happens in Send from Triangle — but only after a
// person has opened the document and approved it here. `approvedPackForSend`
// is that gate, re-read from the record at the moment of sending, so a
// browser cannot assert an approval nobody gave.
// ---------------------------------------------------------------------------

function asId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const CASE_COLUMNS =
  "id, agent_instance_id, title, status, constraints, result_summary, created_at, completed_at, review_outcome, review_note, reviewed_at";

interface CaseRow {
  id: string;
  agent_instance_id: string;
  title: string | null;
  status: string;
  constraints: Record<string, unknown> | null;
  result_summary: string | null;
  created_at: string | null;
  completed_at: string | null;
  review_outcome: string | null;
  review_note: string | null;
  reviewed_at: string | null;
}

/**
 * Open and recently finished "who we put forward" cases, with the packet
 * Triangle can already produce for each.
 *
 * `hours` bounds the finished ones the same way "Done since you looked" does:
 * a packet from last month is history, not something the card should offer.
 */
export async function listPutForwardCases(
  orgId: string,
  hours = 72,
  limit = 12,
): Promise<PutForwardCase[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data: rows } = await svc
    .from("agent_assignments")
    .select(CASE_COLUMNS)
    .eq("org_id", orgId)
    .contains("constraints", { case_type: PUT_FORWARD_CASE_TYPE })
    .in("status", ["queued", "active", "completed"])
    .order("created_at", { ascending: false })
    .limit(40);

  const live = ((rows ?? []) as unknown as CaseRow[]).filter((row) => {
    if (row.status !== "completed") return true;
    return String(row.completed_at ?? "") >= since;
  });
  return hydrate(orgId, live.slice(0, limit));
}

/** One case, read the same way the list reads it. */
export async function getPutForwardCase(
  assignmentId: string,
  orgId: string,
): Promise<PutForwardCase | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data } = await svc
    .from("agent_assignments")
    .select(CASE_COLUMNS)
    .eq("org_id", orgId)
    .eq("id", assignmentId)
    .contains("constraints", { case_type: PUT_FORWARD_CASE_TYPE })
    .maybeSingle();
  if (!data) return null;
  const [one] = await hydrate(orgId, [data as unknown as CaseRow]);
  return one ?? null;
}

async function hydrate(orgId: string, kept: CaseRow[]): Promise<PutForwardCase[]> {
  const svc = createServiceSupabaseClient();
  if (!svc || kept.length === 0) return [];

  const assignmentIds = kept.map((row) => row.id);
  const agentIds = Array.from(new Set(kept.map((row) => row.agent_instance_id)));

  const [{ data: agents }, { data: entities }, threads] = await Promise.all([
    svc
      .from("agent_instances")
      .select("id, display_name, emoji")
      .eq("org_id", orgId)
      .in("id", agentIds),
    svc
      .from("agent_assignment_entities")
      .select("assignment_id, entity_id")
      .eq("org_id", orgId)
      .in("assignment_id", assignmentIds),
    countMessagesByAssignment(assignmentIds, orgId),
  ]);

  const faces = new Map(
    (agents ?? []).map((a) => [
      a.id as string,
      {
        name: (a.display_name as string) || "Hanna",
        emoji: (a.emoji as string) || "👤",
      },
    ]),
  );
  const entityIds = new Map<string, string[]>();
  for (const row of entities ?? []) {
    const key = row.assignment_id as string;
    if (!entityIds.has(key)) entityIds.set(key, []);
    entityIds.get(key)!.push(row.entity_id as string);
  }

  const packs = await Promise.all(
    kept.map((row) => {
      const constraints = row.constraints ?? {};
      const workerId = asId(constraints.worker_id);
      const intent = isPackIntent(constraints.pack_intent)
        ? constraints.pack_intent
        : "bio_anonymised";
      return workerId ? buildPack(orgId, workerId, intent) : Promise.resolve(null);
    }),
  );

  const cases: PutForwardCase[] = [];
  kept.forEach((row, i) => {
    const face = faces.get(row.agent_instance_id);
    if (!face) return;
    const constraints = row.constraints ?? {};
    const intent: PackIntent = isPackIntent(constraints.pack_intent)
      ? constraints.pack_intent
      : "bio_anonymised";
    const thread = threads.get(row.id);
    const status = row.status as PutForwardCase["status"];
    cases.push({
      assignmentId: row.id,
      status,
      finished: status === "completed",
      agentName: face.name,
      agentEmoji: face.emoji,
      intent,
      intentLabel: packIntentLabel(intent),
      intentSentence: packIntentSentence(intent),
      workingLine: `${face.name} is ${packIntentVerb(intent)}`,
      title: row.title || "Who we put forward",
      leadId: asId(constraints.leadId),
      contactId: asId(constraints.contactId),
      personId: asId(constraints.personId),
      companyId: asId(constraints.companyId),
      missionId: asId(constraints.missionId),
      fromAssignmentId: asId(constraints.from_assignment_id),
      entityIds: entityIds.get(row.id) ?? [],
      messageCount: thread?.total ?? 0,
      awaitingAgent: thread?.awaitingAgent ?? 0,
      hannaSaid: thread?.lastAgentBody ?? null,
      resultSummary: row.result_summary ?? null,
      createdAt: row.created_at ?? "",
      completedAt: row.completed_at ?? null,
      pack: packs[i],
      nobodyBound: !asId(constraints.worker_id),
      approval: packApprovalOf({
        reviewOutcome: row.review_outcome,
        reviewedAt: row.reviewed_at,
        completedAt: row.completed_at,
      }),
      approvedAt:
        row.review_outcome === PACK_APPROVED_OUTCOME ? row.reviewed_at : null,
      decidedNote: row.review_note ?? null,
    });
  });
  return cases;
}

async function buildPack(
  orgId: string,
  workerId: string,
  intent: PackIntent,
): Promise<PutForwardPack | null> {
  const named = intent === "full_cv";
  const cv = await buildWorkerCv({ orgId, workerId, intent });
  if (!cv) return null;
  // `buildWorkerCv` anonymises the display name itself; the real name is read
  // once here for the internal card so a person knows who they are looking at.
  const workerName = named ? cv.displayName : await realName(orgId, workerId);
  return {
    workerId,
    displayName: packDisplayName(workerName, intent),
    workerName,
    reference: cv.reference,
    filename: packFilename({ intent, reference: cv.reference, workerName }),
    // The link opens the exact version that would be attached, because that
    // is the document being approved.
    href: `/api/workers/${workerId}/cv?variant=${intent}`,
    role: cv.role,
    basedIn: cv.basedIn,
    availability: cv.availability,
    certificates: cv.certificates,
    languages: cv.languages,
    notRecorded: cv.notRecorded,
  };
}

export type PutForwardDecision = "approve" | "not_used";

/**
 * A person's decision on what may leave Triangle about a real human being.
 *
 * Recorded where migration 042 already keeps human decisions on an
 * employee's work, so this needs no new table and no new migration. A
 * "not used" needs a reason — the same rule as a discarded report, and the
 * schema enforces it too.
 */
export async function decidePutForwardPack(params: {
  assignmentId: string;
  orgId: string;
  userId: string;
  decision: PutForwardDecision;
  note: string;
}): Promise<
  | { ok: true; pack: PutForwardCase | null }
  | { ok: false; error: string; status: number }
> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, error: "Database unavailable.", status: 503 };

  const note = params.note.trim();
  if (params.decision === "not_used" && note.length < 3) {
    return {
      ok: false,
      error:
        "Say why in a few words — wrong person, too thin, wrong version. Without a reason the same pack comes back next week.",
      status: 400,
    };
  }

  const { data, error } = await svc
    .from("agent_assignments")
    .update({
      review_outcome:
        params.decision === "approve" ? PACK_APPROVED_OUTCOME : PACK_NOT_USED_OUTCOME,
      review_note: note || null,
      reviewed_by: params.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.assignmentId)
    .eq("org_id", params.orgId)
    .contains("constraints", { case_type: PUT_FORWARD_CASE_TYPE })
    .select("id");
  if (error || !data?.length) {
    return {
      ok: false,
      error: error?.message ?? "That case is not one of this organization's packs.",
      status: 409,
    };
  }

  return {
    ok: true,
    pack: await getPutForwardCase(params.assignmentId, params.orgId),
  };
}

/**
 * The send-time gate.
 *
 * Returns what may be attached only when a person approved this exact pack,
 * the approval still stands, and the pack belongs to the case being written
 * to. Everything else is a refusal with the reason in plain words.
 */
export async function approvedPackForSend(params: {
  orgId: string;
  assignmentId: string;
  ids: HandoffIds;
}): Promise<
  | { ok: true; workerId: string; intent: PackIntent; filename: string }
  | { ok: false; error: string; status: number }
> {
  const item = await getPutForwardCase(params.assignmentId, params.orgId);
  if (!item) {
    return {
      ok: false,
      error: "That pack is not on this organization's books.",
      status: 404,
    };
  }
  if (!mayAttachPack(item.approval)) {
    return {
      ok: false,
      error: item.approval === "superseded" ? PACK_SUPERSEDED : PACK_NOT_APPROVED,
      status: 409,
    };
  }
  if (!item.pack) {
    return {
      ok: false,
      error: "Triangle holds no profile for that person any more.",
      status: 404,
    };
  }
  if (!matchesIds(item, params.ids)) {
    return { ok: false, error: PACK_WRONG_CASE, status: 409 };
  }

  return {
    ok: true,
    workerId: item.pack.workerId,
    intent: item.intent,
    filename: item.pack.filename,
  };
}

async function realName(orgId: string, workerId: string): Promise<string> {
  const svc = createServiceSupabaseClient();
  if (!svc) return "Unnamed";
  const { data } = await svc
    .from("workers")
    .select("full_name")
    .eq("organization_id", orgId)
    .eq("id", workerId)
    .maybeSingle();
  return (data?.full_name as string | undefined)?.trim() || "Unnamed";
}
