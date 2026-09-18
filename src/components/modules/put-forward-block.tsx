"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2, MessageSquare, X } from "lucide-react";
import {
  mayAttachPack,
  packApprovalSentence,
  type PutForwardCase,
} from "@/lib/data/put-forward";
import type { CaseRef } from "@/lib/data/today-handoff";
import { useTodayHandoff } from "@/components/modules/today-handoff-context";

// ---------------------------------------------------------------------------
// Who we put forward, on the case — Hanna's half, where the human is already
// standing.
//
// While she works, this says so in words instead of a spinner nobody can read
// a state from. It also shows the packet Triangle can already build from the
// worker record, marked as Triangle's own record rather than as something
// Hanna said, because attributing a generated summary to an employee who has
// not answered is the same lie as a queued row nobody picks up.
//
// Open it, then approve it. That approval is the gate: the Send review has no
// attach tick until it exists, and the server reads it again before anything
// leaves. Nothing auto-attaches, and a person who has not looked at the
// document has not approved it.
//
// Approving does not wait for Hanna, because the document is Triangle's own
// record and is ready immediately — but the card says whether she has checked
// the facts, and if she answers after an approval the approval lapses rather
// than carrying an attachment nobody re-read.
// ---------------------------------------------------------------------------

const TONE = {
  dark: {
    box: "rounded-xl border border-violet-400/30 bg-violet-400/[0.07] p-3.5",
    kicker: "font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300",
    intent: "text-[11px] text-violet-200/80",
    line: "mt-1.5 flex items-center gap-1.5 text-[13px] text-slate-200",
    spin: "h-3 w-3 animate-spin text-violet-300",
    pack: "mt-2.5 rounded-lg border border-white/10 bg-black/25 p-3",
    name: "text-[14px] font-semibold text-white",
    muted: "ml-2 text-[13px] font-normal text-slate-400",
    dl: "mt-1.5 space-y-0.5 text-[12px] text-slate-400",
    dt: "text-slate-500",
    dd: "text-slate-300",
    warn: "mt-2 text-[12px] leading-snug text-amber-300/90",
    chip: "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-[12px] font-medium text-slate-200 transition hover:bg-white/10",
    note: "mt-2 text-[11px] leading-snug text-slate-500",
    empty: "mt-2 text-[13px] leading-relaxed text-slate-400",
    said: "mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-200",
    gate: "mt-2.5 rounded-lg border border-emerald-400/30 bg-emerald-400/[0.07] px-3 py-2.5",
    gateLine: "text-[12.5px] leading-snug text-slate-200",
    approve:
      "inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-2.5 py-1 text-[12px] font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40",
    reject:
      "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-slate-400 transition hover:text-rose-300 disabled:opacity-40",
    reason:
      "h-8 min-w-[10rem] grow rounded-lg border border-white/15 bg-black/30 px-2.5 text-[12px] text-slate-100 placeholder-slate-600 focus:border-white/30 focus:outline-none",
    err: "mt-1.5 text-[12px] text-rose-300",
  },
  light: {
    box: "rounded-xl border border-violet-200 bg-violet-50 p-3.5",
    kicker: "font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700",
    intent: "text-[11px] text-violet-800/80",
    line: "mt-1.5 flex items-center gap-1.5 text-[13px] text-slate-800",
    spin: "h-3 w-3 animate-spin text-violet-600",
    pack: "mt-2.5 rounded-lg border border-violet-100 bg-white p-3",
    name: "text-[14px] font-semibold text-slate-900",
    muted: "ml-2 text-[13px] font-normal text-slate-500",
    dl: "mt-1.5 space-y-0.5 text-[12px] text-slate-600",
    dt: "text-slate-500",
    dd: "text-slate-800",
    warn: "mt-2 text-[12px] leading-snug text-amber-800",
    chip: "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50",
    note: "mt-2 text-[11px] leading-snug text-slate-500",
    empty: "mt-2 text-[13px] leading-relaxed text-slate-500",
    said: "mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-800",
    gate: "mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5",
    gateLine: "text-[12.5px] leading-snug text-slate-800",
    approve:
      "inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-[12px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40",
    reject:
      "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-slate-500 transition hover:text-rose-700 disabled:opacity-40",
    reason:
      "h-8 min-w-[10rem] grow rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none",
    err: "mt-1.5 text-[12px] text-rose-600",
  },
} as const;

