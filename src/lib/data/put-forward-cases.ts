import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { countMessagesByAssignment } from "@/lib/data/assignment-threads";
import { anonymisedCvFilename } from "@/lib/data/anonymised-cv-filename";
import { buildWorkerCv } from "@/lib/data/worker-cv";
import {
  isPackIntent,
  packDisplayName,
  packIntentLabel,
  packIntentSentence,
  packIntentVerb,
  PUT_FORWARD_CASE_TYPE,
  type PackIntent,
} from "@/lib/data/put-forward";
import type { HandoffIds } from "@/lib/data/today-handoff";

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
// page uses, and the attach happens in Send from Triangle.
// ---------------------------------------------------------------------------

export interface PutForwardPack {
  workerId: string;
  /** "M. P." for a bio, the full name once a person has released identity. */
  displayName: string;
  /** The real name, for the internal card only. Never the outbound filename. */
  workerName: string;
  reference: string;
  filename: string;
  /** The human-only PDF route. Anonymised unless identity was released. */
  href: string;
  role: string;
  basedIn: string | null;
  availability: string;
  certificates: string[];
  languages: string[];
  /** What Triangle does not hold. Stated, because silence reads as a yes. */
  notRecorded: string[];
}

export interface PutForwardCase extends HandoffIds {
  assignmentId: string;
  status: "queued" | "active" | "completed" | "failed" | "cancelled";
  finished: boolean;
  agentName: string;
  agentEmoji: string;
  intent: PackIntent;
  intentLabel: string;
  intentSentence: string;
  /** "Hanna is preparing the bio" — the line the card shows while she works. */
  workingLine: string;
  title: string;
  entityIds: string[];
  companyId: string | null;
  missionId: string | null;
  /** The Bob thread this was asked from, when it was asked from one. */
  fromAssignmentId: string | null;
  messageCount: number;
  awaitingAgent: number;
  /** What Hanna actually wrote in the Triangle thread. Not a Grok chat. */
  hannaSaid: string | null;
  resultSummary: string | null;
  createdAt: string;
  completedAt: string | null;
  pack: PutForwardPack | null;
  /** Set when the ask named nobody Triangle holds a record for. */
  nobodyBound: boolean;
}

function asId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
    .select(
      "id, agent_instance_id, title, status, constraints, result_summary, created_at, completed_at",
    )
    .eq("org_id", orgId)
    .contains("constraints", { case_type: PUT_FORWARD_CASE_TYPE })
    .in("status", ["queued", "active", "completed"])
    .order("created_at", { ascending: false })
    .limit(40);

  const live = (rows ?? []).filter((row) => {
    if (row.status !== "completed") return true;
    return String(row.completed_at ?? "") >= since;
  });
  if (live.length === 0) return [];

  const assignmentIds = live.map((row) => row.id as string);
  const agentIds = Array.from(new Set(live.map((row) => row.agent_instance_id as string)));

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

  const kept = live.slice(0, limit);
  const packs = await Promise.all(
    kept.map((row) => {
      const constraints = (row.constraints as Record<string, unknown> | null) ?? {};
      const workerId = asId(constraints.worker_id);
      const intent = isPackIntent(constraints.pack_intent)
        ? constraints.pack_intent
        : "bio_anonymised";
      return workerId ? buildPack(orgId, workerId, intent) : Promise.resolve(null);
    }),
  );

  const cases: PutForwardCase[] = [];
  kept.forEach((row, i) => {
    const face = faces.get(row.agent_instance_id as string);
    if (!face) return;
    const constraints = (row.constraints as Record<string, unknown> | null) ?? {};
    const intent: PackIntent = isPackIntent(constraints.pack_intent)
      ? constraints.pack_intent
      : "bio_anonymised";
    const thread = threads.get(row.id as string);
    const status = row.status as PutForwardCase["status"];
    cases.push({
      assignmentId: row.id as string,
      status,
      finished: status === "completed",
      agentName: face.name,
      agentEmoji: face.emoji,
      intent,
      intentLabel: packIntentLabel(intent),
      intentSentence: packIntentSentence(intent),
      workingLine: `${face.name} is ${packIntentVerb(intent)}`,
      title: (row.title as string) || "Who we put forward",
      leadId: asId(constraints.leadId),
      contactId: asId(constraints.contactId),
      personId: asId(constraints.personId),
      companyId: asId(constraints.companyId),
      missionId: asId(constraints.missionId),
      fromAssignmentId: asId(constraints.from_assignment_id),
      entityIds: entityIds.get(row.id as string) ?? [],
      messageCount: thread?.total ?? 0,
      awaitingAgent: thread?.awaitingAgent ?? 0,
      hannaSaid: thread?.lastAgentBody ?? null,
      resultSummary: (row.result_summary as string | null) ?? null,
      createdAt: (row.created_at as string) ?? "",
      completedAt: (row.completed_at as string | null) ?? null,
      pack: packs[i],
      nobodyBound: !asId(constraints.worker_id),
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
  const cv = await buildWorkerCv({ orgId, workerId, includeIdentity: named });
  if (!cv) return null;
  // `buildWorkerCv` anonymises the display name itself; the real name is read
  // once here for the internal card so a person knows who they are looking at.
  const workerName = named ? cv.displayName : await realName(orgId, workerId);
  return {
    workerId,
    displayName: packDisplayName(workerName, intent),
    workerName,
    reference: cv.reference,
    filename: named
      ? `${workerName.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-cv.pdf`
      : anonymisedCvFilename(cv.reference),
    href: named
      ? `/api/workers/${workerId}/cv?identity=1`
      : `/api/workers/${workerId}/cv`,
    role: cv.role,
    basedIn: cv.basedIn,
    availability: cv.availability,
    certificates: cv.certificates,
    languages: cv.languages,
    notRecorded: cv.notRecorded,
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
