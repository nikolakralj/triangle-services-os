import "server-only";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { createOutreachDraft } from "@/lib/data/outreach";
import type { MissionCandidate } from "@/lib/data/mission-shared";

// ---------------------------------------------------------------------------
// Hanna's write into the pool, from a mission step.
//
// Scout files companies through POST …/targets and they become records
// immediately (approve actions, not basic facts). People are different: a
// worker is personal data, and Hanna's scope is worker.propose. She names
// someone already on the books, attaches a pending CV proposal, or files a
// pending worker finding. She cannot create a worker, cannot accept one, and
// cannot mark anyone available. Availability checks are drafts a person sends.
//
// The recruiting finish line counts from the same worker rows the mission
// page draws — named from these findings, available only when the worker
// record itself says so.
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROPOSALS_PER_CALL = 12;

/** Same fields cv-queue already accepts. Anything else is ignored on purpose. */
export const CANDIDATE_FIELDS = [
  "full_name",
  "role",
  "worker_type",
  "email",
  "phone",
  "country",
  "city",
  "skills",
  "certificates",
  "languages",
  "industries",
  "summary",
  "years_experience",
] as const;

const FORBIDDEN_PERSON_FIELDS = new Set([
  "cv_text",
  "cvText",
  "cv_file_name",
  "cv_pages",
  "date_of_birth",
  "dob",
  "birthdate",
  "age",
  "photo",
  "photograph",
  "religion",
  "health",
  "marital_status",
  "family_status",
  "availability_status",
  "available_from",
]);

const PERSON_WEB_HOSTS = new Set([
  "linkedin.com",
  "www.linkedin.com",
  "xing.com",
  "www.xing.com",
  "facebook.com",
  "www.facebook.com",
  "instagram.com",
  "www.instagram.com",
  "twitter.com",
  "www.twitter.com",
  "x.com",
  "www.x.com",
]);

const PLACEHOLDER_PERSON = /\b(doe|mustermann|musterfrau|example|test|probe|dummy|placeholder|sample)\b/i;

export const AVAILABILITY_STATUSES = [
  "available",
  "available_soon",
  "busy",
  "unknown",
  "do_not_use",
] as const;

export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export interface PoolStep {
  id: string;
  orgId: string;
  missionId: string;
  agentInstanceId: string;
  scopes: string[];
  badgeName: string;
}

export function hasPoolWriteScope(scopes: readonly string[]): boolean {
  return scopes.includes("admin") || scopes.includes("worker.propose");
}

export function hasTargetWriteScope(scopes: readonly string[]): boolean {
  return scopes.includes("admin") || scopes.includes("research.suggestion.create");
}

export function machineMayLookupWorkers(scopes: readonly string[]): boolean {
  return hasPoolWriteScope(scopes);
}

/** LinkedIn and the like are Scout's world. Hanna does not enrich people from the open web. */
export function openWebPersonSource(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  let host = "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    host = url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    const m = raw.toLowerCase().match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/i);
    host = (m?.[1] ?? "").replace(/^www\./, "");
  }
  if (!host) return null;
  const bare = host.replace(/^www\./, "");
  if (PERSON_WEB_HOSTS.has(bare) || PERSON_WEB_HOSTS.has(`www.${bare}`)) {
    return "Do not enrich people from the open web. No LinkedIn, Xing or social lookup — propose from Triangle's pool or a CV already in Triangle.";
  }
  return null;
}

export function initialsOf(name: string): string {
  const parts = name
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return `${parts[0]!.charAt(0).toUpperCase()}.`;
  return parts.map((p) => `${p.charAt(0).toUpperCase()}.`).join(" ");
}

function clip(text: string | null | undefined, max: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function stringList(value: unknown, max = 40): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const s = String(item ?? "").replace(/\s+/g, " ").trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s.slice(0, 80));
    if (out.length >= max) break;
  }
  return out;
}

export function pickCandidateFields(raw: Record<string, unknown> | null | undefined): {
  fields: Record<string, unknown>;
  refused: string | null;
} {
  const fields: Record<string, unknown> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { fields, refused: null };
  }
  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_PERSON_FIELDS.has(key)) {
      return {
        fields: {},
        refused: `“${key}” is not accepted. CV text and protected characteristics stay in Triangle; availability is a separate proposal a person confirms.`,
      };
    }
    if (key === "source_url" || key === "sourceUrl" || key === "url") {
      const why = openWebPersonSource(String(raw[key] ?? ""));
      if (why) return { fields: {}, refused: why };
    }
  }
  for (const key of CANDIDATE_FIELDS) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (value == null || value === "") continue;
    if (Array.isArray(value)) fields[key] = stringList(value);
    else if (key === "years_experience") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0 && n <= 60) fields[key] = Math.round(n);
    } else {
      const t = text(value, key === "summary" ? 700 : 200);
      if (t) fields[key] = t;
    }
  }
  return { fields, refused: null };
}

