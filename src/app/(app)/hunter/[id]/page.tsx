import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  Zap,
  Waypoints,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth/session";
import {
  getDiscoveredProjectById,
  rowToDiscoveredProject,
} from "@/lib/data/discovered-projects";
import { listCompanies, rowToCompany } from "@/lib/data/companies";
import { listPipelineStages, rowToPipelineStage } from "@/lib/data/opportunities";
import { getChainNodes, getBuyerContacts, type ContractorChainNodeRow } from "@/lib/data/contractor-chain";
import {
  listResearchRuns,
  listResearchSuggestions,
} from "@/lib/data/research";
import { listProjectPackages } from "@/lib/data/project-packages";
import { listOutreachDrafts } from "@/lib/data/outreach";
import { listPackageMatches } from "@/lib/data/worker-matching";
import { getProjectNote } from "@/lib/data/project-notes";
import { PromoteProjectButton } from "@/components/modules/promote-project-button";
import { UpdateProjectStatusButton } from "@/components/modules/update-project-status-button";
import { ContractorChainPanel } from "@/components/modules/contractor-chain-panel";
import { ResearchSuggestionsPanel } from "@/components/modules/research-suggestions-panel";
import { ResearchChatPanel } from "@/components/modules/research-chat-panel";
import { OutreachDraftsPanel } from "@/components/modules/outreach-drafts-panel";
import { WorkerMatchPanel } from "@/components/modules/worker-match-panel";
import { ProjectNotesPanel } from "@/components/modules/project-notes-panel";
import { PersistedCollapsible } from "@/components/modules/persisted-collapsible";
import {
  buildCommercialReadiness,
  buildContractorChain,
  buildPackageOpportunities,
  mergePackageOpportunities,
  getPhaseCommercialContext,
  getPhaseLabel,
  type CommercialReadiness,
  type PackageOpportunity,
} from "@/lib/hunter-commercial";
import { cn, formatCurrency } from "@/lib/utils";

