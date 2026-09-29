"use client";

import { useState, type ReactNode } from "react";
import { ChevronUp } from "lucide-react";

// ---------------------------------------------------------------------------
// One line on Today; the whole card only when a person opens it.
//
// "A human needs five minutes to read all this" (the CEO, 29 September). Today
// is a list of what needs you, each thing one line long: who, what is ready,
// the one thing that is not confirmed, and one button. The full card — the
// team's decision, the email, Send — is exactly what it was, one click away.
// Nothing is removed; it is folded.
// ---------------------------------------------------------------------------

export function TodayFold({
  title,
  line,
  alert = null,
  action = "Review",
  defaultOpen = false,
  children,
}: {
  /** Who or what, in a few words: "Henry Hammond · g2 Recruitment". */
  title: string;
  /** What is ready, in one sentence. */
  line: string;
  /** The one thing that is not confirmed or is in the way, if any. */
  alert?: string | null;
  /** The button's word: Review, Call, Show. */
  action?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (open) {
    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3 px-1">
          <p className="truncate text-[12.5px] font-medium text-slate-500">{title}</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-expanded
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            Close
          </button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-expanded={false}
      className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-slate-600">{line}</span>
        {alert && (
          <span className="mt-0.5 block text-[12.5px] leading-snug text-amber-700">{alert}</span>
        )}
      </span>
      <span className="shrink-0 rounded-lg bg-slate-900 px-3.5 py-1.5 text-[13px] font-semibold text-white">
        {action}
      </span>
    </button>
  );
}
