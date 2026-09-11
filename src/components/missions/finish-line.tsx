"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { metricPhrase } from "@/lib/data/mission-progress";
import type { MissionMetric, MissionProgress, PlanStepProgress } from "@/lib/data/mission-shared";

// ---------------------------------------------------------------------------
// When the mission is finished, and how it gets there.
//
//   SUCCESS WHEN   ✓ 20 companies still in play          23
//                  ○ 15 buyers named                  9 of 15
//   Plan · 6 steps · 3 complete — next: Name the buyer at each
//
// Every number on the right is counted from the records the mission holds,
// not from anything the worker said. The CEO can move a target; nothing else
// here is typed by anyone.
// ---------------------------------------------------------------------------

export function FinishLine({
  missionId,
  progress,
  leadName,
  running,
  canWrite,
}: {
  missionId: string;
  progress: MissionProgress | null;
  leadName: string;
  running: boolean;
  canWrite: boolean;
}) {
  if (!progress) {
    return <NoFinishLine missionId={missionId} leadName={leadName} running={running} canWrite={canWrite} />;
  }
  return <Criteria missionId={missionId} progress={progress} canWrite={canWrite} />;
}

async function patch(missionId: string, body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(`/api/missions/${missionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    return payload.error ?? "That did not work.";
  } catch {
    return "Network error.";
  }
}

function NoFinishLine({
  missionId,
  leadName,
  running,
  canWrite,
}: {
  missionId: string;
  leadName: string;
  running: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function plan() {
    setBusy(true);
    setError(null);
    const failed = await patch(missionId, { action: "plan" });
    setBusy(false);
    if (failed) setError(failed);
    else router.refresh();
  }

  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">Success when</p>
        <p className="mt-1 text-[13.5px] text-slate-700">
          {running
            ? `${leadName} sets the finish line as it starts.`
            : `No finish line yet. ${leadName} sets one with the next instruction.`}
        </p>
      </div>
      {canWrite && !running && (
        <button
          type="button"
          onClick={() => void plan()}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {busy ? "Planning…" : "Plan it now"}
        </button>
      )}
      {error && <p className="w-full text-[12px] text-rose-600">{error}</p>}
    </section>
  );
}

function Criteria({
  missionId,
  progress,
  canWrite,
}: {
  missionId: string;
  progress: MissionProgress;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDrafts(Object.fromEntries(progress.criteria.map((c) => [c.metric, String(c.target)])));
    setError(null);
    setEditing(true);
  }

  async function save() {
    const targets: Partial<Record<MissionMetric, number>> = {};
    for (const c of progress.criteria) {
      const n = Number(drafts[c.metric]);
      if (!Number.isInteger(n) || n < 1 || n > 500) {
        setError("A target is a whole number from 1 to 500.");
        return;
      }
      if (n !== c.target) targets[c.metric] = n;
    }
    if (Object.keys(targets).length === 0) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    const failed = await patch(missionId, { action: "criteria", targets });
    setBusy(false);
    if (failed) {
      setError(failed);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <section aria-label="Success criteria" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-3 px-5 pt-4">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">Success when</p>
        {progress.met && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            Reached
          </span>
        )}
        <span className="grow" />
        <span className="font-mono text-[13px] font-semibold tabular-nums text-slate-900">{progress.percent}%</span>
        {canWrite && !editing && (
          <button
            type="button"
            onClick={startEditing}
            className="text-[12px] font-medium text-sky-700 hover:underline"
          >
            Edit targets
          </button>
        )}
      </div>
      <div
        className="mx-5 mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label="Progress toward the finish line"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
      >
        <span
          className="block h-full rounded-full bg-emerald-500 transition-[width] duration-500"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <ul className="space-y-2 px-5 py-4">
        {progress.criteria.map((c) => (
          <li key={c.metric} className="flex min-h-8 items-center gap-2.5">
            <Glyph done={c.met} />
            {editing ? (
              <label className="flex flex-wrap items-center gap-2 text-[13.5px] text-slate-700">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={500}
                  value={drafts[c.metric] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [c.metric]: e.target.value }))}
                  className="h-8 w-20 rounded-md border border-slate-300 px-2 font-mono text-[13px] tabular-nums text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
                {metricPhrase(c.metric, Number(drafts[c.metric]) === 1 ? 1 : 2)}
              </label>
            ) : (
              <span className={`text-[13.5px] ${c.met ? "text-slate-900" : "text-slate-700"}`}>
                {c.label}
                {c.setBy === "human" && (
                  <span className="ml-1.5 text-[11px] text-slate-400" title="A person set this target">
                    · set by you
                  </span>
                )}
              </span>
            )}
            <span className="grow" />
            <span className="font-mono text-[12px] tabular-nums text-slate-500">
              {c.met ? <span className="text-emerald-700">{c.actual}</span> : `${c.actual} of ${c.target}`}
            </span>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-[12.5px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save targets
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="inline-flex h-8 items-center rounded-lg px-3 text-[12.5px] font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          {error && <p className="w-full text-[12px] text-rose-600">{error}</p>}
        </div>
      )}

      {progress.plan.length > 0 && <Plan progress={progress} />}
    </section>
  );
}

function Glyph({ done }: { done: boolean }) {
  return done ? (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
      <Check className="h-3 w-3" strokeWidth={3} />
    </span>
  ) : (
    <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300" />
  );
}

function Plan({ progress }: { progress: MissionProgress }) {
  const [open, setOpen] = useState(false);
  const { plan, stepsDone, current } = progress;
  // Compared by position: the page receives a copy, not the same objects.
  const isCurrent = (s: PlanStepProgress) => current?.position === s.position;

  return (
    <div className="border-t border-slate-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2 px-5 py-3 text-left text-[12.5px] text-slate-600 transition hover:bg-slate-50"
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${open ? "rotate-90" : ""}`} />
        <span className="shrink-0 font-semibold text-slate-800">Plan</span>
        <span className="shrink-0 tabular-nums">
          · {plan.length} {plan.length === 1 ? "step" : "steps"} · {stepsDone} complete
        </span>
        {current && !open && <span className="min-w-0 truncate text-slate-500">— next: {current.title}</span>}
      </button>
      {open && (
        <ol className="space-y-2 px-5 pb-4">
          {plan.map((s) => (
            <li key={s.position} className="flex items-center gap-2.5">
              {s.done ? (
                <Glyph done />
              ) : isCurrent(s) ? (
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white">
                  <ChevronRight className="h-3 w-3" strokeWidth={3} />
                </span>
              ) : (
                <Glyph done={false} />
              )}
              <span
                className={`text-[13px] ${isCurrent(s) ? "font-semibold text-slate-950" : s.done ? "text-slate-500" : "text-slate-700"}`}
              >
                {s.title}
              </span>
              <span className="grow" />
              <span className="font-mono text-[12px] tabular-nums text-slate-500">
                {s.done ? "done" : `${s.actual} of ${s.target}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
