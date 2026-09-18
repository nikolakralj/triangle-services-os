"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { X } from "lucide-react";
import { AssignmentThreadDrawer } from "@/components/modules/assignment-thread-drawer";
import {
  handoffKeys,
  type CaseRef,
  type HandoffIds,
  type InProgressWait,
} from "@/lib/data/today-handoff";

export type ThreadTarget = Pick<
  InProgressWait,
  | "assignmentId"
  | "title"
  | "agentName"
  | "messageCount"
  | "awaitingAgent"
> & {
  finished?: boolean;
  /** Everyone the last Ask went to — "Bob and Hanna" — for the toast only. */
  handedTo?: string;
  /**
   * The case this thread belongs to. Carried so the drawer can hand the
   * resourcing half to Hanna without leaving the case — "ask Hanna for a bio"
   * used to be a message Bob could not act on.
   */
  case?: CaseRef;
};

type TodayHandoffApi = {
  openThread: (thread: ThreadTarget) => void;
  /**
   * After Hand to Bob: keep this case on Today as With Bob and open the thread
   * drawer. `ids` pins every role on a grouped person card so it does not
   * vanish into In progress before Open thread is obvious.
   */
  announceHanded: (thread: ThreadTarget, ids?: HandoffIds[]) => void;
  /** True when this case was just handed over and should stay on the card. */
  isPinned: (ids: HandoffIds) => boolean;
};

const TodayHandoffContext = createContext<TodayHandoffApi | null>(null);

/**
 * Owns the Today thread drawer and the Handed-to-Bob toast.
 *
 * Follow-up cards, the hero Reply card, and In progress all open the same
 * right-hand drawer through this provider. Do not mount the drawer only on
 * mission rows and hope follow-ups inherit it.
 */
export function TodayHandoffProvider({ children }: { children: React.ReactNode }) {
  const [thread, setThread] = useState<ThreadTarget | null>(null);
  const [toast, setToast] = useState<ThreadTarget | null>(null);
  const [pinnedKeys, setPinnedKeys] = useState<string[]>([]);

  const value = useMemo<TodayHandoffApi>(
    () => ({
      openThread: (next) => {
        setThread(next);
        setToast(null);
      },
      announceHanded: (next, ids) => {
        setThread(next);
        setToast(next);
        if (ids && ids.length > 0) {
          const extra = ids.flatMap(handoffKeys);
          setPinnedKeys((prev) => Array.from(new Set([...prev, ...extra])));
        }
      },
      isPinned: (ids) => handoffKeys(ids).some((key) => pinnedKeys.includes(key)),
    }),
    [pinnedKeys],
  );

  return (
    <TodayHandoffContext.Provider value={value}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-5 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] shadow-lg shadow-slate-900/10"
        >
          <span>
            {/* Named, because Bob and Hanna now both take cases from Today
                and "Handed to Bob" over a Hanna job is a lie about the owner. */}
            <span className="font-semibold text-slate-900">
              Handed to {toast.handedTo || toast.agentName || "the team"}
            </span>
            {". The answer returns on this case. "}
            <button
              type="button"
              onClick={() => {
                setThread(toast);
                setToast(null);
              }}
              className="font-semibold text-sky-700 hover:text-sky-900"
            >
              Open thread
            </button>
          </span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="rounded p-1 text-slate-400 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <AssignmentThreadDrawer
        key={thread?.assignmentId ?? "closed"}
        thread={thread}
        onClose={() => setThread(null)}
      />
    </TodayHandoffContext.Provider>
  );
}

export function useTodayHandoff(): TodayHandoffApi | null {
  return useContext(TodayHandoffContext);
}
