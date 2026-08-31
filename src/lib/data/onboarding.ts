import "server-only";

import {
  getOrganizationOperatingProfile,
  isOrganizationProfileComplete,
} from "@/lib/data/organization-profile";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type ReadinessPhase =
  | "Workspace foundation"
  | "Demand intake"
  | "Supply truth"
  | "First commercial cycle";

export type TenantReadinessItem = {
  key: string;
  phase: ReadinessPhase;
  label: string;
  complete: boolean;
  evidence: string;
  blocker: string;
  href: string;
  actionLabel: string;
};

export type TenantReadiness = {
  items: TenantReadinessItem[];
  completed: number;
  total: number;
  percent: number;
  safeIntake: boolean;
  safeDraft: boolean;
  packageReady: boolean;
};

type PackageRow = {
  id: string;
  roles: string[] | null;
  estimated_crew_size: number | null;
  contractor_node_id: string | null;
};

export async function getTenantReadiness(
  organizationId: string,
): Promise<TenantReadiness> {
  const service = createServiceSupabaseClient();
  const profile = await getOrganizationOperatingProfile(organizationId);
  if (!service) {
    return emptyReadiness();
  }

  const [
    membersResult,
    mailResult,
    rulesResult,
    workersResult,
    leadsResult,
    projectsResult,
    chainResult,
    buyersResult,
    packagesResult,
  ] = await Promise.all([
    service
      .from("organization_members")
      .select("user_id,role,status")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    service
      .from("mail_accounts")
      .select("id,provider,status")
      .eq("org_id", organizationId)
      .eq("status", "active"),
    service
      .from("job_intake_rules")
      .select("body,reply_style")
      .eq("org_id", organizationId)
      .maybeSingle(),
    service
      .from("workers")
      .select("id,role,country,availability_status,status")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    service
      .from("job_leads")
      .select("id")
      .eq("org_id", organizationId)
      .eq("status", "qualified")
      .limit(1),
    service
      .from("discovered_projects")
      .select("id")
      .eq("organization_id", organizationId)
      .in("status", ["qualified", "pursuing", "won"])
      .limit(1),
    service
      .from("contractor_chain_nodes")
      .select("discovered_project_id,role")
      .eq("organization_id", organizationId),
    service
      .from("buyer_contacts")
      .select("discovered_project_id")
      .eq("organization_id", organizationId),
    service
      .from("project_packages")
      .select("id,roles,estimated_crew_size,contractor_node_id")
      .eq("org_id", organizationId)
      .eq("status", "active"),
  ]);

  const members = membersResult.data ?? [];
  const adminCount = members.filter(
    (member) => member.role === "admin" || member.role === "partner",
  ).length;
  const profileComplete = isOrganizationProfileComplete(profile);
  const sources = mailResult.data ?? [];
  const rules = rulesResult.data;
  const rulesComplete = Boolean(
    rules?.body?.trim() && rules.reply_style?.trim(),
  );
  const workers = workersResult.data ?? [];
  const readyWorkers = workers.filter(
    (worker) =>
      worker.role?.trim() &&
      worker.country?.trim() &&
      ["available", "available_soon"].includes(worker.availability_status),
  );
  const qualifiedCount =
    (leadsResult.data?.length ?? 0) + (projectsResult.data?.length ?? 0);

  const buyerProjectIds = new Set(
    (buyersResult.data ?? []).map((buyer) => buyer.discovered_project_id),
  );
  const routedProjectIds = new Set(
    (chainResult.data ?? [])
      .filter((node) => !["owner", "developer"].includes(node.role))
      .map((node) => node.discovered_project_id),
  );
  const hasBuyerRoute = [...buyerProjectIds].some((projectId) =>
    routedProjectIds.has(projectId),
  );

  const packages = (packagesResult.data ?? []) as PackageRow[];
  const crediblePackages = packages.filter(
    (item) =>
      (item.roles?.length ?? 0) > 0 &&
      (item.estimated_crew_size ?? 0) > 0 &&
      Boolean(item.contractor_node_id),
  );

  const items: TenantReadinessItem[] = [
    {
      key: "organization_profile",
      phase: "Workspace foundation",
      label: "Approved organization identity",
      complete: profileComplete,
      evidence: profileComplete
        ? `${profile.name} has an approved company profile and sign-off.`
        : "Name, factual company profile, or reply sign-off is missing.",
      blocker:
        "AI cannot safely draft commercial content without an approved seller identity.",
      href: "/settings#organization",
      actionLabel: "Complete organization profile",
    },
    {
      key: "active_admin",
      phase: "Workspace foundation",
      label: "Active accountable operator",
      complete: adminCount > 0,
      evidence: `${members.length} active member${members.length === 1 ? "" : "s"}; ${adminCount} admin/partner operator${adminCount === 1 ? "" : "s"}.`,
      blocker:
        "At least one accountable admin or partner must own approvals and commercial actions.",
      href: "/settings#account",
      actionLabel: "Review account access",
    },
    {
      key: "human_approval",
      phase: "Workspace foundation",
      label: "Human approval boundary",
      complete: true,
      evidence:
        "Research writes pending suggestions, outreach remains draft-only, and sent status requires a human action.",
      blocker: "This product safety invariant cannot be disabled.",
      href: "/approvals",
      actionLabel: "Open approval queue",
    },
    {
      key: "demand_source",
      phase: "Demand intake",
      label: "Connected demand source",
      complete: sources.length > 0,
      evidence:
        sources.length > 0
          ? `${sources.length} active mailbox or external source${sources.length === 1 ? "" : "s"}.`
          : "No active mailbox or external intake source is recorded.",
      blocker: "There is no attributable source for new project or job signals.",
      href: "/settings#mailboxes",
      actionLabel: "Connect a demand source",
    },
    {
      key: "commercial_rules",
      phase: "Demand intake",
      label: "Qualification and reply rules",
      complete: rulesComplete,
      evidence: rulesComplete
        ? "Tenant-specific scoring rules and reply style are saved."
        : "Scoring rules or reply style is empty.",
      blocker:
        "The intake agent cannot consistently qualify or draft in the tenant's preferred commercial style.",
      href: "/settings#intake-rules",
      actionLabel: "Set commercial rules",
    },
    {
      key: "supply_truth",
      phase: "Supply truth",
      label: "At least one usable worker",
      complete: readyWorkers.length > 0,
      evidence: `${readyWorkers.length} of ${workers.length} active workers have role, country, and current availability.`,
      blocker:
        "The organization cannot support a package or availability claim with a usable person record.",
      href: "/workers/import",
      actionLabel: "Import or complete workers",
    },
    {
      key: "qualified_demand",
      phase: "First commercial cycle",
      label: "First qualified demand record",
      complete: qualifiedCount > 0,
      evidence:
        qualifiedCount > 0
          ? "At least one job lead or discovered project is explicitly qualified."
          : "No job lead or discovered project is explicitly qualified.",
      blocker:
        "Drafting a targeted package before qualification risks pursuing an unverified signal.",
      href: "/job-intake",
      actionLabel: "Qualify a real signal",
    },
    {
      key: "buyer_route",
      phase: "First commercial cycle",
      label: "Buyer route mapped",
      complete: hasBuyerRoute,
      evidence: hasBuyerRoute
        ? "A project has both a delivery-chain node and a buyer contact."
        : "No project has both a plausible labor buyer in the chain and a buyer contact.",
      blocker:
        "The project owner is often not the labor buyer; outreach has no safe commercial destination yet.",
      href: "/hunter",
      actionLabel: "Map a buyer route",
    },
    {
      key: "sellable_package",
      phase: "First commercial cycle",
      label: "First specific active package",
      complete: crediblePackages.length > 0,
      evidence: `${crediblePackages.length} active package${crediblePackages.length === 1 ? "" : "s"} include roles, crew size, and a contractor-chain buyer.`,
      blocker:
        "The organization has no specific buyer-linked crew or specialist offer to pitch.",
      href: "/hunter",
      actionLabel: "Create a buyer-linked package",
    },
  ];

  const completed = items.filter((item) => item.complete).length;
  const completeKeys = new Set(
    items.filter((item) => item.complete).map((item) => item.key),
  );

  return {
    items,
    completed,
    total: items.length,
    percent: Math.round((completed / items.length) * 100),
    safeIntake: [
      "organization_profile",
      "active_admin",
      "human_approval",
      "demand_source",
      "commercial_rules",
    ].every((key) => completeKeys.has(key)),
    safeDraft: [
      "organization_profile",
      "commercial_rules",
      "qualified_demand",
    ].every((key) => completeKeys.has(key)),
    packageReady: [
      "supply_truth",
      "buyer_route",
      "sellable_package",
    ].every((key) => completeKeys.has(key)),
  };
}

function emptyReadiness(): TenantReadiness {
  return {
    items: [],
    completed: 0,
    total: 0,
    percent: 0,
    safeIntake: false,
    safeDraft: false,
    packageReady: false,
  };
}
