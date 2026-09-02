import { PageHeader } from "@/components/common/page-header";
import { DecisionInboxWorkspace } from "@/components/modules/decision-inbox-workspace";
import { getSession } from "@/lib/auth/session";
import { listDecisionInbox } from "@/lib/data/decision-inbox";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Decision Inbox"
        description="Decision inbox not available — organization context required."
      />
    );
  }

  const snapshot = await listDecisionInbox(session.organizationId);

  return (
    <>
      <PageHeader
        title="Decision Inbox"
        description="Only consequential decisions and exceptions. The AI workforce keeps safe internal work moving without using the CEO as a transport layer."
      />
      <DecisionInboxWorkspace snapshot={snapshot} />
    </>
  );
}
