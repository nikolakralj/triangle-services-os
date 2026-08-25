import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

/**
 * Cross-project intelligence for a company.
 * Shows all projects involving the company, buyer contacts, packages, and outreach.
 */

export interface ProjectInvolvement {
  id: string;
  title: string;
  description: string;
  location: string;
  status: string;
  chainNodeId: string;
  companyRole: string;
  companyRoleLabel: string;
  confidence: number | null;
  buyerContactCount: number;
  packageCount: number;
  outreachCount: number;
  createdAt: string;
}

export interface BuyerContactSummary {
  id: string;
  fullName: string | null;
  jobTitle: string | null;
  email: string | null;
  linkedinUrl: string | null;
  buyerRole: string | null;
  projectId: string;
  projectTitle: string;
}

export interface PackageSummary {
  id: string;
  title: string;
  estimatedCrewSize: number | null;
  confidence: number | null;
  projectId: string;
  projectTitle: string;
}

export interface OutreachSummary {
  id: string;
  channel: string;
  subject: string | null;
  status: string;
  buyerName: string | null;
  projectTitle: string;
  projectId: string;
  createdAt: string;
}

export interface CompanyCrossProjectIntel {
  companyName: string;
  projectInvolvements: ProjectInvolvement[];
  buyerContacts: BuyerContactSummary[];
  packages: PackageSummary[];
  outreach: OutreachSummary[];
  stats: {
    totalProjects: number;
    totalBuyerContacts: number;
    totalPackages: number;
    totalOutreach: number;
    totalOutreachByStatus: Record<string, number>;
    lastOutreachDate: string | null;
  };
}

/**
 * Get cross-project intelligence for a company.
 * This aggregates all projects, contacts, packages, and outreach involving a company.
 */
