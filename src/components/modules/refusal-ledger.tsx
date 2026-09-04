import { ShieldCheck, ShieldAlert, Building2 } from "lucide-react";
import type { RefusalSummary } from "@/lib/data/refusals";

// ---------------------------------------------------------------------------
// What the system would not let anyone record.
//
// Every other panel in this product reports what happened. This one reports
// what was stopped — the attempts to book progress the evidence did not
// support. It is the only surface here that gets more useful the worse the
// week was, and the only one that cannot be gamed by working harder.
//
// A quiet week is genuinely good news, so it says so plainly rather than
// hiding the panel and leaving the impression the feature is broken.
// ---------------------------------------------------------------------------

export function RefusalLedger({ summary }: { summary: RefusalSummary }) {
  const days = summary.days;

  if (summary.total === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <ShieldCheck className="h-4 w-4" />
          Nothing was refused in the last {days} days
        </p>
        <p className="mt-1 text-xs leading-relaxed text-emerald-800">
          Every commercial record written in this period carried the evidence
          its rule required. The checks are always on — this is what a clean
          week looks like, not a disabled feature.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            The system refused {summary.total}{" "}
            {summary.total === 1 ? "attempt" : "attempts"} in {days} days
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
            Each one tried to record progress the evidence did not support. The
            record was not written, so nothing downstream — a package, a
            forecast, a report — was ever built on it.
          </p>
        </div>
        <div className="flex gap-2">
          <Tile label="claimed progress" value={summary.truth} tone="amber" />
          <Tile label="crossed a tenant" value={summary.boundary} tone="rose" />
        </div>
      </div>

      {summary.topReasons.length > 0 && (
        <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {summary.topReasons.map((r) => (
            <div
              key={r.reason}
              className="flex items-start justify-between gap-3 px-3 py-2"
            >
              <p className="text-xs leading-relaxed text-slate-700">
                {r.kind === "boundary" && (
                  <Building2 className="mr-1 inline h-3 w-3 text-rose-500" />
                )}
                {/* The database's own sentence, never reworded — paraphrasing
                    the rule would be the failure this panel exists to catch. */}
                {r.reason}
              </p>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                {r.count}×
              </span>
            </div>
          ))}
        </div>
      )}

      {summary.recent.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          Most recent: {summary.recent[0].surface} ·{" "}
          {new Date(summary.recent[0].occurredAt).toLocaleString("en-GB")}
          {summary.recent[0].attemptedByAgent
            ? ` · attempted by ${summary.recent[0].attemptedByAgent}`
            : ""}
        </p>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "rose";
}) {
  const cls =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-rose-200 bg-rose-50 text-rose-900";
  return (
    <div className={`rounded-lg border px-3 py-2 text-center ${cls}`}>
      <p className="text-lg font-semibold leading-none">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide opacity-80">
        {label}
      </p>
    </div>
  );
}
