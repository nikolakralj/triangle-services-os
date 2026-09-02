import Link from "next/link";
import { CheckCircle2, Clock, FileSearch, XCircle } from "lucide-react";
import { AgentReport } from "@/components/modules/agent-report";
import type { CaseSnapshot } from "@/lib/data/company-case";

// ---------------------------------------------------------------------------
// What an employee has actually done about this thing.
//
// Roadmap item 4: the company case proved that a record is more useful when it
// carries its own history — which employee worked it, what they were asked,
// what they came back with, and what evidence that produced. This is the same
// snapshot rendered for any entity, so a project shows its case without a
// second loader, a second shape, or a second version of the truth.
// ---------------------------------------------------------------------------

const STATUS: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  queued: { label: "Queued", cls: "bg-slate-100 text-slate-600", icon: Clock },
  active: { label: "Working on it", cls: "bg-sky-50 text-sky-700", icon: Clock },
  waiting_review: { label: "Waiting for you", cls: "bg-amber-50 text-amber-800", icon: Clock },
  completed: { label: "Reported", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  failed: { label: "Could not do it", cls: "bg-rose-50 text-rose-700", icon: XCircle },
  cancelled: { label: "Taken back", cls: "bg-slate-100 text-slate-500", icon: XCircle },
};

const EVIDENCE_STATUS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-slate-100 text-slate-500",
};

export function EntityCasePanel({
  snapshot,
  emptyHint,
}: {
  snapshot: CaseSnapshot;
  emptyHint: string;
}) {
  const { assignments, evidence } = snapshot;

  if (assignments.length === 0 && evidence.length === 0) {
    return <p className="text-xs text-slate-500">{emptyHint}</p>;
  }

  const pending = evidence.filter((e) => e.status === "pending");

  return (
    <div className="space-y-3">
      {pending.length > 0 && (
        <Link
          href="/approvals"
          className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
        >
          <FileSearch className="h-3.5 w-3.5" />
          {pending.length} piece{pending.length === 1 ? "" : "s"} of evidence
          waiting on your decision
        </Link>
      )}

      {assignments.map((a) => {
        const meta = STATUS[a.status] ?? STATUS.queued;
        const Icon = meta.icon;
        return (
          <div key={a.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-950">{a.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                  {a.objective}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {a.agentEmoji} {a.agentName}
                  {a.messageCount > 0 ? ` · ${a.messageCount} in conversation` : ""}
                  {a.awaitingAgent > 0 ? ` · ${a.awaitingAgent} not picked up` : ""}
                </p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
              >
                <Icon className="h-3 w-3" />
                {meta.label}
              </span>
            </div>

            {a.resultSummary && (
              <AgentReport
                text={a.resultSummary}
                authorName={a.agentName}
                authorEmoji={a.agentEmoji}
              />
            )}
          </div>
        );
      })}

      {evidence.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Evidence produced
          </p>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {evidence.slice(0, 12).map((e) => {
              const p = e.payload;
              // A person's name before their job title: a buyer_contact
              // payload carries `title` as "Managing Director", which reads as
              // the headline of a record about nobody in particular.
              const headline = String(
                p.project_name ??
                  p.company_name ??
                  p.full_name ??
                  p.name ??
                  p.package_type ??
                  p.title ??
                  e.findingType,
              );
              return (
                <div key={e.id} className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {e.findingType}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${EVIDENCE_STATUS[e.status]}`}
                    >
                      {e.status}
                    </span>
                    {e.confidence !== null && (
                      <span className="text-[10px] text-slate-400">
                        {e.confidence}% sure
                      </span>
                    )}
                    {e.foundBy && (
                      <span className="text-[10px] text-slate-400">
                        {e.foundBy.emoji} {e.foundBy.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-800">{headline}</p>
                  {e.evidenceText && (
                    <p className="mt-0.5 line-clamp-2 border-l-2 border-slate-200 pl-2 text-[11px] leading-relaxed text-slate-500">
                      &ldquo;{e.evidenceText}&rdquo;
                    </p>
                  )}
                  {e.sourceUrl && (
                    <a
                      href={e.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-[11px] font-medium text-sky-700 hover:text-sky-900"
                    >
                      Source
                    </a>
                  )}
                </div>
              );
            })}
          </div>
          {evidence.length > 12 && (
            <p className="mt-1 text-[11px] text-slate-400">
              {evidence.length - 12} more not shown.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
