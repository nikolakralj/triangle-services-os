import { PageHeader } from "@/components/common/page-header";
import { NextMoveBanner } from "@/components/modules/next-move-banner";
import { getNextMove } from "@/lib/data/next-move";
import { DecisionInboxWorkspace } from "@/components/modules/decision-inbox-workspace";
import { PlaysPanel } from "@/components/modules/plays-panel";
import { getSession } from "@/lib/auth/session";
import { listDecisionInbox } from "@/lib/data/decision-inbox";
import { listPlays } from "@/lib/data/plays";
import { AskAnEmployee } from "@/components/modules/ask-an-employee";
import { listWorkforce, listAssignments } from "@/lib/data/workforce";
import { loadAgentFaces } from "@/lib/data/agent-identity";

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

  const [snapshot, plays, nextMove, employees, assignments, faces] = await Promise.all([
    listDecisionInbox(session.organizationId),
    listPlays(session.organizationId),
    getNextMove(session.organizationId),
    listWorkforce(session.organizationId),
    listAssignments(session.organizationId),
    loadAgentFaces(session.organizationId),
  ]);

  // The three most recent answers, on the page where the question was asked.
  // They were on Workforce, below the org chart and the job list.
  const recent = assignments
    .filter((a) => a.status === "completed" && a.resultSummary)
    .slice(0, 3)
    .map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      resultSummary: a.resultSummary,
      authorName: faces.byId.get(a.agentInstanceId)?.name ?? "An employee",
      authorEmoji: faces.byId.get(a.agentInstanceId)?.emoji ?? "🤖",
      at: a.completedAt ?? a.createdAt,
    }));

  return (
    <>
      <PageHeader
        title="Decision Inbox"
        description="Only consequential decisions and exceptions. The AI workforce keeps safe internal work moving without using the CEO as a transport layer."
      />
      {/* Above the queue on purpose. Everything below is a decision about
          something that already happened; this is a decision about what to do
          next, which is the more valuable of the two and had nowhere to live. */}
      <NextMoveBanner move={nextMove} />
      <AskAnEmployee
        employees={employees
          .filter((e) => e.status === "active")
          // Whoever this runtime can actually set to work goes first. The list
          // was in hire order, so the box defaulted to Bob — a courier who
          // moves mail and cannot research anything, which is a wrong answer
          // offered before the question is even typed.
          .sort((a, b) => {
            const rank = (r: string) => (r === "project_researcher" ? 0 : r === "hr" ? 1 : 2);
            return rank(a.roleKey) - rank(b.roleKey);
          })
          .map((e) => ({
            id: e.id,
            name: e.displayName,
            emoji: e.emoji,
            roleTitle: e.description,
          }))}
        recent={recent}
      />
      <PlaysPanel plays={plays} />
      <DecisionInboxWorkspace snapshot={snapshot} />
    </>
  );
}