const checkSchema = z.object({
  channel: z.enum(["email", "phone"]),
  subject: z.string().trim().max(180).nullish(),
  body: z.string().trim().min(8).max(2_000),
});

const candidateSchema = z.object({
  kind: z.literal("candidate"),
  workerId: z.string().trim().uuid().nullish(),
  findingId: z.string().trim().uuid().nullish(),
  why: z.string().trim().max(400).nullish(),
  fields: z.record(z.string(), z.unknown()).nullish(),
});

const availabilitySchema = z.object({
  kind: z.literal("availability"),
  workerId: z.string().trim().uuid(),
  proposed: z.enum(AVAILABILITY_STATUSES).nullish(),
  availableFrom: z.string().trim().max(40).nullish(),
  evidence: z.string().trim().max(400).nullish(),
  check: checkSchema.nullish(),
});

export type PoolProposal = z.infer<typeof candidateSchema> | z.infer<typeof availabilitySchema>;

export interface FiledPoolRow {
  kind: "candidate" | "availability";
  workerId: string | null;
  findingId: string | null;
  initials: string | null;
  stillPending: boolean;
  draftId: string | null;
  refused: string | null;
}

type Svc = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;

async function existingFinding(
  svc: Svc,
  orgId: string,
  key: string,
): Promise<{ id: string; status: string; payload: Record<string, unknown> } | null> {
  const { data } = await svc
    .from("agent_findings")
    .select("id, status, payload")
    .eq("org_id", orgId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    status: data.status as string,
    payload: (data.payload as Record<string, unknown>) ?? {},
  };
}

async function loadWorker(
  svc: Svc,
  orgId: string,
  workerId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await svc
    .from("workers")
    .select(
      "id, full_name, role, status, availability_status, available_from, city, country, certificates, skills, languages, work_authorisation, email, phone",
    )
    .eq("id", workerId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data || data.status === "blacklisted") return null;
  return data as Record<string, unknown>;
}

function workerToCandidate(w: Record<string, unknown>): MissionCandidate {
  return {
    workerId: w.id as string,
    name: (w.full_name as string) ?? "Unnamed",
    role: (w.role as string | null) ?? null,
    status: (w.status as string) ?? "active",
    availability: (w.availability_status as string | null) ?? null,
    availableFrom: (w.available_from as string | null) ?? null,
    based: [w.city, w.country].filter(Boolean).join(", ") || null,
    certificates: Array.isArray(w.certificates) ? (w.certificates as unknown[]).map(String) : [],
  };
}

/** Initials and matching facts only — no name, email, phone, rate or CV text. */
export function workerForBot(w: Record<string, unknown>) {
  const name = String(w.full_name ?? "").trim();
  return {
    workerId: w.id as string,
    initials: initialsOf(name || "?"),
    role: (w.role as string | null) ?? null,
    status: (w.status as string) ?? "candidate",
    availability: (w.availability_status as string | null) ?? null,
    availableFrom: (w.available_from as string | null) ?? null,
    based: [w.city, w.country].filter(Boolean).join(", ") || null,
    skills: Array.isArray(w.skills) ? (w.skills as unknown[]).map(String).slice(0, 12) : [],
    certificates: Array.isArray(w.certificates)
      ? (w.certificates as unknown[]).map(String).slice(0, 12)
      : [],
    languages: Array.isArray(w.languages) ? (w.languages as unknown[]).map(String).slice(0, 8) : [],
    canWorkIn: Array.isArray(w.work_authorisation)
      ? (w.work_authorisation as unknown[]).map(String).slice(0, 12)
      : [],
  };
}

async function insertPoolFinding(
  svc: Svc,
  row: Record<string, unknown> & { org_id: string; idempotency_key: string },
): Promise<{ id: string } | { refused: string }> {
  const already = await existingFinding(svc, row.org_id, row.idempotency_key);
  if (already) return { id: already.id };
  const { data, error } = await svc.from("agent_findings").insert(row).select("id").maybeSingle();
  if (error || !data) {
    if (error) console.error("pool finding refused:", error.message);
    return { refused: error?.message ?? "The database did not return a filed finding." };
  }
  return { id: data.id as string };
}

