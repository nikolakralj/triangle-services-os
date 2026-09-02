import Link from "next/link";
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ExternalLink,
  Package,
  ShieldCheck,
  UserRoundSearch,
} from "lucide-react";
import { AssignmentThread } from "@/components/modules/assignment-thread";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { parseScoutCaseReport } from "@/lib/ai/scout-case-report";
import type { CompanyCaseSnapshot } from "@/lib/data/company-case";
import type { CompanyCrossProjectIntel } from "@/lib/data/company-intel";
import type { Company } from "@/lib/types";

function statusLabel(status: string): string {
  if (status === "queued") return "Waiting for Scout";
  if (status === "active") return "Scout is working";
  if (status === "waiting_review") return "Manager review";
  if (status === "completed") return "Report ready";
  if (status === "failed") return "Blocked";
  return status.replace(/_/g, " ");
}

function displayValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return null;
  return String(value);
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function completeSentences(value: string): string {
  if (/[.!?][\])}"']?$/.test(value.trim())) return value;
  const lastStop = Math.max(value.lastIndexOf("."), value.lastIndexOf("!"), value.lastIndexOf("?"));
  return lastStop > value.length * 0.55 ? value.slice(0, lastStop + 1) : value;
}

function ReportRow({
  icon: Icon,
  label,
  value,
  missing,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  missing?: boolean;
}) {
  return (
    <div className="grid gap-2 border-b border-slate-100 py-4 last:border-0 sm:grid-cols-[170px_1fr]">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Icon className={`h-4 w-4 ${missing ? "text-slate-300" : "text-sky-700"}`} />
        {label}
      </div>
      <p className={`text-sm leading-6 ${missing ? "text-slate-400" : "text-slate-700"}`}>
        {value}
      </p>
    </div>
  );
}

