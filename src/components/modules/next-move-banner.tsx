import Link from "next/link";
import { ArrowRight, CheckCircle2, Target } from "lucide-react";
import type { NextMove } from "@/lib/data/next-move";

// ---------------------------------------------------------------------------
// One sentence, one button, nothing else above it.
//
// Not a widget among widgets — deliberately the largest thing on the page, so
// the answer to "what do I do" is legible before anything is read. If the
// honest answer is "nothing", it says that instead of manufacturing a task.
// ---------------------------------------------------------------------------

export function NextMoveBanner({ move }: { move: NextMove }) {
  if (move.clear) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-950">{move.headline}</p>
          <p className="text-xs text-emerald-800">{move.because}</p>
        </div>
        <Link
          href={move.href}
          className="text-xs font-semibold text-emerald-800 underline-offset-2 hover:underline"
        >
          {move.cta}
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-4 overflow-hidden rounded-2xl bg-slate-950 text-white">
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/20">
          <Target className="h-5 w-5 text-sky-300" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-300">
            Do this next
          </p>
          <p className="mt-0.5 text-lg font-semibold leading-tight">
            {move.headline}
          </p>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-300">
            {move.because}
          </p>
        </div>
        <Link
          href={move.href}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
        >
          {move.cta}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
