import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SectorSwitcher } from "@/components/modules/sector-switcher";
import { DiscoveredProjectsTable } from "@/components/modules/discovered-projects-table";
import { requireSession } from "@/lib/auth/session";
import { listSectors, rowToSector } from "@/lib/data/sectors";
import {
  listDiscoveredProjects,
  rowToDiscoveredProject,
  getDiscoveredProjectStats,
} from "@/lib/data/discovered-projects";
import { listHuntRuns, rowToHuntRun } from "@/lib/data/hunt-runs";
import {
  TrendingUp,
  Target,
  Clock,
  CheckCircle2,
  Activity,
} from "lucide-react";

export default async function HunterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const requestedSectorId = params.sector ? String(params.sector) : undefined;
  const statusFilter = params.status ? String(params.status) : undefined;
  const countryFilter = params.country ? String(params.country) : undefined;

  // Load all sectors
  const sectorRows = await listSectors(session.organizationId);
  const sectors = sectorRows.map(rowToSector);

  // No sector in the URL means "all". Defaulting to one sector meant every
  // project an agent filed — which arrives with no sector at all — was hidden,
  // and this page showed an empty list while 21 projects existed.
  const activeSector = requestedSectorId
    ? sectors.find((s) => s.id === requestedSectorId)
    : undefined;

  if (sectors.length === 0) {
    return (
      <>
        <PageHeader
          title="Hunter"
          description="No sectors configured. Set up sectors in Settings first."
        />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-slate-500">
              You don&apos;t have any sectors yet. The Hunter needs at least one
              active sector to operate.
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  // Load discovered projects + stats + recent runs in parallel
  const [projectRows, stats, runRows] = await Promise.all([
    listDiscoveredProjects(session.organizationId, {
      sectorId: activeSector?.id,
      status: statusFilter,
      countryCode: countryFilter,
      limit: 50,
    }),
    getDiscoveredProjectStats(session.organizationId, activeSector?.id),
    listHuntRuns(session.organizationId, {
      sectorId: activeSector?.id,
      limit: 1,
    }),
  ]);

  const projects = projectRows.map(rowToDiscoveredProject);
  const lastRun = runRows.length > 0 ? rowToHuntRun(runRows[0]!) : null;

  return (
    <>
      <PageHeader
        title="Signal Inbox"
        description={
          activeSector
            ? `Raw intelligence queue for ${activeSector.name}. Everything your employees found, waiting to be qualified.`
            : "Everything your employees found, waiting to be qualified."
        }
      />

      <SectorSwitcher sectors={sectors} activeSectorId={activeSector?.id} />

      {/* Stats row */}
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <StatCard
          icon={<TrendingUp className="h-4 w-4 text-sky-600" />}
          label="Total discovered"
          value={stats.total}
          color="sky"
        />
        <StatCard
          icon={<Target className="h-4 w-4 text-amber-600" />}
          label="New (review needed)"
          value={stats.newCount}
          color="amber"
        />
        <StatCard
          icon={<Clock className="h-4 w-4 text-emerald-600" />}
          label="Pursuing"
          value={stats.pursuingCount + stats.qualifiedCount}
          color="emerald"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4 text-purple-600" />}
          label="Won"
          value={stats.wonCount}
          color="purple"
        />
      </div>

      {/* Last run info */}
      {lastRun && (
        <Card className="mb-4 border-slate-200">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <Activity className="h-4 w-4 text-slate-400" />
              <div className="text-xs text-slate-600">
                Last hunt:{" "}
                <b className="text-slate-900">
                  {new Date(lastRun.startedAt).toLocaleString()}
                </b>
                {" — "}
                <span
                  className={
                    lastRun.status === "success"
                      ? "text-emerald-700"
                      : lastRun.status === "failed"
                        ? "text-rose-700"
                        : "text-slate-700"
                  }
                >
                  {lastRun.status}
                </span>
                {" — "}
                {lastRun.newProjectsInserted} new projects (
                {lastRun.duplicatesFiltered} dupes filtered)
              </div>
            </div>
            <Link
              href="/hunter/runs"
              className="text-xs font-medium text-sky-600 hover:text-sky-800"
            >
              View all runs →
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Status filter pills — every project ever discovered, findable by status */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Status:
        </span>
        {[
          { key: "", label: "All" },
          { key: "new", label: "New" },
          { key: "reviewing", label: "Reviewing" },
          { key: "qualified", label: "Qualified" },
          { key: "pursuing", label: "Pursuing" },
          { key: "won", label: "Won" },
          { key: "lost", label: "Lost" },
          { key: "archived", label: "Archived" },
        ].map(({ key, label }) => {
          const qs = new URLSearchParams();
          if (activeSector) qs.set("sector", activeSector.id);
          if (key) qs.set("status", key);
          if (countryFilter) qs.set("country", countryFilter);
          const active = (statusFilter ?? "") === key;
          return (
            <Link
              key={key || "all"}
              href={`/hunter?${qs.toString()}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Country filter pills */}
      {activeSector && activeSector.targetCountries.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Country:
          </span>
          <Link
            href={(() => {
              const qs = new URLSearchParams();
              qs.set("sector", activeSector.id);
              if (statusFilter) qs.set("status", statusFilter);
              return `/hunter?${qs.toString()}`;
            })()}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              !countryFilter
                ? "border-sky-300 bg-sky-50 text-sky-800"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            All
          </Link>
          {activeSector.targetCountries.map((cc) => {
            const qs = new URLSearchParams();
            qs.set("sector", activeSector.id);
            qs.set("country", cc);
            if (statusFilter) qs.set("status", statusFilter);
            return (
              <Link
                key={cc}
                href={`/hunter?${qs.toString()}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  countryFilter === cc
                    ? "border-sky-300 bg-sky-50 text-sky-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {cc}
              </Link>
            );
          })}
        </div>
      )}

      {/* Projects */}
      <DiscoveredProjectsTable projects={projects} />
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "sky" | "amber" | "emerald" | "purple";
}) {
  const bg = {
    sky: "bg-sky-50",
    amber: "bg-amber-50",
    emerald: "bg-emerald-50",
    purple: "bg-purple-50",
  }[color];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg}`}
          >
            {icon}
          </div>
          <div>
            <p className="text-2xl font-bold leading-none text-slate-900">
              {value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
