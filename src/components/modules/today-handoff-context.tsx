"use client";

import { createContext, useContext } from "react";
import type { HandoffIds, InProgressWait } from "@/lib/data/today-handoff";

export type ThreadTarget = Pick<
  InProgressWait,
  | "assignmentId"
  | "title"
  | "agentName"
  | "messageCount"
  | "awaitingAgent"
> & { finished?: boolean };

type TodayHandoffApi = {
  openThread: (thread: ThreadTarget) => void;
  /**
   * After Ask Bob: keep this case on Today as With Bob and open the thread.
   * `ids` pins every role on a grouped person card so it does not vanish
   * into In progress before Open thread is obvious.
   */
  announceHanded: (thread: ThreadTarget, ids?: HandoffIds[]) => void;
  /** True when this case was just handed over and should stay on the card. */
  isPinned: (ids: HandoffIds) => boolean;
};

const TodayHandoffContext = createContext<TodayHandoffApi | null>(null);

export function TodayHandoffProvider({
  value,
  children,
}: {
  value: TodayHandoffApi;
  children: React.ReactNode;
}) {
  return (
    <TodayHandoffContext.Provider value={value}>{children}</TodayHandoffContext.Provider>
  );
}

export function useTodayHandoff(): TodayHandoffApi | null {
  return useContext(TodayHandoffContext);
}