async function draftAvailabilityCheck(params: {
  orgId: string;
  workerId: string;
  initials: string;
  role: string | null;
  badgeName: string;
  check: z.infer<typeof checkSchema>;
}): Promise<string | null> {
  const channel = params.check.channel === "phone" ? "phone_call" : "email_cold";
  const subject =
    text(params.check.subject, 180) ??
    `Availability check — ${params.initials}${params.role ? ` · ${params.role}` : ""}`;
  const body = [
    params.check.body.trim(),
    "",
    `(Triangle draft — a person sends this. Worker ${params.workerId}. Hanna never contacts the candidate.)`,
  ].join("\n");
  const created = await createOutreachDraft({
    orgId: params.orgId,
    projectId: null,
    channel: channel as "phone_call" | "email_cold",
    subject,
    body,
    createdByAgent: params.badgeName,
  });
  return created?.id ?? null;
}

async function nameExistingWorker(
  svc: Svc,
  step: PoolStep,
  workerId: string,
  why: string | null,
): Promise<FiledPoolRow> {
  const worker = await loadWorker(svc, step.orgId, workerId);
  if (!worker) {
    return {
      kind: "candidate",
      workerId,
      findingId: null,
      initials: null,
      stillPending: true,
      draftId: null,
      refused: "No worker with that id is in this organisation's pool.",
    };
  }
  const name = String(worker.full_name ?? "").trim();
  const written = await insertPoolFinding(svc, {
    org_id: step.orgId,
    mission_id: step.missionId,
    assignment_id: step.id,
    agent_instance_id: step.agentInstanceId,
    finding_type: "worker",
    status: "applied",
    promoted_entity_type: "worker",
    promoted_entity_id: workerId,
    source_url: `triangle://workers/${workerId}`,
    evidence_text: why || "Named from Triangle's pool for this mission.",
    idempotency_key: `mission:${step.id}:worker:${workerId}`,
    payload: {
      source: "mission",
      proposal: "named",
      worker_id: workerId,
      full_name: name,
      role: worker.role ?? null,
      why,
    },
  });
  if ("refused" in written) {
    return {
      kind: "candidate",
      workerId,
      findingId: null,
      initials: initialsOf(name),
      stillPending: true,
      draftId: null,
      refused: written.refused,
    };
  }
  return {
    kind: "candidate",
    workerId,
    findingId: written.id,
    initials: initialsOf(name),
    stillPending: false,
    draftId: null,
    refused: null,
  };
}

async function attachPendingFinding(
  svc: Svc,
  step: PoolStep,
  findingId: string,
): Promise<FiledPoolRow> {
  const { data } = await svc
    .from("agent_findings")
    .select("id, status, finding_type, payload, promoted_entity_id")
    .eq("id", findingId)
    .eq("org_id", step.orgId)
    .maybeSingle();
  if (!data || data.finding_type !== "worker") {
    return {
      kind: "candidate",
      workerId: null,
      findingId,
      initials: null,
      stillPending: true,
      draftId: null,
      refused: "No pending worker proposal with that id.",
    };
  }
  if (data.status !== "pending") {
    return {
      kind: "candidate",
      workerId: (data.promoted_entity_id as string | null) ?? null,
      findingId,
      initials: null,
      stillPending: false,
      draftId: null,
      refused: "That proposal has already been decided.",
    };
  }
  const payload = (data.payload as Record<string, unknown>) ?? {};
  const name = String(payload.full_name ?? payload.name ?? "").trim();
  const nextPayload = {
    ...payload,
    source: payload.source ?? "mission",
    proposal: payload.proposal ?? "candidate",
    cv_text: undefined,
    cvText: undefined,
  };
  delete (nextPayload as { cv_text?: unknown }).cv_text;
  delete (nextPayload as { cvText?: unknown }).cvText;
  const { error } = await svc
    .from("agent_findings")
    .update({
      mission_id: step.missionId,
      assignment_id: step.id,
      payload: nextPayload,
    })
    .eq("id", findingId)
    .eq("org_id", step.orgId)
    .eq("status", "pending");
  if (error) {
    return {
      kind: "candidate",
      workerId: null,
      findingId,
      initials: name ? initialsOf(name) : null,
      stillPending: true,
      draftId: null,
      refused: error.message,
    };
  }
  return {
    kind: "candidate",
    workerId: null,
    findingId,
    initials: name ? initialsOf(name) : null,
    stillPending: true,
    draftId: null,
    refused: null,
  };
}

