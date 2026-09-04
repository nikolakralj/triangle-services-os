import Link from "next/link";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  Radar,
  Send,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { NextMoveBanner } from "@/components/modules/next-move-banner";
import { getNextMove } from "@/lib/data/next-move";
import { RefusalLedger } from "@/components/modules/refusal-ledger";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { getSession } from "@/lib/auth/session";
import { summarizeRefusals } from "@/lib/data/refusals";
import { getCommercialStats } from "@/lib/data/commercial-stats";
import { countDecisionAttention } from "@/lib/data/decision-inbox";
import { listDiscoveredProjects, rowToDiscoveredProject } from "@/lib/data/discovered-projects";
import { getProjectProgress } from "@/lib/data/project-progress";
import { listWorkers, rowToWorker } from "@/lib/data/workers";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// The operating view of the governed model.
//
// This page used to count companies against a target of 300, report "progress
// toward 300 — 57%", and chart a sales pipeline by stage. Those measure
// activity, not outcome: adding 128 more companies would have moved the number
// without moving the business an inch, which is the exact thing this product
// refuses to let anyone do everywhere else.
//
// What replaces them is the chain AGENTS.md actually names —
//   signal -> qualified requirement -> buyer route -> crew package
//          -> human action -> order
// — plus, above it all, what the system would not let anyone record.
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Overview"
        description="Overview not available — organization context required."
      />
    );
  }
  const orgId = session.organizationId;

  const svc = createServiceSupabaseClient();
  const count = async (table: string, orgCol = "org_id", extra?: [string, string]) => {
    if (!svc) return 0;
    let q = svc.from(table).select("id", { count: "exact", head: true }).eq(orgCol, orgId);
    if (extra) q = q.eq(extra[0], extra[1]);
    const { count: n } = await q;
    return n ?? 0;
  };

  const [
    refusals,
    nextMove,
    commercial,
    decisions,
    projectRows,
    workerRows,
    requirements,
    routes,
    packages,
    orders,
  ] = await Promise.all([
    summarizeRefusals(orgId),
    getNextMove(orgId),
    getCommercialStats(orgId),
    countDecisionAttention(orgId),
    listDiscoveredProjects(orgId, { limit: 200 }),
    listWorkers(orgId),
    count("commercial_requirements"),
    count("buyer_routes"),
    count("project_packages"),
    count("commercial_orders"),
  ]);

  const projects = projectRows.map(rowToDiscoveredProject);
  const workers = workerRows.map(rowToWorker);
  const progress = await getProjectProgress(projects.map((p) => p.id), orgId);

  const reachable = projects.filter(
    (p) => progress.get(p.id)?.hasReachableContact,
  ).length;
  const withBuyer = projects.filter(
    (p) => progress.get(p.id)?.hasBuyerContact,
  ).length;
  const available = workers.filter((w) => w.availabilityStatus === "available").length;

  // Each step names the one before it, so a gap reads as a gap rather than as
  // a small number sitting on its own.
  const chain = [
    { label: "Signals discovered", value: projects.length, href: "/hunter" },
    { label: "Buyer named", value: withBuyer, href: "/hunter" },
    { label: "Someone you can call", value: reachable, href: "/hunter" },
    { label: "Crew packages", value: packages, href: "/hunter" },
    { label: "Requirements", value: requirements, href: "/commercial" },
    { label: "Confirmed buyer routes", value: routes, href: "/commercial" },
    { label: "Sends recorded", value: commercial.outreachSent, href: "/commercial" },
    { label: "Orders", value: orders, href: "/delivery" },
  ];
  const firstGap = chain.find((s) => s.value === 0);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Where the company actually is, from signal to paid work — and what the system refused to record."
      />

      <NextMoveBanner move={nextMove} />
      <div className="mb-4">
        <RefusalLedger summary={refusals} />
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Waiting on you"
          value={decisions}
          helper="Evidence, blocked employees and unsent drafts"
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="People available"
          value={available}
          helper={`of ${workers.length} on the books, human-confirmed`}
          icon={<Users className="h-5 w-5" />}
          tone="sky"
        />
        <StatCard
          label="Qualified requirements"
          value={commercial.qualifiedRequirements}
          helper="Passed the full evidence gate"
          icon={<BriefcaseBusiness className="h-5 w-5" />}
          tone="violet"
        />
        <StatCard
          label="Awaiting a reply"
          value={commercial.awaitingReply}
          helper="Sent, follow-up date passed, nothing logged"
          icon={<Send className="h-5 w-5" />}
          tone="rose"
        />
      </div>

      <Card>
        <CardHeader
          title="Signal to paid work"
          description="Every step counts real rows. A step at zero is where the company currently stops."
        />
        <CardContent className="space-y-2">
          {chain.map((step) => {
            const isGap = step.value === 0;
            const isFirstGap = firstGap?.label === step.label;
            return (
              <Link
                key={step.label}
                href={step.href}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 transition ${
                  isFirstGap
                    ? "border-amber-300 bg-amber-50 hover:bg-amber-100"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <span className="flex items-center gap-2 text-sm text-slate-800">
                  {isGap ? (
                    <Radar className="h-4 w-4 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                  {step.label}
                  {isFirstGap && (
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                      stops here
                    </span>
                  )}
                </span>
                <span
                  className={`text-sm font-semibold ${
                    isGap ? "text-amber-700" : "text-slate-900"
                  }`}
                >
                  {step.value}
                </span>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
