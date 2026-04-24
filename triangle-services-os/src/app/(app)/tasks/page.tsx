import { PageHeader } from "@/components/common/page-header";
import { TasksTable } from "@/components/modules/simple-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { tasks } from "@/lib/sample-data";

export default function TasksPage() {
  return (
    <>
      <PageHeader
        title="Tasks"
        description="Follow-ups, reminders and ownership. Every open opportunity should have a next step and date."
        actions={<Button variant="primary">Create task</Button>}
      />
      <Card className="mb-4">
        <CardContent className="grid gap-3 lg:grid-cols-6">
          <Select><option>My tasks</option><option>All tasks</option><option>Overdue</option><option>Due today</option><option>Due this week</option><option>Completed</option></Select>
          <Select><option>All owners</option></Select>
          <Select><option>All priorities</option></Select>
          <Select><option>All related entities</option></Select>
          <Button>Mark selected done</Button>
          <Button>Export CSV</Button>
        </CardContent>
      </Card>
      <TasksTable tasks={tasks} />
    </>
  );
}