async function proposeNewCandidate(
  svc: Svc,
  step: PoolStep,
  fields: Record<string, unknown>,
  why: string | null,
): Promise<FiledPoolRow> {
  const name = String(fields.full_name ?? "").trim();
  if (!name) {
    return {
      kind: "candidate",
      workerId: null,
      findingId: null,
      initials: null,
      stillPending: true,
      draftId: null,
      refused: "A new candidate proposal needs fields.full_name (and usually a role).",
    };
  }
  if (PLACEHOLDER_PERSON.test(name)) {
    return {
      kind: "candidate",
      workerId: null,
      findingId: null,
      initials: null,
      stillPending: true,
      draftId: null,
      refused: `"${name}" looks like a placeholder, not a real person.`,
    };
  }
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
  const written = await insertPoolFinding(svc, {
    org_id: step.orgId,
    mission_id: step.missionId,
    assignment_id: step.id,
    agent_instance_id: step.agentInstanceId,
    finding_type: "worker",
    status: "pending",
    source_url: `triangle://missions/${step.missionId}`,
    evidence_text: why || "Proposed from a mission for a person to accept into the pool.",
    idempotency_key: `mission:${step.id}:candidate:${key}`,
    payload: {
      source: "mission",
      proposal: "candidate",
      ...fields,
      why,
    },
  });
  if ("refused" in written) {
    return {
      kind: "candidate",
      workerId: null,
      findingId: null,
      initials: initialsOf(name),
      stillPending: true,
      draftId: null,
      refused: written.refused,
    };
  }
  return {
    kind: "candidate",
    workerId: null,
    findingId: written.id,
    initials: initialsOf(name),
    stillPending: true,
    draftId: null,
    refused: null,
  };
}

async function proposeAvailability(
  svc: Svc,
  step: PoolStep,
  input: z.infer<typeof availabilitySchema>,
): Promise<FiledPoolRow> {
  const worker = await loadWorker(svc, step.orgId, input.workerId);
  if (!worker) {
    return {
      kind: "availability",
      workerId: input.workerId,
      findingId: null,
      initials: null,
      stillPending: true,
      draftId: null,
      refused: "No worker with that id is in this organisation's pool.",
    };
  }
  const name = String(worker.full_name ?? "").trim();
  const initials = initialsOf(name);
  if (!input.proposed && !input.check) {
    return {
      kind: "availability",
      workerId: input.workerId,
      findingId: null,
      initials,
      stillPending: true,
      draftId: null,
      refused:
        "Send `proposed` (a person accepts the update) and/or `check` (the words a person sends). Hanna cannot mark anyone available herself.",
    };
  }
  if (input.proposed && !text(input.evidence, 400) && !input.check) {
    return {
      kind: "availability",
      workerId: input.workerId,
      findingId: null,
      initials,
      stillPending: true,
      draftId: null,
      refused:
        "An availability update needs evidence already in Triangle, or a check draft a person will send. Do not infer it from a CV.",
    };
  }

  let draftId: string | null = null;
  if (input.check) {
    draftId = await draftAvailabilityCheck({
      orgId: step.orgId,
      workerId: input.workerId,
      initials,
      role: (worker.role as string | null) ?? null,
      badgeName: step.badgeName,
      check: input.check,
    });
  }

  const pending = Boolean(input.proposed);
  const written = await insertPoolFinding(svc, {
    org_id: step.orgId,
    mission_id: step.missionId,
    assignment_id: step.id,
    agent_instance_id: step.agentInstanceId,
    finding_type: "worker",
    status: pending ? "pending" : "applied",
    promoted_entity_type: "worker",
    promoted_entity_id: input.workerId,
    source_url: `triangle://workers/${input.workerId}`,
    evidence_text:
      input.evidence ||
      (input.check
        ? "Availability check drafted for a person to send."
        : "Availability update proposed from a mission."),
    idempotency_key: `mission:${step.id}:availability:${input.workerId}:${input.proposed ?? "check"}`,
    payload: {
      source: "mission",
      proposal: "availability",
      worker_id: input.workerId,
      full_name: name,
      role: worker.role ?? null,
      proposed_availability: input.proposed ?? null,
      available_from: input.availableFrom ?? null,
      evidence: input.evidence ?? null,
      check: input.check
        ? { channel: input.check.channel, subject: input.check.subject ?? null, body: input.check.body }
        : null,
      draft_id: draftId,
      current_availability: worker.availability_status ?? "unknown",
    },
  });
  if ("refused" in written) {
    return {
      kind: "availability",
      workerId: input.workerId,
      findingId: null,
      initials,
      stillPending: pending,
      draftId,
      refused: written.refused,
    };
  }
  return {
    kind: "availability",
    workerId: input.workerId,
    findingId: written.id,
    initials,
    stillPending: pending,
    draftId,
    refused: null,
  };
}