export function PutForwardBlock({
  item,
  caseRef,
  tone = "dark",
  onPickWorker,
}: {
  item: PutForwardCase;
  caseRef: CaseRef;
  tone?: keyof typeof TONE;
  /** Bind the pack's person to the Send review's attach, in one click. */
  onPickWorker?: (workerId: string) => void;
}) {
  const handoff = useTodayHandoff();
  const t = TONE[tone];
  const pack = item.pack;
  const said = item.hannaSaid || item.resultSummary;

  return (
    <div className={t.box}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className={t.kicker}>Who we put forward</p>
        <span className={t.intent}>{item.intentLabel}</span>
      </div>

      <p className={t.line}>
        {!item.finished && <Loader2 className={t.spin} />}
        {item.finished
          ? `${item.agentName} finished. ${item.intentSentence}`
          : `${item.workingLine}. ${item.intentSentence}`}
      </p>

      {pack ? (
        <div className={t.pack}>
          <p className={t.name}>
            {pack.displayName}
            {pack.role && <span className={t.muted}>{pack.role}</span>}
          </p>
          <dl className={t.dl}>
            <div className="flex gap-1.5">
              <dt className={t.dt}>Reference</dt>
              <dd className={`font-mono ${t.dd}`}>{pack.reference}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className={t.dt}>Availability</dt>
              <dd className={t.dd}>{pack.availability}</dd>
            </div>
            {pack.certificates.length > 0 && (
              <div className="flex gap-1.5">
                <dt className={t.dt}>Tickets</dt>
                <dd className={t.dd}>{pack.certificates.join(", ")}</dd>
              </div>
            )}
            {pack.languages.length > 0 && (
              <div className="flex gap-1.5">
                <dt className={t.dt}>Languages</dt>
                <dd className={t.dd}>{pack.languages.join(", ")}</dd>
              </div>
            )}
          </dl>
          {pack.notRecorded.length > 0 && (
            <p className={t.warn}>Not recorded: {pack.notRecorded.join(", ")}.</p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <a href={pack.href} target="_blank" rel="noreferrer" className={t.chip}>
              <FileText className="h-3 w-3" />
              Open {pack.filename}
            </a>
            {onPickWorker && (
              <button type="button" onClick={() => onPickWorker(pack.workerId)} className={t.chip}>
                Name {pack.displayName} in the reply
              </button>
            )}
          </div>
          <p className={t.note}>
            Triangle&apos;s own record of {pack.workerName}, ready now.{" "}
            {item.finished
              ? `${item.agentName} has checked it.`
              : `${item.agentName}'s check arrives on this case.`}
          </p>
          <ApprovalGate item={item} tone={tone} />
        </div>
      ) : (
        <p className={t.empty}>
          {item.nobodyBound
            ? `Nobody on the books is bound to this case yet — ${item.agentName} names candidates and says what is missing on each.`
            : "Triangle holds no profile for that person yet."}
        </p>
      )}

      {said && (
        <div className="mt-2.5">
          <p className={t.kicker}>{item.agentName} said</p>
          <pre className={t.said}>{said}</pre>
        </div>
      )}

      <button
        type="button"
        onClick={() =>
          handoff?.openThread({
            assignmentId: item.assignmentId,
            title: item.title,
            agentName: item.agentName,
            messageCount: item.messageCount,
            awaitingAgent: item.awaitingAgent,
            finished: item.finished,
            case: caseRef,
          })
        }
        className={`mt-2.5 ${t.chip}`}
      >
        <MessageSquare className="h-3 w-3" />
        Open thread
      </button>
    </div>
  );
}

/**
 * The human review gate, on the case.
 *
 * One decision with two answers and a reason on the refusal, in the shape
 * the rest of Today already uses for a decision about an employee's work.
 */
function ApprovalGate({
  item,
  tone,
}: {
  item: PutForwardCase;
  tone: keyof typeof TONE;
}) {
  const router = useRouter();
  const t = TONE[tone];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function decide(decision: "approve" | "not_used", note?: string) {
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch("/api/put-forward", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: item.assignmentId, decision, note }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "That decision did not save.");
        return;
      }
      setRejecting(false);
      router.refresh();
    } catch {
      setError("Network error. Nothing was recorded.");
    } finally {
      setBusy(null);
    }
  }

  const approved = mayAttachPack(item.approval);

  return (
    <div className={t.gate}>
      <p className={t.gateLine}>
        {packApprovalSentence({
          approval: item.approval,
          agentName: item.agentName,
          finished: item.finished,
          intent: item.intent,
        })}
      </p>

      {item.approval === "not_used" && item.decidedNote && (
        <p className={t.note}>{item.decidedNote}</p>
      )}

      {!approved && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void decide("approve")}
            className={t.approve}
          >
            {busy === "approve" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            {item.approval === "superseded" ? "Approve again" : "Approve for sending"}
          </button>
          {item.approval !== "not_used" && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setRejecting((v) => !v)}
              className={t.reject}
            >
              <X className="h-3 w-3" />
              Not this one
            </button>
          )}
        </div>
      )}

      {approved && (
        <p className={t.note} suppressHydrationWarning>
          {item.decidedNote}
          {item.approvedAt
            ? ` ${new Date(item.approvedAt).toLocaleString([], {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}.`
            : ""}
        </p>
      )}

      {rejecting && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why? Wrong person, too thin, wrong version…"
            className={t.reason}
          />
          <button
            type="button"
            disabled={busy !== null || reason.trim().length < 3}
            onClick={() => void decide("not_used", reason.trim())}
            className={t.approve}
          >
            {busy === "not_used" && <Loader2 className="h-3 w-3 animate-spin" />}
            Rule it out
          </button>
        </div>
      )}

      {error && <p className={t.err}>{error}</p>}
    </div>
  );
}
