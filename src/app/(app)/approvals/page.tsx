import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { getSession } from "@/lib/auth/session";
import { ApprovalsQueue } from "@/components/modules/approvals-queue";
import { listApprovals, type ApprovalStatus } from "@/lib/data/approvals";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// One place for management decisions — every proposal from every employee,
// whichever table it happens to live in. Before this page merged them,
// research suggestions were only visible inside the project they belonged to,
// which meant you had to already know where to look to find work waiting on you.
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
  const status: ApprovalStatus =
    query.status === "accepted" || query.status === "rejected"
      ? query.status
      : "pending";

  const items = await listApprovals(session.organizationId, { status });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Decisions only a human can make. Nothing an employee finds becomes a real record until you accept it here."
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
            {key === "pending" && items.length > 0 && status === "pending"
              ? ` · ${items.length}`
              : ""}
          </Link>
        ))}
      </div>

      <ApprovalsQueue items={items} readOnly={status !== "pending"} />
    </div>
  );
}
