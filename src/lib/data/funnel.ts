import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { leadGroupKey } from "@/lib/data/lead-match";

// ---------------------------------------------------------------------------
// The path from a requisition arriving to an order, with the leak visible.
//
// The Today screen had no data representation at all — it wrote the business
// out as a sentence in the footer: "2 people · 18 projects · 174 companies ·
// 34 inbound requisitions". Four numbers with no relationship between them,
// which is a data dump, not a representation.
//
// These numbers have a relationship, and it is the only one that matters: how
// many roles arrived, and how many were answered. Everything downstream is
// starved by that one step, and no amount of research fixes it.
//
// Counted as ROLES, not rows, and replies counted only when one was recorded.
// The first version got both wrong. g2 sent one Ireland commissioning role
// four times, so "Requisitions in" was bigger than the demand. And "Replied
// to" counted lead_reply_drafts — three AI-written replies with status 'draft'
// and no sent_at, none of which ever left the building. Both numbers were on
// the screen and neither was true.
//
// Deliberately shows zeros as zeros. A funnel that hides its empty stages is
// the "agent activity is not success" failure drawn as a chart, and the whole
// product exists to refuse that.
// ---------------------------------------------------------------------------

export interface FunnelStage {
  key: string;
  /** What a person would call it. */
  label: string;
  n: number;
  /** True for the stages that only a human can move. */
  human: boolean;
}

export interface Funnel {
  /** The warm path: a requisition arrived asking for people. */
  stages: FunnelStage[];
  /**
   * The cold path: a signal Triangle found on its own.
   *
   * These are two genuinely different routes to an order and AGENTS.md names
   * both — demand-first and supply-first. Overview drew this one as a list of
   * rows on its own page while Today drew the other as a strip, which is one
   * business in two idioms in two places: the same disease as the four
   * vocabularies for a finished job. Both live here, on one scale, so the warm
   * path being bigger than the cold one is visible instead of being something
   * you work out by navigating.
   */
  cold: FunnelStage[];
  /** Where the most are lost, by count, for the one-line verdict. */
  worstDrop: { from: string; to: string; lost: number } | null;
  /** Days since the oldest role nobody has answered first arrived. */
  oldestUnansweredDays: number | null;
  oldestUnansweredFrom: string | null;
}

async function countOf(
  svc: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  table: string,
  orgColumn: string,
  org: string,
  filter?: (q: ReturnType<typeof buildQuery>) => ReturnType<typeof buildQuery>,
): Promise<number> {
  function buildQuery() {
    return svc.from(table).select("id", { count: "exact", head: true }).eq(orgColumn, org);
  }
  const q = filter ? filter(buildQuery()) : buildQuery();
  const { count } = await q;
  return count ?? 0;
}

