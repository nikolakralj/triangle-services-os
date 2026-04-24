import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { CompanyDetail } from "@/components/modules/detail-sections";
import { activities, companies, contacts, documents, opportunities, tasks } from "@/lib/sample-data";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = companies.find((item) => item.id === id);
  if (!company) notFound();

  return (
    <>
      <PageHeader title={company.name} description="Company record with contacts, opportunities, tasks, documents, activity and AI actions." />
      <CompanyDetail
        company={company}
        contacts={contacts.filter((item) => item.companyId === company.id)}
        opportunities={opportunities.filter((item) => item.companyId === company.id)}
        tasks={tasks.filter((item) => item.relatedEntityId === company.id)}
        documents={documents.filter((item) => !item.linkedEntityId || item.linkedEntityId === company.id)}
        activities={activities.filter((item) => item.companyId === company.id || !item.companyId)}
      />
    </>
  );
}
