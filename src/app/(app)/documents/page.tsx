import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { DocumentsTable } from "@/components/modules/simple-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { documents } from "@/lib/sample-data";

const folders = [
  "Company documents",
  "Compliance / Safety",
  "Worker documents",
  "Sales documents",
  "Project documents",
  "Templates",
  "Financial / Legal",
];

export default function DocumentsPage() {
  return (
    <>
      <PageHeader
        title="Documents"
        description="Private document center backed by Supabase Storage private buckets and signed URLs."
        actions={<Button variant="primary">Upload document</Button>}
      />
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {folders.map((folder) => (
          <Link key={folder} href={folder === "Templates" ? "/documents/templates" : "/documents/checklist"} className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 shadow-sm hover:border-sky-300 hover:text-sky-700">
            {folder}
          </Link>
        ))}
      </div>
      <Card className="mb-4">
        <CardContent className="grid gap-3 lg:grid-cols-5">
          <Select><option>All categories</option></Select>
          <Select><option>All sensitivities</option></Select>
          <Select><option>All linked records</option></Select>
          <Select><option>Review status</option></Select>
          <Button>Search documents</Button>
        </CardContent>
      </Card>
      <DocumentsTable documents={documents} />
    </>
  );
}
