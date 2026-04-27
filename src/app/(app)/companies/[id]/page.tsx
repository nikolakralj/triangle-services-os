import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { CompanyDetail } from "@/components/modules/detail-sections";
import { requireSession } from "@/lib/auth/session";
import { getCompanyById, rowToCompany } from "@/lib/data/companies";
import {
  getContactsByCompany,
  rowToContact,
} from "@/lib/data/contacts";
import {
  getOpportunitiesByCompany,
  rowToOpportunity,
} from "@/lib/data/opportunities";
import { getTasksByEntity, rowToTask } from "@/lib/data/tasks";
import {
  getActivitiesByCompany,
  rowToActivity,
} from "@/lib/data/activities";
import {
  enrichContactsWithOwnerNames,
  enrichOpportunitiesWithOwnerNames,
  enrichTasksWithOwnerNames,
  enrichActivitiesWithCreatorNames,
} from "@/lib/data/utils";

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

  // Fetch related data in parallel
  const [contactRows, opportunityRows, taskRows, activityRows] = await Promise.all([
    getContactsByCompany(id),
    getOpportunitiesByCompany(id),
    getTasksByEntity("company", id),
    getActivitiesByCompany(id),
  ]);

  const contacts = contactRows.map(rowToContact);
  const opportunities = opportunityRows.map(rowToOpportunity);
  const tasks = taskRows.map(rowToTask);
  const activities = activityRows.map(rowToActivity);

  // Resolve owner/assignee names
  const enrichedContacts = await enrichContactsWithOwnerNames(contacts);
  const enrichedOpportunities = await enrichOpportunitiesWithOwnerNames(opportunities);
  const enrichedTasks = await enrichTasksWithOwnerNames(tasks);
  const enrichedActivities = await enrichActivitiesWithCreatorNames(activities);

  return (
    <>
      <PageHeader
        title={company.name}
        description="Company record with contacts, opportunities, tasks, documents, activity and AI actions."
      />
      <CompanyDetail
        company={company}
        contacts={enrichedContacts}
        opportunities={enrichedOpportunities}
        tasks={enrichedTasks}
        documents={[]}
        activities={enrichedActivities}
      />
    </>
  );
}
