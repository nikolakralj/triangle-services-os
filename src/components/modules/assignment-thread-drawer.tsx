"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { AssignmentThread } from "@/components/modules/assignment-thread";
import type { ThreadTarget } from "@/components/modules/today-handoff-context";

// Right-side drawer on Today. Open thread stays on the card's page; it does
// not navigate to Workforce / What you handed out.

export function AssignmentThreadDrawer({
  thread,
  onClose,
}: {
  thread: ThreadTarget | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!thread) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [thread, onClose]);

  if (!thread) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close thread"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/30"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="today-thread-title"
        className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl shadow-slate-900/20"
      >
        <header className="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
              Open thread
            </p>
            <h2
              id="today-thread-title"
              className="mt-0.5 text-[14px] font-semibold leading-snug text-slate-900"
            >
              {thread.title}
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {thread.agentName} · stays on this case
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <AssignmentThread
            key={thread.assignmentId}
            assignmentId={thread.assignmentId}
            messageCount={thread.messageCount}
            awaitingAgent={thread.awaitingAgent}
            agentName={thread.agentName}
            finished={thread.finished === true}
            alwaysOpen
          />
        </div>
      </aside>
    </div>
  );
}
