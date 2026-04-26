import { PageHeader } from "@/components/common/page-header";
import { PipelineBoard } from "@/components/modules/pipeline-board";
import { companies, opportunities, pipelineStages } from "@/lib/sample-data";

export default function PipelinePage() {
  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Kanban board for sales stages. Drag cards between stages; the API route is ready to persist stage changes when Supabase is configured."
      />
      <PipelineBoard initialOpportunities={opportunities} stages={pipelineStages} companies={companies} />
    </>
  );
}
