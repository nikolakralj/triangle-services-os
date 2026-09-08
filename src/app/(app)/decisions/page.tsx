import { PageHeader } from "@/components/common/page-header";
import { OperationsCockpit } from "@/components/modules/operations-cockpit";
import { getNextMove } from "@/lib/data/next-move";
import { listDecisionInbox } from "@/lib/data/decision-inbox";
import { listPlays } from "@/lib/data/plays";
import { listWorkforce, listAssignments } from "@/lib/data/workforce";
import { loadAgentFaces } from "@/lib/data/agent-identity";
import { getSession } from "@/lib/auth/session";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const session = await getSession();
  if (!session?.organizationId) {
    return (
      <PageHeader
        title="Operations Cockpit"
        description="Cockpit not available — organization context required."
      />
    );
  }

  const svc = createServiceSupabaseClient();
  const [
    snapshot,
    plays,
    nextMove,
    employees,
    assignments,
    faces,
    projectsRes,
    companiesRes,
    leadsRes,
    workersRes,
  ] = await Promise.all([
    listDecisionInbox(session.organizationId),
    listPlays(session.organizationId),
    getNextMove(session.organizationId),
    listWorkforce(session.organizationId),
    listAssignments(session.organizationId),
    loadAgentFaces(session.organizationId),
    svc
      ? svc
          .from("discovered_projects")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", session.organizationId)
      : Promise.resolve({ count: 18 }),
    svc
      ? svc
          .from("companies")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", session.organizationId)
      : Promise.resolve({ count: 174 }),
    svc
      ? svc
          .from("job_leads")
          .select("id", { count: "exact", head: true })
          .eq("org_id", session.organizationId)
      : Promise.resolve({ count: 34 }),
    svc
      ? svc
          .from("workers")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", session.organizationId)
      : Promise.resolve({ count: 2 }),
  ]);

  const recent = assignments
    .filter((a) => a.status === "completed" && a.resultSummary)
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      resultSummary: a.resultSummary,
      authorName: faces.byId.get(a.agentInstanceId)?.name ?? "An employee",
      authorEmoji: faces.byId.get(a.agentInstanceId)?.emoji ?? "🤖",
      at: a.completedAt ?? a.createdAt,
    }));

  const sortedEmployees = employees
    .filter((e) => e.status === "active")
    .sort((a, b) => {
      const rank = (r: string) => (r === "project_researcher" ? 0 : r === "hr" ? 1 : 2);
      return rank(a.roleKey) - rank(b.roleKey);
    })
    .map((e) => ({
      id: e.id,
      name: e.displayName,
      emoji: e.emoji,
      roleTitle: e.description,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Cockpit"
        description="Command your AI agents, review live intelligence, and execute today's high-leverage commercial actions."
      />
      <OperationsCockpit
        move={nextMove}
        employees={sortedEmployees}
        recentResults={recent}
        plays={plays}
        snapshot={snapshot}
        archives={{
          projectsCount: projectsRes?.count ?? 18,
          companiesCount: companiesRes?.count ?? 174,
          leadsCount: leadsRes?.count ?? 34,
          workersCount: workersRes?.count ?? 2,
        }}
      />
    </div>
  );
}

