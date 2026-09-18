"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2, MessageSquare } from "lucide-react";
import {
  DEFAULT_PACK_INTENT,
  mayAttachPack,
  packApprovalSentence,
  packDisplayName,
  type PutForwardCase,
} from "@/lib/data/put-forward";
import {
  formSentence,
  humaniseReport,
  othersSentence,
  reportOpening,
} from "@/lib/data/case-decision";
import type { CaseRef } from "@/lib/data/today-handoff";
import { useTodayHandoff } from "@/components/modules/today-handoff-context";

// ---------------------------------------------------------------------------
// The team's decision on a case.
//
// "Employees, not buttons" (18 September): the person reads what the team
// decided and why, and judges it — approve the document, or say what to
// change in the one Ask. No radio list over the pool, no bio / CV picker, no
// wall of ids. Who we propose is Hanna's bound person when she has the case,
// otherwise Triangle's own top match, said plainly as not yet checked.
// ---------------------------------------------------------------------------

export interface DecisionPick {
  workerId: string;
  name: string;
  role: string | null;
  why: string;
  caveats: string[];
}

/** Bob's half of the case, as the card needs it. */
export interface DecisionChase {
  assignmentId: string;
  agentName: string;
  title: string;
  body: string | null;
  working: boolean;
  messageCount: number;
  awaitingAgent: number;
}

const TONE = {
  dark: {
    box: "rounded-xl border border-white/10 bg-white/[0.04] p-4",
    kicker: "font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300",
    status: "text-[11.5px] text-slate-400",
    lead: "mt-2 text-[15px] leading-snug text-slate-100",
    name: "font-semibold text-white",
    muted: "text-slate-400",
    line: "mt-1 text-[13px] leading-relaxed text-slate-300",
    warn: "mt-1.5 text-[12.5px] leading-snug text-amber-300/90",
    note: "mt-2 text-[12px] leading-snug text-slate-400",
    doc: "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-[12.5px] font-medium text-slate-100 transition hover:bg-white/10",
    approve:
      "inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-2.5 py-1 text-[12.5px] font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40",
    approved: "inline-flex items-center gap-1 text-[12.5px] font-medium text-emerald-300",
    said: "mt-2.5 border-t border-white/10 pt-2.5",
    saidWho: "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400",
    saidText: "mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-200",
    link: "inline-flex items-center gap-1 text-[12px] font-medium text-sky-300 transition hover:text-sky-200",
    error: "mt-1.5 text-[12px] text-rose-300",
  },
  light: {
    box: "rounded-xl border border-slate-200 bg-slate-50 p-3.5",
    kicker: "font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700",
    status: "text-[11.5px] text-slate-500",
    lead: "mt-1.5 text-[14px] leading-snug text-slate-800",
    name: "font-semibold text-slate-900",
    muted: "text-slate-500",
    line: "mt-1 text-[12.5px] leading-relaxed text-slate-600",
    warn: "mt-1.5 text-[12px] leading-snug text-amber-800",
    note: "mt-2 text-[11.5px] leading-snug text-slate-500",
    doc: "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50",
    approve:
      "inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-[12px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40",
    approved: "inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700",
    said: "mt-2.5 border-t border-slate-200 pt-2.5",
    saidWho: "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500",
    saidText: "mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-700",
    link: "inline-flex items-center gap-1 text-[12px] font-medium text-sky-700 transition hover:text-sky-900",
    error: "mt-1.5 text-[12px] text-rose-600",
  },
} as const;

type Tone = keyof typeof TONE;

