import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { ContactDetail } from "@/components/modules/detail-sections";
import { activities, companies, contacts } from "@/lib/sample-data";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = contacts.find((item) => item.id === id);
  if (!contact) notFound();
  const company = companies.find((item) => item.id === contact.companyId);

  return (
    <>
      <PageHeader
        title={contact.fullName}
        description="Contact record with GDPR/source information, timeline and outreach draft actions."
      />
      <ContactDetail
        contact={contact}
        company={company}
        activities={activities.filter((item) => item.contactId === contact.id)}
      />
    </>
  );
}
