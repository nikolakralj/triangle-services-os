import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  LocateFixed,
  ShieldAlert,
  Waypoints,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth/session";
import {
  getDiscoveredProjectById,
  rowToDiscoveredProject,
} from "@/lib/data/discovered-projects";
import { listCompanies, rowToCompany } from "@/lib/data/companies";
import { listPipelineStages, rowToPipelineStage } from "@/lib/data/opportunities";
import { PromoteProjectButton } from "@/components/modules/promote-project-button";
import { UpdateProjectStatusButton } from "@/components/modules/update-project-status-button";
import {
  buildCommercialReadiness,
  buildContractorChain,
  buildPackageOpportunities,
  getPhaseCommercialContext,
  getPhaseLabel,
  type CommercialReadiness,
  type ContractorChainNode,
  type PackageOpportunity,
} from "@/lib/hunter-commercial";
import { cn, formatCurrency } from "@/lib/utils";

export default async function DiscoveredProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const [row, companyRows, stageRows] = await Promise.all([
    getDiscoveredProjectById(id),
    listCompanies(session.organizationId),
    listPipelineStages(session.organizationId),
  ]);

  if (!row || row.organization_id !== session.organizationId) notFound();

  const project = rowToDiscoveredProject(row);
  const companies = companyRows.map(rowToCompany);
  const stages = stageRows.map(rowToPipelineStage);
  const readiness = buildCommercialReadiness(project);
  const contractorChain = buildContractorChain(project);
  const packageOpportunities = buildPackageOpportunities(project);

  return (
    <>
      <Link
        href="/hunter"
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Hunter
      </Link>

      <PageHeader
        title={project.projectName}
        description={
          project.aiSummary ?? "Discovered project. Use this page to shape it into a commercial opportunity."
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card className="border-slate-200">
            <CardHeader
              title="Commercial readiness"
              description="This project is only useful if we can identify a route to buyer and a package worth offering."
            />
            <CardContent className="space-y-4">
              <ReadinessBanner readiness={readiness} />
              <div className="grid gap-3 md:grid-cols-2">
                <MetricCard
                  label="Attack point"
                  value={readiness.attackPoint}
                  helper="Best current company or role to pursue next."
                />
                <MetricCard
                  label="Next action"
                  value={readiness.nextAction}
                  helper="The next commercial move this record suggests right now."
                />
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Commercial check
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {getPhaseCommercialContext(project.phase)}
                </p>
                <ul className="mt-3 space-y-2">
                  {readiness.reasons.map((reason) => (
                    <li key={reason} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-slate-400" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Contractor chain"
              description="Known, inferred, and unknown roles stay separated so we do not pretend the route to buyer is clearer than it is."
            />
            <CardContent className="space-y-3">
              {contractorChain.map((node) => (
                <ContractorChainRow key={node.id} node={node} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Package opportunities"
              description="These are package hypotheses, not promises. The point is to translate project intelligence into specific offers of any credible size."
            />
            <CardContent className="space-y-3">
              {packageOpportunities.map((pkg) => (
                <PackageOpportunityCard key={pkg.id} opportunity={pkg} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Project facts" />
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Info label="Client / operator" value={project.clientCompany ?? "-"} />
              <Info label="General contractor" value={project.generalContractor ?? "-"} />
              <Info label="Type" value={project.projectType ?? "-"} />
              <Info label="Capacity" value={project.capacity ?? "-"} />
              <Info
                label="Country"
                value={
                  project.country
                    ? `${project.country}${project.countryCode ? ` (${project.countryCode})` : ""}`
                    : "-"
                }
              />
              <Info label="City" value={project.city ?? "-"} />
              <Info
                label="Estimated value"
                value={project.estimatedValueEur ? formatCurrency(project.estimatedValueEur) : "-"}
              />
              <Info label="Phase" value={getPhaseLabel(project.phase)} />
              <Info
                label="Phase confidence"
                value={
                  project.phaseConfidence !== undefined ? `${project.phaseConfidence}%` : "-"
                }
              />
              <Info label="Estimated start" value={project.estimatedStartDate ?? "-"} />
              <Info
                label="Estimated completion"
                value={project.estimatedCompletionDate ?? "-"}
              />
              <Info
                label="Peak workforce month"
                value={project.peakWorkforceMonth ?? "-"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Labor relevance" />
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-700">
                <b>Total estimated crew:</b> {project.estimatedCrewSize ?? "Unknown"}
              </p>
              {project.crewBreakdown && Object.keys(project.crewBreakdown).length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(project.crewBreakdown).map(([role, count]) => (
                    <div
                      key={role}
                      className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                    >
                      <span className="text-sm text-slate-700">{role.replace(/_/g, " ")}</span>
                      <span className="text-sm font-bold text-slate-900">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No role breakdown yet. Use package opportunities above as the first commercial hypothesis.
                </p>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  AI match reasoning
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {project.aiMatchReasoning ?? "-"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Status" />
            <CardContent>
              <Badge>{project.status}</Badge>
              <p className="mt-2 text-xs text-slate-500">
                Discovered {new Date(project.createdAt).toLocaleDateString()}
              </p>
              <p className="mt-1 text-xs text-slate-500">AI model: {project.aiModel ?? "-"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Commercial scores" />
            <CardContent className="space-y-3">
              <ScoreRow label="Project attractiveness" value={project.aiOpportunityScore} />
              <ScoreRow label="Route to buyer" value={readiness.routeToBuyerScore} />
              <ScoreRow label="Worker match" value={project.aiMatchScore} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Source" />
            <CardContent className="space-y-2">
              {project.sourceUrl ? (
                <a
                  href={project.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-800"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open source
                </a>
              ) : (
                <p className="text-sm text-slate-500">No URL captured</p>
              )}
              {project.sourceText ? (
                <blockquote className="border-l-2 border-slate-200 pl-3 text-xs italic text-slate-600">
                  &quot;{project.sourceText}&quot;
                </blockquote>
              ) : null}
              {project.sourceDate ? (
                <p className="text-xs text-slate-500">Published: {project.sourceDate}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Actions" />
            <CardContent className="space-y-2">
              <UpdateProjectStatusButton
                projectId={project.id}
                currentStatus={project.status}
              />
              <button
                className={cn(
                  "w-full rounded-md px-3 py-2 text-sm font-semibold text-white",
                  readiness.canOutreach
                    ? "bg-sky-600 hover:bg-sky-700"
                    : "cursor-not-allowed bg-slate-300 text-slate-600",
                )}
                disabled={!readiness.canOutreach}
              >
                Prepare outreach
              </button>
              <PromoteProjectButton
                projectName={project.projectName}
                country={project.country}
                estimatedValueEur={project.estimatedValueEur}
                companies={companies}
                stages={stages}
              />
              <button className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Match workers
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function ReadinessBanner({ readiness }: { readiness: CommercialReadiness }) {
  const styles = {
    rose: {
      shell: "border-rose-200 bg-rose-50",
      text: "text-rose-900",
      badge: "bg-rose-600 text-white",
      icon: ShieldAlert,
    },
    amber: {
      shell: "border-amber-200 bg-amber-50",
      text: "text-amber-950",
      badge: "bg-amber-500 text-white",
      icon: AlertTriangle,
    },
    emerald: {
      shell: "border-emerald-200 bg-emerald-50",
      text: "text-emerald-950",
      badge: "bg-emerald-600 text-white",
      icon: CheckCircle2,
    },
  }[readiness.tone];

  const Icon = styles.icon;

  return (
    <div className={cn("rounded-lg border p-4", styles.shell)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-white/80 p-2">
            <Icon className={cn("h-4 w-4", styles.text)} />
          </div>
          <div>
            <p className={cn("text-sm font-semibold", styles.text)}>{readiness.label}</p>
            <p className="mt-1 text-sm text-slate-700">{readiness.nextAction}</p>
          </div>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", styles.badge)}>
          Route to buyer {readiness.routeToBuyerScore}/100
        </span>
      </div>
    </div>
  );
}

function ContractorChainRow({ node }: { node: ContractorChainNode }) {
  const tone = {
    known: {
      icon: CheckCircle2,
      badge: "Known",
      shell: "border-emerald-200 bg-emerald-50",
      text: "text-emerald-950",
    },
    inferred: {
      icon: LocateFixed,
      badge: "Inferred",
      shell: "border-amber-200 bg-amber-50",
      text: "text-amber-950",
    },
    unknown: {
      icon: CircleDashed,
      badge: "Unknown",
      shell: "border-slate-200 bg-slate-50",
      text: "text-slate-700",
    },
  }[node.level];

  const Icon = tone.icon;

  return (
    <div className={cn("rounded-lg border p-3", tone.shell)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", tone.text)} />
            <p className="text-sm font-semibold text-slate-900">{node.label}</p>
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {tone.badge}
            </span>
            {node.confidence !== undefined ? (
              <span className="text-xs text-slate-500">{node.confidence}%</span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-900">{node.company ?? "-"}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{node.rationale}</p>
        </div>
      </div>
    </div>
  );
}

function PackageOpportunityCard({ opportunity }: { opportunity: PackageOpportunity }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Waypoints className="h-4 w-4 text-sky-600" />
            <p className="text-sm font-semibold text-slate-900">{opportunity.title}</p>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-700">{opportunity.summary}</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
          {opportunity.confidence}/100
        </span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <FactPill label="Phase fit" value={opportunity.phaseFit} />
        <FactPill label="Package size" value={opportunity.sizeRange} />
        <FactPill label="Roles" value={opportunity.roles.join(", ")} />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-900">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>
    </div>
  );
}

function FactPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-700">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value?: number }) {
  if (value === undefined || value === null) {
    return (
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{label}</span>
        <span>-</span>
      </div>
    );
  }

  const color =
    value >= 80
      ? "bg-emerald-500"
      : value >= 60
        ? "bg-sky-500"
        : value >= 40
          ? "bg-amber-500"
          : "bg-slate-400";

  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-bold">{value}/100</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
