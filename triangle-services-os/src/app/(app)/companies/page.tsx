import { PageHeader } from "@/components/common/page-header";
import { CompaniesWorkspace } from "@/components/modules/companies-workspace";
import { companies } from "@/lib/sample-data";

export default function CompaniesPage() {
  return (
    <>
      <PageHeader
        title="Companies"
        description="Master 300-company lead database with filtering, CSV import/export, ownership and AI scoring."
      />
      <CompaniesWorkspace initialCompanies={companies} />
    </>
  );
}
