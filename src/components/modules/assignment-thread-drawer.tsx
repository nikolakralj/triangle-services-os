"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, Undo2, X } from "lucide-react";
import { AssignmentThread } from "@/components/modules/assignment-thread";
import type { ThreadTarget } from "@/components/modules/today-handoff-context";
import { AskHannaAction } from "@/components/modules/ask-hanna-action";
import { asksForAPutForward } from "@/lib/data/put-forward";

// Right-side drawer on Today. Open thread stays on the card's page; it does
// not navigate to Workforce / What you handed out. Take back sits here, beside
// what the employee has already done, for work that is still open.
//
// Portaled to document.body so overflow-hidden follow-up lists cannot clip it.

export function AssignmentThreadDrawer({
  thread,
  onClose,
}: {
  thread: ThreadTarget | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!thread) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [thread, onClose]);

  if (!thread || typeof document === "undefined") return null;

  // Hanna already owns this half when the thread is hers; offering to hand it
  // to herself would be the second-chat problem with a new name.
  const caseRef = thread.case ?? null;
  const isHanna = thread.agentName.trim().toLowerCase() === "hanna";

  async function takeBack(assignmentId: string) {
    setTaking(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/assignments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not take it back.");
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setTaking(false);
    }
  }

  return createPortal(
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
              {thread.agentName} · the answer returns on this case
            </p>
            {error && <p className="mt-1 text-[12px] text-rose-600">{error}</p>}
          </div>
          {!thread.finished && (
            <button
              type="button"
              disabled={taking}
              onClick={() => void takeBack(thread.assignmentId)}
              title={`Stop ${thread.agentName} working on this. The thread stays.`}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            >
              {taking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
              Take back
            </button>
          )}
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
            composerHint={(draft) =>
              caseRef && !isHanna && asksForAPutForward(draft) ? (
                <p className="mb-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 text-[12px] leading-snug text-violet-900">
                  That reads like who we put forward, which is Hanna&apos;s half.{" "}
                  {thread.agentName} cannot prepare a bio or a CV. Use Ask Hanna below —
                  it stays on this case.
                </p>
              ) : null
            }
          />
        </div>
        {caseRef && !isHanna && (
          <div className="border-t border-slate-100 px-4 py-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">
              Who we put forward
            </p>
            <AskHannaAction
              caseRef={caseRef}
              fromAssignmentId={thread.assignmentId}
              label="Ask Hanna"
            />
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}
