import type { DiscoveredProject } from "@/lib/data/discovered-projects";
import type { ProjectPackageRow } from "@/lib/data/project-packages";

export type KnowledgeLevel = "known" | "inferred" | "unknown";

export type ContractorChainNode = {
  id: string;
  label: string;
  company?: string;
  level: KnowledgeLevel;
  confidence?: number;
  rationale: string;
};

export type PackageOpportunity = {
  id: string;
  title: string;
  summary: string;
  roles: string[];
  sizeRange: string;
  phaseFit: string;
  confidence: number;
  isAccepted?: boolean;
  contractorNodeId?: string;
};

export type CommercialReadiness = {
  label: "Do not call yet" | "Research first" | "Outreach ready";
  tone: "rose" | "amber" | "emerald";
  routeToBuyerScore: number;
  canOutreach: boolean;
  reasons: string[];
  nextAction: string;
  attackPoint: string;
};

const EARLY_PHASES = new Set(["announced", "permits_filed", "permits_approved"]);
const BUILD_PHASES = new Set(["groundbreaking", "foundation", "shell"]);
const DELIVERY_PHASES = new Set(["fit_out", "mep_install", "commissioning"]);

export function getPhaseLabel(phase?: string) {
  if (!phase) return "Unknown";

  const labels: Record<string, string> = {
    announced: "Announced",
    permits_filed: "Permits filed",
    permits_approved: "Permits approved",
    groundbreaking: "Groundbreaking",
    foundation: "Foundation",
    shell: "Shell",
    fit_out: "Fit-out",
    mep_install: "MEP install",
    commissioning: "Commissioning",
    operational: "Operational",
    unknown: "Unknown",
  };

  return labels[phase] ?? phase.replace(/_/g, " ");
}

export function getPhaseCommercialContext(phase?: string) {
  if (!phase || phase === "unknown") {
    return "Project timing is still fuzzy. Treat labor demand and outreach timing as provisional.";
  }
  if (EARLY_PHASES.has(phase)) {
    return "This looks early. The right move is usually to find the contractor chain before pushing a labor offer.";
  }
  if (BUILD_PHASES.has(phase)) {
    return "Construction appears active. Focus on package owners and build-phase subcontractors.";
  }
  if (DELIVERY_PHASES.has(phase)) {
    return "This is close to live buying territory. Fit-out, MEP, supervision, and commissioning packages matter more now.";
  }
  if (phase === "operational") {
    return "This may be too late for broad installation packages. Niche support roles may still be possible.";
  }
  return "Use this phase as a directional signal, not a certainty.";
}

export function buildContractorChain(project: DiscoveredProject): ContractorChainNode[] {
  return [
    {
      id: "owner",
      label: "Owner / operator",
      company: project.clientCompany,
      level: project.clientCompany ? "known" : "unknown",
      confidence: project.clientCompany ? 95 : undefined,
      rationale: project.clientCompany
        ? "The source names this company as the project client or operator."
        : "No owner or operator was extracted from the source.",
    },
    {
      id: "developer",
      label: "Developer",
      company: project.clientCompany && EARLY_PHASES.has(project.phase ?? "") ? project.clientCompany : undefined,
      level: project.clientCompany && EARLY_PHASES.has(project.phase ?? "") ? "inferred" : "unknown",
      confidence: project.clientCompany && EARLY_PHASES.has(project.phase ?? "") ? 55 : undefined,
      rationale:
        project.clientCompany && EARLY_PHASES.has(project.phase ?? "")
          ? "Early-phase data center announcements often name the developer or owner before the delivery chain is visible."
          : "Developer not identified yet.",
    },
    {
      id: "gc",
      label: "EPC / general contractor",
      company: project.generalContractor,
      level: project.generalContractor ? "known" : "unknown",
      confidence: project.generalContractor ? 90 : undefined,
      rationale: project.generalContractor
        ? "The source names a delivery contractor directly."
        : "No EPC or GC was identified in the current source set.",
    },
    {
      id: "mep",
      label: "MEP contractor",
      level: "unknown",
      rationale: "MEP contractor has not been identified yet.",
    },
    {
      id: "electrical",
      label: "Electrical contractor",
      level: "unknown",
      rationale: "Electrical package owner has not been identified yet.",
    },
    {
      id: "intermediary",
      label: "Labor intermediary",
      level: "unknown",
      rationale: "No labor intermediary or staffing partner has been linked yet.",
    },
  ];
}

