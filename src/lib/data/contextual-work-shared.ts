export type ContextualType = "job_lead" | "company" | "contact" | "project" | "worker";

export type NamedRole = "scout" | "hanna" | "bob";

export interface HumanBrief {
  whatChanged: string | null;
  whyItMatters: string | null;
  recommend: string | null;
  needFromYou: string | null;
  evidence: string | null;
}

export interface ContextualAssignmentView {
  id: string;
  title: string;
  objective: string;
  status: string;
  employeeName: string;
  employeeRole: string;
  agentInstanceId: string;
  resultSummary: string | null;
  createdAt: string;
  completedAt: string | null;
  brief: HumanBrief | null;
  suggestMission: string | null;
}
