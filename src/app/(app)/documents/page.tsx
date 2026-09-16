import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { ComplianceOverview } from "@/components/modules/compliance-overview";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Compliance is a tab in Talent (DEV-011). This page keeps its URL for
// bookmarks and the checklist / templates sub-pages; the content is the same
// component the tab renders.
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ checklist?: string }>;
}) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Compliance"
        description="Not available — organization context required."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Documents & compliance"
        description="Private tenant documents, vendor readiness, and expiry risk backed by Supabase Storage."
        actions={
          <Link
            href="/workers?tab=compliance"
            className="text-sm font-medium text-sky-700 hover:text-sky-900"
          >
            Open in Talent →
          </Link>
        }
      />
      <ComplianceOverview
        orgId={session.organizationId}
        role={session.role}
        initialChecklistItemId={params.checklist}
      />
    </div>
  );
}
