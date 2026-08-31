import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type RequirementStatus =
  | "draft"
  | "needs_information"
  | "qualified"
  | "disqualified"
  | "proposal_ready"
  | "ordered"
  | "closed";

export type CommercialRequirementRow = {
  id: string;
  org_id: string;
  source_type: string;
  job_lead_id: string | null;
  discovered_project_id: string | null;
  opportunity_id: string | null;
  project_package_id: string | null;
  title: string;
  status: RequirementStatus;
  decision_reason: string | null;
  demand_evidence_url: string | null;
  demand_evidence_summary: string | null;
  demand_evidence_date: string | null;
  buyer_confirmed_at: string | null;
  buyer_confirmed_by: string | null;
  scope_summary: string | null;
  exclusions: string | null;
  roles: string[];
  headcount_min: number | null;
  headcount_max: number | null;
  seniority: string | null;
  country: string | null;
  city: string | null;
  site_location: string | null;
  start_date_from: string | null;
  start_date_to: string | null;
  start_window_text: string | null;
  duration_weeks: number | null;
  duration_text: string | null;
  shift_pattern: string | null;
  required_skills: string[];
  required_documents: string[];
  engagement_model: string;
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  rate_unit: string | null;
  payment_terms_days: number | null;
  commercial_notes: string | null;
  country_feasibility_state: string;
  supplier_onboarding_state: string;
  unknowns: string[];
  owner_id: string | null;
  next_action: string | null;
  next_action_due_at: string | null;
  qualified_at: string | null;
  qualified_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BuyerRouteRow = {
  id: string;
  org_id: string;
  requirement_id: string;
  discovered_project_id: string | null;
  chain_node_id: string | null;
  buyer_contact_id: string | null;
  route_type: string;
  route_status: string;
  contracting_entity: string | null;
  buyer_company: string | null;
  buyer_contact_name: string | null;
  buyer_contact_email: string | null;
  portal_url: string | null;
  evidence_url: string | null;
  evidence_summary: string | null;
  onboarding_requirements: string | null;
  engagement_model: string | null;
  owner_id: string | null;
  next_action: string | null;
  next_action_due_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CommercialActionRow = {
  id: string;
  org_id: string;
  requirement_id: string | null;
  buyer_route_id: string | null;
  project_package_id: string | null;
  outreach_draft_id: string | null;
  submission_packet_send_id: string | null;
  action_type: string;
  status: string;
  channel: string | null;
  sender_user_id: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_company: string | null;
  subject: string | null;
  ai_draft: string | null;
  final_content: string | null;
  occurred_at: string | null;
  follow_up_at: string | null;
  response_summary: string | null;
  objection: string | null;
  outcome: string | null;
  next_action: string | null;
  next_action_due_at: string | null;
  human_confirmed_at: string | null;
  human_confirmed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RequirementListItem = CommercialRequirementRow & {
  routeCount: number;
  confirmedRouteCount: number;
  actionCount: number;
  completedActionCount: number;
  missingForQualification: string[];
};

export type CommercialSourceOption = {
  value: string;
  label: string;
  status: string;
};

export type CommercialWorkspace = {
  requirement: CommercialRequirementRow;
  routes: BuyerRouteRow[];
  actions: CommercialActionRow[];
  chainNodes: Array<{ id: string; label: string; company_name: string | null; role: string }>;
  buyerContacts: Array<{
    id: string;
    full_name: string | null;
    company_name: string | null;
    job_title: string | null;
    email: string | null;
  }>;
  packages: Array<{ id: string; title: string; status: string }>;
  missingForQualification: string[];
};

const CONFIRMED_ROUTE_STATUSES = new Set([
  "confirmed",
  "approved",
  "prequalification",
]);

export function requirementQualificationGaps(
  requirement: CommercialRequirementRow,
  routes: BuyerRouteRow[],
) {
  const missing: string[] = [];
  if (!requirement.buyer_confirmed_at) missing.push("buyer confirmation");
  if (!requirement.scope_summary?.trim()) missing.push("scope");
  if (requirement.roles.length === 0) missing.push("roles");
  if ((requirement.headcount_max ?? requirement.headcount_min ?? 0) <= 0) {
    missing.push("headcount");
  }
  if (!requirement.country?.trim()) missing.push("country");
  if (!requirement.start_date_from && !requirement.start_window_text?.trim()) {
    missing.push("start window");
  }
  if (!requirement.duration_weeks && !requirement.duration_text?.trim()) {
    missing.push("duration");
  }
  if (requirement.engagement_model === "unknown") {
    missing.push("engagement model");
  }
  if (!requirement.commercial_notes?.trim()) {
    missing.push("rate or commercial logic");
  }
  if (!requirement.owner_id) missing.push("owner");
  if (!requirement.next_action?.trim() || !requirement.next_action_due_at) {
    missing.push("dated next action");
  }
  if (
    !routes.some((route) => CONFIRMED_ROUTE_STATUSES.has(route.route_status))
  ) {
    missing.push("confirmed buyer or supplier route");
  }
  return missing;
}

export async function listCommercialRequirements(
  orgId: string,
): Promise<RequirementListItem[]> {
  const service = createServiceSupabaseClient();
  if (!service) return [];

  const [requirementsResult, routesResult, actionsResult] = await Promise.all([
    service
      .from("commercial_requirements")
      .select("*")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false }),
    service.from("buyer_routes").select("*").eq("org_id", orgId),
    service
      .from("commercial_actions")
      .select("*")
      .eq("org_id", orgId),
  ]);

  if (requirementsResult.error) {
    console.error("listCommercialRequirements error", requirementsResult.error);
    return [];
  }

  const requirements =
    (requirementsResult.data ?? []) as CommercialRequirementRow[];
  const routes = (routesResult.data ?? []) as BuyerRouteRow[];
  const actions = (actionsResult.data ?? []) as CommercialActionRow[];

  return requirements.map((requirement) => {
    const requirementRoutes = routes.filter(
      (route) => route.requirement_id === requirement.id,
    );
    const requirementActions = actions.filter(
      (action) => action.requirement_id === requirement.id,
    );
    return {
      ...requirement,
      routeCount: requirementRoutes.length,
      confirmedRouteCount: requirementRoutes.filter((route) =>
        CONFIRMED_ROUTE_STATUSES.has(route.route_status),
      ).length,
      actionCount: requirementActions.length,
      completedActionCount: requirementActions.filter((action) =>
        ["completed", "responded", "no_response"].includes(action.status),
      ).length,
      missingForQualification: requirementQualificationGaps(
        requirement,
        requirementRoutes,
      ),
    };
  });
}

export async function listCommercialSourceOptions(
  orgId: string,
): Promise<CommercialSourceOption[]> {
  const service = createServiceSupabaseClient();
  if (!service) return [];

  const [leads, projects, opportunities] = await Promise.all([
    service
      .from("job_leads")
      .select("id,role_title,agency_name,status")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
    service
      .from("discovered_projects")
      .select("id,project_name,status")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
    service
      .from("opportunities")
      .select("id,title,status")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return [
    ...(leads.data ?? []).map((lead) => ({
      value: `job_lead:${lead.id}`,
      label: `Job lead — ${lead.role_title}${lead.agency_name ? ` (${lead.agency_name})` : ""}`,
      status: lead.status,
    })),
    ...(projects.data ?? []).map((project) => ({
      value: `discovered_project:${project.id}`,
      label: `Project — ${project.project_name}`,
      status: project.status,
    })),
    ...(opportunities.data ?? []).map((opportunity) => ({
      value: `opportunity:${opportunity.id}`,
      label: `Opportunity — ${opportunity.title}`,
      status: opportunity.status,
    })),
  ];
}

export async function getCommercialWorkspace(
  requirementId: string,
  orgId: string,
): Promise<CommercialWorkspace | null> {
  const service = createServiceSupabaseClient();
  if (!service) return null;

  const { data: requirement, error } = await service
    .from("commercial_requirements")
    .select("*")
    .eq("id", requirementId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error || !requirement) return null;

  const typedRequirement = requirement as CommercialRequirementRow;
  const [routesResult, actionsResult, packagesResult, chainResult, buyersResult] =
    await Promise.all([
      service
        .from("buyer_routes")
        .select("*")
        .eq("requirement_id", requirementId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
      service
        .from("commercial_actions")
        .select("*")
        .eq("requirement_id", requirementId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
      service
        .from("project_packages")
        .select("id,title,status")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
      typedRequirement.discovered_project_id
        ? service
            .from("contractor_chain_nodes")
            .select("id,label,company_name,role")
            .eq("organization_id", orgId)
            .eq(
              "discovered_project_id",
              typedRequirement.discovered_project_id,
            )
        : Promise.resolve({ data: [], error: null }),
      typedRequirement.discovered_project_id
        ? service
            .from("buyer_contacts")
            .select("id,full_name,company_name,job_title,email")
            .eq("organization_id", orgId)
            .eq(
              "discovered_project_id",
              typedRequirement.discovered_project_id,
            )
        : Promise.resolve({ data: [], error: null }),
    ]);

  const routes = (routesResult.data ?? []) as BuyerRouteRow[];
  return {
    requirement: typedRequirement,
    routes,
    actions: (actionsResult.data ?? []) as CommercialActionRow[],
    chainNodes: chainResult.data ?? [],
    buyerContacts: buyersResult.data ?? [],
    packages: packagesResult.data ?? [],
    missingForQualification: requirementQualificationGaps(
      typedRequirement,
      routes,
    ),
  };
}
