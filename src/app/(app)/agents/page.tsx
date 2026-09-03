import { PageHeader } from "@/components/common/page-header";
import { getSession } from "@/lib/auth/session";
import { AgentConsole } from "@/components/modules/agent-console";
import { countUnmappedProjects, suggestJobs } from "@/lib/data/job-suggestions";
import { listAgentTasks, listAgentRuns } from "@/lib/data/agents";
import {
  listWorkforce,
  listHumans,
  listAssignments,
  listWorkersLite,
} from "@/lib/data/workforce";
import { listDiscoveredProjects } from "@/lib/data/discovered-projects";

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

  const [humans, employees, assignments, workers, projectRows, tasks, runs] =
    await Promise.all([
      listHumans(session.organizationId),
      listWorkforce(session.organizationId),
      listAssignments(session.organizationId),
      listWorkersLite(session.organizationId),
      listDiscoveredProjects(session.organizationId),
      listAgentTasks(session.organizationId, { limit: 12 }),
      listAgentRuns(session.organizationId),
    ]);

  // So a job can be filed against the project it is about, instead of the
  // agent only knowing which project because you typed its name.
  const projects = projectRows.map((p) => ({ id: p.id, name: p.project_name }));

  // What the company should be working on, derived from what is actually
  // missing. The board picks; it does not have to compose the brief.
  const [suggestedJobs, moreUnmapped] = await Promise.all([
    suggestJobs(session.organizationId),
    countUnmappedProjects(session.organizationId),
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
        projects={projects}
        canHire={session.role === "admin"}
        tasks={tasks}
        runs={runs}
        suggestedJobs={suggestedJobs.map((j) => ({
          id: j.id,
          title: j.title,
          reason: j.reason,
          priority: j.priority,
          kind: j.kind,
        }))}
        moreUnmapped={moreUnmapped}
      />
    </div>
  );
}