export function CompanyCaseWorkspace({
  company,
  intel,
  companyCase,
}: {
  company: Company;
  intel: CompanyCrossProjectIntel | null;
  companyCase: CompanyCaseSnapshot;
}) {
  const qualificationAssignments = companyCase.assignments.filter((assignment) =>
    assignment.title.toLowerCase().startsWith("qualify "),
  );
  const qualification = qualificationAssignments[0] ?? null;
  const backgroundAssignments = companyCase.assignments.filter(
    (assignment) => assignment.id !== qualification?.id,
  );
  const report = parseScoutCaseReport(qualification?.resultSummary ?? null);
  const directDoor = safeHttpUrl(
    report?.buyerPath?.publicDoor ?? report?.nextCommercialAction?.channel,
  );
  const sourcedDoor = report?.sources.find((source) =>
    /supplier|lieferant|baupartner|nachunternehmer|vendor|procurement|connect2partner|portal/i.test(
      `${source.title} ${source.claim} ${source.url}`,
    ),
  );
  const publicDoor = directDoor ?? safeHttpUrl(sourcedDoor?.url);

  const projectValue =
    report?.namedProject?.name ?? intel?.projectInvolvements[0]?.title ?? null;
  const buyerValue =
    report?.buyerPath?.laborBuyer ??
    (intel?.buyerContacts.length
      ? `${intel.buyerContacts.length} sourced buyer contact${intel.buyerContacts.length === 1 ? "" : "s"}`
      : null);
  const packageValue = report?.crewPackage?.scope ?? intel?.packages[0]?.title ?? null;
  const actionValue = report?.nextCommercialAction?.action ?? null;
  const reportReady = Boolean(report && qualification?.status === "completed");

  const caseState = reportReady
    ? report?.verdict === "pursue"
      ? "Strategy ready"
      : report?.verdict === "no_go"
        ? "No-go recommended"
        : "Hold recommended"
    : qualification
      ? statusLabel(qualification.status)
      : "Unassigned";

  const headline = reportReady
    ? report?.headline
    : qualification?.status === "active"
      ? "Scout is qualifying the project, buyer route, crew offer, and next action."
      : qualification?.status === "queued"
        ? "The case is queued. Scout has not started yet."
        : qualification?.status === "failed"
          ? "The employee could not complete this case. Manager direction is required."
          : "This company does not yet have a commercial qualification report.";

  const decisionText = reportReady
    ? report?.verdict === "pursue"
      ? actionValue ?? "Authorize the manager to prepare the next commercial step."
      : report?.verdict === "no_go"
        ? "Close or park the case; do not spend outreach time on it."
        : report?.unknowns[0] ?? "Keep the case on hold until the missing proof is found."
    : qualification?.status === "failed"
      ? "Review the blocker and decide whether Scout should retry."
      : "No CEO action is needed while the manager is waiting for the employee report.";

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-sm">
        <div className="grid gap-6 px-5 py-5 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
                Commercial manager report
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium">
                {caseState}
              </span>
              {company.doNotContact ? (
                <span className="rounded-full bg-rose-400/15 px-2.5 py-1 text-xs font-medium text-rose-200">
                  Do not contact
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-xl font-semibold leading-8">{headline}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
              {report?.executiveSummary
                ? completeSentences(report.executiveSummary)
                :
                "The company is being treated as one durable commercial case. Background research and employee conversation stay attached, but only a decision-ready strategy is promoted here."}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              CEO decision
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-100">{decisionText}</p>
            {qualification ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-sky-200">
                <Bot className="h-4 w-4" />
                {qualification.agentEmoji} {qualification.agentName} · {statusLabel(qualification.status)}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <Card>
        <CardHeader
          title="Simple strategy"
          description="Enough to decide how Triangle should approach this company—without reading the worker's research log."
        />
        <CardContent>
          <ReportRow
            icon={Building2}
            label="Where is the work?"
            value={projectValue ?? "No named project or durable framework has been verified yet."}
            missing={!projectValue}
          />
          <ReportRow
            icon={UserRoundSearch}
            label="Who buys?"
            value={buyerValue ?? "The actual labour buyer is still unknown; the project owner is not enough."}
            missing={!buyerValue}
          />
          <ReportRow
            icon={Package}
            label="What do we offer?"
            value={packageValue ?? "No Triangle-supported crew package has been proposed yet."}
            missing={!packageValue}
          />
          <ReportRow
            icon={BriefcaseBusiness}
            label="How do we open the door?"
            value={actionValue ?? "No safe commercial action has been specified yet."}
            missing={!actionValue}
          />

          {publicDoor ? (
            <a
              href={publicDoor}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100"
            >
              Open verified supplier door <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}

          {qualification ? (
            <div className="mt-2 border-t border-slate-100 pt-3">
              <AssignmentThread
                assignmentId={qualification.id}
                messageCount={qualification.messageCount}
                awaitingAgent={qualification.awaitingAgent}
                agentName={qualification.agentName}
                recipientLabel="commercial manager"
                finished={
                  qualification.status === "completed" || qualification.status === "failed"
                }
                label="Ask the commercial manager for clarification"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {reportReady && (report?.unknowns.length || report?.risks.length) ? (
        <Card>
          <CardHeader title="What could still change the decision" />
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Unknowns
              </p>
              {report?.unknowns.length ? (
                <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                  {report.unknowns.map((item) => (
                    <li key={item} className="flex gap-2">
                      <CircleDashed className="mt-1 h-4 w-4 shrink-0 text-amber-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No material unknown was reported.</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Risks and boundaries
              </p>
              {report?.risks.length ? (
                <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                  {report.risks.map((item) => (
                    <li key={item} className="flex gap-2">
                      <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No special risk was reported.</p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Manager audit</p>
            <p className="mt-1 text-xs text-slate-500">
              Worker hand-in, conversation, evidence, and background assignments.
            </p>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-5 border-t border-slate-100 px-5 py-5">
          {qualification ? (
            <article className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{qualification.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {qualification.agentEmoji} {qualification.agentName} · {statusLabel(qualification.status)}
                  </p>
                </div>
                <Badge intent={qualification.status === "failed" ? "danger" : "success"}>
                  {statusLabel(qualification.status)}
                </Badge>
              </div>
              {qualification.resultSummary ? (
                <p className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-700">
                  {report?.workerNarrative ?? qualification.resultSummary}
                </p>
              ) : (
                <p className="mt-3 text-xs leading-5 text-slate-500">{qualification.objective}</p>
              )}
              <AssignmentThread
                assignmentId={qualification.id}
                messageCount={qualification.messageCount}
                awaitingAgent={qualification.awaitingAgent}
                agentName={qualification.agentName}
                finished={
                  qualification.status === "completed" || qualification.status === "failed"
                }
              />
            </article>
          ) : null}

          {report?.sources.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Report sources
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {report.sources.slice(0, 10).map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-sky-700 hover:bg-slate-50"
                  >
                    {source.title} <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {companyCase.evidence.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Evidence ledger
              </p>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                {companyCase.evidence.slice(0, 8).map((item) => {
                  const heading =
                    displayValue(item.payload.project_name) ??
                    displayValue(item.payload.company_name) ??
                    displayValue(item.payload.name) ??
                    item.findingType;
                  return (
                    <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-800">{heading}</p>
                      {item.evidenceText ? (
                        <p className="mt-1.5 text-xs leading-5 text-slate-600">
                          {item.evidenceText}
                        </p>
                      ) : null}
                      {item.sourceUrl ? (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline"
                        >
                          Verify source <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {backgroundAssignments.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Background worker jobs
              </p>
              <div className="mt-2 space-y-2">
                {backgroundAssignments.map((assignment) => (
                  <details key={assignment.id} className="rounded-lg border border-slate-200 p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                      {assignment.title} · {statusLabel(assignment.status)}
                    </summary>
                    <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-600">
                      {assignment.resultSummary ?? assignment.objective}
                    </p>
                    <AssignmentThread
                      assignmentId={assignment.id}
                      messageCount={assignment.messageCount}
                      awaitingAgent={assignment.awaitingAgent}
                      agentName={assignment.agentName}
                      finished={
                        assignment.status === "completed" || assignment.status === "failed"
                      }
                    />
                  </details>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
            <p><span className="font-semibold">Type:</span> {company.companyType || "Unknown"}</p>
            <p><span className="font-semibold">Location:</span> {[company.city, company.country].filter(Boolean).join(", ") || "Unknown"}</p>
            <p><span className="font-semibold">Status:</span> {company.status}</p>
          </div>
        </div>
      </details>

      {intel?.projectInvolvements.length ? (
        <Card>
          <CardHeader title="Connected opportunities" />
          <CardContent className="space-y-2">
            {intel.projectInvolvements.map((project) => (
              <Link
                key={project.id}
                href={`/hunter/${project.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{project.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {project.companyRoleLabel || project.companyRole} · {project.buyerContactCount} buyer contacts · {project.packageCount} packages
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        {reportReady ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <CircleDashed className="h-3.5 w-3.5" />
        )}
        AI researches and proposes. External contact, commitments, and commercial approval remain human decisions.
      </p>
    </div>
  );
}
