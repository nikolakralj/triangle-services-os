"use client";

import { createContext, useContext } from "react";
import type { InProgressWait } from "@/lib/data/today-handoff";

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
  announceHanded: (thread: ThreadTarget) => void;
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
