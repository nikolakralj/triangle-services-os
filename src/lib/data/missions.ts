import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { createAssignment } from "@/lib/data/workforce";
import { listSupplyPartners } from "@/lib/data/supply-partners";
import type { MissionNaming } from "@/lib/ai/mission-namer";
import {
  parseMissionStepRecord,
  type ChannelWhose,
  type MissionChannelKind,
  type TargetState,
} from "@/lib/ai/mission-report";
import {
  hostOf,
  parseActivity,
  type ActivityEvent,
  type MissionAttempt,
  type MissionCandidate,
  type MissionChannel,
  type MissionCompanyRow,
  type MissionKind,
  type MissionMessage,
  type MissionPartner,
  type MissionPersonRow,
  type MissionProjectRow,
  type MissionSourceRow,
  type MissionState,
  type MissionStepView,
  type MissionTab,
  type MissionWorkspace,
  type ReadyToContact,
} from "@/lib/data/mission-shared";

// ---------------------------------------------------------------------------
// Missions: one objective, every instruction inside it, and everything the
// work produced.
//
// A mission is a row in `missions`. Each instruction is an ordinary
// agent_assignment with that mission_id — auditable, budgeted, visible on
// Workforce like any other job. What the steps found are agent_findings with
// the same mission_id, pointing at the company and person records they were
// written onto. Nothing here is a copy; the loaders below assemble one view
// from those three places every time.
//
// Every read tolerates the tables not being there yet, so Today and the
// sidebar still render on a database that has not had migration 043.
// ---------------------------------------------------------------------------

type Svc = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;

/** A step claimed this long ago that never reported back has stopped. */
export const STALE_STEP_MINUTES = 15;

/** How many open missions the tab strip carries. */
const TAB_LIMIT = 12;

const MISSION_FIELDS =
  "id, org_id, title, emoji, objective, kind, lead_agent_instance_id, created_by, created_at, updated_at, last_seen_at, closed_at";
const STEP_FIELDS =
  "id, mission_id, status, title, objective, created_at, started_at, completed_at, result_summary, constraints, agent_instance_id";

interface MissionRow {
  id: string;
  org_id: string;
  title: string;
  emoji: string | null;
  objective: string;
  kind: MissionKind;
  lead_agent_instance_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
  closed_at: string | null;
}

interface StepRow {
  id: string;
  mission_id: string;
  status: string;
  title: string;
  objective: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result_summary: string | null;
  constraints: Record<string, unknown> | null;
  agent_instance_id: string;
}

interface FindingRow {
  id: string;
  finding_type: string;
  finding_state: TargetState | null;
  status: string;
  payload: Record<string, unknown> | null;
  source_url: string | null;
  created_at: string;
  reviewed_at: string | null;
  promoted_entity_id: string | null;
}

// ── state ───────────────────────────────────────────────────────────────────

function isTodayUtc(iso: string): boolean {
  return new Date(iso).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

/**
 * Where a mission is, from its steps. Steps newest first.
 *
 * Deliberately a function of rows that already exist rather than a column:
 * the tab, the page and the sidebar all call this, so they cannot disagree.
 */
export function deriveMissionState(
  mission: Pick<MissionRow, "closed_at" | "last_seen_at">,
  steps: StepRow[],
  now = Date.now(),
): { state: MissionState; reason: string | null } {
  if (mission.closed_at) return { state: "done", reason: "Closed" };

  const active = steps.find((s) => s.status === "active");
  if (active) {
    const started = active.started_at ? new Date(active.started_at).getTime() : now;
    if (now - started > STALE_STEP_MINUTES * 60_000) {
      return {
        state: "blocked",
        reason: "The last run stopped without reporting back. Try it again.",
      };
    }
    return { state: "working", reason: null };
  }

  const queued = steps.filter((s) => s.status === "queued");
  if (queued.length > 0) {
    const refused = queued
      .map((s) => s.constraints?.budget_refused_at)
      .find((v): v is string => typeof v === "string");
    if (refused && isTodayUtc(refused)) {
      return {
        state: "blocked",
        reason: "Today's run budget is spent. It picks up again tomorrow.",
      };
    }
    return { state: "queued", reason: null };
  }

  const latest = steps[0];
  if (!latest) return { state: "queued", reason: null };
  if (latest.status === "failed") {
    return {
      state: "blocked",
      reason: (latest.result_summary ?? "The last step failed.").slice(0, 240),
    };
  }
  if (latest.status === "cancelled") return { state: "done", reason: null };

  const record = parseMissionStepRecord(latest.result_summary);
  if (record?.questionForCeo) return { state: "needs_you", reason: record.questionForCeo };

  const finished = latest.completed_at ? new Date(latest.completed_at).getTime() : 0;
  const seen = mission.last_seen_at ? new Date(mission.last_seen_at).getTime() : 0;
  return finished > seen ? { state: "ready", reason: null } : { state: "done", reason: null };
}

async function loadSteps(
  svc: Svc,
  orgId: string,
  missionIds: string[],
): Promise<Map<string, StepRow[]>> {
  const out = new Map<string, StepRow[]>();
  if (missionIds.length === 0) return out;
  const { data } = await svc
    .from("agent_assignments")
    .select(STEP_FIELDS)
    .eq("org_id", orgId)
    .in("mission_id", missionIds)
    .order("created_at", { ascending: false });
  for (const row of (data ?? []) as StepRow[]) {
    const list = out.get(row.mission_id) ?? [];
    list.push(row);
    out.set(row.mission_id, list);
  }
  return out;
}

// ── tabs ────────────────────────────────────────────────────────────────────

/**
 * The open missions, as tabs.
 *
 * In the order they were opened, like browser tabs. Reordering by activity
 * would move the tab under the CEO's cursor every time a worker finished.
 */
export async function listMissionTabs(orgId: string): Promise<MissionTab[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data, error } = await svc
    .from("missions")
    .select(MISSION_FIELDS)
    .eq("org_id", orgId)
    .is("closed_at", null)
    .order("updated_at", { ascending: false })
    .limit(TAB_LIMIT);
  if (error || !data || data.length === 0) return [];

  const missions = (data as MissionRow[]).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const steps = await loadSteps(
    svc,
    orgId,
    missions.map((m) => m.id),
  );
  return missions.map((m) => {
    const { state, reason } = deriveMissionState(m, steps.get(m.id) ?? []);
    return {
      id: m.id,
      title: m.title,
      emoji: m.emoji,
      kind: m.kind,
      state,
      reason,
      updatedAt: m.updated_at,
    };
  });
}

