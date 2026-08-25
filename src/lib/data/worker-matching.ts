import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkerMatchResult = {
  workerId: string;
  fullName: string;
  role: string;
  skills: string[];
  country: string;
  availabilityStatus: string;
  reliabilityScore: number;
  qualityScore: number;
  safetyScore: number;
  hourlyRateExpectation: number | null;
  dailyRateExpectation: number | null;
  matchScore: number;
  matchReasons: string[];
};

export type PackageMatchRow = {
  id: string;
  orgId: string;
  packageId: string;
  workerId: string;
  matchScore: number;
  matchReasons: string[];
  status: "shortlisted" | "submitted" | "rejected" | "placed";
  submittedAt: string | null;
  placedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // enriched from workers join
  workerName: string;
  workerRole: string;
  workerAvailability: string;
  workerCountry: string;
  workerSkills: string[];
};

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function scoreWorker(
  worker: {
    role: string | null;
    skills: string[];
    availability_status: string | null;
    reliability_score: number;
    quality_score: number;
    safety_score: number;
  },
  packageRoles: string[],
): { score: number; reasons: string[] } {
  // ─────────────────────────────────────────────────────────────────────────
  // Scoring model (v2, additive — not multiplicative)
  // ─────────────────────────────────────────────────────────────────────────
  // Workers are individuals — each one fills ONE role in a multi-role package.
  // A perfect supervisor shouldn't be penalised for not also being an electrician.
  //
  //   primary role fit ............ 50 pts
  //     • exact role match against any package role: full 50
  //     • role appears in worker skills: partial 30
  //     • else: 0 (worker excluded below the 30-floor)
  //   skill depth (secondary) .... 15 pts
  //     • % of package roles that worker can plausibly also cover
  //   availability ................ 15 pts
  //   reliability + quality + safety (additive contribution) ... 20 pts
  // ─────────────────────────────────────────────────────────────────────────

  const reasons: string[] = [];
  const workerRole = (worker.role ?? "").toLowerCase();
  const workerSkills = worker.skills.map((s) => s.toLowerCase());
  const matchedRoles = new Set<string>();

  // --- Primary role fit: 50 pts ---
  let rolePoints = 0;
  let primaryMatchRole: string | null = null;
  for (const pkgRole of packageRoles) {
    const pkgRoleLower = pkgRole.toLowerCase();
    if (workerRole && (workerRole.includes(pkgRoleLower) || pkgRoleLower.includes(workerRole))) {
      rolePoints = 50;
      primaryMatchRole = pkgRole;
      matchedRoles.add(pkgRole);
      reasons.push(`role: ${worker.role} fits ${pkgRole}`);
      break;
    }
  }
  // Fall back to skill-only match if no role match
  if (rolePoints === 0) {
    for (const pkgRole of packageRoles) {
      const pkgRoleLower = pkgRole.toLowerCase();
      if (workerSkills.some((s) => s.includes(pkgRoleLower) || pkgRoleLower.includes(s))) {
        rolePoints = 30;
        primaryMatchRole = pkgRole;
        matchedRoles.add(pkgRole);
        reasons.push(`skills cover ${pkgRole} (no exact role match)`);
        break;
      }
    }
  }

  // --- Skill depth: 15 pts (other package roles this worker could also cover) ---
  for (const pkgRole of packageRoles) {
    if (matchedRoles.has(pkgRole)) continue;
    const pkgRoleLower = pkgRole.toLowerCase();
    if (workerSkills.some((s) => s.includes(pkgRoleLower) || pkgRoleLower.includes(s))) {
      matchedRoles.add(pkgRole);
    }
  }
  const skillCoverageRatio = packageRoles.length > 0 ? matchedRoles.size / packageRoles.length : 0;
  const skillPoints = Math.round(skillCoverageRatio * 15);
  if (matchedRoles.size > 1) {
    reasons.push(`also covers ${matchedRoles.size - 1} other role(s)`);
  }

  // --- Availability: 15 pts ---
  let availPoints = 0;
  const avail = worker.availability_status ?? "unknown";
  if (avail === "available") {
    availPoints = 15;
    reasons.push("available now");
  } else if (avail === "available_soon") {
    availPoints = 10;
    reasons.push("available soon");
  } else if (avail === "unknown") {
    availPoints = 5;
  }
  // busy = 0, do_not_use = 0

  // --- Reliability / quality / safety: additive up to 20 pts ---
  const avgQuality = (worker.reliability_score + worker.quality_score + worker.safety_score) / 3;
  const qualityPoints = Math.round((avgQuality / 100) * 20);
  if (avgQuality >= 85) {
    reasons.push(`strong track record (${Math.round(avgQuality)}/100)`);
  } else if (avgQuality < 60) {
    reasons.push(`weak track record (${Math.round(avgQuality)}/100)`);
  }

  const finalScore = Math.min(100, rolePoints + skillPoints + availPoints + qualityPoints);
  // Exclude clear non-matches (no role hit at all)
  if (rolePoints === 0) {
    return { score: 0, reasons: ["no role or skill match"] };
  }
  return { score: finalScore, reasons };
}

// ---------------------------------------------------------------------------
// a) matchWorkersToPackage
// ---------------------------------------------------------------------------

