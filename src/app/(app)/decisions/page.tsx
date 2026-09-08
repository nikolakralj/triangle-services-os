import { PageHeader } from "@/components/common/page-header";
import { TodayScreen } from "@/components/modules/today-screen";
import { getNextMove } from "@/lib/data/next-move";
import { listWhatCameBack } from "@/lib/data/came-back";
import { getFunnel } from "@/lib/data/funnel";
import { summarizeRefusals } from "@/lib/data/refusals";
import { RefusalLedger } from "@/components/modules/refusal-ledger";
import { FunnelStrip } from "@/components/modules/funnel-strip";
import { listWorkforce } from "@/lib/data/workforce";
import { getSession } from "@/lib/auth/session";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// The one screen.
//
// This page used to load the decision inbox, the plays, the workforce, every
// assignment, the agent faces and four table counts, and hand all of it to a
// 956-line cockpit with a dispatch bar, a human-actions panel, a tactical-plays
// list and a four-tab Agent Desk whose detail drawer ended in a "Done" button
// that closed the drawer.
//
// Now: the next move, what came back, and the employees who can be asked.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Today"
        description="Not available — organization context required."
      />
    );
  }

  const svc = createServiceSupabaseClient();
  const org = session.organizationId;

  const [move, cameBack, employees, funnel, refusals, projects, companies, people] =
    await Promise.all([
      getNextMove(org),
      listWhatCameBack(org),
      listWorkforce(org),
      getFunnel(org),
      summarizeRefusals(org),
      count(svc, "discovered_projects", "organization_id", org),
      count(svc, "companies", "organization_id", org),
      count(svc, "workers", "organization_id", org),
    ]);

  // Scout first, then Hanna, then the rest — the order the router in the Ask
  // box falls back through when a brief does not clearly belong to either.
  const roster = employees
    .filter((e) => e.status === "active")
    .sort((a, b) => rank(a.roleKey) - rank(b.roleKey))
    .map((e) => ({
      id: e.id,
      name: e.displayName,
      emoji: e.emoji,
      roleTitle: e.description,
    }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Today"
        description="One action to take, one box to ask in, and what the team brought back."
      />
      {/* The business on one line, before the day's work. It had no data
          representation at all: the footer wrote four unrelated numbers out
          as a sentence. */}
      <FunnelStrip funnel={funnel} />
      {/* What the system would not let anyone record. Moved off Overview:
          it is the most informative thing this product produces and it was
          on a page nobody had a reason to open. */}
      <RefusalLedger summary={refusals} />
      <TodayScreen
        move={move}
        employees={roster}
        cameBack={cameBack}
        counts={{ projects, companies, people }}
      />
    </div>
  );
}

function rank(roleKey: string): number {
  if (roleKey === "project_researcher") return 0;
  if (roleKey === "hr" || roleKey === "triangle_hr") return 1;
  return 2;
}

async function count(
  svc: ReturnType<typeof createServiceSupabaseClient>,
  table: string,
  orgColumn: string,
  org: string,
): Promise<number> {
  if (!svc) return 0;
  const { count: n } = await svc
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(orgColumn, org);
  return n ?? 0;
}
