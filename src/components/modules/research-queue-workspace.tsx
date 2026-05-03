"use client";

import { useMemo, useState } from "react";
import { MessageSquare, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResearchRunRow, ResearchSuggestionRow } from "@/lib/data/research";
import { ResearchSuggestionsPanel } from "@/components/modules/research-suggestions-panel";
import { ResearchChatPanel } from "@/components/modules/research-chat-panel";
import { ContractorChainGraph } from "@/components/modules/contractor-chain-graph";
import type { ContractorChainNodeRow } from "@/lib/data/contractor-chain";
import type { ProjectPackageRow } from "@/lib/data/project-packages";

type ViewMode = "queue" | "overview" | "graph";

function runStatusLabel(run: ResearchRunRow | null) {
  if (!run) return "No run yet";
  return `${run.status} - ${new Date(run.started_at).toLocaleString()}`;
}

export function ResearchQueueWorkspace({
  projectId,
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
  const [chatOpen, setChatOpen] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="sticky top-2 z-10 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setChatOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5 text-sky-600" />
            {chatOpen ? "Close Research Chat" : "Open Research Chat"}
          </button>
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
                window.location.reload(); // Simple reload to trigger server component refresh
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

      {lastError ? (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <XCircle className="h-3.5 w-3.5" />
          {lastError}
        </div>
      ) : null}

      {chatOpen ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <ResearchChatPanel projectId={projectId} compact onError={setLastError} />
        </div>
      ) : null}

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
