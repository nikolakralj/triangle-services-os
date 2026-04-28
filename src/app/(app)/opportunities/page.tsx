import { PageHeader } from "@/components/common/page-header";
import { OpportunitiesTable } from "@/components/modules/simple-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { getSession } from "@/lib/auth/session";
import { listOpportunities, rowToOpportunity } from "@/lib/data/opportunities";
import { listCompanies, rowToCompany } from "@/lib/data/companies";
import { enrichOpportunitiesWithOwnerNames } from "@/lib/data/utils";

export default async function OpportunitiesPage() {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Opportunities"
        description="Opportunities not available - organization context required"
      />
    );
  }

  const [opportunityRows, companyRows] = await Promise.all([
    listOpportunities(session.organizationId),
    listCompanies(session.organizationId),
  ]);

  const opportunities = opportunityRows.map(rowToOpportunity);
  const companies = companyRows.map(rowToCompany);

  // Resolve owner names
  const enrichedOpportunities = await enrichOpportunitiesWithOwnerNames(opportunities);

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Project needs, vendor registrations, RFQs and commercial discussions linked to companies and contacts."
        actions={<Button variant="primary">Add opportunity</Button>}
      />
      <Card className="mb-4">
        <CardContent className="grid gap-3 lg:grid-cols-5">
          <Select>
            <option>All stages</option>
          </Select>
          <Select>
            <option>All owners</option>
          </Select>
          <Select>
            <option>All countries</option>
          </Select>
          <Select>
            <option>All opportunity types</option>
          </Select>
          <Button>Export CSV</Button>
        </CardContent>
      </Card>
      <OpportunitiesTable opportunities={enrichedOpportunities} companies={companies} />
    </>
  );
}
