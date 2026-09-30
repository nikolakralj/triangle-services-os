import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { listReplyDrafts } from "@/lib/data/job-intake";
import {
  formatReportDate,
  reportSentence,
  type ReportView,
} from "@/lib/data/employee-report-policy";
import type { MissionCandidate, MissionMessage, MissionStepView, MissionWorkspace } from "@/lib/data/mission-shared";
import {
  assignProposals,
  type CaseActivityInput,
  type CaseDraftInput,
  type CasePageInput,
  type CaseProposal,
} from "@/lib/data/case-page";

// ---------------------------------------------------------------------------
// The records the case page reads. Service client, organisation scoped.
// A missing table leaves the case drawable from the roles already loaded.
// ---------------------------------------------------------------------------

export interface CaseMail {
  clientName: string | null;
  clientEmail: string | null;
  city: string | null;
  sector: string | null;
  leadId: string | null;
  email: CasePageInput["email"];
  /** Mailbox the request arrived in, when it is one this person can send from. */
  arrivedInAccountId: string | null;
  drafts: CaseDraftInput[];
}

export async function loadCaseMail(orgId: string, missionId: string): Promise<CaseMail | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data: roleRow, error } = await svc
    .from("requirement_roles")
    .select("job_lead_id, inbound_email_id")
    .eq("org_id", orgId)
    .eq("mission_id", missionId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !roleRow) return null;

  const leadId = (roleRow.job_lead_id as string | null) ?? null;
  const emailId = (roleRow.inbound_email_id as string | null) ?? null;
  const [leadResult, emailResult, drafts] = await Promise.all([
    leadId
      ? svc
          .from("job_leads")
          .select("contact_name, contact_email, agency_name, client_company, city, sector")
          .eq("org_id", orgId)
          .eq("id", leadId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    emailId
      ? svc
          .from("inbound_emails")
          .select("subject, body_text, sent_at, mail_account_id")
          .eq("org_id", orgId)
          .eq("id", emailId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    leadId ? listReplyDrafts(leadId, orgId) : Promise.resolve([]),
  ]);

  const lead = leadResult.data as Record<string, unknown> | null;
  const email = emailResult.data as Record<string, unknown> | null;
  const sentAt = typeof email?.sent_at === "string" ? email.sent_at : null;

  return {
    clientName:
      text(lead?.contact_name) ?? text(lead?.client_company) ?? text(lead?.agency_name),
    clientEmail: text(lead?.contact_email),
    city: text(lead?.city),
    sector: text(lead?.sector),
    leadId,
    email: email
      ? {
          subject: text(email.subject) ?? "Source email",
          body: text(email.body_text),
          when: sentAt ? formatReportDate(sentAt.slice(0, 10)) : null,
        }
      : null,
    arrivedInAccountId: text(email?.mail_account_id),
    drafts: drafts
      .filter((draft) => draft.status === "draft" && draft.body.trim().length > 0)
      .map((draft) => ({
        subject: draft.subject,
        body: draft.body,
        original: draft.aiBody,
      })),
  };
}

/**
 * The case, as the page draws it. Proposals come from what employees reported
 * for a role, then from people the mission has named when their role says which.
 */
export function casePageInput(input: {
  workspace: MissionWorkspace;
  reports: ReportView[];
  mail: CaseMail | null;
  threadDraft: CaseDraftInput | null;
}): CasePageInput {
  const proposals = proposalsFrom(input.reports, input.workspace.candidates);
  const names = assignProposals(input.workspace.requirementRoles, proposals);
  const drafts =
    input.mail && input.mail.drafts.length > 0
      ? input.mail.drafts
      : input.threadDraft
        ? [input.threadDraft]
        : [];
  const city = input.mail?.city ?? input.workspace.requirementRoles[0]?.location ?? null;
  return {
    clientName: input.mail?.clientName ?? null,
    city,
    sector: input.mail?.sector ?? null,
    email: input.mail?.email ?? null,
    roles: input.workspace.requirementRoles.map((role, index) => ({
      ...role,
      proposed: names[index] ?? [],
    })),
    openQuestions: input.workspace.requirementQuestions,
    drafts,
    activity: activityOf(input.workspace.steps, input.reports),
  };
}

/** Bob's latest letter on the acknowledge step, when no reply draft is stored. */
export function threadReplyDraft(
  steps: MissionStepView[],
  messages: MissionMessage[],
): CaseDraftInput | null {
  const bob = steps.find((step) => step.title.startsWith("Acknowledge"));
  if (!bob) return null;
  const letter = [...messages]
    .reverse()
    .find(
      (message) =>
        message.stepId === bob.id && message.role === "agent" && looksLikeReply(message.body),
    );
  if (!letter) return null;
  return {
    subject: "Reply",
    body: letter.body.trim(),
    original: letter.body.trim(),
  };
}

function proposalsFrom(reports: ReportView[], candidates: MissionCandidate[]): CaseProposal[] {
  const fromReports = reports
    .filter((report) => report.kind === "candidate_found" && report.personName)
    .map((report) => ({ name: report.personName as string, roleTitle: report.roleTitle }));
  const fromPool = candidates
    .filter((candidate) => candidate.name && candidate.role)
    .map((candidate) => ({ name: candidate.name, roleTitle: candidate.role }));
  return [...fromReports, ...fromPool];
}

function activityOf(steps: MissionStepView[], reports: ReportView[]): CaseActivityInput[] {
  const reported = [...reports]
    .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : a.occurredOn > b.occurredOn ? -1 : 0))
    .map((report) => ({
      when: formatReportDate(report.occurredOn),
      who: report.source === "mailbox" ? "From the mailbox" : report.employeeName || "The team",
      sentence: [reportSentence(report), report.note].filter(Boolean).join(" "),
    }));
  const working = steps.map((step) => ({
    when: step.completedAt ? formatReportDate(step.completedAt.slice(0, 10)) : "Open",
    who: step.worker || "The team",
    sentence: `${step.title} — ${stepWord(step.status)}.`,
  }));
  return [...reported, ...working];
}

function stepWord(status: string): string {
  switch (status) {
    case "queued":
      return "waiting to start";
    case "active":
      return "working";
    case "waiting_review":
      return "ready for you";
    case "completed":
      return "finished";
    case "failed":
      return "stopped";
    default:
      return "on the case";
  }
}

function looksLikeReply(body: string): boolean {
  const text = body.trim();
  if (text.length < 80) return false;
  return /^(hi|hello|dear|good morning|good afternoon)\b/i.test(text) || text.includes("\n\n");
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
