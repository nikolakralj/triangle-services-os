import { PageHeader } from "@/components/common/page-header";
import { ContactsTable } from "@/components/modules/simple-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { getSession } from "@/lib/auth/session";
import { listContacts, rowToContact } from "@/lib/data/contacts";
import { listCompanies, rowToCompany } from "@/lib/data/companies";

export default async function ContactsPage() {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Contacts"
        description="Contacts not available - organization context required"
      />
    );
  }

  const [contactRows, companyRows] = await Promise.all([
    listContacts(session.organizationId),
    listCompanies(session.organizationId),
  ]);

  // Convert database rows to UI types
  const contacts = contactRows.map(rowToContact);
  const companies = companyRows.map(rowToCompany);

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Business contacts linked to target companies. Draft emails only; no automated mass outreach."
        actions={<Button variant="primary">Add contact</Button>}
      />
      <Card className="mb-4">
        <CardContent className="grid gap-3 lg:grid-cols-5">
          <Input placeholder="Search contact, email, company..." />
          <Select>
            <option>All role categories</option>
          </Select>
          <Select>
            <option>All countries</option>
          </Select>
          <Select>
            <option>All owners</option>
          </Select>
          <Button>Export CSV</Button>
        </CardContent>
      </Card>
      <ContactsTable contacts={contacts} companies={companies} />
    </>
  );
}