export default async function DiscoveredProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; showWeak?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireSession();

  const [row, companyRows, stageRows] = await Promise.all([
    getDiscoveredProjectById(id),
    listCompanies(session.organizationId),
    listPipelineStages(session.organizationId),
  ]);

  const [
    savedChainNodes,
    allResearchSuggestions,
    researchRuns,
    dbPackages,
    outreachDrafts,
    buyerContacts,
    projectNote,
  ] = row
    ? await Promise.all([
        getChainNodes(id, session.organizationId),
        listResearchSuggestions(id, session.organizationId),
        listResearchRuns(id, session.organizationId),
        listProjectPackages(id, session.organizationId),
        listOutreachDrafts(id, session.organizationId),
        getBuyerContacts(id, session.organizationId),
        getProjectNote(id, session.organizationId),
      ])
    : [[], [], [], [], [], [], null];

  // Fetch existing worker matches for all DB packages in parallel
  const initialMatchesMap: Record<string, import("@/lib/data/worker-matching").PackageMatchRow[]> =
    {};
  if (row && dbPackages.length > 0) {
    const matchResults = await Promise.all(
      dbPackages.map((pkg) => listPackageMatches(pkg.id, session.organizationId)),
    );
    dbPackages.forEach((pkg, i) => {
      initialMatchesMap[pkg.id] = matchResults[i];
    });
  }

  if (!row || row.organization_id !== session.organizationId) notFound();

  const project = rowToDiscoveredProject(row);
  const companies = companyRows.map(rowToCompany);
  const stages = stageRows.map(rowToPipelineStage);
  const readiness = buildCommercialReadiness(project);
  const contractorChain = buildContractorChain(project);
  const heuristicPackages = buildPackageOpportunities(project);
  const packageOpportunities = mergePackageOpportunities(heuristicPackages, dbPackages, project);

  // Build lookup maps for OutreachDraftsPanel
  const buyersById: Record<
    string,
    { contactId?: string | null; suggestionId?: string | null; name: string; company: string; title?: string | null }
  > = {};
  for (const bc of buyerContacts) {
    buyersById[bc.id] = {
      contactId: bc.id,
      name: bc.full_name ?? "?",
      company: bc.company_name ?? "?",
      title: bc.job_title,
    };
  }
  for (const s of allResearchSuggestions) {
    if (s.suggestion_type === "buyer_contact" && s.status === "pending") {
      const p = s.payload_json as Record<string, unknown>;
      buyersById[s.id] = {
        suggestionId: s.id,
        name: String(p.name ?? "?"),
        company: String(p.company ?? "?"),
        title: p.title ? String(p.title) : null,
      };
    }
  }
  const packagesById: Record<string, { id: string; title: string }> = {};
  for (const pkg of dbPackages) {
    packagesById[pkg.id] = { id: pkg.id, title: pkg.title };
  }
  const latestResearchRun = researchRuns[0] ?? null;
  const pendingSuggestionCount = allResearchSuggestions.filter((s) => s.status === "pending").length;
  const activeView = query.view === "overview" || query.view === "graph" ? query.view : "queue";
  const showWeakDefault = query.showWeak === "true";

  return (
    <div className="flex h-[calc(100vh-100px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      {/* Left Panel: The Orchestrator Chat */}
      <div className="flex w-3/5 flex-col border-r border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Zap className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Project Agent</h2>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-tight truncate max-w-[200px] block">
                  Active: {project.projectName}
                </span>
              </div>
            </div>
          </div>
          <Link
            href="/ai"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-all"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Exit Project
          </Link>
        </div>
        <div className="flex-1 overflow-hidden relative bg-slate-50">
          <ResearchChatPanel projectId={project.id} />
        </div>
      </div>

      {/* Right Panel: Intelligence Deck */}
      <div className="w-2/5 overflow-y-auto bg-slate-50/30 p-6 space-y-6">
        <PersistedCollapsible
          storageKey={`hunter:${project.id}:chain`}
          title="Contractor Chain"
          description="Working map of who controls the project packages."
          defaultOpen
        >
          {savedChainNodes.length === 0 ? (
            <div className="mb-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500 text-center">
              No accepted chain nodes yet. Ask the agent to map the GC and MEP roles.
            </div>
          ) : null}
          <ContractorChainPanel
            projectId={project.id}
            savedNodes={savedChainNodes}
            inferredNodes={contractorChain.map((n) => ({
              id: n.id,
              label: n.label,
              company: n.company,
              level: n.level,
              confidence: n.confidence,
              rationale: n.rationale,
            }))}
          />
        </PersistedCollapsible>

        <PersistedCollapsible
          storageKey={`hunter:${project.id}:commercial`}
          title="Commercial Readiness"
          description="Route-to-buyer framing, attack point, and phase."
          defaultOpen
        >
          <div className="space-y-4">
            <ReadinessBanner readiness={readiness} />
            <div className="grid gap-3 md:grid-cols-2">
              <MetricCard label="Attack point" value={readiness.attackPoint} helper="Best company to pursue." />
              <MetricCard label="Next action" value={readiness.nextAction} helper="The next commercial move." />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Commercial Check</p>
              <p className="mt-2 text-xs leading-5 text-slate-700">{getPhaseCommercialContext(project.phase)}</p>
            </div>
          </div>
        </PersistedCollapsible>

        <PersistedCollapsible
          storageKey={`hunter:${project.id}:inbox`}
          title={`Inbox (${pendingSuggestionCount} pending)`}
          description="Pending AI suggestions to review."
        >
          <ResearchSuggestionsPanel 
            suggestions={allResearchSuggestions} 
            showWeakDefault={showWeakDefault} 
          />
        </PersistedCollapsible>

        <PersistedCollapsible
          storageKey={`hunter:${project.id}:packages`}
          title="Package Opportunities"
          description="Hypotheses generated from context."
        >
          <div className="space-y-3">
            {packageOpportunities.map((pkg) => (
              <PackageOpportunityCard
                key={pkg.id}
                opportunity={pkg}
                contractor={pkg.contractorNodeId ? savedChainNodes.find(n => n.id === pkg.contractorNodeId) : undefined}
              />
            ))}
            {packageOpportunities.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
                No package opportunities identified yet.
              </div>
            )}
          </div>
        </PersistedCollapsible>

        <PersistedCollapsible
          storageKey={`hunter:${project.id}:workers`}
          title="Worker Matching"
          description="Match your worker pool to packages. Click 'Find workers' per package to run scoring."
        >
          <WorkerMatchPanel
            packages={dbPackages
              .filter((p) => p.status !== "archived")
              .map((p) => ({
                id: p.id,
                title: p.title,
                roles: p.roles ?? [],
                estimatedCrewSize: p.estimated_crew_size ?? null,
              }))}
            initialMatches={initialMatchesMap}
          />
        </PersistedCollapsible>

        <PersistedCollapsible
          storageKey={`hunter:${project.id}:outreach`}
          title="Outreach"
          description="AI-drafted messages. Never auto-sent — you copy, send, and mark sent here."
        >
          <OutreachDraftsPanel
            drafts={outreachDrafts}
            buyersById={buyersById}
            packagesById={packagesById}
          />
        </PersistedCollapsible>

        <PersistedCollapsible
          storageKey={`hunter:${project.id}:memory`}
          title="Project Memory"
          description="Your notes for this project. The agent reads them on every run."
        >
          <ProjectNotesPanel
            projectId={project.id}
            initialBody={projectNote?.body ?? ""}
            initialUpdatedAt={projectNote?.updatedAt ?? null}
          />
        </PersistedCollapsible>

        <PersistedCollapsible storageKey={`hunter:${project.id}:facts`} title="Project Facts">
          <div className="grid gap-4 md:grid-cols-2">
            <Info label="Estimated value" value={project.estimatedValueEur ? formatCurrency(project.estimatedValueEur) : "-"} />
            <Info label="Phase" value={getPhaseLabel(project.phase)} />
            <Info label="Client" value={project.clientCompany ?? "-"} />
            <Info label="Type" value={project.projectType ?? "-"} />
            <Info label="Location" value={project.country ? `${project.city ? project.city + ', ' : ''}${project.country}` : "-"} />
            <Info label="Status" value={project.status} />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
            <UpdateProjectStatusButton projectId={project.id} currentStatus={project.status} />
            <PromoteProjectButton
              projectName={project.projectName}
              country={project.country}
              estimatedValueEur={project.estimatedValueEur}
              companies={companies}
              stages={stages}
            />
          </div>
        </PersistedCollapsible>
      </div>
    </div>
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

function PackageOpportunityCard({ 
  opportunity, 
  contractor 
}: { 
  opportunity: PackageOpportunity;
  contractor?: ContractorChainNodeRow;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Waypoints className={cn("h-4 w-4", opportunity.isAccepted ? "text-emerald-600" : "text-sky-600")} />
            <p className="text-sm font-semibold text-slate-900">{opportunity.title}</p>
            {opportunity.isAccepted && (
              <Badge intent="success" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 py-0 h-5 text-[10px] border-emerald-200">
                Accepted
              </Badge>
            )}
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
        {contractor && (
          <FactPill label="Owner" value={contractor.company_name ?? contractor.label} />
        )}
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
