"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import type { MissionTab } from "@/lib/data/mission-shared";
import { MissionMark, StateGlyph } from "@/components/missions/mission-state";
import { openAsk } from "@/components/missions/ask-launcher";

// ---------------------------------------------------------------------------
// The tab strip. One tab per objective, never one per question.
//
//   [ DE EPC Germany ● ] [ 👷 PCS7 engineers ◐ ] [ AT Siemens Vienna ✓ ] [+]
//
// Tabs keep the order they were opened in, like a browser's. A tab that moved
// every time its worker finished would be somewhere else each time you
// reached for it. Closing a tab closes the mission; its records stay.
// ---------------------------------------------------------------------------

export function MissionTabs({
  tabs,
  activeId,
  canWrite,
}: {
  tabs: MissionTab[];
  activeId: string | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [closing, setClosing] = useState<string | null>(null);

  async function close(id: string) {
    setClosing(id);
    try {
      await fetch(`/api/missions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close" }),
      });
    } catch {
      // The tab stays; nothing was closed.
    }
    setClosing(null);
    if (id === activeId) {
      const rest = tabs.filter((t) => t.id !== id);
      router.push(rest.length > 0 ? `/missions/${rest[rest.length - 1].id}` : "/missions");
    }
    router.refresh();
  }

  return (
    <div className="flex items-end gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100/80 px-3 pt-2">
      <Link
        href="/missions"
        className={`mb-1.5 mr-1 shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
          activeId === null ? "text-slate-900" : "text-slate-500 hover:text-slate-900"
        }`}
      >
        Missions
      </Link>

      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <div
            key={t.id}
            className={`group relative -mb-px flex h-9 min-w-[150px] max-w-[240px] shrink-0 items-center rounded-t-lg border text-[13px] transition ${
              active
                ? "border-slate-200 border-b-white bg-white text-slate-900"
                : "border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"
            }`}
          >
            <Link
              href={`/missions/${t.id}`}
              title={t.reason ? `${t.title} — ${t.reason}` : t.title}
              className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-3 pr-1"
            >
              <MissionMark emoji={t.emoji} size="sm" />
              <span className={`truncate ${active ? "font-semibold" : "font-medium"}`}>{t.title}</span>
              <StateGlyph state={t.state} className="ml-auto" />
            </Link>
            {canWrite && (
              <button
                type="button"
                aria-label={`Close ${t.title}`}
                onClick={() => void close(t.id)}
                className={`mr-1.5 rounded p-0.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 focus-visible:opacity-100 ${
                  active ? "" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                {closing === t.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        );
      })}

      {canWrite && (
        <button
          type="button"
          onClick={() => openAsk({})}
          aria-label="Start a mission"
          title="Start a mission"
          className="mb-1 ml-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-white hover:text-slate-900"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
