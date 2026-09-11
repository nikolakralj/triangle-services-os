"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { ago, type DecisionKind, type MissionDecision } from "@/lib/data/mission-shared";

// ---------------------------------------------------------------------------
// What the CEO decided, as the worker keeps it.
//
//   YOUR DECISIONS                        3 in force · Scout applies them
//   EXCLUDE  Exclude HVAC-only companies.                        Take back
//            “ignore HVAC-only companies” · 2 h ago
//
// Each was written down from an instruction with the words it came from, and
// every later step applies it. Taking one back is a click, and so is putting
// it back.
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<DecisionKind, string> = {
  exclude: "Exclude",
  focus: "Focus",
  prefer: "Prefer",
  limit: "Limit",
  other: "Decision",
};

export function MissionDecisions({
  missionId,
  decisions,
  leadName,
  canWrite,
}: {
  missionId: string;
  decisions: MissionDecision[];
  leadName: string;
  canWrite: boolean;
}) {
  const [showInactive, setShowInactive] = useState(false);
  if (decisions.length === 0) return null;
  const active = decisions.filter((d) => d.status === "active");
  const inactive = decisions.filter((d) => d.status !== "active");

  return (
    <section aria-label="Your decisions" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-4">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">Your decisions</p>
        <span className="grow" />
        <span className="text-[12px] text-slate-500">
          {active.length} in force · {leadName} applies them to every step
        </span>
      </div>
      {active.length === 0 ? (
        <p className="px-5 pb-4 pt-2 text-[13px] text-slate-500">None in force.</p>
      ) : (
        <ul className="divide-y divide-slate-100 px-5 pb-2 pt-1">
          {active.map((d) => (
            <DecisionRow key={d.id} decision={d} missionId={missionId} canWrite={canWrite} />
          ))}
        </ul>
      )}
      {inactive.length > 0 && (
        <div className="border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            aria-expanded={showInactive}
            className="flex w-full items-center gap-2 px-5 py-3 text-left text-[12.5px] text-slate-600 transition hover:bg-slate-50"
          >
            <ChevronRight className={`h-3.5 w-3.5 text-slate-400 transition ${showInactive ? "rotate-90" : ""}`} />
            No longer in force · {inactive.length}
          </button>
          {showInactive && (
            <ul className="divide-y divide-slate-100 px-5 pb-2">
              {inactive.map((d) => (
                <DecisionRow key={d.id} decision={d} missionId={missionId} canWrite={canWrite} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function DecisionRow({
  decision,
  missionId,
  canWrite,
}: {
  decision: MissionDecision;
  missionId: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = decision.status === "active";

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/missions/${missionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: active ? "remove_decision" : "restore_decision",
          decisionId: decision.id,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "That did not work.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
          active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
        }`}
      >
        {KIND_LABEL[decision.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[13.5px] leading-snug ${active ? "text-slate-900" : "text-slate-500"}`}>
          {decision.text}
        </p>
        <p className="mt-0.5 text-[12px] leading-snug text-slate-500">
          <span className="italic">“{decision.quote}”</span>
          <span suppressHydrationWarning> · {ago(decision.decidedAt)}</span>
          {decision.status === "superseded" && " · replaced by a later instruction"}
          {decision.status === "removed" && " · taken back"}
        </p>
        {error && <p className="mt-1 text-[12px] text-rose-600">{error}</p>}
      </div>
      {canWrite && (
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          {active ? "Take back" : "Restore"}
        </button>
      )}
    </li>
  );
}