export async function fileMissionPool(
  step: PoolStep,
  raw: unknown,
): Promise<
  | { error: string }
  | { filed: FiledPoolRow[]; invalid: Array<{ index: number; error: string }> }
> {
  if (!hasPoolWriteScope(step.scopes)) {
    return {
      error:
        "Candidate and availability proposals need the worker.propose scope. Company targets stay on POST …/targets.",
    };
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "Send `proposals` as a list of one to twelve candidate or availability items." };
  }
  if (raw.length > PROPOSALS_PER_CALL) {
    return { error: `At most ${PROPOSALS_PER_CALL} proposals per call; send the rest in another.` };
  }

  const svc = createServiceSupabaseClient();
  if (!svc) return { error: "Database unavailable." };

  const invalid: Array<{ index: number; error: string }> = [];
  const parsed: Array<{ index: number; item: PoolProposal }> = [];
  raw.forEach((item, index) => {
    const kind = (item as { kind?: unknown })?.kind;
    const schema = kind === "availability" ? availabilitySchema : candidateSchema;
    const result = schema.safeParse(item);
    if (!result.success) {
      invalid.push({
        index,
        error: result.error.issues.map((i) => `${i.path.join(".") || "proposal"}: ${i.message}`).join("; "),
      });
      return;
    }
    parsed.push({ index, item: result.data });
  });

  const filed: FiledPoolRow[] = [];
  for (const { item } of parsed) {
    if (item.kind === "availability") {
      filed.push(await proposeAvailability(svc, step, item));
      continue;
    }
    if (item.fields) {
      const picked = pickCandidateFields(item.fields);
      if (picked.refused) {
        filed.push({
          kind: "candidate",
          workerId: item.workerId ?? null,
          findingId: item.findingId ?? null,
          initials: null,
          stillPending: true,
          draftId: null,
          refused: picked.refused,
        });
        continue;
      }
      const whyUrl = openWebPersonSource(item.why ?? "");
      if (whyUrl) {
        filed.push({
          kind: "candidate",
          workerId: null,
          findingId: null,
          initials: null,
          stillPending: true,
          draftId: null,
          refused: whyUrl,
        });
        continue;
      }
      if (item.workerId) {
        filed.push({
          kind: "candidate",
          workerId: item.workerId,
          findingId: null,
          initials: null,
          stillPending: true,
          draftId: null,
          refused: "Name an existing worker with workerId alone. Do not send their fields — those stay in Triangle.",
        });
        continue;
      }
      filed.push(await proposeNewCandidate(svc, step, picked.fields, item.why ?? null));
      continue;
    }
    if (item.findingId) {
      filed.push(await attachPendingFinding(svc, step, item.findingId));
      continue;
    }
    if (item.workerId) {
      filed.push(await nameExistingWorker(svc, step, item.workerId, item.why ?? null));
      continue;
    }
    filed.push({
      kind: "candidate",
      workerId: null,
      findingId: null,
      initials: null,
      stillPending: true,
      draftId: null,
      refused: "A candidate proposal needs workerId (someone in the pool), findingId (a pending CV), or fields for a person to accept.",
    });
  }

  return { filed, invalid };
}

function workerIdFromFinding(f: Record<string, unknown>): string | null {
  const promoted = f.promoted_entity_id as string | null;
  if (promoted && UUID.test(promoted)) return promoted;
  const payload = (f.payload as Record<string, unknown> | null) ?? {};
  const fromPayload = payload.worker_id;
  if (typeof fromPayload === "string" && UUID.test(fromPayload)) return fromPayload;
  return null;
}

/**
 * People this mission has named from the pool, counted from findings (and
 * any worker ids a finished in-app recruiting step recorded).
 */
