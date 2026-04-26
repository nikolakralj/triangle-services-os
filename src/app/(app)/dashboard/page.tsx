import {
  AlertTriangle,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Clock3,
  FileWarning,
  Target,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { activities, companies, opportunities, pipelineStages, tasks } from "@/lib/sample-data";

export default function DashboardPage() {
  const openOpportunities = opportunities.filter((item) => item.status === "open");
  const overdueTasks = tasks.filter((task) => task.status !== "done" && task.dueDate && task.dueDate <= "2026-04-24");
  const dueThisWeek = tasks.filter((task) => task.status !== "done" && task.dueDate && task.dueDate <= "2026-04-30");
  const companiesWithoutNextAction = companies.filter((company) => !company.nextActionAt);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Daily operating view for the 300-company lead database, pipeline, follow-ups and vendor document readiness."
        actions={<Button variant="primary">Generate weekly report</Button>}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total companies" value={companies.length} helper="Target: 300" icon={<Building2 className="h-5 w-5" />} tone="sky" />
        <StatCard label="Progress toward 300" value={`${Math.round((companies.length / 300) * 100)}%`} helper={`${300 - companies.length} companies remaining`} icon={<Target className="h-5 w-5" />} tone="emerald" />
        <StatCard label="Contacts added" value="3" helper="Decision makers and coordinators" icon={<Users className="h-5 w-5" />} tone="violet" />
        <StatCard label="Open opportunities" value={openOpportunities.length} helper="Active commercial discussions" icon={<BriefcaseBusiness className="h-5 w-5" />} tone="amber" />
        <StatCard label="RFQs received" value="0" helper="No formal RFQ yet" icon={<FileWarning className="h-5 w-5" />} tone="slate" />
        <StatCard label="Offers sent" value="0" helper="Proposal module is ready next" icon={<CheckCircle2 className="h-5 w-5" />} tone="slate" />
        <StatCard label="Overdue follow-ups" value={overdueTasks.length} helper="Needs action today" icon={<AlertTriangle className="h-5 w-5" />} tone="rose" />
        <StatCard label="Tasks due this week" value={dueThisWeek.length} helper="All team members" icon={<Clock3 className="h-5 w-5" />} tone="sky" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader title="Pipeline by stage" description="Visual count before opening the Kanban board." />
          <CardContent className="space-y-3">
            {pipelineStages.slice(0, 11).map((stage) => {
              const count = opportunities.filter((opportunity) => opportunity.stageId === stage.id).length;
              return (
                <div key={stage.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{stage.name}</span>
                    <span className="text-slate-500">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-sky-500" style={{ width: `${Math.max(6, count * 18)}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Top priority companies" description="Highest-scored targets for outreach." />
          <CardContent className="space-y-3">
            {[...companies]
              .sort((a, b) => b.leadScore - a.leadScore)
              .slice(0, 5)
              .map((company) => (
                <div key={company.id} className="rounded-md border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-950">{company.name}</p>
                    <Badge intent="info">{company.leadScore}/25</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{company.country} · {company.companyType}</p>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Overdue follow-ups" />
          <CardContent className="space-y-3">
            {overdueTasks.map((task) => (
              <div key={task.id} className="rounded-md bg-rose-50 p-3 text-sm text-rose-900">
                <p className="font-medium">{task.title}</p>
                <p className="text-xs">Due {task.dueDate} · {task.assignedToName ?? "—"}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Companies without next action" />
          <CardContent className="space-y-3">
            {companiesWithoutNextAction.length ? (
              companiesWithoutNextAction.map((company) => (
                <div key={company.id} className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                  {company.name}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">All sample companies have a next action.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Recent activities" />
          <CardContent className="space-y-3">
            {activities.map((activity) => (
              <div key={activity.id} className="rounded-md border border-slate-100 p-3">
                <p className="font-medium text-slate-950">{activity.title}</p>
                <p className="mt-1 text-xs text-slate-500">{activity.summary}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
