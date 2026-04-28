import { PageHeader } from "@/components/common/page-header";
import { ContactsTable } from "@/components/modules/simple-table";
import { ContactsFilterForm } from "@/components/modules/contacts-filter";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import {
  searchAndFilterContacts,
  rowToContact,
  getContactRoleCategories,
  getContactCountries,
} from "@/lib/data/contacts";
import { listCompanies, rowToCompany } from "@/lib/data/companies";
import { listWorkers, rowToWorker } from "@/lib/data/workers";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Contacts"
        description="Contacts not available - organization context required"
      />
    );
  }

  const params = await searchParams;
  const search = params.search ? String(params.search) : "";
  const roleCategory = params.roleCategory ? String(params.roleCategory) : "";
  const country = params.country ? String(params.country) : "";
  const ownerId = params.ownerId ? String(params.ownerId) : "";

  // Fetch filtered contacts and metadata in parallel
  const [contactRows, companyRows, workerRows, roleCategories, countries] =
    await Promise.all([
      searchAndFilterContacts(session.organizationId, {
        search: search || undefined,
        roleCategory: roleCategory || undefined,
        country: country || undefined,
        ownerId: ownerId || undefined,
      }),
      listCompanies(session.organizationId),
      listWorkers(session.organizationId),
      getContactRoleCategories(session.organizationId),
      getContactCountries(session.organizationId),
    ]);

  const contacts = contactRows.map(rowToContact);
  const companies = companyRows.map(rowToCompany);
  const workers = workerRows.map(rowToWorker);

  return (
    <>
      <PageHeader
        title="Contacts"
        description={`${contacts.length} contact${contacts.length !== 1 ? "s" : ""} - filter, search, and manage your contacts.`}
        actions={<Button variant="primary">Add contact</Button>}
      />
      <ContactsFilterForm
        roleCategories={roleCategories}
        countries={countries}
        workers={workers}
        initialSearch={search}
        initialRoleCategory={roleCategory}
        initialCountry={country}
        initialOwnerId={ownerId}
      />
      <ContactsTable contacts={contacts} companies={companies} />
    </>
  );
}
