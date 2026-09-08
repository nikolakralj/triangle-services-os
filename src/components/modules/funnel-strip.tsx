import type { Funnel } from "@/lib/data/funnel";

// ---------------------------------------------------------------------------
// The business, drawn, on one line.
//
// The screen previously wrote it out as prose in the footer — "2 people · 18
// projects · 174 companies · 34 inbound requisitions" — four numbers with no
// relationship between them. These seven have exactly one relationship and it
// is the only one worth a chart: 34 requisitions arrived, 3 got a reply, and
// everything downstream is starved by that step.
//
// Design decisions that are load-bearing rather than decorative:
//
//   Linear scale, not log. 3 next to 34 SHOULD look tiny. A log axis would
//   flatter the number and flattering the number is the failure this product
//   exists to refuse.
//
//   Zeros get a visible empty track and a printed 0, so "no orders" reads as
//   a fact rather than as missing data.
//
//   The stages a human alone can move are marked. Six of the seven are, which
//   is the honest shape of this company: agents cannot fix the leak.
//
// Server component — no state, no interaction, so it ships no JavaScript.
// ---------------------------------------------------------------------------

export function FunnelStrip({ funnel }: { funnel: Funnel }) {
  if (funnel.stages.length === 0) return null;
  const max = Math.max(...funnel.stages.map((s) => s.n), 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 pb-4 pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
          Requisition to order
        </h2>
        {funnel.oldestUnansweredDays !== null && funnel.oldestUnansweredDays > 0 && (
          <p className="font-mono text-[11px] text-rose-600">
            oldest unanswered: {funnel.oldestUnansweredDays}d
            {funnel.oldestUnansweredFrom ? ` · ${funnel.oldestUnansweredFrom}` : ""}
          </p>
        )}
      </div>

      {/* Bars share one scale so the drop is the thing you see, not the labels. */}
      <div className="mt-3 flex items-end gap-1 overflow-x-auto pb-1">
        {funnel.stages.map((s, i) => {
          const pct = Math.round((s.n / max) * 100);
          const empty = s.n === 0;
          return (
            <div key={s.key} className="flex min-w-[74px] flex-1 flex-col gap-1.5">
              <div className="flex items-baseline gap-1">
                <span
                  className={`font-mono text-[17px] font-medium tabular-nums leading-none ${
                    empty ? "text-slate-300" : "text-slate-900"
                  }`}
                >
                  {s.n}
                </span>
                {s.human && (
                  <span
                    title="Only a human can move this step"
                    className="mb-0.5 h-1 w-1 shrink-0 rounded-full bg-sky-400"
                  />
                )}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    empty
                      ? ""
                      : i === 0
                        ? "bg-slate-800"
                        : s.n < funnel.stages[i - 1].n / 2
                          ? "bg-rose-400"
                          : "bg-slate-500"
                  }`}
                  style={{ width: `${empty ? 0 : Math.max(pct, 3)}%` }}
                />
              </div>
              <span className="text-[10.5px] leading-tight text-slate-500">
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* One sentence, so nobody has to compare seven bars to get the point. */}
      {funnel.worstDrop && (
        <p className="mt-2.5 border-t border-slate-100 pt-2.5 text-[12.5px] text-slate-600">
          Biggest loss is{" "}
          <span className="font-semibold text-slate-900">
            {funnel.worstDrop.from} → {funnel.worstDrop.to}
          </span>
          : {funnel.worstDrop.lost} lost.{" "}
          <span className="text-slate-400">
            Dots mark the steps only a human can move.
          </span>
        </p>
      )}
    </div>
  );
}