export function buildPackageOpportunities(project: DiscoveredProject): PackageOpportunity[] {
  const phase = project.phase ?? "unknown";
  const packages: PackageOpportunity[] = [];

  if (phase === "commissioning") {
    packages.push({
      id: "commissioning-support",
      title: "Commissioning support package",
      summary: "Best fit if the project is entering systems testing, energization, and close-out.",
      roles: ["PLC programmers", "automation engineers", "commissioning technicians", "electrical supervisors"],
      sizeRange: "1-6 people",
      phaseFit: "Commissioning",
      confidence: 82,
    });
  }

  if (DELIVERY_PHASES.has(phase)) {
    packages.push({
      id: "electrical-fit-out",
      title: "Electrical fit-out package",
      summary: "Strongest route when the job is moving into containment, cable pulling, fit-out, and energization prep.",
      roles: ["electricians", "cable pullers", "electrical supervisors"],
      sizeRange: project.estimatedCrewSize && project.estimatedCrewSize > 30 ? "6-24 people" : "2-12 people",
      phaseFit: `${getPhaseLabel(phase)} phase`,
      confidence: 88,
    });
    packages.push({
      id: "mech-support",
      title: "Mechanical / installation support package",
      summary: "Useful when mixed MEP scopes create overflow for fitters, installers, and general technical labor.",
      roles: ["mechanical fitters", "welders", "site support workers"],
      sizeRange: "2-10 people",
      phaseFit: `${getPhaseLabel(phase)} phase`,
      confidence: 61,
    });
  }

  if (BUILD_PHASES.has(phase)) {
    packages.push({
      id: "site-supervision",
      title: "Site supervision and prep package",
      summary: "Construction-phase angle when package owners need supervisors, layout support, or early electrical preparation.",
      roles: ["electrical supervisors", "site supervisors", "technical coordinators"],
      sizeRange: "1-4 people",
      phaseFit: `${getPhaseLabel(phase)} phase`,
      confidence: 67,
    });
  }

  if (EARLY_PHASES.has(phase)) {
    packages.push({
      id: "early-package-hypothesis",
      title: "Early package hypothesis",
      summary: "This is not outreach-ready labor demand yet. Use it to frame research into likely package owners and future labor windows.",
      roles: ["electricians", "cable pullers", "mechanical fitters", "PLC programmers"],
      sizeRange: "1-20+ people",
      phaseFit: `${getPhaseLabel(phase)} phase`,
      confidence: 45,
    });
  }

  if (packages.length === 0) {
    packages.push({
      id: "general-technical-support",
      title: "General technical support package",
      summary: "Commercial shape is still weak. Treat this as a placeholder until the chain and phase become clearer.",
      roles: ["electrical workers", "mechanical workers", "PLC programmers", "supervisors"],
      sizeRange: "1-12 people",
      phaseFit: "Phase unclear",
      confidence: 35,
    });
  }

  return packages.sort((a, b) => b.confidence - a.confidence);
}

