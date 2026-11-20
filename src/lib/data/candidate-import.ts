import "server-only";
import { createFinding } from "@/lib/data/findings";
import {
  DuplicateIndex,
  identityOf,
  parseCandidateRecord,
  type DuplicateRef,
} from "@/lib/data/candidate-fields";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST /api/agent/candidates
//
// Hanna files up to 50 people. Each valid one becomes a pending worker
// finding. A person accepts or rejects them in Approvals, the whole batch or
// one at a time. Nothing here inserts a worker.
// ---------------------------------------------------------------------------

const MAX_CANDIDATES = 50;
const PLACEHOLDER_PERSON =
  /\b(doe|mustermann|musterfrau|example|test|probe|dummy|placeholder|sample)\b/i;

export interface CandidateImportResult {
  index: number;
  status: "created" | "duplicate_of" | "error";
  findingId?: string;
  workerId?: string;
  matchedOn?: "linkedin_url" | "email" | "name_country";
  nameMatch?: { kind: "worker" | "finding"; id: string } | null;
  error?: string;
}

export async function fileCandidateBatch(params: {
  orgId: string;
  agentInstanceId: string | null;
  badgeName: string;
  candidates: unknown;
}): Promise<
  | { ok: false; status: number; error: string }
  | { ok: true; batchId: string | null; results: CandidateImportResult[] }
> {
  if (!Array.isArray(params.candidates)) {
    return { ok: false, status: 400, error: "Body must be { candidates: [...] }." };
  }
  if (params.candidates.length === 0) {
    return { ok: false, status: 400, error: "Send at least one candidate." };
  }
  if (params.candidates.length > MAX_CANDIDATES) {
    return {
      ok: false,
      status: 400,
      error: `At most ${MAX_CANDIDATES} candidates per call.`,
    };
  }

  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, status: 503, error: "Database unavailable." };

  const index = new DuplicateIndex();
  const { data: workers, error: workerError } = await svc
    .from("workers")
    .select("id, full_name, email, linkedin_url, country")
    .eq("organization_id", params.orgId);
  if (workerError && !isMissingLinkColumn(workerError.message)) {
    return { ok: false, status: 500, error: "Could not read the Talent Pool." };
  }
  const loaded = workerError ? await workersWithoutLinkedin(svc, params.orgId) : (workers ?? []);
  if (loaded === null) {
    return { ok: false, status: 500, error: "Could not read the Talent Pool." };
  }
  const workerRows = loaded as Array<Record<string, unknown>>;
  for (const row of workerRows) {
    index.add(
      identityOf({
        full_name: row.full_name,
        email: row.email,
        linkedin_url: row.linkedin_url,
        country: row.country,
      }),
      { kind: "worker", id: String(row.id) },
    );
  }

  const { data: pending, error: pendingError } = await svc
    .from("agent_findings")
    .select("id, payload")
    .eq("org_id", params.orgId)
    .eq("finding_type", "worker")
    .eq("status", "pending")
    .limit(1000);
  if (pendingError) {
    return { ok: false, status: 500, error: "Could not read pending proposals." };
  }
  for (const row of pending ?? []) {
    const payload = (row.payload as Record<string, unknown>) ?? {};
    if (payload.proposal === "availability") continue;
    index.add(identityOf(payload), { kind: "finding", id: String(row.id) });
  }

  const batchId = crypto.randomUUID();
  const batchLabel = `Candidates · ${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date())}`;

  const results: CandidateImportResult[] = [];
  let createdAny = false;

  for (let i = 0; i < params.candidates.length; i++) {
    const parsed = parseCandidateRecord(params.candidates[i], {
      allowAvailability: true,
      strict: true,
    });
    if (parsed.error) {
      results.push({ index: i, status: "error", error: parsed.error });
      continue;
    }
    const name = String(parsed.fields.full_name ?? "");
    if (PLACEHOLDER_PERSON.test(name)) {
      results.push({
        index: i,
        status: "error",
        error: "That name looks like a placeholder, not a person.",
      });
      continue;
    }

    const identity = identityOf(parsed.fields);
    const hit = index.match(identity);
    if (hit.status === "duplicate") {
      results.push(duplicateResult(i, hit.via, hit.ref));
      continue;
    }

    const nameMatch = hit.status === "name_only" ? { kind: hit.ref.kind, id: hit.ref.id } : null;
    const filed = await createFinding({
      orgId: params.orgId,
      agentInstanceId: params.agentInstanceId,
      findingType: "worker",
      evidenceText: `Proposed by ${params.badgeName} for a person to accept into the Talent Pool.`,
      payload: {
        source: "candidate_import",
        proposal: "candidate",
        batch_id: batchId,
        batch_label: batchLabel,
        ...parsed.fields,
        ...(nameMatch ? { name_match: nameMatch } : {}),
      },
    });
    if ("refused" in filed) {
      results.push({ index: i, status: "error", error: filed.refused });
      continue;
    }
    if (filed.duplicate) {
      results.push({
        index: i,
        status: "duplicate_of",
        findingId: filed.id,
      });
      index.add(identity, { kind: "finding", id: filed.id });
      continue;
    }

    createdAny = true;
    index.add(identity, { kind: "finding", id: filed.id });
    results.push({
      index: i,
      status: "created",
      findingId: filed.id,
      nameMatch,
    });
  }

  return { ok: true, batchId: createdAny ? batchId : null, results };
}

function duplicateResult(
  index: number,
  via: "linkedin_url" | "email" | "name_country",
  ref: DuplicateRef,
): CandidateImportResult {
  return {
    index,
    status: "duplicate_of",
    matchedOn: via,
    ...(ref.kind === "worker" ? { workerId: ref.id } : { findingId: ref.id }),
  };
}

function isMissingLinkColumn(message: string | undefined): boolean {
  return Boolean(message && message.includes("linkedin_url"));
}

async function workersWithoutLinkedin(
  svc: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  orgId: string,
): Promise<Array<Record<string, unknown>> | null> {
  const { data, error } = await svc
    .from("workers")
    .select("id, full_name, email, country")
    .eq("organization_id", orgId);
  if (error) return null;
  return (data ?? []) as Array<Record<string, unknown>>;
}
