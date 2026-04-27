import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { ContactDetail } from "@/components/modules/detail-sections";
import { getContactById, rowToContact } from "@/lib/data/contacts";
import { getCompanyById, rowToCompany } from "@/lib/data/companies";
import {
  getActivitiesByContact,
  rowToActivity,
} from "@/lib/data/activities";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch contact first
  const contactRow = await getContactById(id);
  if (!contactRow) notFound();

  const contact = rowToContact(contactRow);

  // Fetch related data in parallel
  const [companyRow, activityRows] = await Promise.all([
    contact.companyId ? getCompanyById(contact.companyId) : Promise.resolve(null),
    getActivitiesByContact(id),
  ]);

  const company = companyRow ? rowToCompany(companyRow) : undefined;
  const activities = activityRows.map(rowToActivity);

  return (
    <>
      <PageHeader
        title={contact.fullName}
        description="Contact record with GDPR/source information, timeline and outreach draft actions."
      />
      <ContactDetail
        contact={contact}
        company={company}
        activities={activities}
      />
    </>
  );
}
