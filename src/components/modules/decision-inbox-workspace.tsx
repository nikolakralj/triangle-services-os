import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CirclePause,
  ExternalLink,
  FileCheck2,
  ChevronDown,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { ApprovalsQueue } from "@/components/modules/approvals-queue";
import { Badge } from "@/components/ui/badge";
import type {
  DecisionCase,
  DecisionInboxSnapshot,
  DecisionKind,
  EvidenceQuality,
} from "@/lib/data/decision-inbox";

const KIND_META: Record<
  DecisionKind,
  { label: string; intent: "success" | "warning" | "danger" | "info" | "purple"; icon: typeof Target }
> = {
  pursue: { label: "Pursue", intent: "success", icon: Target },
  hold: { label: "Hold for evidence", intent: "warning", icon: CirclePause },
  reject: { label: "Reject recommended", intent: "danger", icon: AlertTriangle },
  agent_blocked: { label: "Agent blocked", intent: "danger", icon: Bot },
  evidence_conflict: { label: "Evidence conflict", intent: "warning", icon: AlertTriangle },
  approve_commercial_action: {
    label: "Commercial approval",
    intent: "purple",
    icon: ExternalLink,
  },
};

const QUALITY_META: Record<EvidenceQuality, { label: string; intent: "success" | "warning" | "danger" }> = {
  high: { label: "Strong evidence", intent: "success" },
  medium: { label: "Usable evidence", intent: "warning" },
  low: { label: "Weak evidence", intent: "danger" },
};

// ---------------------------------------------------------------------------
// One decision, one line.
//
// This used to render six labelled panels per decision — recommended decision,
// business impact, responsible employee, unknowns, next safe AI step, your
// step — roughly a screenful each, twenty-five times over. All of it true, and
// all of it in the way: the point of this page is to get through the queue and
// close the tab, not to read a report about every case.
//
// So the row states the only two things needed to decide: what it is, and what
// YOU do. Everything else is one click away for the cases where the answer is
// not obvious. A coloured edge carries the kind, so the eye sorts the list
// before the words are read.
// ---------------------------------------------------------------------------

const EDGE: Record<string, string> = {
  approve_commercial_action: "bg-violet-500",
  agent_blocked: "bg-rose-500",
  evidence_conflict: "bg-amber-500",
  pursue_hold_reject: "bg-sky-500",
  no_action_needed: "bg-slate-300",
};

function DecisionCard({ decision }: { decision: DecisionCase }) {
  const meta = KIND_META[decision.kind];
  const quality = QUALITY_META[decision.evidenceQuality];
  const Icon = meta.icon;

  return (
    <details className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-300">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-0">
        <span
          className={`h-full min-h-[3.5rem] w-1 shrink-0 ${EDGE[decision.kind] ?? "bg-slate-300"}`}
          aria-hidden
        />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-3 pr-3">
          <Icon className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-950">
              {decision.title}
            </span>
            {/* The actionable half, on the line, so the queue can be worked
                without opening anything. */}
            <span className="mt-0.5 block truncate text-xs text-slate-600">
              {decision.nextHumanStep}
            </span>
          </span>
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {meta.label}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
        </span>
      </summary>

      <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-4">
        <div className="rounded-lg border border-sky-100 bg-sky-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
            Recommended
          </p>
          <p className="mt-0.5 text-sm font-medium leading-6 text-slate-950">
            {decision.recommendation}
          </p>
        </div>

        {decision.detail && (
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
            {decision.detail.length > 500
              ? `${decision.detail.slice(0, 500)}…`
              : decision.detail}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <Badge intent={quality.intent}>{quality.label}</Badge>
          {decision.averageConfidence !== null && (
            <Badge>{decision.averageConfidence}% confidence</Badge>
          )}
          <span className="text-slate-500">{decision.ownerLabel}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500">{decision.businessImpact}</span>
        </div>

        {decision.unknowns.length > 0 && (
          <ul className="space-y-1">
            {decision.unknowns.map((unknown) => (
              <li key={unknown} className="flex gap-2 text-xs leading-5 text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                {unknown}
              </li>
            ))}
          </ul>
        )}

        <p className="flex items-start gap-1.5 text-xs leading-5 text-slate-500">
          <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {decision.nextSafeAiStep}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {decision.caseHref && (
            <Link
              href={decision.caseHref}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Open the case <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {decision.approvalItems.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <ApprovalsQueue items={decision.approvalItems} />
          </div>
        )}
      </div>
    </details>
  );
}

export function DecisionInboxWorkspace({ snapshot }: { snapshot: DecisionInboxSnapshot }) {
  const totalAttention = snapshot.decisions.length;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-sm">
        <div className="grid gap-6 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_440px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
              CEO attention layer
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              {totalAttention === 0
                ? "The AI team does not need you right now."
                : `${totalAttention} decision${totalAttention === 1 ? "" : "s"} to make.`}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              If work is not shown below, the AI team continues within its authority. You appear only for evidence decisions, blockers and external commercial actions.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4 xl:grid-cols-2">
            {[
              // Labelled as what they count. These are raw items grouped into
              // the decisions above, so a tile reading 27 above a headline
              // reading 25 is not a contradiction — but it looked like one.
              [snapshot.pendingApprovalCount, "pieces of evidence"],
              [snapshot.blockedCount, "employees blocked"],
              [snapshot.commercialActionCount, "drafts unsent"],
              [snapshot.noActionNeededCount, "cases AI is handling"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-xl font-semibold">{value}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {snapshot.decisions.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
          <h2 className="mt-3 text-base font-semibold text-emerald-950">Nothing requires a CEO decision</h2>
          <p className="mx-auto mt-1 max-w-2xl text-sm leading-6 text-emerald-800">
            Active internal research stays with the responsible AI employees. This inbox will wake up when evidence, a blocker or an external action crosses a human boundary.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {snapshot.decisions.map((decision) => (
            <DecisionCard key={decision.id} decision={decision} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <p className="flex items-center gap-2 text-slate-600">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Research can continue automatically. Outreach, commitments and personal-data sharing remain human decisions.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/approvals" className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline">
            Evidence history <FileCheck2 className="h-3.5 w-3.5" />
          </Link>
          <Link href="/agents" className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline">
            AI workforce <Sparkles className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