export async function matchWorkersToPackage(
  packageId: string,
  orgId: string,
): Promise<WorkerMatchResult[]> {
  const service = createServiceSupabaseClient();
  if (!service) return [];

  const { data: pkg, error: pkgError } = await service
    .from("project_packages")
    .select("id, org_id, title, roles, estimated_crew_size, project_id")
    .eq("id", packageId)
    .eq("org_id", orgId)
    .single();

  if (pkgError || !pkg) return [];

  const packageRoles: string[] = Array.isArray(pkg.roles) ? pkg.roles : [];

  const { data: workers, error: workersError } = await service
    .from("workers")
    .select(
      "id, full_name, role, skills, country, availability_status, reliability_score, quality_score, safety_score, hourly_rate_expectation, daily_rate_expectation",
    )
    .eq("organization_id", orgId)
    .eq("status", "active");

  if (workersError || !workers) return [];

  const results: WorkerMatchResult[] = [];

  for (const worker of workers) {
    const { score, reasons } = scoreWorker(
      {
        role: worker.role,
        skills: Array.isArray(worker.skills) ? worker.skills : [],
        availability_status: worker.availability_status,
        reliability_score: worker.reliability_score ?? 0,
        quality_score: worker.quality_score ?? 0,
        safety_score: worker.safety_score ?? 0,
      },
      packageRoles,
    );

    // Only include workers with at least a primary role/skill hit
    if (score >= 50) {
      results.push({
        workerId: worker.id,
        fullName: worker.full_name,
        role: worker.role ?? "",
        skills: Array.isArray(worker.skills) ? worker.skills : [],
        country: worker.country ?? "",
        availabilityStatus: worker.availability_status ?? "unknown",
        reliabilityScore: worker.reliability_score ?? 0,
        qualityScore: worker.quality_score ?? 0,
        safetyScore: worker.safety_score ?? 0,
        hourlyRateExpectation: worker.hourly_rate_expectation ?? null,
        dailyRateExpectation: worker.daily_rate_expectation ?? null,
        matchScore: score,
        matchReasons: reasons,
      });
    }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore);
}

// ---------------------------------------------------------------------------
// b) saveWorkerMatches
// ---------------------------------------------------------------------------

export async function saveWorkerMatches(
  packageId: string,
  orgId: string,
  matches: WorkerMatchResult[],
): Promise<boolean> {
  const service = createServiceSupabaseClient();
  if (!service || matches.length === 0) return false;

  // Fetch existing statuses so we can preserve them on conflict
  const { data: existing } = await service
    .from("package_worker_matches")
    .select("worker_id, status")
    .eq("package_id", packageId)
    .eq("org_id", orgId);

  const existingStatusMap = new Map<string, string>(
    (existing ?? []).map((row) => [row.worker_id, row.status]),
  );

  const rows = matches.map((m) => ({
    org_id: orgId,
    package_id: packageId,
    worker_id: m.workerId,
    match_score: m.matchScore,
    match_reasons: m.matchReasons,
    status: existingStatusMap.get(m.workerId) ?? "shortlisted",
  }));

  const { error } = await service
    .from("package_worker_matches")
    .upsert(rows, { onConflict: "package_id,worker_id" });

  return !error;
}

// ---------------------------------------------------------------------------
// c) listPackageMatches
// ---------------------------------------------------------------------------

export async function listPackageMatches(
  packageId: string,
  orgId: string,
): Promise<PackageMatchRow[]> {
  const service = createServiceSupabaseClient();
  if (!service) return [];

  const { data: matchRows, error } = await service
    .from("package_worker_matches")
    .select("*")
    .eq("package_id", packageId)
    .eq("org_id", orgId)
    .order("match_score", { ascending: false });

  if (error || !matchRows || matchRows.length === 0) return [];

  // Fetch worker details for enrichment (including skills and country)
  const workerIds = matchRows.map((r) => r.worker_id);
  const { data: workers } = await service
    .from("workers")
    .select("id, full_name, role, availability_status, country, skills")
    .in("id", workerIds);

  const workerMap = new Map(
    (workers ?? []).map((w) => [w.id, w]),
  );

  return matchRows.map((row) => {
    const worker = workerMap.get(row.worker_id);
    return {
      id: row.id,
      orgId: row.org_id,
      packageId: row.package_id,
      workerId: row.worker_id,
      matchScore: row.match_score,
      matchReasons: row.match_reasons ?? [],
      status: row.status,
      submittedAt: row.submitted_at ?? null,
      placedAt: row.placed_at ?? null,
      notes: row.notes ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      workerName: worker?.full_name ?? "",
      workerRole: worker?.role ?? "",
      workerAvailability: worker?.availability_status ?? "unknown",
      workerCountry: worker?.country ?? "",
      workerSkills: Array.isArray(worker?.skills) ? worker.skills : [],
    };
  });
}

// ---------------------------------------------------------------------------
// d) updateMatchStatus
// ---------------------------------------------------------------------------

export async function updateMatchStatus(
  matchId: string,
  orgId: string,
  status: string,
  notes?: string,
): Promise<boolean> {
  const service = createServiceSupabaseClient();
  if (!service) return false;

  const patch: Record<string, unknown> = { status };
  if (notes !== undefined) patch.notes = notes;
  if (status === "submitted") patch.submitted_at = new Date().toISOString();
  if (status === "placed") patch.placed_at = new Date().toISOString();

  const { error } = await service
    .from("package_worker_matches")
    .update(patch)
    .eq("id", matchId)
    .eq("org_id", orgId);

  return !error;
}
