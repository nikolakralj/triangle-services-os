import { PageHeader } from "@/components/common/page-header";
import { ImportsWorkspace } from "@/components/modules/imports-workspace";
import { WorkerImport } from "@/components/modules/worker-import";
import { CvUpload } from "@/components/modules/cv-upload";

export default function ImportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Imports"
        description="Bring people in — one CV at a time, or the whole roster from a spreadsheet."
      />
      <CvUpload />
      <WorkerImport />
      <ImportsWorkspace />
    </div>
  );
}
