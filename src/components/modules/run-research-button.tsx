"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RunState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; suggestionsCreated: number; estimatedCostUsd?: number }
  | { status: "error"; message: string };

export function RunResearchButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [state, setState] = useState<RunState>({ status: "idle" });

  async function handleRun() {
    setState({ status: "running" });
    try {
      const res = await fetch("/api/research/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState({ status: "error", message: data.error ?? "Research failed." });
        return;
      }

      setState({
        status: "done",
        suggestionsCreated: data.suggestionsCreated ?? 0,
        estimatedCostUsd: data.estimatedCostUsd,
      });

      router.refresh();
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleRun}
        disabled={state.status === "running"}
        className={cn(
          "w-full gap-2",
          state.status === "done" && "bg-emerald-600 hover:bg-emerald-700",
        )}
      >
        {state.status === "running" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Researching... this takes 30-60 s
          </>
        ) : state.status === "done" ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Done - {state.suggestionsCreated} suggestion
            {state.suggestionsCreated !== 1 ? "s" : ""} created
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Run AI Research
          </>
        )}
      </Button>

      {state.status === "error" && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {state.message}
        </div>
      )}

      {state.status === "done" && state.estimatedCostUsd !== undefined && (
        <p className="text-center text-[11px] text-slate-400">
          Cost: ~${state.estimatedCostUsd.toFixed(4)} - Suggestions waiting in panel below
        </p>
      )}

      {state.status === "idle" && (
        <p className="text-center text-[11px] text-slate-400">
          AI searches the web and proposes chain nodes, buyer contacts, and package opportunities.
          You review before anything is saved.
        </p>
      )}
    </div>
  );
}

export function RunResearchCompactButton({
  projectId,
  onStateChange,
}: {
  projectId: string;
  onStateChange?: (state: RunState) => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<RunState>({ status: "idle" });

  async function handleRun() {
    const runningState: RunState = { status: "running" };
    setState(runningState);
    onStateChange?.(runningState);
    try {
      const res = await fetch("/api/research/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorState: RunState = { status: "error", message: data.error ?? "Research failed." };
        setState(errorState);
        onStateChange?.(errorState);
        return;
      }
      const doneState: RunState = {
        status: "done",
        suggestionsCreated: data.suggestionsCreated ?? 0,
        estimatedCostUsd: data.estimatedCostUsd,
      };
      setState(doneState);
      onStateChange?.(doneState);
      router.refresh();
    } catch (err) {
      const errorState: RunState = {
        status: "error",
        message: err instanceof Error ? err.message : "Network error",
      };
      setState(errorState);
      onStateChange?.(errorState);
    }
  }

  return (
    <button
      onClick={handleRun}
      disabled={state.status === "running"}
      className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
    >
      {state.status === "running" ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Running
        </>
      ) : (
        <>
          <Sparkles className="h-3.5 w-3.5" />
          Run AI Research
        </>
      )}
    </button>
  );
}
