import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CirclePause,
  ExternalLink,
  FileCheck2,
  MessagesSquare,
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

function DecisionCard({ decision }: { decision: DecisionCase }) {
  const meta = KIND_META[decision.kind];
  const quality = QUALITY_META[decision.evidenceQuality];
  const Icon = meta.icon;

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge intent={meta.intent}>
                <Icon className="mr-1 h-3.5 w-3.5" />
                {meta.label}
              </Badge>
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {decision.caseLabel}
              </span>
            </div>
            <h2 className="mt-2 text-base font-semibold text-slate-950">{decision.title}</h2>
            {decision.detail && (
              <p className="mt-1 max-w-5xl whitespace-pre-wrap text-sm leading-6 text-slate-600">
                {decision.detail.length > 700 ? `${decision.detail.slice(0, 700)}…` : decision.detail}
              </p>
            )}
          </div>
          {decision.caseHref && (
            <Link
              href={decision.caseHref}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open living case <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
              Recommended decision
            </p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-950">
              {decision.recommendation}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Business impact
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{decision.businessImpact}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Responsible employee
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{decision.ownerLabel}</p>
            </div>
          </div>

          {decision.unknowns.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Unknowns and risks
              </p>
              <ul className="mt-2 space-y-1.5">
                {decision.unknowns.map((unknown) => (
                  <li key={unknown} className="flex gap-2 text-sm leading-5 text-slate-600">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    {unknown}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="border-t border-slate-100 bg-slate-50/70 p-5 lg:border-l lg:border-t-0">
          <div className="flex flex-wrap gap-2">
            <Badge intent={quality.intent}>{quality.label}</Badge>
            {decision.averageConfidence !== null && (
              <Badge>{decision.averageConfidence}% confidence</Badge>
            )}
            {decision.evidenceCount > 0 && (
              <Badge>{decision.evidenceCount} evidence item{decision.evidenceCount === 1 ? "" : "s"}</Badge>
            )}
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <Bot className="h-3.5 w-3.5" /> Next safe AI step
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{decision.nextSafeAiStep}</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <MessagesSquare className="h-3.5 w-3.5" /> Your step
              </p>
              <p className="mt-1 text-sm font-medium leading-6 text-slate-900">{decision.nextHumanStep}</p>
            </div>
          </div>
        </aside>
      </div>

      {decision.approvalItems.length > 0 && (
        <details className="border-t border-slate-100 bg-white">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Review and decide on the supporting evidence
          </summary>
          <div className="border-t border-slate-100 p-5">
            <ApprovalsQueue items={decision.approvalItems} />
          </div>
        </details>
      )}
    </article>
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
                : `${totalAttention} case decision${totalAttention === 1 ? "" : "s"} need your attention.`}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              If work is not shown below, the AI team continues within its authority. You appear only for evidence decisions, blockers and external commercial actions.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4 xl:grid-cols-2">
            {[
              [snapshot.pendingApprovalCount, "Evidence decisions"],
              [snapshot.blockedCount, "Blocked agents"],
              [snapshot.commercialActionCount, "External drafts"],
              [snapshot.noActionNeededCount, "AI handling now"],
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
