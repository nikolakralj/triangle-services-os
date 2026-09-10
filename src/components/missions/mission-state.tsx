import { Check } from "lucide-react";
import { MISSION_STATE_LABEL, type MissionState } from "@/lib/data/mission-shared";

// ---------------------------------------------------------------------------
// The six states, as marks.
//
//   ○ queued   ◐ working   ● needs you   ✓ ready   ✓ done   ! blocked
//
// "Then you can have ten agents working without continuously checking them."
// The mark carries the state on its own — shape as well as colour — so a
// tab strip reads at a glance and still reads for somebody who cannot tell
// amber from green.
// ---------------------------------------------------------------------------

export function StateGlyph({
  state,
  className = "",
}: {
  state: MissionState;
  className?: string;
}) {
  switch (state) {
    case "queued":
      return (
        <span
          aria-hidden
          className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-slate-400 ${className}`}
        />
      );
    case "working":
      return (
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className={`h-3 w-3 shrink-0 animate-spin text-sky-500 motion-reduce:animate-none ${className}`}
        >
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
          <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case "needs_you":
      return (
        <span aria-hidden className={`relative inline-flex h-2.5 w-2.5 shrink-0 ${className}`}>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
        </span>
      );
    case "ready":
      return (
        <Check aria-hidden strokeWidth={3} className={`h-3.5 w-3.5 shrink-0 text-emerald-600 ${className}`} />
      );
    case "done":
      return (
        <Check aria-hidden strokeWidth={2.5} className={`h-3.5 w-3.5 shrink-0 text-slate-400 ${className}`} />
      );
    case "blocked":
      return (
        <span
          aria-hidden
          className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold leading-none text-white ${className}`}
        >
          !
        </span>
      );
  }
}

const CHIP: Record<MissionState, string> = {
  queued: "bg-slate-100 text-slate-600 ring-slate-200",
  working: "bg-sky-50 text-sky-700 ring-sky-200",
  needs_you: "bg-amber-50 text-amber-800 ring-amber-200",
  ready: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  done: "bg-slate-50 text-slate-500 ring-slate-200",
  blocked: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function StateChip({
  state,
  size = "md",
}: {
  state: MissionState;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold uppercase tracking-[0.08em] ring-1 ring-inset ${
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      } ${CHIP[state]}`}
    >
      <StateGlyph state={state} />
      {MISSION_STATE_LABEL[state]}
    </span>
  );
}

/**
 * "DE", not 🇩🇪 drawn as two loose letters.
 *
 * A flag is two regional-indicator characters, and Windows has no flags in its
 * emoji font, so the CEO's tab strip read "DE Germany EPC buyers" in the body
 * font, looking like a typo. A flag is shown as a country chip everywhere,
 * which reads the same on every machine; any other emoji is left alone.
 */
export function flagCode(emoji: string | null): string | null {
  if (!emoji) return null;
  const points = Array.from(emoji.trim()).map((c) => c.codePointAt(0) ?? 0);
  if (points.length !== 2 || !points.every((p) => p >= 0x1f1e6 && p <= 0x1f1ff)) return null;
  return String.fromCharCode(...points.map((p) => p - 0x1f1e6 + 65));
}

export function MissionMark({
  emoji,
  size = "md",
}: {
  emoji: string | null;
  size?: "sm" | "md" | "lg";
}) {
  if (!emoji) return null;
  const code = flagCode(emoji);
  if (code) {
    return (
      <span
        aria-label={code}
        className={`inline-flex shrink-0 items-center justify-center rounded-[5px] bg-slate-800 font-mono font-bold tracking-[0.06em] text-white ${
          size === "lg" ? "h-[22px] px-1.5 text-[11px]" : size === "sm" ? "h-4 px-1 text-[8.5px]" : "h-[18px] px-1 text-[9.5px]"
        }`}
      >
        {code}
      </span>
    );
  }
  return (
    <span
      className={`shrink-0 leading-none ${
        size === "lg" ? "text-[26px]" : size === "sm" ? "text-[13px]" : "text-[15px]"
      }`}
    >
      {emoji}
    </span>
  );
}
