"use client";

import { useLayoutEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";

// ---------------------------------------------------------------------------
// The prepared words, editable where they are shown.
//
// Copy and Open mail handed over the words exactly as an employee wrote them,
// and Sent recorded those same words. Whatever the CEO changed on the way, in
// the mail program, never reached the record: the ledger said the draft went
// out when a different message did, and nothing could show what the CEO keeps
// correcting.
//
// Change the words here and Copy, Open mail and Sent all use what is in the
// box. The employee's version is kept beside it in the ledger.
// ---------------------------------------------------------------------------

const TONE = {
  dark: {
    box: "border-white/10 bg-black/40 text-slate-200 focus:border-white/30",
    note: "text-slate-500",
    reset: "text-slate-300 hover:text-white",
  },
  light: {
    box: "border-slate-200 bg-white text-slate-700 focus:border-slate-400",
    note: "text-slate-500",
    reset: "text-slate-600 hover:text-slate-900",
  },
} as const;

export function EditableWords({
  value,
  original,
  onChange,
  tone = "light",
  label = "The words to send",
}: {
  value: string;
  /** The words as the employee wrote them. */
  original: string;
  onChange: (next: string) => void;
  tone?: keyof typeof TONE;
  label?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const edited = value !== original;
  const t = TONE[tone];

  // Grow with the text: a scrolling box hides the sentence being corrected.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);

  return (
    <div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        spellCheck
        rows={3}
        className={`block w-full resize-none overflow-hidden rounded-xl border px-3.5 py-3 font-mono text-[12.5px] leading-[1.7] transition focus:outline-none ${t.box}`}
      />
      {edited && (
        <p className={`mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] ${t.note}`}>
          <span>Edited — your version is what gets recorded; the draft is kept beside it.</span>
          <button
            type="button"
            onClick={() => onChange(original)}
            className={`inline-flex items-center gap-1 font-medium transition ${t.reset}`}
          >
            <RotateCcw className="h-3 w-3" />
            Back to the draft
          </button>
        </p>
      )}
    </div>
  );
}
