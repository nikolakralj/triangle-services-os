import { PageHeader } from "@/components/common/page-header";
import { getSession } from "@/lib/auth/session";
import { AgentConsole } from "@/components/modules/agent-console";
import { listAgents, listAgentTasks, listAgentRuns } from "@/lib/data/agents";

export const dynamic = "force-dynamic";

// The control room for the external workforce. Triangle stays the single
// source of truth; agents (Grok bots today, anything tomorrow) read their
// instructions here and leave their results here — so nobody has to open
// the bot platform's own app for day-to-day steering.
export default async function AgentsPage() {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Agents"
        description="Agents not available — organization context required."
      />
    );
  }

  const [agents, tasks, runs] = await Promise.all([
    listAgents(session.organizationId),
    listAgentTasks(session.organizationId),
    listAgentRuns(session.organizationId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description="Your external workforce. Queue instructions here — each agent picks them up on its next run and reports back. Nothing here sends email or changes records without the usual approvals."
      />
      <AgentConsole agents={agents} tasks={tasks} runs={runs} />
    </div>
  );
}