/** For the sidebar: missions waiting on a human — asked, finished, or stuck. */
export async function countMissionsForYou(orgId: string): Promise<number> {
  const tabs = await listMissionTabs(orgId);
  return tabs.filter(
    (t) => t.state === "needs_you" || t.state === "ready" || t.state === "blocked",
  ).length;
}

export async function listClosedMissions(
  orgId: string,
  limit = 30,
): Promise<Array<{ id: string; title: string; emoji: string | null; closedAt: string; objective: string }>> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data, error } = await svc
    .from("missions")
    .select("id, title, emoji, objective, closed_at")
    .eq("org_id", orgId)
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((m) => ({
    id: m.id as string,
    title: m.title as string,
    emoji: (m.emoji as string | null) ?? null,
    objective: m.objective as string,
    closedAt: m.closed_at as string,
  }));
}

// ── starting and continuing ─────────────────────────────────────────────────

export async function startMission(params: {
  orgId: string;
  userId: string | null;
  text: string;
  naming: MissionNaming;
  leadAgentInstanceId: string;
}): Promise<{ missionId: string; stepId: string } | { error: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { error: "Database unavailable." };

  const { data, error } = await svc
    .from("missions")
    .insert({
      org_id: params.orgId,
      title: params.naming.title,
      emoji: params.naming.emoji,
      objective: params.naming.objective,
      kind: params.naming.kind,
      lead_agent_instance_id: params.leadAgentInstanceId,
      created_by: params.userId,
      // Seen at birth, so it only turns "ready" when a step finishes after.
      last_seen_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: error?.message ?? "Could not start the mission." };
  }

  const step = await addStep(svc, {
    orgId: params.orgId,
    missionId: data.id as string,
    agentInstanceId: params.leadAgentInstanceId,
    userId: params.userId,
    text: params.text,
  });
  if ("error" in step) return step;
  return { missionId: data.id as string, stepId: step.stepId };
}

/**
 * The next instruction inside a mission.
 *
 * Always a new step, never a message pushed into a step that is still
 * running: the worker files its result against the thread, and a question
 * that lands mid-run would leave its own step unable to finish. A step that
 * arrives while another is working waits in the queue and reads what the
 * first one filed — which is the point of a mission.
 */
