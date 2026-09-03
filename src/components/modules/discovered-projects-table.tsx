import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  Calendar,
  CircleDollarSign,
  ExternalLink,
  MapPin,
  TrendingUp,
  Users,
} from "lucide-react";
import type { DiscoveredProject } from "@/lib/data/discovered-projects";
import type { ProjectProgress } from "@/lib/data/project-progress";
import { formatCurrency } from "@/lib/utils";
import { DeleteProjectButton } from "./delete-project-button";

const PHASE_LABELS: Record<string, string> = {
  announced: "Announced",
  permits_filed: "Permits Filed",
  permits_approved: "Permits Approved",
  groundbreaking: "Groundbreaking",
  foundation: "Foundation",
  shell: "Shell",
  fit_out: "Fit-out",
  mep_install: "MEP Install",
  commissioning: "Commissioning",
  operational: "Operational",
  unknown: "Unknown",
};

const PHASE_COLORS: Record<string, string> = {
  announced: "bg-slate-100 text-slate-700",
  permits_filed: "bg-blue-100 text-blue-800",
  permits_approved: "bg-cyan-100 text-cyan-800",
  groundbreaking: "bg-amber-100 text-amber-800",
  foundation: "bg-orange-100 text-orange-800",
  shell: "bg-yellow-100 text-yellow-800",
  fit_out: "bg-emerald-100 text-emerald-800",
  mep_install: "bg-green-100 text-green-800",
  commissioning: "bg-teal-100 text-teal-800",
  operational: "bg-slate-100 text-slate-500",
  unknown: "bg-slate-100 text-slate-500",
};

const PROGRESS_STEPS = [
  "Chain mapped",
  "Buyer named",
  "Reachable",
  "Package shaped",
] as const;

function ProgressBadge({ progress }: { progress?: ProjectProgress }) {
  if (!progress) return null;
  const done = [
    progress.hasChain,
    progress.hasBuyerContact,
    progress.hasReachableContact,
    progress.hasPackage,
  ];
  return (
    <div className="w-full max-w-[200px]">
      <p
        className={`text-right text-xs font-medium ${
          progress.hasReachableContact
            ? "text-emerald-700"
            : progress.step > 0
              ? "text-slate-600"
              : "text-slate-400"
        }`}
      >
        {progress.label}
      </p>
      <div className="mt-1 flex justify-end gap-1" aria-hidden>
        {done.map((ok, i) => (
          <span
            key={PROGRESS_STEPS[i]}
            title={PROGRESS_STEPS[i]}
            className={`h-1.5 w-8 rounded-full ${
              ok ? "bg-emerald-500" : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <p className="mt-1 text-right text-[10px] text-slate-400">
        {progress.step} of 4 steps
      </p>
    </div>
  );
}

export function DiscoveredProjectsTable({
  projects,
  progress,
}: {
  projects: DiscoveredProject[];
  /** Real qualification state per project id. See lib/data/project-progress.ts. */
  progress?: Map<string, ProjectProgress>;
}) {
  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <TrendingUp className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="mb-1 text-base font-semibold text-slate-900">
            No projects discovered yet
          </h3>
          <p className="mx-auto max-w-md text-sm text-slate-500">
            Click <b>&quot;Hunt now&quot;</b> to run the AI agent. It will search the web for
            new construction projects matching your sector keywords and add them
            here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {projects.map((project) => (
        <Card
          key={project.id}
          className="transition hover:border-sky-200 hover:shadow-sm"
        >
          <CardContent className="p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-950">
                    {project.projectName}
                  </h3>
                  {project.phase && (
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        PHASE_COLORS[project.phase] ?? PHASE_COLORS.unknown
                      }`}
                    >
                      {PHASE_LABELS[project.phase] ?? project.phase}
                    </span>
                  )}
                  <Badge>{project.status}</Badge>
                  <div className="ml-auto flex items-center">
                    <DeleteProjectButton projectId={project.id} />
                  </div>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  {project.clientCompany && (
                    <span>
                      <b>Client:</b> {project.clientCompany}
                    </span>
                  )}
                  {project.generalContractor && (
                    <span>
                      <b>GC:</b> {project.generalContractor}
                    </span>
                  )}
                  {project.country && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {project.city ? `${project.city}, ` : ""}
                      {project.country}
                    </span>
                  )}
                  {project.capacity && (
                    <span>
                      <b>Capacity:</b> {project.capacity}
                    </span>
                  )}
                </div>

                {project.aiSummary && (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-700">
                    {project.aiSummary}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                  {/* `value && <jsx/>` renders a literal 0 when the value IS
                      0 — Ford's project has estimated_value_eur = 0 and the
                      row showed a bare "0" next to the source link. Compare
                      explicitly. */}
                  {typeof project.estimatedCrewSize === "number" &&
                    project.estimatedCrewSize > 0 && (
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      <b>{project.estimatedCrewSize}</b> crew
                    </span>
                  )}
                  {typeof project.estimatedValueEur === "number" &&
                    project.estimatedValueEur > 0 && (
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <CircleDollarSign className="h-3.5 w-3.5 text-slate-400" />
                      {formatCurrency(project.estimatedValueEur)}
                    </span>
                  )}
                  {project.peakWorkforceMonth && (
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      Peak: {project.peakWorkforceMonth}
                    </span>
                  )}
                  {project.sourceUrl && (
                    <a
                      href={project.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Source
                    </a>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 md:min-w-[200px]">
                {/* Was an "Opportunity" score bar. It read 75 on sixteen of
                    eighteen projects because a model was asked for a number
                    with no rubric — and the list was sorted by it. This shows
                    what Triangle has actually established instead. */}
                <ProgressBadge progress={progress?.get(project.id)} />
                <Link
                  href={`/hunter/${project.id}`}
                  className="mt-2 inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  View details
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
