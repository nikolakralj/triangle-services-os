import { PageHeader } from "@/components/common/page-header";
import { TasksTable } from "@/components/modules/simple-table";
import { TasksFilterForm } from "@/components/modules/tasks-filter";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import {
  searchAndFilterTasks,
  rowToTask,
} from "@/lib/data/tasks";
import { listWorkers, rowToWorker } from "@/lib/data/workers";
import { enrichTasksWithOwnerNames } from "@/lib/data/utils";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Tasks"
        description="Tasks not available - organization context required"
      />
    );
  }

  const params = await searchParams;
  const search = params.search ? String(params.search) : "";
  const status = params.status ? String(params.status) : "";
  const assignedToId = params.assignedToId ? String(params.assignedToId) : "";
  const priority = params.priority ? String(params.priority) : "";

  const [taskRows, workerRows] = await Promise.all([
    searchAndFilterTasks(session.organizationId, {
      search: search || undefined,
      status: status || undefined,
      assignedToId: assignedToId || undefined,
      priority: priority || undefined,
    }),
    listWorkers(session.organizationId),
  ]);

  const tasks = taskRows.map(rowToTask);
  const enrichedTasks = await enrichTasksWithOwnerNames(tasks);
  const workers = workerRows.map(rowToWorker);

  return (
    <>
      <PageHeader
        title="Tasks"
        description={`${enrichedTasks.length} task${enrichedTasks.length !== 1 ? "s" : ""} - follow-ups, reminders and ownership tracking.`}
        actions={<Button variant="primary">Create task</Button>}
      />
      <TasksFilterForm
        workers={workers}
        initialSearch={search}
        initialStatus={status}
        initialAssignedToId={assignedToId}
        initialPriority={priority}
      />
      <TasksTable tasks={enrichedTasks} />
    </>
  );
}
