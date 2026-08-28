import { PageHeader } from "@/components/common/page-header";
import { ImportsWorkspace } from "@/components/modules/imports-workspace";
import { WorkerImport } from "@/components/modules/worker-import";

export default function ImportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Imports"
        description="Bring your roster and your lead lists in from a spreadsheet."
      />
      <WorkerImport />
      <ImportsWorkspace />
    </div>
  );
}
