import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// The refusal log.
//
// Sixty-six guards in the migrations refuse to record commercial progress the
// evidence does not support: an action marked complete with no recipient, an
// order signed against an unqualified requirement, a worker double-booked, a
// record reached across a tenant boundary.
//
// Every one of those refusals used to be thrown away. Someone saw an error and
// moved on, and the company learned nothing from having tried.
//
// That is backwards. A refusal is the most informative event this system
// produces — the exact moment someone, human or agent, tried to book progress
// that had not happened. Collected, it is the only honest measure of how often
// this company would otherwise have lied to itself.
//
// Recorded from the application rather than the trigger on purpose: a Postgres
// exception rolls back its entire transaction, so a log line written inside the
// trigger would roll back with it and never survive.
// ---------------------------------------------------------------------------

export type RefusalKind = "truth" | "boundary" | "other";

export interface Refusal {
  id: string;
  occurredAt: string;
  surface: string;
  kind: RefusalKind;
  reason: string;
  attemptedByAgent: string | null;
  entityType: string | null;
  entityId: string | null;
}

/**
 * Is this error the database refusing, or something merely broken?
 *
 * A refusal is a designed outcome and belongs in the ledger. A missing column
 * or a dropped connection is a defect and does not — filing those as
 * "attempts to record false progress" would make the ledger lie, which is a
 * particularly bad thing for this ledger to do.
 */
export function isRefusal(message: string): boolean {
  return REFUSAL_PATTERNS.some((p) => p.test(message));
}

const REFUSAL_PATTERNS: RegExp[] = [
  /\brequires\b/i,
  /belongs to another organization/i,
  /does not match this requirement/i,
  /must share an order/i,
  /still contains missing, in-progress, or blocked items/i,
  /conflicting key value violates exclusion constraint/i,
  /violates check constraint/i,
];

export function classifyRefusal(message: string): RefusalKind {
  if (/belongs to another organization|does not match this|must share an/i.test(message)) {
    return "boundary";
  }
  if (
    /\brequires\b|still contains missing|exclusion constraint|check constraint/i.test(
      message,
    )
  ) {
    return "truth";
  }
  return "other";
}

/**
 * Strip Postgres's wrapper so the sentence a person reads is the sentence the
 * migration author wrote. The rule itself is never reworded.
 */
export function cleanReason(message: string): string {
  return message
    .replace(/^.*?violates check constraint\s*/i, "Rejected by rule ")
    .replace(/^error:\s*/i, "")
    .trim()
    .slice(0, 400);
}

/**
 * Never throws and never blocks the caller. A failure to record a refusal must
 * not become a second failure on top of the first.
 */
export async function recordRefusal(params: {
  orgId: string;
  surface: string;
  reason: string;
  userId?: string | null;
  agentName?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    if (!isRefusal(params.reason)) return;
    const svc = createServiceSupabaseClient();
    if (!svc) return;
    await svc.from("refusal_log").insert({
      org_id: params.orgId,
      surface: params.surface,
      kind: classifyRefusal(params.reason),
      reason: cleanReason(params.reason),
      attempted_by: params.userId ?? null,
      attempted_by_agent: params.agentName ?? null,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      details: params.details ?? {},
    });
  } catch {
    // Deliberately silent.
  }
}

export interface RefusalSummary {
  total: number;
  truth: number;
  boundary: number;
  since: string;
  /** Computed here, not in the component — Date.now() during render is impure. */
  days: number;
  /** Most common reasons, worst first. */
  topReasons: Array<{ reason: string; count: number; kind: RefusalKind }>;
  recent: Refusal[];
}

export async function summarizeRefusals(
  orgId: string,
  days = 7,
): Promise<RefusalSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const empty: RefusalSummary = {
    total: 0,
    truth: 0,
    boundary: 0,
    since,
    days,
    topReasons: [],
    recent: [],
  };

  const svc = createServiceSupabaseClient();
  if (!svc) return empty;

  const { data } = await svc
    .from("refusal_log")
    .select(
      "id, occurred_at, surface, kind, reason, attempted_by_agent, entity_type, entity_id",
    )
    .eq("org_id", orgId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(200);

  const rows = data ?? [];
  const counts = new Map<string, { count: number; kind: RefusalKind }>();
  for (const r of rows) {
    const key = r.reason as string;
    const prev = counts.get(key);
    counts.set(key, {
      count: (prev?.count ?? 0) + 1,
      kind: r.kind as RefusalKind,
    });
  }

  return {
    total: rows.length,
    truth: rows.filter((r) => r.kind === "truth").length,
    boundary: rows.filter((r) => r.kind === "boundary").length,
    since,
    days,
    topReasons: Array.from(counts.entries())
      .map(([reason, v]) => ({ reason, count: v.count, kind: v.kind }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    recent: rows.slice(0, 8).map((r) => ({
      id: r.id as string,
      occurredAt: r.occurred_at as string,
      surface: r.surface as string,
      kind: r.kind as RefusalKind,
      reason: r.reason as string,
      attemptedByAgent: (r.attempted_by_agent as string) ?? null,
      entityType: (r.entity_type as string) ?? null,
      entityId: (r.entity_id as string) ?? null,
    })),
  };
}
