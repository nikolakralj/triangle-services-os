import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { CompanyDetail } from "@/components/modules/detail-sections";
import { requireSession } from "@/lib/auth/session";
import { getCompanyById, rowToCompany } from "@/lib/data/companies";

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

  return (
    <>
      <PageHeader
        title={company.name}
        description="Company record with contacts, opportunities, tasks, documents, activity and AI actions."
      />
      <CompanyDetail
        company={company}
        contacts={[]}
        opportunities={[]}
        tasks={[]}
        documents={[]}
        activities={[]}
      />
    </>
  );
}
