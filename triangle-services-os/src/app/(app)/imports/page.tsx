import { PageHeader } from "@/components/common/page-header";
import { ImportsWorkspace } from "@/components/modules/imports-workspace";

export default function ImportsPage() {
  return (
    <>
      <PageHeader
        title="Imports"
        description="CSV imports now, protected external import endpoint later. No scraping implementation in the MVP."
      />
      <ImportsWorkspace />
    </>
  );
}
