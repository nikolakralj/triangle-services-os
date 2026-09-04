import { PageHeader } from "@/components/common/page-header";
import { OpportunitiesTable } from "@/components/modules/simple-table";
import { OpportunitiesActions } from "@/components/modules/opportunities-actions";
import { getSession } from "@/lib/auth/session";
import {
  listOpportunities,
  listPipelineStages,
  rowToOpportunity,
  rowToPipelineStage,
} from "@/lib/data/opportunities";
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

  const [opportunityRows, companyRows, stageRows] = await Promise.all([
    listOpportunities(session.organizationId),
    listCompanies(session.organizationId),
    listPipelineStages(session.organizationId),
  ]);

  const opportunities = opportunityRows.map(rowToOpportunity);
  const companies = companyRows.map(rowToCompany);
  const stages = stageRows.map(rowToPipelineStage);

  // Resolve owner names
  const enrichedOpportunities = await enrichOpportunitiesWithOwnerNames(opportunities);

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Project needs, vendor registrations, RFQs and commercial discussions linked to companies and contacts."
        actions={
          <OpportunitiesActions
            companies={companies}
            stages={stages}
            opportunities={enrichedOpportunities}
          />
        }
      />
      {/* Four <Select> filters used to sit here, each with a single hardcoded
          option and no handler. The pipeline board carries the working filters;
          decoration that cannot filter is worse than no filter at all. */}
      <OpportunitiesTable opportunities={enrichedOpportunities} companies={companies} />
    </>
  );
}
