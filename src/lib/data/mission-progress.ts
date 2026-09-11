// ---------------------------------------------------------------------------
// How far along a mission is, counted from what it holds.
//
// "Progress 74%" is only worth showing if nobody can talk it up. So a
// criterion is a metric and a target, and the actual number is counted here
// from the same rows the mission page draws — the companies filed, the people
// named, the partner firms whose capacity a person confirmed. The worker is
// never asked how far along it is.
//
// Client-safe: the mission page, the worker's prompt and the check on a
// proposed plan all read the same definitions.
// ---------------------------------------------------------------------------

import type {
  CriterionProgress,
  MissionCandidate,
  MissionCompanyRow,
  MissionCriterion,
  MissionKind,
  MissionMetric,
  MissionPartner,
  MissionPass,
  MissionPlanStep,
  MissionProgress,
  PlanStepProgress,
} from "@/lib/data/mission-shared";

export const RESEARCH_METRICS = [
  "companies_found",
  "companies_in_play",
  "named_buyers",
  "contact_routes",
  "project_evidence",
  "reachable",
] as const satisfies readonly MissionMetric[];

export const RECRUITING_METRICS = [
  "candidates_named",
  "candidates_available",
  "partners_confirmed",
] as const satisfies readonly MissionMetric[];

/** The passes a plan may use today. Verify and rank join when they count something real. */
export const RESEARCH_PASSES = ["discover", "qualify", "research", "prepare"] as const satisfies readonly MissionPass[];
export const RECRUITING_PASSES = ["match", "qualify"] as const satisfies readonly MissionPass[];

export function metricsFor(kind: MissionKind): readonly MissionMetric[] {
  return kind === "recruiting" ? RECRUITING_METRICS : RESEARCH_METRICS;
}

const PHRASE: Record<MissionMetric, readonly [one: string, many: string]> = {
  companies_found: ["company found", "companies found"],
  companies_in_play: ["company still in play", "companies still in play"],
  named_buyers: ["buyer named", "buyers named"],
  contact_routes: ["buyer with a published way in", "buyers with a published way in"],
  project_evidence: ["company tied to a current project", "companies tied to a current project"],
  reachable: ["person ready to reach — name, door and words", "people ready to reach — name, door and words"],
  candidates_named: ["person named from the pool", "people named from the pool"],
  candidates_available: ["person available now or soon", "people available now or soon"],
  partners_confirmed: ["partner firm with confirmed capacity", "partner firms with confirmed capacity"],
};

/** The words after the number: "companies still in play". */
export function metricPhrase(metric: MissionMetric, n: number): string {
  return PHRASE[metric][n === 1 ? 0 : 1];
}

/** "20 companies still in play". */
export function metricLabel(metric: MissionMetric, target: number): string {
  return `${target} ${metricPhrase(metric, target)}`;
}

/**
 * A plan step with no criterion of its own is measured against the one it
 * leads to: finding companies is done when as many were found as must stay in
 * play.
 */
const LEADS_TO: Partial<Record<MissionMetric, MissionMetric>> = {
  companies_found: "companies_in_play",
  candidates_named: "candidates_available",
};

/**
 * The count each count narrows. Fifteen buyers named out of twelve companies
 * in play is a finish line nobody can reach.
 */
const NARROWS: Partial<Record<MissionMetric, MissionMetric>> = {
  companies_in_play: "companies_found",
  named_buyers: "companies_in_play",
  contact_routes: "named_buyers",
  reachable: "contact_routes",
  project_evidence: "companies_in_play",
  candidates_available: "candidates_named",
};

// ── counting ────────────────────────────────────────────────────────────────

export interface MissionFacts {
  companies: ReadonlyArray<Pick<MissionCompanyRow, "state" | "notForUs" | "person" | "channel" | "project">>;
  candidates: ReadonlyArray<Pick<MissionCandidate, "availability">>;
  partners: ReadonlyArray<Pick<MissionPartner, "sellable">>;
}

