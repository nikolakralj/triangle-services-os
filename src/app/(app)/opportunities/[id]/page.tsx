import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { OpportunityDetail } from "@/components/modules/detail-sections";
import {
  getOpportunityById,
  rowToOpportunity,
} from "@/lib/data/opportunities";
import { getCompanyById, rowToCompany } from "@/lib/data/companies";
import { getContactById, rowToContact } from "@/lib/data/contacts";
import {
  getActivitiesByOpportunity,
  rowToActivity,
} from "@/lib/data/activities";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch opportunity first
  const opportunityRow = await getOpportunityById(id);
  if (!opportunityRow) notFound();

  const opportunity = rowToOpportunity(opportunityRow);

  // Fetch related data in parallel
  const [companyRow, contactRow, activityRows] = await Promise.all([
    opportunity.companyId ? getCompanyById(opportunity.companyId) : Promise.resolve(null),
    opportunity.primaryContactId ? getContactById(opportunity.primaryContactId) : Promise.resolve(null),
    getActivitiesByOpportunity(id),
  ]);

  const company = companyRow ? rowToCompany(companyRow) : undefined;
  const contact = contactRow ? rowToContact(contactRow) : undefined;
  const activities = activityRows.map(rowToActivity);

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
        activities={activities}
      />
    </>
  );
}
