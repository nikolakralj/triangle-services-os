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
        title="Your team"
        description="The people who work for you — they just happen to be software. Hand over tasks, see what they did, and nothing goes out to a client without your sign-off."
      />
      <AgentConsole agents={agents} tasks={tasks} runs={runs} />
    </div>
  );
}