export function CaseDecision({
  tone = "dark",
  caseRef,
  putForward,
  pick,
  others = [],
  agency,
  chase,
}: {
  tone?: Tone;
  caseRef: CaseRef;
  /** Hanna's newest who-we-put-forward case on this case, if any. */
  putForward: PutForwardCase | null;
  /** Triangle's own top match, or the candidate Hanna's case is about. */
  pick: DecisionPick | null;
  /** Everyone else on the books who fits, named, never offered as controls. */
  others?: DecisionPick[];
  /** Set only when the case is a requisition from an agency. */
  agency?: string | null;
  chase?: DecisionChase | null;
}) {
  const t = TONE[tone];
  const handoff = useTodayHandoff();
  const pack = putForward?.pack ?? null;
  const intent = putForward?.intent ?? DEFAULT_PACK_INTENT;

  const display = pack
    ? pack.displayName
    : pick
      ? packDisplayName(pick.name, intent)
      : null;
  const realName = pack?.workerName ?? pick?.name ?? null;
  const role = pack?.role ?? pick?.role ?? null;
  const why = pick && (!pack || pack.workerId === pick.workerId) ? pick.why : "";
  const unknowns = [
    ...(pick && (!pack || pack.workerId === pick.workerId) ? pick.caveats : []),
    ...(pack?.notRecorded ?? []).map((item) => `${item} not recorded`),
  ];
  const doc = pack
    ? { href: pack.href, label: pack.filename }
    : pick
      ? { href: `/api/workers/${pick.workerId}/cv?variant=${intent}`, label: "the bio" }
      : null;

  const status = [
    putForward
      ? putForward.finished
        ? `${putForward.agentName} checked it`
        : putForward.workingLine
      : pick
        ? "Triangle's pick — not checked by the team yet"
        : null,
    chase ? (chase.working ? `${chase.agentName} is on the conversation` : `${chase.agentName} answered`) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const otherNames = others
    .filter((o) => o.workerId !== (pack?.workerId ?? pick?.workerId))
    .map((o) => o.name);
  const firstOther = otherNames[0]?.split(/\s+/)[0];

  return (
    <section aria-label="The team's decision" className={t.box}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className={t.kicker}>The team&apos;s decision</p>
        {status && <p className={t.status}>{status}</p>}
      </div>

      {display ? (
        <p className={t.lead}>
          <span className={t.name}>We propose {display}</span>
          {role ? ` — ${role}` : ""}.
          {realName && realName !== display && (
            <span className={t.muted}> {realName} on our books.</span>
          )}
        </p>
      ) : (
        <p className={t.lead}>
          {putForward?.nobodyBound
            ? `${putForward.agentName} is choosing who to propose from the books.`
            : "Nobody on the books fits this yet."}
        </p>
      )}
      {why && <p className={t.line}>Why: {why}.</p>}
      {display && <p className={t.line}>{formSentence(intent, agency)}</p>}
      {unknowns.length > 0 && <p className={t.warn}>Not known yet: {unknowns.join(" · ")}.</p>}

      {doc && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <a href={doc.href} target="_blank" rel="noreferrer" className={t.doc}>
            <FileText className="h-3.5 w-3.5" />
            Open {doc.label}
          </a>
          {putForward && pack && <Approval item={putForward} tone={tone} />}
        </div>
      )}
      {putForward && pack && !putForward.finished && (
        // Shown at once so the case is never empty, and never passed off as
        // something she said before she said it (18 September).
        <p className={t.note}>
          Triangle&apos;s own record of {pack.workerName}, ready now. {putForward.agentName}&apos;s
          check comes back here.
        </p>
      )}
      {!putForward && pick && (
        <p className={t.note}>
          Nobody on the team has checked this pick yet. Ask hands it to them — the answer comes back here.
        </p>
      )}
      {otherNames.length > 0 && (
        <p className={t.note}>
          Also fit: {othersSentence(otherNames)}.
          {firstOther ? ` Say “use ${firstOther}” in Ask to switch.` : ""}
        </p>
      )}

      {putForward && (putForward.hannaSaid || putForward.resultSummary) && (
        <Said
          tone={tone}
          who={putForward.agentName}
          text={putForward.hannaSaid || putForward.resultSummary}
          onThread={() =>
            handoff?.openThread({
              assignmentId: putForward.assignmentId,
              title: putForward.title,
              agentName: putForward.agentName,
              messageCount: putForward.messageCount,
              awaitingAgent: putForward.awaitingAgent,
              finished: putForward.finished,
              case: caseRef,
            })
          }
        />
      )}
      {chase && (
        <Said
          tone={tone}
          who={chase.agentName}
          text={chase.body}
          emptyLine={
            chase.working
              ? `${chase.agentName} has not written in the Triangle thread yet.`
              : null
          }
          onThread={() =>
            handoff?.openThread({
              assignmentId: chase.assignmentId,
              title: chase.title,
              agentName: chase.agentName,
              messageCount: chase.messageCount,
              awaitingAgent: chase.awaitingAgent,
              finished: !chase.working,
              case: caseRef,
            })
          }
        />
      )}
    </section>
  );
}

/** What an employee wrote: the opening lines, ids stripped; the rest folds. */
function Said({
  tone,
  who,
  text,
  emptyLine = null,
  onThread,
}: {
  tone: Tone;
  who: string;
  text: string | null;
  emptyLine?: string | null;
  onThread: () => void;
}) {
  const t = TONE[tone];
  const [all, setAll] = useState(false);
  const opening = reportOpening(text);
  const full = humaniseReport(text);
  if (!opening && !emptyLine) return null;
  return (
    <div className={t.said}>
      <p className={t.saidWho}>{who}</p>
      <p className={t.saidText}>{opening ? (all ? full : opening) : emptyLine}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        {opening && full.length > opening.length && (
          <button type="button" onClick={() => setAll((v) => !v)} className={t.link}>
            {all ? "Show less" : "Read all"}
          </button>
        )}
        <button type="button" onClick={onThread} className={t.link}>
          <MessageSquare className="h-3 w-3" />
          {who}&apos;s thread
        </button>
      </div>
    </div>
  );
}

/** One decision on the document: approve it for sending. Changing it is words in Ask. */
function Approval({ item, tone }: { item: PutForwardCase; tone: Tone }) {
  const t = TONE[tone];
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approved = mayAttachPack(item.approval);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/put-forward", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: item.assignmentId, decision: "approve" }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "That approval did not save.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Nothing was recorded.");
    } finally {
      setBusy(false);
    }
  }

  if (approved) {
    return (
      <span className={t.approved} suppressHydrationWarning>
        <Check className="h-3.5 w-3.5" />
        Approved
        {item.approvedAt
          ? ` ${new Date(item.approvedAt).toLocaleString([], {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : ""}{" "}
        — it goes with the reply when you send.
      </span>
    );
  }
  if (item.approval === "not_used") {
    return <span className={t.muted}>Ruled out{item.decidedNote ? `: ${item.decidedNote}` : ""}.</span>;
  }
  return (
    <>
      <button type="button" disabled={busy} onClick={() => void approve()} className={t.approve}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        {item.approval === "superseded" ? "Approve again" : "Approve for sending"}
      </button>
      <span className={`basis-full ${t.muted} text-[11.5px]`}>
        {packApprovalSentence({
          approval: item.approval,
          agentName: item.agentName,
          finished: item.finished,
          intent: item.intent,
        })}
      </span>
      {error && <span className={`basis-full ${t.error}`}>{error}</span>}
    </>
  );
}
