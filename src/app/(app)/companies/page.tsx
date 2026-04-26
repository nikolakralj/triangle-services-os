import { PageHeader } from "@/components/common/page-header";
import { CompaniesWorkspace } from "@/components/modules/companies-workspace";
import { requireSession, capabilities } from "@/lib/auth/session";
import { listCompanies, rowToCompany } from "@/lib/data/companies";

export default async function CompaniesPage() {
  const session = await requireSession();
  const rows = await listCompanies(session.organizationId);
  const companies = rows.map(rowToCompany);
  const caps = capabilities(session.role);

  return (
    <>
      <PageHeader
        title="Companies"
        description={`${rows.length} companies in your database - filter, search, score, and convert to opportunities.`}
      />
      <CompaniesWorkspace
        initialCompanies={companies}
        canWrite={caps.canWrite}
        canDelete={caps.canDelete}
      />
    </>
  );
}
