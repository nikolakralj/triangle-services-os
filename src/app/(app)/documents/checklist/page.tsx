import { PageHeader } from "@/components/common/page-header";
import { DocumentChecklistTable } from "@/components/modules/document-checklist-table";
import { Card, CardHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { listDocumentChecklist } from "@/lib/data/documents";

export default async function DocumentChecklistPage() {
  const session = await getSession();
  const checklist = session?.organizationId
    ? await listDocumentChecklist(session.organizationId)
    : [];
  const canManage = session?.role === "admin" || session?.role === "partner";

  return (
    <>
      <PageHeader
        title="Vendor document checklist"
        description="Shows whether your organization has prepared the important company and vendor documents buyers may request."
      />
      <Card>
        <CardHeader
          title="Checklist items"
          description="Upload evidence, link it to the checklist, and record human approval."
        />
        <DocumentChecklistTable initialItems={checklist} canManage={canManage} />
      </Card>
    </>
  );
}
