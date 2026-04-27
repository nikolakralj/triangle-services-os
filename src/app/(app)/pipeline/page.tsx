import { PageHeader } from "@/components/common/page-header";
import { PipelineBoard } from "@/components/modules/pipeline-board";
import { getSession } from "@/lib/auth/session";
import {
  listOpportunities,
  listPipelineStages,
  rowToPipelineStage,
  rowToOpportunity,
} from "@/lib/data/opportunities";
import { listCompanies, rowToCompany } from "@/lib/data/companies";

export default async function PipelinePage() {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Pipeline"
        description="Pipeline not available - organization context required"
      />
    );
  }

  const [opportunityRows, stageRows, companyRows] = await Promise.all([
    listOpportunities(session.organizationId),
    listPipelineStages(session.organizationId),
    listCompanies(session.organizationId),
  ]);

  // Convert database rows to UI types
  const opportunities = opportunityRows.map(rowToOpportunity);
  const stages = stageRows.map(rowToPipelineStage);
  const companies = companyRows.map(rowToCompany);

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Kanban board for sales stages. Drag cards between stages to move opportunities through your sales pipeline."
      />
      <PipelineBoard
        initialOpportunities={opportunities}
        stages={stages}
        companies={companies}
      />
    </>
  );
}
