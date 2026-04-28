import { PageHeader } from "@/components/common/page-header";
import { AIAssistant } from "@/components/modules/ai-assistant";
import { getSession } from "@/lib/auth/session";
import { listCompanies, rowToCompany } from "@/lib/data/companies";
import { listContacts, rowToContact } from "@/lib/data/contacts";
import { listOpportunities, rowToOpportunity } from "@/lib/data/opportunities";
import { enrichContactsWithOwnerNames, enrichOpportunitiesWithOwnerNames } from "@/lib/data/utils";

export default async function AIPage() {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="AI Assistant"
        description="AI Assistant not available - organization context required"
      />
    );
  }

  const [companyRows, contactRows, opportunityRows] = await Promise.all([
    listCompanies(session.organizationId),
    listContacts(session.organizationId),
    listOpportunities(session.organizationId),
  ]);

  const companies = companyRows.map(rowToCompany);
  const contacts = contactRows.map(rowToContact);
  const opportunities = opportunityRows.map(rowToOpportunity);

  // Resolve owner names
  const enrichedContacts = await enrichContactsWithOwnerNames(contacts);
  const enrichedOpportunities = await enrichOpportunitiesWithOwnerNames(opportunities);

  return (
    <>
      <PageHeader
        title="AI Assistant"
        description="Internal business-development assistant for lead scoring, summaries, outreach drafts, call scripts, proposal outlines and document drafts."
      />
      <AIAssistant
        companies={companies}
        contacts={enrichedContacts}
        opportunities={enrichedOpportunities}
      />
    </>
  );
}
