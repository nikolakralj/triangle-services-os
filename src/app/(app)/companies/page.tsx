import { PageHeader } from "@/components/common/page-header";
import { CompaniesWorkspace } from "@/components/modules/companies-workspace";
import { requireSession, capabilities } from "@/lib/auth/session";
import { listCompanies } from "@/lib/data/companies";
import type { Company } from "@/lib/types";

function rowToCompany(r: Awaited<ReturnType<typeof listCompanies>>[number]): Company {
  return {
    id: r.id,
    name: r.name,
    legalName: r.legal_name ?? undefined,
    companyType: r.company_type ?? "other",
    status: (r.company_status as Company["status"]) ?? "research",
    country: r.country ?? "",
    region: r.region ?? undefined,
    city: r.city ?? "",
    website: r.website ?? "",
    websiteDomain: r.website_domain ?? "",
    linkedinUrl: r.linkedin_url ?? undefined,
    sourceUrl: r.source_url ?? undefined,
    sectors: r.sectors ?? [],
    targetCountries: r.target_countries ?? [],
    priority: (r.priority as Company["priority"]) ?? "medium",
    leadScore: r.lead_score ?? 0,
    leadScoreReason: r.lead_score_reason ?? "",
    description: r.description ?? "",
    painPoints: r.pain_points ?? undefined,
    notes: r.notes ?? undefined,
    researchStatus: (r.research_status as Company["researchStatus"]) ?? "not_reviewed",
    doNotContact: r.do_not_contact ?? false,
    lastContactAt: r.last_contact_at ?? undefined,
    nextActionAt: r.next_action_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export default async function CompaniesPage() {
  const session = await requireSession();
  const rows = await listCompanies(session.organizationId);
  const companies = rows.map(rowToCompany);
  const caps = capabilities(session.role);

  return (
    <>
      <PageHeader
        title="Companies"
        description={`${rows.length} companies in your database — filter, search, score, and convert to opportunities.`}
      />
      <CompaniesWorkspace
        initialCompanies={companies}
        canWrite={caps.canWrite}
        canDelete={caps.canDelete}
      />
    </>
  );
}