export async function addMissionInstruction(params: {
  orgId: string;
  userId: string | null;
  missionId: string;
  text: string;
}): Promise<{ missionId: string; stepId: string } | { error: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { error: "Database unavailable." };

  const { data: mission } = await svc
    .from("missions")
    .select("id, lead_agent_instance_id")
    .eq("id", params.missionId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  if (!mission) return { error: "That mission does not exist." };
  if (!mission.lead_agent_instance_id) {
    return { error: "Nobody is leading this mission any more." };
  }

  const { data: lead } = await svc
    .from("agent_instances")
    .select("status, display_name")
    .eq("id", mission.lead_agent_instance_id as string)
    .eq("org_id", params.orgId)
    .maybeSingle();
  if (!lead || lead.status !== "active") {
    return { error: `${(lead?.display_name as string) ?? "Its employee"} is not active.` };
  }

  const step = await addStep(svc, {
    orgId: params.orgId,
    missionId: params.missionId,
    agentInstanceId: mission.lead_agent_instance_id as string,
    userId: params.userId,
    text: params.text,
  });
  if ("error" in step) return step;
  return { missionId: params.missionId, stepId: step.stepId };
}

async function addStep(
  svc: Svc,
  params: {
    orgId: string;
    missionId: string;
    agentInstanceId: string;
    userId: string | null;
    text: string;
  },
): Promise<{ stepId: string } | { error: string }> {
  const text = params.text.trim().slice(0, 8_000);
  const created = await createAssignment({
    orgId: params.orgId,
    agentInstanceId: params.agentInstanceId,
    title: text.split("\n")[0].slice(0, 120),
    objective: text,
    priority: "high",
    constraints: { execution_mode: "in_app", case_type: "mission_step" },
    missionId: params.missionId,
    userId: params.userId,
  });
  if (!created) return { error: "Could not hand that instruction out." };

  // The instruction is the first line of the step's thread, so the
  // conversation reads as one: what was asked, what came back.
  await svc.from("assignment_messages").insert({
    org_id: params.orgId,
    assignment_id: created.id,
    role: "human",
    body: text,
    author_user_id: params.userId,
    delivered_at: new Date().toISOString(),
  });

  // An instruction given to a closed mission reopens it — the CEO continuing
  // to talk about it is the reopening.
  await svc
    .from("missions")
    .update({ updated_at: new Date().toISOString(), closed_at: null, closed_by: null })
    .eq("id", params.missionId)
    .eq("org_id", params.orgId);

  return { stepId: created.id };
}

export async function touchMission(orgId: string, missionId: string): Promise<void> {
  const svc = createServiceSupabaseClient();
  if (!svc) return;
  await svc
    .from("missions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", missionId)
    .eq("org_id", orgId);
}

export async function markMissionSeen(orgId: string, missionId: string): Promise<void> {
  const svc = createServiceSupabaseClient();
  if (!svc) return;
  // updated_at is set by trigger on every update; seen is not activity, so
  // it is put back to what it was.
  const { data } = await svc
    .from("missions")
    .select("updated_at")
    .eq("id", missionId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return;
  await svc
    .from("missions")
    .update({ last_seen_at: new Date().toISOString(), updated_at: data.updated_at })
    .eq("id", missionId)
    .eq("org_id", orgId);
}

export async function setMissionClosed(params: {
  orgId: string;
  missionId: string;
  userId: string;
  closed: boolean;
}): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;
  const { data, error } = await svc
    .from("missions")
    .update(
      params.closed
        ? { closed_at: new Date().toISOString(), closed_by: params.userId }
        : { closed_at: null, closed_by: null },
    )
    .eq("id", params.missionId)
    .eq("org_id", params.orgId)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Put a stopped step back in the queue.
 *
 * A step whose run died without reporting stays `active` for ever, and a
 * failed one ends the conversation on an error. Either can be tried again
 * without retyping the instruction.
 */
export async function retryMissionStep(params: {
  orgId: string;
  missionId: string;
}): Promise<{ stepId: string } | { error: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { error: "Database unavailable." };
  const steps = (await loadSteps(svc, params.orgId, [params.missionId])).get(params.missionId) ?? [];
  const latest = steps[0];
  if (!latest) return { error: "There is nothing to try again." };

  const stale =
    latest.status === "active" &&
    latest.started_at !== null &&
    Date.now() - new Date(latest.started_at).getTime() > STALE_STEP_MINUTES * 60_000;
  const refusedToday =
    latest.status === "queued" && typeof latest.constraints?.budget_refused_at === "string";
  if (latest.status !== "failed" && !stale && !refusedToday) {
    return { error: "The last step has not stopped, so there is nothing to try again." };
  }

  const constraints = { ...(latest.constraints ?? {}) };
  delete constraints.budget_refused_at;
  const { error } = await svc
    .from("agent_assignments")
    .update({
      status: "queued",
      started_at: null,
      completed_at: null,
      result_summary: null,
      constraints,
    })
    .eq("id", latest.id)
    .eq("org_id", params.orgId);
  if (error) return { error: error.message };
  return { stepId: latest.id };
}

/** The oldest step still waiting, if nothing in the mission is running. */
export async function nextQueuedStep(orgId: string, missionId: string): Promise<string | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const steps = (await loadSteps(svc, orgId, [missionId])).get(missionId) ?? [];
  const running = steps.some(
    (s) =>
      s.status === "active" &&
      s.started_at !== null &&
      Date.now() - new Date(s.started_at).getTime() <= STALE_STEP_MINUTES * 60_000,
  );
  if (running) return null;
  const queued = steps.filter((s) => s.status === "queued");
  return queued.length > 0 ? queued[queued.length - 1].id : null;
}

// ── what a mission holds ────────────────────────────────────────────────────

export interface MissionHoldings {
  companies: MissionCompanyRow[];
  people: MissionPersonRow[];
  projects: MissionProjectRow[];
  sources: MissionSourceRow[];
  counts: MissionWorkspace["counts"];
}

function str(p: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = p?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

const CHANNEL_KINDS = new Set(["phone", "email", "linkedin", "contact_form"]);

function channelOf(p: Record<string, unknown> | null): MissionChannel | null {
  const kind = str(p, "kind");
  const value = str(p, "value");
  if (!kind || !value || !CHANNEL_KINDS.has(kind)) return null;
  const whose = str(p, "whose");
  return {
    kind: kind as MissionChannelKind,
    value,
    whose: (whose === "person" || whose === "department" ? whose : "switchboard") as ChannelWhose,
  };
}

function sourcesOf(list: FindingRow[]): Array<{ url: string; claim: string }> {
  const out = new Map<string, { url: string; claim: string }>();
  for (const f of list) {
    const raw = f.payload?.sources;
    if (Array.isArray(raw)) {
      for (const s of raw) {
        const url = typeof s?.url === "string" ? s.url : null;
        if (url && !out.has(url)) {
          out.set(url, { url, claim: typeof s.claim === "string" ? s.claim : "" });
        }
      }
    }
    if (f.source_url && !out.has(f.source_url)) {
      out.set(f.source_url, { url: f.source_url, claim: "" });
    }
  }
  return Array.from(out.values()).slice(0, 8);
}

/** Of everything filed about one record, the view worth showing. Newest first in. */
function representative(list: FindingRow[]): FindingRow {
  const latest = list[0];
  if (latest.finding_state === "dead") return latest;
  // A later step that was about something else must not downgrade a person
  // who was already reachable back to "one thing missing".
  return list.find((f) => f.finding_state === "reachable" && f.status !== "rejected") ?? latest;
}

async function loadAttempts(
  svc: Svc,
  orgId: string,
  contactIds: string[],
): Promise<Map<string, MissionAttempt>> {
  const out = new Map<string, MissionAttempt>();
  if (contactIds.length === 0) return out;
  const { data: drafts, error } = await svc
    .from("outreach_drafts")
    .select("id, contact_id, sent_at, created_at")
    .eq("org_id", orgId)
    .in("contact_id", contactIds)
    .neq("status", "draft")
    .order("sent_at", { ascending: false });
  if (error || !drafts || drafts.length === 0) return out;

  const { data: actions } = await svc
    .from("commercial_actions")
    .select("id, outreach_draft_id, outcome")
    .eq("org_id", orgId)
    .in(
      "outreach_draft_id",
      drafts.map((d) => d.id as string),
    );
  const byDraft = new Map((actions ?? []).map((a) => [a.outreach_draft_id as string, a]));

  for (const d of drafts) {
    const contactId = d.contact_id as string | null;
    if (!contactId || out.has(contactId)) continue;
    const action = byDraft.get(d.id as string);
    out.set(contactId, {
      outcome: (action?.outcome as string | null) ?? null,
      at: (d.sent_at as string | null) ?? (d.created_at as string),
      actionId: (action?.id as string | null) ?? null,
    });
  }
  return out;
}

const STATE_ORDER: Record<TargetState, number> = {
  reachable: 0,
  one_thing_missing: 1,
  dead: 2,
};

export async function loadMissionHoldings(
  orgId: string,
  missionId: string,
): Promise<MissionHoldings> {
  const empty: MissionHoldings = {
    companies: [],
    people: [],
    projects: [],
    sources: [],
    counts: { researched: 0, qualified: 0, callable: 0, dead: 0, notForUs: 0 },
  };
  const svc = createServiceSupabaseClient();
  if (!svc) return empty;

  const { data, error } = await svc
    .from("agent_findings")
    .select(
      "id, finding_type, finding_state, status, payload, source_url, created_at, reviewed_at, promoted_entity_id",
    )
    .eq("org_id", orgId)
    .eq("mission_id", missionId)
    .in("finding_type", ["company", "contact"])
    .order("created_at", { ascending: false })
    .limit(600);
  if (error || !data || data.length === 0) return empty;

  const findings = data as FindingRow[];
  const byCompany = new Map<string, FindingRow[]>();
  const byContact = new Map<string, FindingRow[]>();
  for (const f of findings) {
    if (!f.promoted_entity_id) continue;
    const bucket = f.finding_type === "company" ? byCompany : byContact;
    const list = bucket.get(f.promoted_entity_id) ?? [];
    list.push(f);
    bucket.set(f.promoted_entity_id, list);
  }
  const companyIds = Array.from(byCompany.keys());
  const contactIds = Array.from(byContact.keys());

  const [companiesRes, contactsRes, elsewhereRes, attempts] = await Promise.all([
    companyIds.length
      ? svc
          .from("companies")
          .select("id, name, city, country, website, company_type, found_by_agent_instance_id, verified_at")
          .eq("organization_id", orgId)
          .in("id", companyIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    contactIds.length
      ? svc
          .from("contacts")
          .select("id, full_name, job_title, company_id, found_by_agent_instance_id, verified_at, source_url")
          .eq("organization_id", orgId)
          .in("id", contactIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    companyIds.length
      ? svc
          .from("agent_findings")
          .select("mission_id, promoted_entity_id")
          .eq("org_id", orgId)
          .eq("finding_type", "company")
          .in("promoted_entity_id", companyIds)
          .neq("mission_id", missionId)
          .limit(500)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    loadAttempts(svc, orgId, contactIds),
  ]);

  const companyById = new Map(
    ((companiesRes.data ?? []) as Record<string, unknown>[]).map((c) => [c.id as string, c]),
  );
  const contactById = new Map(
    ((contactsRes.data ?? []) as Record<string, unknown>[]).map((c) => [c.id as string, c]),
  );

  // Where else each company has turned up — its memory across missions.
  const elsewhere = new Map<string, Set<string>>();
  for (const row of (elsewhereRes.data ?? []) as Record<string, unknown>[]) {
    const mission = row.mission_id as string | null;
    const company = row.promoted_entity_id as string | null;
    if (!mission || !company) continue;
    const set = elsewhere.get(company) ?? new Set<string>();
    set.add(mission);
    elsewhere.set(company, set);
  }
  const otherMissionIds = Array.from(new Set(Array.from(elsewhere.values()).flatMap((s) => [...s])));
  const otherMissions = new Map<string, { id: string; title: string; emoji: string | null }>();
  if (otherMissionIds.length > 0) {
    const { data: rows } = await svc
      .from("missions")
      .select("id, title, emoji")
      .eq("org_id", orgId)
      .in("id", otherMissionIds);
    for (const m of rows ?? []) {
      otherMissions.set(m.id as string, {
        id: m.id as string,
        title: m.title as string,
        emoji: (m.emoji as string | null) ?? null,
      });
    }
  }

  // ── companies ──
  const companies: MissionCompanyRow[] = [];
  for (const [companyId, list] of byCompany) {
    const record = companyById.get(companyId);
    if (!record) continue;
    const chosen = representative(list);
    const p = chosen.payload ?? {};
    const rejected = list.find((f) => f.status === "rejected");
    const state = (chosen.finding_state ?? "one_thing_missing") as TargetState;
    const contactId = str(p, "contact_id");
    const personName = str(p, "decision_maker");
    const projectName = str(p, "project");

    companies.push({
      companyId,
      name: (record.name as string) ?? str(p, "company_name") ?? "Unnamed company",
      city: (record.city as string | null) ?? str(p, "city"),
      country: (record.country as string | null) ?? str(p, "country"),
      website: (record.website as string | null) ?? str(p, "website"),
      role: str(p, "role") ?? ((record.company_type as string | null) ?? null),
      why: str(p, "why") ?? "",
      state,
      notForUs: rejected
        ? {
            reason: str(rejected.payload, "rejected_reason") ?? "Ruled out",
            at: rejected.reviewed_at ?? rejected.created_at,
          }
        : null,
      missing:
        state === "one_thing_missing"
          ? { fact: str(p, "missing") ?? "Not recorded", owner: str(p, "missing_owner") ?? "Scout" }
          : null,
      deadReason: state === "dead" ? str(p, "dead_reason") : null,
      person: personName
        ? { contactId, name: personName, title: str(p, "person_title") }
        : null,
      channel: channelOf(p),
      words: str(p, "how_to_open"),
      project: projectName ? { name: projectName, evidence: str(p, "project_evidence") } : null,
      sources: sourcesOf(list),
      agentFound: Boolean(record.found_by_agent_instance_id) && !record.verified_at,
      verified: Boolean(record.verified_at),
      alsoIn: Array.from(elsewhere.get(companyId) ?? [])
        .map((id) => otherMissions.get(id))
        .filter((m): m is { id: string; title: string; emoji: string | null } => Boolean(m)),
      lastAttempt: contactId ? attempts.get(contactId) ?? null : null,
      reachChecked: list.some((f) => Boolean(f.payload?.reach_checked_at)),
      reachNote: state === "one_thing_missing" ? str(p, "reach_note") : null,
      foundAt: list[list.length - 1].created_at,
      updatedAt: list[0].created_at,
    });
  }

  companies.sort((a, b) => {
    const ra = a.notForUs ? 9 : STATE_ORDER[a.state];
    const rb = b.notForUs ? 9 : STATE_ORDER[b.state];
    if (ra !== rb) return ra - rb;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  const companyRowById = new Map(companies.map((c) => [c.companyId, c]));

  // ── people ──
  const people: MissionPersonRow[] = [];
  for (const [contactId, list] of byContact) {
    const record = contactById.get(contactId);
    if (!record) continue;
    const chosen = representative(list);
    const p = chosen.payload ?? {};
    const companyId = (record.company_id as string | null) ?? str(p, "company_id");
    const companyRow = companyId ? companyRowById.get(companyId) : undefined;
    const state = (chosen.finding_state ?? "one_thing_missing") as TargetState;
    people.push({
      contactId,
      name: (record.full_name as string) ?? str(p, "full_name") ?? "Unnamed",
      title: (record.job_title as string | null) ?? str(p, "job_title"),
      companyId,
      companyName: companyRow?.name ?? str(p, "company_name"),
      channel: channelOf(p),
      words: str(p, "how_to_open"),
      state,
      missing: state === "one_thing_missing" ? str(p, "missing") : null,
      notForUs: Boolean(companyRow?.notForUs) || list.some((f) => f.status === "rejected"),
      agentFound: Boolean(record.found_by_agent_instance_id) && !record.verified_at,
      verified: Boolean(record.verified_at),
      lastAttempt: attempts.get(contactId) ?? null,
      sourceUrl: (record.source_url as string | null) ?? chosen.source_url,
    });
  }
  people.sort((a, b) => {
    const ra = a.notForUs ? 9 : STATE_ORDER[a.state];
    const rb = b.notForUs ? 9 : STATE_ORDER[b.state];
    return ra - rb || a.name.localeCompare(b.name);
  });

  // ── projects named along the way ──
  const projects: MissionProjectRow[] = [];
  const seenProjects = new Set<string>();
  for (const f of findings) {
    if (f.finding_type !== "company" || !f.promoted_entity_id) continue;
    const name = str(f.payload, "project");
    if (!name) continue;
    const key = `${name.toLowerCase()}|${f.promoted_entity_id}`;
    if (seenProjects.has(key)) continue;
    seenProjects.add(key);
    projects.push({
      name,
      evidence: str(f.payload, "project_evidence"),
      companyId: f.promoted_entity_id,
      companyName: companyRowById.get(f.promoted_entity_id)?.name ?? str(f.payload, "company_name") ?? "",
      sourceUrl: f.source_url,
      at: f.created_at,
    });
  }

  // ── every source, and what it supports ──
  const sourceMap = new Map<string, MissionSourceRow>();
  for (const f of [...findings].reverse()) {
    const about =
      f.finding_type === "company"
        ? companyRowById.get(f.promoted_entity_id ?? "")?.name ?? str(f.payload, "company_name")
        : str(f.payload, "full_name");
    for (const s of sourcesOf([f])) {
      const row = sourceMap.get(s.url) ?? {
        url: s.url,
        host: hostOf(s.url),
        claims: [],
        about: [],
        firstAt: f.created_at,
      };
      if (s.claim && !row.claims.includes(s.claim)) row.claims.push(s.claim);
      if (about && !row.about.includes(about)) row.about.push(about);
      sourceMap.set(s.url, row);
    }
  }
  const sources = Array.from(sourceMap.values()).sort((a, b) =>
    b.firstAt.localeCompare(a.firstAt),
  );

  const live = companies.filter((c) => !c.notForUs);
  return {
    companies,
    people,
    projects,
    sources,
    counts: {
      researched: companies.length,
      qualified: live.filter((c) => c.state !== "dead").length,
      callable: live.filter((c) => c.state === "reachable").length,
      dead: live.filter((c) => c.state === "dead").length,
      notForUs: companies.length - live.length,
    },
  };
}

// ── the workspace ───────────────────────────────────────────────────────────

async function loadMessages(svc: Svc, orgId: string, stepIds: string[]): Promise<MissionMessage[]> {
  if (stepIds.length === 0) return [];
  const { data } = await svc
    .from("assignment_messages")
    .select("id, assignment_id, role, body, created_at")
    .eq("org_id", orgId)
    .in("assignment_id", stepIds)
    .order("created_at");
  return (data ?? []).map((m) => ({
    id: m.id as string,
    role: m.role as "human" | "agent",
    body: m.body as string,
    at: m.created_at as string,
    stepId: m.assignment_id as string,
  }));
}

async function loadRunActivity(
  svc: Svc,
  orgId: string,
  stepIds: string[],
): Promise<Map<string, ActivityEvent[]>> {
  const out = new Map<string, ActivityEvent[]>();
  if (stepIds.length === 0) return out;
  const { data } = await svc
    .from("agent_runs")
    .select("assignment_id, metadata, started_at")
    .eq("org_id", orgId)
    .in("assignment_id", stepIds)
    .order("started_at", { ascending: false });
  // The newest run of each step: a retried step shows what the retry did.
  for (const run of data ?? []) {
    const stepId = run.assignment_id as string;
    if (!out.has(stepId)) out.set(stepId, parseActivity(run.metadata));
  }
  return out;
}

export async function getMissionWorkspace(
  orgId: string,
  missionId: string,
): Promise<MissionWorkspace | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data: row, error } = await svc
    .from("missions")
    .select(MISSION_FIELDS)
    .eq("id", missionId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error || !row) return null;
  const mission = row as MissionRow;

  const [stepMap, holdings, tabs, lead] = await Promise.all([
    loadSteps(svc, orgId, [missionId]),
    loadMissionHoldings(orgId, missionId),
    listMissionTabs(orgId),
    mission.lead_agent_instance_id
      ? svc
          .from("agent_instances")
          .select("id, display_name, emoji, description")
          .eq("id", mission.lead_agent_instance_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const steps = stepMap.get(missionId) ?? [];
  const stepIds = steps.map((s) => s.id);
  const [messages, activityByStep] = await Promise.all([
    loadMessages(svc, orgId, stepIds),
    loadRunActivity(svc, orgId, stepIds),
  ]);

  const { state, reason } = deriveMissionState(mission, steps);
  const stepViews: MissionStepView[] = steps.map((s) => ({
    id: s.id,
    status: s.status,
    instruction: s.objective,
    createdAt: s.created_at,
    startedAt: s.started_at,
    completedAt: s.completed_at,
    record: parseMissionStepRecord(s.result_summary),
    error: s.status === "failed" ? s.result_summary : null,
    activity: activityByStep.get(s.id) ?? [],
  }));
  const latest = stepViews.find((s) => s.record)?.record ?? null;

  // A recruiting mission's surface is the people its employee named.
  let candidates: MissionCandidate[] = [];
  let partners: MissionPartner[] = [];
  if (mission.kind === "recruiting" && latest?.candidates) {
    const workerIds = latest.candidates.workerIds;
    const partnerIds = new Set(latest.candidates.partnerIds);
    const [workersRes, allPartners] = await Promise.all([
      workerIds.length
        ? svc
            .from("workers")
            .select("id, full_name, role, status, availability_status, available_from, city, country, certificates")
            .eq("organization_id", orgId)
            .in("id", workerIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      partnerIds.size ? listSupplyPartners(orgId) : Promise.resolve([]),
    ]);
    const byId = new Map(
      ((workersRes.data ?? []) as Record<string, unknown>[]).map((w) => [w.id as string, w]),
    );
    candidates = workerIds
      .map((id) => byId.get(id))
      .filter((w): w is Record<string, unknown> => Boolean(w))
      .map((w) => ({
        workerId: w.id as string,
        name: (w.full_name as string) ?? "Unnamed",
        role: (w.role as string | null) ?? null,
        status: (w.status as string) ?? "active",
        availability: (w.availability_status as string | null) ?? null,
        availableFrom: (w.available_from as string | null) ?? null,
        based: [w.city, w.country].filter(Boolean).join(", ") || null,
        certificates: Array.isArray(w.certificates) ? (w.certificates as unknown[]).map(String) : [],
      }));
    partners = allPartners
      .filter((p) => partnerIds.has(p.id))
      .map((p) => ({
        partnerId: p.id,
        name: p.name,
        trades: p.trades,
        crewSize: p.crewSize,
        country: p.country,
        sellable: p.sellable,
        confirmedDaysAgo: p.confirmedDaysAgo,
      }));
  }

  const leadRow = lead.data as Record<string, unknown> | null;
  return {
    mission: {
      id: mission.id,
      title: mission.title,
      emoji: mission.emoji,
      objective: mission.objective,
      kind: mission.kind,
      createdAt: mission.created_at,
      updatedAt: mission.updated_at,
      closedAt: mission.closed_at,
      lastSeenAt: mission.last_seen_at,
    },
    lead: leadRow
      ? {
          id: leadRow.id as string,
          name: leadRow.display_name as string,
          emoji: (leadRow.emoji as string) || "🤖",
          role: (leadRow.description as string | null) ?? null,
        }
      : null,
    state,
    stateReason: reason,
    tabs,
    steps: stepViews,
    latest,
    messages,
    ...holdings,
    candidates,
    partners,
  };
}

/** What a page polls while a step is working. Small on purpose. */
export async function getMissionPulse(
  orgId: string,
  missionId: string,
): Promise<{
  state: MissionState;
  reason: string | null;
  activity: ActivityEvent[];
  runningSince: string | null;
  updatedAt: string;
} | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data: row } = await svc
    .from("missions")
    .select(MISSION_FIELDS)
    .eq("id", missionId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!row) return null;
  const mission = row as MissionRow;
  const steps = (await loadSteps(svc, orgId, [missionId])).get(missionId) ?? [];
  const { state, reason } = deriveMissionState(mission, steps);
  const current = steps.find((s) => s.status === "active") ?? steps[0];
  const activity = current
    ? (await loadRunActivity(svc, orgId, [current.id])).get(current.id) ?? []
    : [];
  return {
    state,
    reason,
    activity,
    runningSince: current?.status === "active" ? current.started_at : null,
    updatedAt: mission.updated_at,
  };
}

// ── what a step is given ────────────────────────────────────────────────────

export interface MissionRunContext {
  mission: {
    id: string;
    title: string;
    emoji: string | null;
    objective: string;
    kind: MissionKind;
    createdBy: string | null;
  };
  agentName: string;
  /** The instruction this step exists to carry out. */
  instruction: string;
  /** Everything said before this instruction, oldest first. */
  conversation: Array<{ role: "human" | "agent"; body: string; at: string }>;
  holdings: MissionHoldings;
}

/**
 * Phase 0 of the mission: the worker reads the mission before it works.
 *
 * Scout's research run used to receive its own brief and nothing else, so
 * "now find the buyer at Goldbeck" re-ran "find EPC contractors" from zero.
 * A step now gets the objective, the conversation so far, everything the
 * mission already holds — including what the CEO ruled out and who has
 * already been contacted — and then the instruction.
 */
export async function loadMissionRunContext(
  orgId: string,
  missionId: string,
  stepId: string,
): Promise<MissionRunContext | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data: row } = await svc
    .from("missions")
    .select(MISSION_FIELDS)
    .eq("id", missionId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!row) return null;
  const mission = row as MissionRow;

  const [stepMap, holdings, agent] = await Promise.all([
    loadSteps(svc, orgId, [missionId]),
    loadMissionHoldings(orgId, missionId),
    mission.lead_agent_instance_id
      ? svc
          .from("agent_instances")
          .select("display_name")
          .eq("id", mission.lead_agent_instance_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const steps = stepMap.get(missionId) ?? [];
  const step = steps.find((s) => s.id === stepId);
  if (!step) return null;

  const earlier = steps.filter((s) => s.created_at <= step.created_at).map((s) => s.id);
  const messages = await loadMessages(svc, orgId, earlier);
  const conversation = messages
    .filter((m) => !(m.stepId === stepId && m.role === "human"))
    .filter((m) => m.at <= (step.started_at ?? new Date().toISOString()))
    .map((m) => ({ role: m.role, body: m.body, at: m.at }));

  return {
    mission: {
      id: mission.id,
      title: mission.title,
      emoji: mission.emoji,
      objective: mission.objective,
      kind: mission.kind,
      createdBy: mission.created_by,
    },
    agentName: ((agent.data as Record<string, unknown> | null)?.display_name as string) ?? "Scout",
    instruction: step.objective,
    conversation,
    holdings,
  };
}

/** The mission's holdings as lines a worker can read in its prompt. */
export function describeHoldings(holdings: MissionHoldings, limit = 60): string {
  if (holdings.companies.length === 0) return "Nothing yet — this is the first step.";
  const lines = holdings.companies.slice(0, limit).map((c) => {
    const where = [c.city, c.country].filter(Boolean).join(", ");
    const head = `- ${c.name}${where ? ` (${where})` : ""}${c.role ? ` · ${c.role}` : ""}`;
    if (c.notForUs) return `${head} · NOT FOR US — ruled out by the CEO: ${c.notForUs.reason}`;
    const contacted = c.lastAttempt
      ? ` · already contacted (${c.lastAttempt.outcome ?? "recorded"}, ${c.lastAttempt.at.slice(0, 10)})`
      : "";
    const checked = c.verified ? " · verified by a person" : "";
    if (c.state === "reachable") {
      const who = c.person ? `${c.person.name}${c.person.title ? `, ${c.person.title}` : ""}` : "";
      const door = c.channel ? ` · ${c.channel.kind} ${c.channel.value} (${c.channel.whose})` : "";
      return `${head} · SOMEONE TO REACH: ${who}${door}${checked}${contacted}`;
    }
    if (c.state === "dead") return `${head} · DEAD: ${c.deadReason ?? "no reason recorded"}`;
    return `${head} · ONE THING MISSING: ${c.missing?.fact ?? "not recorded"}${checked}`;
  });
  const more = holdings.companies.length - limit;
  return [
    ...lines,
    more > 0 ? `(and ${more} more companies)` : null,
    `Totals: ${holdings.counts.researched} companies, ${holdings.people.length} people.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── for Today ───────────────────────────────────────────────────────────────

/**
 * People a mission made reachable who nobody has contacted yet.
 *
 * These are the signals the CEO asked for: "Goldbeck — decision maker found —
 * direct phone available — recommended call", with the call one click away
 * and the mission one click behind it. The research itself stays in the
 * mission.
 */
export async function listReadyToContact(orgId: string, limit = 6): Promise<ReadyToContact[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const { data: open, error } = await svc
    .from("missions")
    .select("id, title, emoji")
    .eq("org_id", orgId)
    .is("closed_at", null);
  if (error || !open || open.length === 0) return [];
  const missionById = new Map(open.map((m) => [m.id as string, m]));

  const { data: findings } = await svc
    .from("agent_findings")
    .select("mission_id, promoted_entity_id, payload, source_url, created_at")
    .eq("org_id", orgId)
    .eq("finding_type", "contact")
    .eq("status", "applied")
    .eq("finding_state", "reachable")
    .in("mission_id", Array.from(missionById.keys()))
    .order("created_at", { ascending: false })
    .limit(200);

  const latestByContact = new Map<string, Record<string, unknown>>();
  for (const f of findings ?? []) {
    const id = f.promoted_entity_id as string | null;
    if (id && !latestByContact.has(id)) latestByContact.set(id, f);
  }
  const contactIds = Array.from(latestByContact.keys());
  if (contactIds.length === 0) return [];

  // Anyone ruled out anywhere in the mission is not a signal.
  const { data: rejected } = await svc
    .from("agent_findings")
    .select("promoted_entity_id, payload")
    .eq("org_id", orgId)
    .eq("status", "rejected")
    .in("mission_id", Array.from(missionById.keys()));
  const ruledOut = new Set<string>();
  for (const r of rejected ?? []) {
    if (r.promoted_entity_id) ruledOut.add(r.promoted_entity_id as string);
    const company = (r.payload as Record<string, unknown> | null)?.company_id;
    if (typeof company === "string") ruledOut.add(company);
  }

  const [attempts, contactsRes] = await Promise.all([
    loadAttempts(svc, orgId, contactIds),
    svc
      .from("contacts")
      .select("id, full_name, job_title, company_id, verified_at, do_not_contact")
      .eq("organization_id", orgId)
      .in("id", contactIds),
  ]);
  const companyIds = Array.from(
    new Set((contactsRes.data ?? []).map((c) => c.company_id as string | null).filter(Boolean) as string[]),
  );
  const { data: companies } = companyIds.length
    ? await svc.from("companies").select("id, name, do_not_contact").eq("organization_id", orgId).in("id", companyIds)
    : { data: [] as Record<string, unknown>[] };
  const companyById = new Map((companies ?? []).map((c) => [c.id as string, c]));

  const out: ReadyToContact[] = [];
  for (const contact of contactsRes.data ?? []) {
    const id = contact.id as string;
    if (attempts.has(id) || ruledOut.has(id) || contact.do_not_contact) continue;
    const companyId = (contact.company_id as string | null) ?? null;
    const company = companyId ? companyById.get(companyId) : undefined;
    if (companyId && (ruledOut.has(companyId) || company?.do_not_contact)) continue;
    const finding = latestByContact.get(id)!;
    const payload = (finding.payload as Record<string, unknown> | null) ?? {};
    const channel = channelOf(payload);
    const mission = missionById.get(finding.mission_id as string);
    if (!channel || !mission) continue;
    out.push({
      contactId: id,
      name: contact.full_name as string,
      title: (contact.job_title as string | null) ?? null,
      companyId,
      companyName: (company?.name as string | undefined) ?? str(payload, "company_name"),
      channel,
      words: str(payload, "how_to_open"),
      sourceUrl: (finding.source_url as string | null) ?? null,
      mission: {
        id: mission.id as string,
        title: mission.title as string,
        emoji: (mission.emoji as string | null) ?? null,
      },
      verified: Boolean(contact.verified_at),
    });
  }

  // A number you can dial beats an address you must write to.
  const rank = (r: ReadyToContact) =>
    (r.channel.kind === "phone" ? 0 : r.channel.kind === "email" ? 1 : 2) +
    (r.channel.whose === "person" ? 0 : 0.5);
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

// ── a person's decisions about what a mission found ─────────────────────────

/** "This is right." Verification belongs to a person; the column refuses anything else. */
export async function verifyRecord(params: {
  orgId: string;
  userId: string;
  entityType: "company" | "contact";
  entityId: string;
}): Promise<{ ok: true } | { error: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { error: "Database unavailable." };
  const table = params.entityType === "company" ? "companies" : "contacts";
  const update: Record<string, unknown> = {
    verified_at: new Date().toISOString(),
    verified_by: params.userId,
    updated_by: params.userId,
  };
  const { data, error } = await svc
    .from(table)
    .update(update)
    .eq("id", params.entityId)
    .eq("organization_id", params.orgId)
    .select("id, research_status");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That record no longer exists." };
  if (params.entityType === "company" && data[0].research_status === "not_reviewed") {
    await svc
      .from("companies")
      .update({ research_status: "reviewed" })
      .eq("id", params.entityId)
      .eq("organization_id", params.orgId);
  }
  return { ok: true };
}

/**
 * "Not for us." With the reason, or the same lead is back next week.
 *
 * Written onto every finding the mission holds about the company and its
 * people, so the next step reads it as a decision and does not bring it back.
 * The company itself is marked not relevant only when an employee created it
 * and nobody has confirmed it — a human's own record keeps its status and
 * gains a note.
 */
export async function markNotForUs(params: {
  orgId: string;
  userId: string;
  missionId: string;
  companyId: string;
  reason: string;
}): Promise<{ ok: true } | { error: string }> {
  const reason = params.reason.trim();
  if (reason.length < 3) return { error: "Say why, so it does not come back." };
  const svc = createServiceSupabaseClient();
  if (!svc) return { error: "Database unavailable." };

  const { data: findings, error } = await svc
    .from("agent_findings")
    .select("id, payload, promoted_entity_id, finding_type")
    .eq("org_id", params.orgId)
    .eq("mission_id", params.missionId)
    .in("finding_type", ["company", "contact"]);
  if (error) return { error: error.message };

  const mine = (findings ?? []).filter((f) => {
    const p = (f.payload as Record<string, unknown> | null) ?? {};
    return f.promoted_entity_id === params.companyId || p.company_id === params.companyId;
  });
  if (mine.length === 0) return { error: "This mission holds nothing about that company." };

  const now = new Date().toISOString();
  for (const f of mine) {
    await svc
      .from("agent_findings")
      .update({
        status: "rejected",
        reviewed_by: params.userId,
        reviewed_at: now,
        payload: { ...((f.payload as Record<string, unknown> | null) ?? {}), rejected_reason: reason },
      })
      .eq("id", f.id as string)
      .eq("org_id", params.orgId);
  }

  const { data: company } = await svc
    .from("companies")
    .select("id, company_status, found_by_agent_instance_id, verified_at, notes")
    .eq("id", params.companyId)
    .eq("organization_id", params.orgId)
    .maybeSingle();
  if (company) {
    const line = `Not for us (${now.slice(0, 10)}): ${reason}`;
    const notes = [String(company.notes ?? "").trim(), line].filter(Boolean).join("\n").slice(0, 8_000);
    const agentsOwn =
      Boolean(company.found_by_agent_instance_id) &&
      !company.verified_at &&
      ["research", "target"].includes(String(company.company_status));
    await svc
      .from("companies")
      .update({
        notes,
        updated_by: params.userId,
        ...(agentsOwn ? { company_status: "not_relevant" } : {}),
      })
      .eq("id", params.companyId)
      .eq("organization_id", params.orgId);
  }
  return { ok: true };
}

/** Take back a "not for us" pressed by mistake. */
export async function undoNotForUs(params: {
  orgId: string;
  missionId: string;
  companyId: string;
}): Promise<{ ok: true } | { error: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { error: "Database unavailable." };
  const { data: findings } = await svc
    .from("agent_findings")
    .select("id, payload, promoted_entity_id")
    .eq("org_id", params.orgId)
    .eq("mission_id", params.missionId)
    .eq("status", "rejected")
    .in("finding_type", ["company", "contact"]);
  const mine = (findings ?? []).filter((f) => {
    const p = (f.payload as Record<string, unknown> | null) ?? {};
    return f.promoted_entity_id === params.companyId || p.company_id === params.companyId;
  });
  for (const f of mine) {
    const payload = { ...((f.payload as Record<string, unknown> | null) ?? {}) };
    delete payload.rejected_reason;
    await svc
      .from("agent_findings")
      .update({ status: "applied", reviewed_by: null, reviewed_at: null, payload })
      .eq("id", f.id as string)
      .eq("org_id", params.orgId);
  }
  const { data: company } = await svc
    .from("companies")
    .select("company_status, found_by_agent_instance_id, verified_at")
    .eq("id", params.companyId)
    .eq("organization_id", params.orgId)
    .maybeSingle();
  if (
    company &&
    company.company_status === "not_relevant" &&
    company.found_by_agent_instance_id &&
    !company.verified_at
  ) {
    await svc
      .from("companies")
      .update({ company_status: "research" })
      .eq("id", params.companyId)
      .eq("organization_id", params.orgId);
  }
  return { ok: true };
}
