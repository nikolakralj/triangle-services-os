"use client";

import { cn } from "@/lib/utils";
import type { ResearchRunRow, ResearchSuggestionRow } from "@/lib/data/research";
import { ResearchSuggestionsPanel } from "@/components/modules/research-suggestions-panel";
import { ResearchPathPointer } from "@/components/modules/research-path-pointer";
import { ContractorChainGraph } from "@/components/modules/contractor-chain-graph";
import type { ContractorChainNodeRow } from "@/lib/data/contractor-chain";
import type { ProjectPackageRow } from "@/lib/data/project-packages";

type ViewMode = "queue" | "overview" | "graph";

function runStatusLabel(run: ResearchRunRow | null) {
  if (!run) return "No run yet";
  return `${run.status} - ${new Date(run.started_at).toLocaleString()}`;
}

export function ResearchQueueWorkspace({
  suggestions,
  latestResearchRun,
  pendingCount,
  showWeakDefault,
  viewMode,
  savedChainNodes,
  dbPackages,
}: {
  projectId: string;
  suggestions: ResearchSuggestionRow[];
  latestResearchRun: ResearchRunRow | null;
  pendingCount: number;
  showWeakDefault: boolean;
  viewMode: ViewMode;
  savedChainNodes: ContractorChainNodeRow[];
  dbPackages: ProjectPackageRow[];
}) {
  return (
    <div className="space-y-4">
      <div className="sticky top-2 z-10 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
            Last run: {runStatusLabel(latestResearchRun)}
          </span>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
            Pending: {pendingCount}
          </span>

          <div className="ml-auto flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set("view", "queue");
                window.history.pushState({}, "", url);
                window.location.reload();
              }}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-bold transition-all",
                viewMode === "queue" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              List
            </button>
            <button
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set("view", "graph");
                window.history.pushState({}, "", url);
                window.location.reload();
              }}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-bold transition-all",
                viewMode === "graph" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Graph
            </button>
          </div>
        </div>
      </div>

      <ResearchPathPointer />

      {viewMode === "graph" ? (
        <div className="h-[600px] rounded-xl border border-slate-200 bg-white overflow-hidden shadow-inner">
          <ContractorChainGraph
            suggestions={suggestions}
            savedChainNodes={savedChainNodes}
            dbPackages={dbPackages}
          />
        </div>
      ) : (
        <ResearchSuggestionsPanel suggestions={suggestions} showWeakDefault={showWeakDefault} />
      )}
    </div>
  );
}