export function mergePackageOpportunities(
  heuristicPackages: PackageOpportunity[],
  dbPackages: ProjectPackageRow[],
  project: DiscoveredProject
): PackageOpportunity[] {
  const merged: PackageOpportunity[] = [];

  // 1. Add DB packages (Accepted)
  for (const pkg of dbPackages) {
    merged.push({
      id: pkg.id,
      title: pkg.title,
      summary: pkg.summary || "",
      roles: pkg.roles,
      sizeRange: pkg.estimated_crew_size ? `${pkg.estimated_crew_size} people` : "Unknown",
      phaseFit: "Confirmed research",
      confidence: pkg.confidence ?? 100,
      isAccepted: true,
      contractorNodeId: pkg.contractor_node_id ?? undefined,
    });
  }

  // 2. Add Heuristic packages (Inferred)
  // Only add heuristics if they don't obviously overlap with an accepted package
  // (e.g. if we have an accepted "Electrical fit-out", maybe we don't need the heuristic one)
  for (const hp of heuristicPackages) {
    const isRedundant = dbPackages.some(
      (dp) => dp.title.toLowerCase().includes(hp.title.toLowerCase()) || 
              hp.title.toLowerCase().includes(dp.title.toLowerCase())
    );
    
    if (!isRedundant) {
      merged.push({
        ...hp,
        isAccepted: false,
      });
    }
  }

  return merged.sort((a, b) => {
    // Accepted always wins, then confidence
    if (a.isAccepted && !b.isAccepted) return -1;
    if (!a.isAccepted && b.isAccepted) return 1;
    return b.confidence - a.confidence;
  });
}

export function buildCommercialReadiness(project: DiscoveredProject): CommercialReadiness {
  const hasSource = Boolean(project.sourceUrl);
  const hasPhase = Boolean(project.phase && project.phase !== "unknown");
  const hasOwner = Boolean(project.clientCompany);
  const hasKnownRoute = Boolean(project.generalContractor);
  const packages = buildPackageOpportunities(project);
  const bestPackage = packages[0];

  const reasons: string[] = [];
  let routeToBuyerScore = 0;

  if (hasSource) routeToBuyerScore += 15;
  else reasons.push("Source provenance is weak.");

  if (hasPhase) routeToBuyerScore += 20;
  else reasons.push("Project phase is still unclear.");

  if (hasOwner) routeToBuyerScore += 15;
  else reasons.push("Owner / operator is not confirmed.");

  if (hasKnownRoute) routeToBuyerScore += 35;
  else reasons.push("Contractor chain still needs research.");

  if ((bestPackage?.confidence ?? 0) >= 70) routeToBuyerScore += 15;
  else reasons.push("Package hypothesis is still soft.");

  const attackPoint = hasKnownRoute
    ? `Start with ${project.generalContractor}`
    : hasOwner && EARLY_PHASES.has(project.phase ?? "")
      ? `Research downstream delivery chain from ${project.clientCompany}`
      : hasOwner
        ? `Use ${project.clientCompany} to identify the package owner`
        : "Attack point unknown";

  if (hasKnownRoute && hasPhase && hasSource) {
    return {
      label: "Outreach ready",
      tone: "emerald",
      routeToBuyerScore,
      canOutreach: true,
      reasons: reasons.length ? reasons : ["Known contractor route exists and project timing is commercially usable."],
      nextAction: `Build buyer list inside ${project.generalContractor} and tailor outreach around the ${bestPackage?.title.toLowerCase() ?? "best-fit package"}.`,
      attackPoint,
    };
  }

  if (hasSource && hasOwner && hasPhase) {
    return {
      label: "Research first",
      tone: "amber",
      routeToBuyerScore,
      canOutreach: false,
      reasons: reasons.length ? reasons : ["Project is real, but buyer access is still weak."],
      nextAction: "Map the GC / EPC / MEP / electrical package owner before any generic outreach.",
      attackPoint,
    };
  }

  return {
    label: "Do not call yet",
    tone: "rose",
    routeToBuyerScore,
    canOutreach: false,
    reasons: reasons.length ? reasons : ["Commercial shape is too weak to justify contact."],
    nextAction: "Strengthen the project record first: source, phase, contractor chain, and package hypothesis.",
    attackPoint,
  };
}