export async function getCompanyCrossProjectIntel(
  companyName: string,
  orgId: string,
): Promise<CompanyCrossProjectIntel | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  try {
    // Step 1: Find all contractor_chain_nodes involving this company
    const { data: chainNodes, error: chainError } = await svc
      .from("contractor_chain_nodes")
      .select("id,discovered_project_id,role,label,company_name,confidence")
      .eq("organization_id", orgId)
      .or(
        `company_name.ilike.%${companyName}%,company_name.ilike.%${companyName.split(" ")[0]}%`,
      );

    if (chainError) {
      console.error("getCompanyCrossProjectIntel - chainNodes error:", chainError);
      return null;
    }

    if (!chainNodes || chainNodes.length === 0) {
      return {
        companyName,
        projectInvolvements: [],
        buyerContacts: [],
        packages: [],
        outreach: [],
        stats: {
          totalProjects: 0,
          totalBuyerContacts: 0,
          totalPackages: 0,
          totalOutreach: 0,
          totalOutreachByStatus: {},
          lastOutreachDate: null,
        },
      };
    }

    const projectIds = Array.from(
      new Set(chainNodes.map((n) => n.discovered_project_id)),
    );

    // Step 2: Fetch all discovered_projects for these IDs
    const { data: projects, error: projError } = await svc
      .from("discovered_projects")
      .select("id,title,description,location,status,created_at")
      .in("id", projectIds);

    if (projError) {
      console.error("getCompanyCrossProjectIntel - projects error:", projError);
    }

    // Step 3: Get buyer contacts across these projects
    const { data: buyerContacts, error: buyerError } = await svc
      .from("buyer_contacts")
      .select("id,full_name,job_title,email,linkedin_url,buyer_role,discovered_project_id")
      .eq("organization_id", orgId)
      .in("discovered_project_id", projectIds);

    if (buyerError) {
      console.error("getCompanyCrossProjectIntel - buyerContacts error:", buyerError);
    }

    // Step 4: Get packages across these projects
    const { data: packages, error: pkgError } = await svc
      .from("project_packages")
      .select("id,title,estimated_crew_size,confidence,discovered_project_id")
      .eq("org_id", orgId)
      .in("discovered_project_id", projectIds);

    if (pkgError) {
      console.error("getCompanyCrossProjectIntel - packages error:", pkgError);
    }

    // Step 5: Get outreach drafts across these projects
    const { data: outreach, error: outreachError } = await svc
      .from("outreach_drafts")
      .select("id,channel,subject,status,project_id,created_at,buyer_contact_id")
      .eq("org_id", orgId)
      .in("project_id", projectIds);

    if (outreachError) {
      console.error("getCompanyCrossProjectIntel - outreach error:", outreachError);
    }

    // Step 6: Fetch buyer contact names for outreach if needed
    let buyerNamesMap: Record<string, string> = {};
    const outreachBuyerIds = outreach
      ?.filter((o) => o.buyer_contact_id)
      .map((o) => o.buyer_contact_id) as string[];

    if (outreachBuyerIds && outreachBuyerIds.length > 0) {
      const { data: buyerNames } = await svc
        .from("buyer_contacts")
        .select("id,full_name")
        .in("id", Array.from(new Set(outreachBuyerIds)));

      buyerNames?.forEach((b) => {
        buyerNamesMap[b.id] = b.full_name ?? "";
      });
    }

    // Step 7: Build project map
    const projectMap = new Map<
      string,
      {
        id: string;
        title: string;
        description: string;
        location: string;
        status: string;
        created_at: string;
      }
    >();

    projects?.forEach((p) => {
      projectMap.set(p.id, {
        id: p.id,
        title: p.title,
        description: p.description,
        location: p.location,
        status: p.status,
        created_at: p.created_at,
      });
    });

    // Step 8: Build project involvements
    const projectInvolvements: ProjectInvolvement[] = chainNodes.map((node) => {
      const project = projectMap.get(node.discovered_project_id);
      if (!project) return null as any; // skip if project not found (shouldn't happen)

      const buyerCount =
        buyerContacts?.filter((bc) => bc.discovered_project_id === node.discovered_project_id)
          .length ?? 0;
      const pkgCount =
        packages?.filter((p) => p.discovered_project_id === node.discovered_project_id).length ?? 0;
      const outreachCount =
        outreach?.filter((o) => o.project_id === node.discovered_project_id).length ?? 0;

      return {
        id: project.id,
        title: project.title,
        description: project.description,
        location: project.location,
        status: project.status,
        chainNodeId: node.id,
        companyRole: node.role,
        companyRoleLabel: node.label,
        confidence: node.confidence,
        buyerContactCount: buyerCount,
        packageCount: pkgCount,
        outreachCount: outreachCount,
        createdAt: project.created_at,
      };
    }).filter(Boolean);

    // Step 9: Transform contacts
    const buyerContactsSummary: BuyerContactSummary[] =
      buyerContacts?.map((bc) => {
        const project = projectMap.get(bc.discovered_project_id);
        return {
          id: bc.id,
          fullName: bc.full_name,
          jobTitle: bc.job_title,
          email: bc.email,
          linkedinUrl: bc.linkedin_url,
          buyerRole: bc.buyer_role,
          projectId: bc.discovered_project_id,
          projectTitle: project?.title ?? "",
        };
      }) ?? [];

    // Step 10: Transform packages
    const packagesSummary: PackageSummary[] =
      packages?.map((p) => {
        const project = projectMap.get(p.discovered_project_id);
        return {
          id: p.id,
          title: p.title,
          estimatedCrewSize: p.estimated_crew_size,
          confidence: p.confidence,
          projectId: p.discovered_project_id,
          projectTitle: project?.title ?? "",
        };
      }) ?? [];

    // Step 11: Transform outreach
    const outreachSummary: OutreachSummary[] =
      outreach?.map((o) => {
        const project = projectMap.get(o.project_id);
        return {
          id: o.id,
          channel: o.channel,
          subject: o.subject,
          status: o.status,
          buyerName: o.buyer_contact_id ? buyerNamesMap[o.buyer_contact_id] ?? null : null,
          projectTitle: project?.title ?? "",
          projectId: o.project_id,
          createdAt: o.created_at,
        };
      }) ?? [];

    // Step 12: Calculate stats
    const outreachByStatus: Record<string, number> = {};
    outreachSummary.forEach((o) => {
      outreachByStatus[o.status] = (outreachByStatus[o.status] ?? 0) + 1;
    });

    const lastOutreach = outreachSummary.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];

    return {
      companyName,
      projectInvolvements,
      buyerContacts: buyerContactsSummary,
      packages: packagesSummary,
      outreach: outreachSummary,
      stats: {
        totalProjects: projectIds.length,
        totalBuyerContacts: buyerContactsSummary.length,
        totalPackages: packagesSummary.length,
        totalOutreach: outreachSummary.length,
        totalOutreachByStatus: outreachByStatus,
        lastOutreachDate: lastOutreach?.createdAt ?? null,
      },
    };
  } catch (err) {
    console.error("getCompanyCrossProjectIntel:", err);
    return null;
  }
}
