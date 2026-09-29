import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { CompanyCaseWorkspace } from "@/components/modules/company-case-workspace";
import { requireSession } from "@/lib/auth/session";
import { getCompanyById, rowToCompany } from "@/lib/data/companies";
import { getCompanyCrossProjectIntel } from "@/lib/data/company-intel";
import { getCompanyCase } from "@/lib/data/company-case";
import { AskPageContext } from "@/components/missions/ask-context";
import { ReportedWork } from "@/components/modules/reported-work";
import { listReportsForCompany } from "@/lib/data/employee-reports";

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

  const [crossProjectIntel, companyCase, reports] = await Promise.all([
    getCompanyCrossProjectIntel(company.name, session.organizationId, company.id),
    getCompanyCase(id, session.organizationId),
    listReportsForCompany(session.organizationId, company.id, company.name),
  ]);

  return (
    <>
      {/* Ask on this page binds work to the company; the report lands on its case. */}
      <AskPageContext kind="record" type="company" id={company.id} label={company.name} />
      <PageHeader
        title={company.name}
        description="Commercial manager report: where the work is, who buys, what Triangle can offer, and the next safe action."
      />
      <CompanyCaseWorkspace
        company={company}
        intel={crossProjectIntel}
        companyCase={companyCase}
      />
      {reports.length > 0 && (
        <div className="mt-4">
          <ReportedWork reports={reports} />
        </div>
      )}
    </>
  );
}