export function countMetric(metric: MissionMetric, facts: MissionFacts): number {
  const inPlay = facts.companies.filter((c) => !c.notForUs && c.state !== "dead");
  switch (metric) {
    case "companies_found":
      return facts.companies.length;
    case "companies_in_play":
      return inPlay.length;
    case "named_buyers":
      return inPlay.filter((c) => c.person).length;
    case "contact_routes":
      return inPlay.filter((c) => c.person && c.channel).length;
    case "project_evidence":
      return inPlay.filter((c) => c.project).length;
    case "reachable":
      return inPlay.filter((c) => c.state === "reachable").length;
    case "candidates_named":
      return facts.candidates.length;
    case "candidates_available":
      return facts.candidates.filter(
        (c) => c.availability === "available" || c.availability === "available_soon",
      ).length;
    case "partners_confirmed":
      return facts.partners.filter((p) => p.sellable).length;
  }
}

export function evaluateProgress(
  criteria: readonly MissionCriterion[],
  plan: readonly MissionPlanStep[],
  facts: MissionFacts,
): MissionProgress | null {
  if (criteria.length === 0) return null;
  const targets = new Map(criteria.map((c) => [c.metric, c.target]));

  const rows: CriterionProgress[] = criteria.map((c) => {
    const actual = countMetric(c.metric, facts);
    return { ...c, actual, met: actual >= c.target, label: metricLabel(c.metric, c.target) };
  });

  const steps: PlanStepProgress[] = [...plan]
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const leadsTo = LEADS_TO[s.metric];
      const target = targets.get(s.metric) ?? (leadsTo ? targets.get(leadsTo) : undefined) ?? 1;
      const actual = countMetric(s.metric, facts);
      return { ...s, target, actual, done: actual >= target };
    });

  const met = rows.every((r) => r.met);
  const share = rows.reduce((sum, r) => sum + Math.min(1, r.actual / r.target), 0) / rows.length;
  return {
    criteria: rows,
    plan: steps,
    // Rounding must never show 100% on a finish line that is not reached.
    percent: met ? 100 : Math.min(99, Math.round(share * 100)),
    met,
    stepsDone: steps.filter((s) => s.done).length,
    current: steps.find((s) => !s.done) ?? null,
  };
}

/** "3 of 5 met · 74%". */
export function progressSentence(progress: MissionProgress): string {
  const met = progress.criteria.filter((c) => c.met).length;
  return `${met} of ${progress.criteria.length} met · ${progress.percent}%`;
}

/** The finish line and the route, as a worker reads them in its instructions. */
export function describeProgress(progress: MissionProgress | null): string {
  if (!progress) return "SUCCESS WHEN: not set yet.";
  return [
    "SUCCESS WHEN (counted from the records on file, never from what you report):",
    ...progress.criteria.map(
      (c) => `- ${c.label}: ${c.actual} on file${c.met ? " — met" : ""}`,
    ),
    "",
    `PLAN (${progress.stepsDone} of ${progress.plan.length} steps done; → marks the next):`,
    ...progress.plan.map(
      (s) =>
        `${s.done ? "✓" : s === progress.current ? "→" : "○"} ${s.position}. ${s.title} [${s.pass}] — ${s.actual} of ${s.target}`,
    ),
  ].join("\n");
}

// ── a proposed plan, made safe to keep ──────────────────────────────────────

export interface PlanDraft {
  criteria: ReadonlyArray<{ metric: string; target: number }>;
  plan: ReadonlyArray<{ pass: string; title: string; metric: string }>;
}

export interface SettledPlan {
  criteria: Array<{ metric: MissionMetric; target: number }>;
  plan: Array<{ pass: MissionPass; title: string; metric: MissionMetric }>;
}

const DEFAULT_STEP: Record<MissionMetric, { pass: MissionPass; title: string }> = {
  companies_found: { pass: "discover", title: "Find companies that buy this kind of labour" },
  companies_in_play: { pass: "qualify", title: "Keep the ones that fit what we supply" },
  named_buyers: { pass: "research", title: "Name the person who buys the labour at each" },
  contact_routes: { pass: "research", title: "Find a published way in to each buyer" },
  project_evidence: { pass: "qualify", title: "Tie each to a current project" },
  reachable: { pass: "prepare", title: "Prepare the words for the best of them" },
  candidates_named: { pass: "match", title: "Match people from the pool to the job" },
  candidates_available: { pass: "qualify", title: "Check who is available when the job starts" },
  partners_confirmed: { pass: "match", title: "Find partner firms with confirmed capacity for the rest" },
};

