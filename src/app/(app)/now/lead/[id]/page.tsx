import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { listReplyDrafts } from "@/lib/data/job-intake";
import { loadLeadWorkspace } from "@/lib/data/contextual-work";
import { OpportunityWorkspace, OpenOriginalLink } from "@/components/modules/opportunity-workspace";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LeadNowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const workspace = await loadLeadWorkspace(session.organizationId, id);
  if (!workspace?.lead) notFound();

  const drafts = await listReplyDrafts(id, session.organizationId);
  const lead = workspace.lead;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/decisions" className="text-xs font-medium text-slate-500 hover:text-slate-800">
          ← Today
        </Link>
        <OpenOriginalLink mailbox={lead.sourceMailbox} subject={lead.subject} />
      </div>
      <OpportunityWorkspace
        lead={lead}
        drafts={drafts}
        assignments={workspace.assignments}
      />
    </div>
  );
}