export async function getFunnel(org: string): Promise<Funnel> {
  const svc = createServiceSupabaseClient();
  if (!svc) {
    return {
      stages: [],
      cold: [],
      worstDrop: null,
      oldestUnansweredDays: null,
      oldestUnansweredFrom: null,
    };
  }

  const [named, attempts, reached, routes, orders, leadsRes, repliesRes] =
    await Promise.all([
      countOf(svc, "buyer_contacts", "organization_id", org),
      countOf(svc, "commercial_actions", "org_id", org),
      countOf(svc, "commercial_actions", "org_id", org, (q) => q.eq("outcome", "reached")),
      countOf(svc, "buyer_routes", "org_id", org),
      countOf(svc, "commercial_orders", "org_id", org),
      svc
        .from("job_leads")
        .select("id, duplicate_of_id, country, created_at, agency_name")
        .eq("org_id", org)
        .order("created_at", { ascending: true })
        .limit(2000),
      // A reply is a recorded attempt against the requisition. An unsent draft
      // is not one, whichever table it sits in.
      svc
        .from("outreach_drafts")
        .select("job_lead_id")
        .eq("org_id", org)
        .not("job_lead_id", "is", null)
        .neq("status", "draft"),
    ]);

  // Roles, grouped the same way the Today card groups them, so the strip and
  // the card cannot disagree about how many roles there are.
  const groups = new Map<string, { firstAt: string; agency: string | null }>();
  const groupOfLead = new Map<string, string>();
  for (const lead of leadsRes.data ?? []) {
    const key = leadGroupKey({
      id: lead.id as string,
      duplicate_of_id: (lead.duplicate_of_id as string | null) ?? null,
      country: (lead.country as string | null) ?? null,
    });
    groupOfLead.set(lead.id as string, key);
    // Leads arrive oldest first, so the first one seen is when the role arrived.
    if (!groups.has(key)) {
      groups.set(key, {
        firstAt: lead.created_at as string,
        agency: (lead.agency_name as string | null) ?? null,
      });
    }
  }

  const repliedGroups = new Set<string>();
  for (const reply of repliesRes.data ?? []) {
    const key = groupOfLead.get(reply.job_lead_id as string);
    if (key) repliedGroups.add(key);
  }

  const requisitions = groups.size;
  const replied = repliedGroups.size;

  // Aging is the fact the old card never showed, and it decides urgency.
  let oldest: { firstAt: string; agency: string | null } | null = null;
  for (const [key, group] of groups) {
    if (repliedGroups.has(key)) continue;
    if (!oldest || group.firstAt < oldest.firstAt) oldest = group;
  }
  const oldestUnansweredDays = oldest
    ? Math.floor((Date.now() - new Date(oldest.firstAt).getTime()) / 86_400_000)
    : null;

  const stages: FunnelStage[] = [
    { key: "in", label: "Requisitions in", n: requisitions, human: false },
    { key: "replied", label: "Replied to", n: replied, human: true },
    { key: "named", label: "Buyers named", n: named, human: false },
    { key: "attempts", label: "Attempts made", n: attempts, human: true },
    { key: "reached", label: "Got through", n: reached, human: true },
    { key: "routes", label: "Buyer routes", n: routes, human: true },
    { key: "orders", label: "Orders", n: orders, human: true },
  ];

  // The cold path, moved off the Overview page. Same numbers it counted, same
  // meaning; the difference is that it now sits beside the warm path on one
  // scale instead of on a page of its own.
  const [signals, packages, requirements, progressByProject] = await Promise.all([
    countOf(svc, "discovered_projects", "organization_id", org),
    countOf(svc, "project_packages", "org_id", org),
    countOf(svc, "commercial_requirements", "org_id", org),
    (async () => {
      const { listDiscoveredProjects, rowToDiscoveredProject } = await import(
        "@/lib/data/discovered-projects"
      );
      const { getProjectProgress } = await import("@/lib/data/project-progress");
      const rows = await listDiscoveredProjects(org, { limit: 300 });
      const ids = rows.map(rowToDiscoveredProject).map((p) => p.id);
      return getProjectProgress(ids, org);
    })(),
  ]);

  const withBuyer = Array.from(progressByProject.values()).filter(
    (p) => p.hasBuyerContact,
  ).length;
  const coldReachable = Array.from(progressByProject.values()).filter(
    (p) => p.hasReachableContact,
  ).length;

  const cold: FunnelStage[] = [
    { key: "signals", label: "Signals found", n: signals, human: false },
    { key: "cold-buyer", label: "Buyer named", n: withBuyer, human: false },
    { key: "cold-reach", label: "Someone to call", n: coldReachable, human: false },
    { key: "packages", label: "Crew packages", n: packages, human: true },
    { key: "requirements", label: "Requirements", n: requirements, human: true },
    { key: "cold-routes", label: "Buyer routes", n: routes, human: true },
    { key: "cold-orders", label: "Orders", n: orders, human: true },
  ];

  // Ranked by how many were LOST, not by percentage.
  //
  // Proportion picked the wrong step: 3 → 0 at buyer routes is a 100% loss and
  // beat the top of the funnel, so the verdict named a three-row step while
  // most of the requisitions sat unanswered above it. Percentages of tiny
  // numbers always win that comparison, and the number that costs money is
  // the count.
  let worstDrop: Funnel["worstDrop"] = null;
  for (let i = 0; i < stages.length - 1; i++) {
    const a = stages[i];
    const b = stages[i + 1];
    const lost = a.n - b.n;
    if (lost <= 0) continue;
    if (!worstDrop || lost > worstDrop.lost) {
      worstDrop = { from: a.label, to: b.label, lost };
    }
  }

  return {
    stages,
    cold,
    worstDrop,
    oldestUnansweredDays,
    oldestUnansweredFrom: oldest?.agency ?? null,
  };
}