const DEFAULT_CRITERIA: Record<MissionKind, SettledPlan["criteria"]> = {
  research: [
    { metric: "companies_in_play", target: 20 },
    { metric: "named_buyers", target: 15 },
    { metric: "contact_routes", target: 12 },
    { metric: "project_evidence", target: 10 },
    { metric: "reachable", target: 5 },
  ],
  recruiting: [
    { metric: "candidates_named", target: 3 },
    { metric: "candidates_available", target: 3 },
  ],
};

const MIN_STEPS: Record<MissionKind, number> = { research: 3, recruiting: 2 };

function depth(metric: MissionMetric): number {
  let d = 0;
  for (let m = NARROWS[metric]; m; m = NARROWS[m]) d++;
  return d;
}

function stepsFor(criteria: SettledPlan["criteria"], kind: MissionKind): SettledPlan["plan"] {
  const has = new Set(criteria.map((c) => c.metric));
  return metricsFor(kind)
    .filter((m) => has.has(m) || (LEADS_TO[m] !== undefined && has.has(LEADS_TO[m]!)))
    .map((m) => ({ ...DEFAULT_STEP[m], metric: m }));
}

/**
 * Keep what can be counted, clamp what cannot be reached, and make sure every
 * criterion is on the route. Null when nothing usable is left.
 */
export function settlePlan(kind: MissionKind, draft: PlanDraft): SettledPlan | null {
  const allowed = metricsFor(kind);
  const passes = new Set<string>(kind === "recruiting" ? RECRUITING_PASSES : RESEARCH_PASSES);

  const picked = new Map<MissionMetric, number>();
  for (const c of draft.criteria) {
    const metric = allowed.find((m) => m === c.metric);
    const target = Math.round(Number(c.target));
    if (!metric || picked.has(metric) || !Number.isFinite(target)) continue;
    picked.set(metric, Math.min(500, Math.max(1, target)));
    if (picked.size === 5) break;
  }
  if (picked.size === 0) return null;

  // Outer counts first, so each narrower count is clamped to an already
  // clamped one.
  const ordered = [...picked.keys()].sort((a, b) => depth(a) - depth(b));
  for (const metric of ordered) {
    let parent = NARROWS[metric];
    while (parent && !picked.has(parent)) parent = NARROWS[parent];
    if (parent) picked.set(metric, Math.min(picked.get(metric)!, picked.get(parent)!));
  }
  const criteria = allowed
    .filter((m) => picked.has(m))
    .map((metric) => ({ metric, target: picked.get(metric)! }));

  const measurable = (m: MissionMetric) =>
    picked.has(m) || (LEADS_TO[m] !== undefined && picked.has(LEADS_TO[m]!));
  let plan: SettledPlan["plan"] = [];
  for (const s of draft.plan) {
    const metric = allowed.find((m) => m === s.metric);
    const title = String(s.title ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!metric || !passes.has(s.pass) || !measurable(metric) || !title) continue;
    plan.push({ pass: s.pass as MissionPass, title, metric });
    if (plan.length === 7) break;
  }
  if (plan.length < MIN_STEPS[kind]) plan = stepsFor(criteria, kind);
  for (const c of criteria) {
    if (!plan.some((s) => s.metric === c.metric)) plan.push({ ...DEFAULT_STEP[c.metric], metric: c.metric });
  }
  return { criteria, plan: plan.slice(0, 12) };
}

/** What a mission gets when nobody could propose anything better. */
export function defaultPlan(kind: MissionKind): SettledPlan {
  const criteria = DEFAULT_CRITERIA[kind].map((c) => ({ ...c }));
  return { criteria, plan: stepsFor(criteria, kind) };
}
