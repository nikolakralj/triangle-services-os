"use client";

import Link from "next/link";
import { ArrowUpRight, Compass } from "lucide-react";
import { openAsk } from "@/components/missions/ask-launcher";

/**
 * Replaces the retired project Research Agent chat. Research is a Scout
 * mission or an Ask from the case; suggestions still land here and on
 * Approvals. Nothing is handed out from Settings → Team (DEV-012).
 */
export function ResearchPathPointer({ projectName }: { projectName?: string }) {
  const askText = projectName
    ? `Research the contractor chain and buyer route for ${projectName}.`
    : "Research the contractor chain and buyer route for this project.";

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Compass className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            Research is a Scout mission, not a chat on this page
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Hand this signal to Scout with Ask, or start a mission from
            Missions. Pending suggestions stay in Inbox below and on Approvals
            — accept them there onto the contractor chain.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openAsk({ text: askText })}
              className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Start a Scout mission
            </button>
            <Link
              href="/missions"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Missions
              <ArrowUpRight className="h-3 w-3" />
            </Link>
            <Link
              href="/approvals"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Approvals
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
