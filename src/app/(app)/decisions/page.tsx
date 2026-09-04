import { PageHeader } from "@/components/common/page-header";
import { DecisionInboxWorkspace } from "@/components/modules/decision-inbox-workspace";
import { PlaysPanel } from "@/components/modules/plays-panel";
import { getSession } from "@/lib/auth/session";
import { listDecisionInbox } from "@/lib/data/decision-inbox";
import { listPlays } from "@/lib/data/plays";

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

  const [snapshot, plays] = await Promise.all([
    listDecisionInbox(session.organizationId),
    listPlays(session.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Decision Inbox"
        description="Only consequential decisions and exceptions. The AI workforce keeps safe internal work moving without using the CEO as a transport layer."
      />
      {/* Above the queue on purpose. Everything below is a decision about
          something that already happened; this is a decision about what to do
          next, which is the more valuable of the two and had nowhere to live. */}
      <PlaysPanel plays={plays} />
      <DecisionInboxWorkspace snapshot={snapshot} />
    </>
  );
}
