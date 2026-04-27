import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { WorkerDetail } from "@/components/modules/detail-sections";
import { workers } from "@/lib/sample-data";

export default async function WorkerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const worker = workers.find((item) => item.id === id);
  if (!worker) notFound();

  return (
    <>
      <PageHeader
        title={worker.fullName}
        description="Basic worker profile for availability, capability and document tracking."
      />
      <WorkerDetail worker={worker} />
    </>
  );
}
