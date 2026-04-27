import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { checklist } from "@/lib/sample-data";

export default function DocumentChecklistPage() {
  return (
    <>
      <PageHeader
        title="Vendor document checklist"
        description="Shows whether Triangle Services has prepared the important company/vendor documents clients may request."
      />
      <Card>
        <CardHeader
          title="Checklist items"
          description="Upload documents, generate AI drafts, mark approved and set review dates."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {[
                  "Item",
                  "Folder",
                  "Status",
                  "Owner",
                  "Review date",
                  "Notes",
                  "Actions",
                ].map((header) => (
                  <th
                    key={header}
                    className="border-b border-slate-200 px-4 py-3"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {checklist.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium">{item.title}</td>
                  <td className="px-4 py-3">{item.category}</td>
                  <td className="px-4 py-3">
                    <Badge
                      intent={
                        item.status === "missing"
                          ? "danger"
                          : item.status === "draft"
                            ? "warning"
                            : "success"
                      }
                    >
                      {item.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{item.ownerName ?? "—"}</td>
                  <td className="px-4 py-3">{item.reviewDate ?? "n/a"}</td>
                  <td className="px-4 py-3">{item.notes ?? "n/a"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button>Upload</Button>
                      <Button>Generate draft</Button>
                      <Button>Approve</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
