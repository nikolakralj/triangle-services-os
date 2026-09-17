"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Share2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Put this person's mail into the common shared space. Human-only API.
// Does not send.
// ---------------------------------------------------------------------------

export function ShareLeadButton({
  leadId,
  compact = false,
}: {
  leadId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function share() {
    setState("saving");
    setError(null);
    try {
      const res = await fetch(`/api/job-intake/leads/${leadId}/share`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not share that.");
        setState("idle");
        return;
      }
      setState("done");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700">
        <Check className="h-3.5 w-3.5" />
        In shared space
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={state === "saving"}
        onClick={() => void share()}
        className={
          compact
            ? "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            : "inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        }
      >
        {state === "saving" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Share2 className="h-3.5 w-3.5" />
        )}
        Share with the team
      </button>
      {error ? <span className="text-[11px] text-rose-600">{error}</span> : null}
    </span>
  );
}