export async function loadMissionPool(
  orgId: string,
  missionId: string,
  extraWorkerIds: readonly string[] = [],
): Promise<{ candidates: MissionCandidate[]; workerIds: string[] }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { candidates: [], workerIds: [] };

  const { data } = await svc
    .from("agent_findings")
    .select("promoted_entity_id, payload, status")
    .eq("org_id", orgId)
    .eq("mission_id", missionId)
    .eq("finding_type", "worker");

  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | null) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const id of extraWorkerIds) add(id);
  for (const f of (data ?? []) as Record<string, unknown>[]) {
    if (f.status === "rejected") continue;
    add(workerIdFromFinding(f));
  }
  if (ids.length === 0) return { candidates: [], workerIds: [] };

  const { data: workers } = await svc
    .from("workers")
    .select("id, full_name, role, status, availability_status, available_from, city, country, certificates")
    .eq("organization_id", orgId)
    .in("id", ids);

  const byId = new Map(
    ((workers ?? []) as Record<string, unknown>[]).map((w) => [w.id as string, w]),
  );
  const candidates = ids
    .map((id) => byId.get(id))
    .filter((w): w is Record<string, unknown> => Boolean(w))
    .filter((w) => w.status !== "blacklisted")
    .map(workerToCandidate);
  return { candidates, workerIds: candidates.map((c) => c.workerId) };
}

/** The pool, as Hanna's bot may see it: initials and matching facts, never CV text. */
export async function poolForBot(orgId: string, limit = 80) {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data } = await svc
    .from("workers")
    .select(
      "id, full_name, role, status, availability_status, available_from, city, country, certificates, skills, languages, work_authorisation",
    )
    .eq("organization_id", orgId)
    .in("status", ["active", "candidate"])
    .order("updated_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map(workerForBot);
}

export async function lookupWorkers(orgId: string, query: string) {
  const svc = createServiceSupabaseClient();
  const q = query.trim().replace(/[%_,()]/g, " ").slice(0, 80).trim();
  if (!svc || q.length < 2) return [];
  const { data } = await svc
    .from("workers")
    .select(
      "id, full_name, role, status, availability_status, available_from, city, country, skills, certificates",
    )
    .eq("organization_id", orgId)
    .in("status", ["active", "candidate"])
    .ilike("full_name", `%${q}%`)
    .limit(10);
  return ((data ?? []) as Record<string, unknown>[]).map(workerForBot);
}

/** Approvals copy for an availability finding. Null if the payload is a CV/person proposal. */
export function availabilityFindingCopy(
  payload: Record<string, unknown>,
  evidenceText: string | null,
): { itemType: string; headline: string; detail: string | null; evidenceText: string | null } | null {
  if (String(payload.proposal ?? "") !== "availability") return null;
  const name = String(payload.full_name ?? "Someone in the pool").trim() || "Someone in the pool";
  const proposed = String(payload.proposed_availability ?? "").trim();
  const from = String(payload.available_from ?? "").trim();
  const evidence = String(payload.evidence ?? "").trim();
  const check = payload.check as { channel?: string; subject?: string; body?: string } | null;
  const draft = check?.body
    ? `Draft for a person to send (${check.channel ?? "message"})${check.subject ? ` — ${check.subject}` : ""}: ${check.body}`
    : null;
  return {
    itemType: "worker_availability",
    headline: proposed ? `Availability — ${name}: ${proposed}` : `Availability check — ${name}`,
    detail:
      [evidence || null, from ? `From ${from}` : null, "A person confirms this; Hanna cannot mark anyone available."]
        .filter(Boolean)
        .join(" · "),
    evidenceText: draft || evidenceText,
  };
}

export function poolActivity(row: FiledPoolRow) {
  if (row.refused) {
    return { kind: "failed" as const, text: `Could not file pool proposal: ${clip(row.refused, 140)}` };
  }
  if (row.kind === "availability") {
    const who = row.initials ?? "a person in the pool";
    if (row.draftId && row.stillPending) {
      return { kind: "missing" as const, text: `Drafted an availability check for ${who} — a person sends it.` };
    }
    if (row.stillPending) {
      return { kind: "missing" as const, text: `Proposed an availability update for ${who} — a person accepts it.` };
    }
    return { kind: "found" as const, text: `Drafted an availability check for ${who}.` };
  }
  const who = row.initials ?? "a candidate";
  if (row.stillPending) {
    return { kind: "found" as const, text: `Proposed ${who} into the pool — still pending.` };
  }
  return { kind: "found" as const, text: `Named ${who} from the pool.` };
}
