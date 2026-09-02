import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { CompanyCaseWorkspace } from "@/components/modules/company-case-workspace";
import { requireSession } from "@/lib/auth/session";
import { getCompanyById, rowToCompany } from "@/lib/data/companies";
import { getCompanyCrossProjectIntel } from "@/lib/data/company-intel";
import { getCompanyCase } from "@/lib/data/company-case";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const row = await getCompanyById(id);

  if (!row || row.organization_id !== session.organizationId) notFound();

  const company = rowToCompany(row);

  const [crossProjectIntel, companyCase] = await Promise.all([
    getCompanyCrossProjectIntel(company.name, session.organizationId, company.id),
    getCompanyCase(id, session.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title={company.name}
        description="Commercial manager report: where the work is, who buys, what Triangle can offer, and the next safe action."
      />
      <CompanyCaseWorkspace
        company={company}
        intel={crossProjectIntel}
        companyCase={companyCase}
      />
    </>
  );
}
