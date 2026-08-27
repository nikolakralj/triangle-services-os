import { PageHeader } from "@/components/common/page-header";
import { getSession } from "@/lib/auth/session";
import { AgentConsole } from "@/components/modules/agent-console";
import { listAgentTasks, listAgentRuns } from "@/lib/data/agents";
import {
  listWorkforce,
  listHumans,
  listAssignments,
  listWorkersLite,
} from "@/lib/data/workforce";

export const dynamic = "force-dynamic";

// The Workforce page. Humans on the board, AI employees underneath, durable
// assignments as the unit of work. Employees are agent_instances — provider-
// independent identities — never raw credentials.
export default async function WorkforcePage() {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Workforce"
        description="Workforce not available — organization context required."
      />
    );
  }

  const [humans, employees, assignments, workers, tasks, runs] = await Promise.all([
    listHumans(session.organizationId),
    listWorkforce(session.organizationId),
    listAssignments(session.organizationId),
    listWorkersLite(session.organizationId),
    listAgentTasks(session.organizationId, { limit: 12 }),
    listAgentRuns(session.organizationId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workforce"
        description="Your company — humans on the board, AI employees doing the work. Hand out assignments, watch results come back, and nothing reaches a client without your sign-off."
      />
      <AgentConsole
        humans={humans}
        employees={employees}
        assignments={assignments}
        workers={workers}
        tasks={tasks}
        runs={runs}
      />
    </div>
  );
}
