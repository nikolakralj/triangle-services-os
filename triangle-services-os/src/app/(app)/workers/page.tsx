import { PageHeader } from "@/components/common/page-header";
import { WorkersTable } from "@/components/modules/simple-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { workers } from "@/lib/sample-data";

export default function WorkersPage() {
  return (
    <>
      <PageHeader
        title="Workers"
        description="Basic worker/freelancer database. This is not HR/payroll; it is availability and capability tracking for delivery planning."
        actions={<Button variant="primary">Add worker</Button>}
      />
      <Card className="mb-4">
        <CardContent className="grid gap-3 lg:grid-cols-5">
          <Select><option>All roles</option></Select>
          <Select><option>All availability</option></Select>
          <Select><option>All countries</option></Select>
          <Select><option>All skills</option></Select>
          <Button>Export CSV</Button>
        </CardContent>
      </Card>
      <WorkersTable workers={workers} />
    </>
  );
}
