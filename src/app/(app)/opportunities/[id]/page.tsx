import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { OpportunityDetail } from "@/components/modules/detail-sections";
import {
  activities,
  companies,
  contacts,
  opportunities,
} from "@/lib/sample-data";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const opportunity = opportunities.find((item) => item.id === id);
  if (!opportunity) notFound();
  const company = companies.find((item) => item.id === opportunity.companyId);
  const contact = contacts.find(
    (item) => item.id === opportunity.primaryContactId,
  );

  return (
    <>
      <PageHeader
        title={opportunity.title}
        description="Opportunity record for scope, client need, documents, tasks, activity and AI actions."
      />
      <OpportunityDetail
        opportunity={opportunity}
        company={company}
        contact={contact}
        activities={activities.filter(
          (item) => item.opportunityId === opportunity.id,
        )}
      />
    </>
  );
}
