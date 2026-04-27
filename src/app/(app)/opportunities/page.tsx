import { PageHeader } from "@/components/common/page-header";
import { OpportunitiesTable } from "@/components/modules/simple-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { companies, opportunities } from "@/lib/sample-data";

export default function OpportunitiesPage() {
  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Project needs, vendor registrations, RFQs and commercial discussions linked to companies and contacts."
        actions={<Button variant="primary">Add opportunity</Button>}
      />
      <Card className="mb-4">
        <CardContent className="grid gap-3 lg:grid-cols-5">
          <Select>
            <option>All stages</option>
          </Select>
          <Select>
            <option>All owners</option>
          </Select>
          <Select>
            <option>All countries</option>
          </Select>
          <Select>
            <option>All opportunity types</option>
          </Select>
          <Button>Export CSV</Button>
        </CardContent>
      </Card>
      <OpportunitiesTable opportunities={opportunities} companies={companies} />
    </>
  );
}
