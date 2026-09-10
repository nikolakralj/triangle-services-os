"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { ago, type MissionTab } from "@/lib/data/mission-shared";
import { MissionTabs } from "@/components/missions/mission-tabs";
import { MissionMark, StateChip } from "@/components/missions/mission-state";
import { openAsk } from "@/components/missions/ask-launcher";

// ---------------------------------------------------------------------------
// All missions: the open ones as cards, the closed ones filed underneath.
// ---------------------------------------------------------------------------

export function MissionCard({ tab }: { tab: MissionTab }) {
  const tone =
    tab.state === "needs_you"
      ? "text-amber-800"
      : tab.state === "blocked"
        ? "text-rose-700"
        : "text-slate-500";
  return (
    <Link
      href={`/missions/${tab.id}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
    >
      <span className="flex items-start gap-2.5">
        <span className="pt-0.5">
          <MissionMark emoji={tab.emoji} />
        </span>
        <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-slate-900 group-hover:text-slate-950">
          {tab.title}
        </span>
        <StateChip state={tab.state} size="sm" />
      </span>
      <span className={`mt-2 line-clamp-2 text-[12.5px] leading-snug ${tone}`} suppressHydrationWarning>
        {tab.reason ?? `${tab.kind === "recruiting" ? "Recruiting" : "Research"} · updated ${ago(tab.updatedAt)}`}
      </span>
    </Link>
  );
}

export function MissionsIndex({
  tabs,
  closed,
  canWrite,
}: {
  tabs: MissionTab[];
  closed: Array<{ id: string; title: string; emoji: string | null; closedAt: string; objective: string }>;
  canWrite: boolean;
}) {
  return (
    <div className="-mx-4 -mt-4 xl:-mx-5">
      <MissionTabs tabs={tabs} activeId={null} canWrite={canWrite} />
      <div className="px-4 pb-10 pt-6 xl:px-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Missions</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              One objective each. Everything you say inside a mission goes to the same worker, who
              reads what the mission already holds before starting.
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => openAsk({})}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-[13px] font-semibold text-white transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Start a mission
            </button>
          )}
        </div>

        {tabs.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <p className="text-[15px] font-semibold text-slate-900">No open missions</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">
              Give the team an objective — “Find EPC contractors in Germany that buy automation
              labour” — and it becomes a mission you can keep talking to.
            </p>
            {canWrite && (
              <button
                type="button"
                onClick={() => openAsk({})}
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-[13px] font-semibold text-white transition hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
                Start a mission
              </button>
            )}
          </div>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tabs.map((t) => (
              <MissionCard key={t.id} tab={t} />
            ))}
          </div>
        )}

        {closed.length > 0 && (
          <details className="group mt-8">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] text-slate-500 transition hover:text-slate-800">
              <span className="font-mono text-[11px] transition group-open:rotate-90">▸</span>
              <span className="font-medium text-slate-700">{closed.length}</span> closed
            </summary>
            <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {closed.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/missions/${m.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50"
                  >
                    <MissionMark emoji={m.emoji} size="sm" />
                    <span className="text-[14px] font-medium text-slate-800">{m.title}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-500">{m.objective}</span>
                    <span className="shrink-0 text-[12px] text-slate-400" suppressHydrationWarning>
                      closed {ago(m.closedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
