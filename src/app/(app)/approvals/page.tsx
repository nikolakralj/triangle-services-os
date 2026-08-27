import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { getSession } from "@/lib/auth/session";
import { FindingsInbox } from "@/components/modules/findings-inbox";
import { listFindings } from "@/lib/data/findings";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// One place for management decisions. Today it holds agent findings — the
// discoveries that would become real records. Research suggestions and reply
// drafts still live on their own screens; they belong here next, so there is
// a single queue rather than one per feature.
export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Approvals"
        description="Approvals not available — organization context required."
      />
    );
  }

  const query = await searchParams;
  const status =
    query.status === "accepted" || query.status === "rejected"
      ? query.status
      : "pending";

  const findings = await listFindings(session.organizationId, { status });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Decisions only you can make. Nothing an employee discovers becomes a real record until you accept it here."
      />

      <div className="flex flex-wrap gap-1.5">
        {[
          { key: "pending", label: "Waiting for you" },
          { key: "accepted", label: "Accepted" },
          { key: "rejected", label: "Rejected" },
        ].map(({ key, label }) => (
          <Link
            key={key}
            href={key === "pending" ? "/approvals" : `/approvals?status=${key}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              status === key
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <FindingsInbox findings={findings} />

      <p className="text-xs text-slate-500">
        Research suggestions on a specific project are still reviewed on that
        project&apos;s page, and reply drafts on Job Intake. Both move here next.
      </p>
    </div>
  );
}
