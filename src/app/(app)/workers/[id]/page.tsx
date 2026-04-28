import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { WorkerDetail } from "@/components/modules/detail-sections";
import { requireSession } from "@/lib/auth/session";
import { getWorkerById, rowToWorker } from "@/lib/data/workers";
import { getTasksByEntity, rowToTask } from "@/lib/data/tasks";
import { getActivitiesByWorker, rowToActivity } from "@/lib/data/activities";
import {
  enrichTasksWithOwnerNames,
  enrichActivitiesWithCreatorNames,
} from "@/lib/data/utils";

export default async function WorkerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const row = await getWorkerById(id);

  if (!row || row.organization_id !== session.organizationId) notFound();

  const worker = rowToWorker(row);

  // Fetch related data in parallel
  const [taskRows, activityRows] = await Promise.all([
    getTasksByEntity("worker", id),
    getActivitiesByWorker(id),
  ]);

  const tasks = taskRows.map(rowToTask);
  const activities = activityRows.map(rowToActivity);

  // Resolve assignee and creator names
  const enrichedTasks = await enrichTasksWithOwnerNames(tasks);
  const enrichedActivities = await enrichActivitiesWithCreatorNames(activities);

  return (
    <>
      <PageHeader
        title={worker.fullName}
        description="Basic worker profile for availability, capability and document tracking."
      />
      <WorkerDetail
        worker={worker}
        tasks={enrichedTasks}
        activities={enrichedActivities}
      />
    </>
  );
}
