import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// The path from a requisition arriving to an order, with the leak visible.
//
// The Today screen had no data representation at all — it wrote the business
// out as a sentence in the footer: "2 people · 18 projects · 174 companies ·
// 34 inbound requisitions". Four numbers with no relationship between them,
// which is a data dump, not a representation.
//
// These eight numbers have a relationship, and it is the only one that
// matters: 34 requisitions arrived and 3 were replied to. Everything
// downstream is starved by that one step, and no amount of research fixes it.
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
  stages: FunnelStage[];
  /** Where the largest proportional drop happens, for the one-line verdict. */
  worstDrop: { from: string; to: string; lost: number } | null;
  /** Days since the oldest requisition nobody has answered. */
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
    return { stages: [], worstDrop: null, oldestUnansweredDays: null, oldestUnansweredFrom: null };
  }

  const [requisitions, replied, named, attempts, reached, routes, orders, oldest] =
    await Promise.all([
      countOf(svc, "job_leads", "org_id", org),
      countOf(svc, "lead_reply_drafts", "org_id", org),
      countOf(svc, "buyer_contacts", "organization_id", org),
      countOf(svc, "commercial_actions", "org_id", org),
      countOf(svc, "commercial_actions", "org_id", org, (q) => q.eq("outcome", "reached")),
      countOf(svc, "buyer_routes", "org_id", org),
      countOf(svc, "commercial_orders", "org_id", org),
      svc
        .from("job_leads")
        .select("created_at, agency_name, role_title")
        .eq("org_id", org)
        .order("created_at", { ascending: true })
        .limit(50),
    ]);

  // The oldest requisition with no reply drafted against it. Aging is the
  // fact the old card never showed, and it is the one that decides urgency.
  const { data: draftedFor } = await svc
    .from("lead_reply_drafts")
    .select("job_lead_id")
    .eq("org_id", org);
  const answered = new Set(
    (draftedFor ?? []).map((r) => r.job_lead_id as string).filter(Boolean),
  );
  const { data: leadRows } = await svc
    .from("job_leads")
    .select("id, created_at, agency_name")
    .eq("org_id", org)
    .order("created_at", { ascending: true })
    .limit(200);
  const firstUnanswered = (leadRows ?? []).find((r) => !answered.has(r.id as string));

  const oldestUnansweredDays = firstUnanswered?.created_at
    ? Math.floor(
        (Date.now() - new Date(firstUnanswered.created_at as string).getTime()) /
          86_400_000,
      )
    : null;

  void oldest;

  const stages: FunnelStage[] = [
    { key: "in", label: "Requisitions in", n: requisitions, human: false },
    { key: "replied", label: "Replied to", n: replied, human: true },
    { key: "named", label: "Buyers named", n: named, human: false },
    { key: "attempts", label: "Attempts made", n: attempts, human: true },
    { key: "reached", label: "Got through", n: reached, human: true },
    { key: "routes", label: "Buyer routes", n: routes, human: true },
    { key: "orders", label: "Orders", n: orders, human: true },
  ];

  // Ranked by how many were LOST, not by percentage.
  //
  // Proportion picked the wrong step: 3 → 0 at buyer routes is a 100% loss and
  // beat 34 → 3 at the top, so the verdict read "biggest loss is Got through →
  // Buyer routes: 3 lost" while thirty-one requisitions sat unanswered above
  // it. Percentages of tiny numbers always win that comparison, and the number
  // that costs money is the count.
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
    worstDrop,
    oldestUnansweredDays,
    oldestUnansweredFrom: (firstUnanswered?.agency_name as string) ?? null,
  };
}
