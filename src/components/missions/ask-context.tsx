"use client";

import { useEffect, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// What the CEO is looking at, so the Ask box can bind work to it (DEV-010).
//
// A record page mounts <AskPageContext/> with the record it shows; the Ask box
// in the top bar reads it. With a record in view, a substantial Ask becomes a
// missionless assignment on that record and the result returns on its case —
// the person stays on the situation instead of being sent to a new Mission.
// Inside a mission, the box defaults to that mission.
//
// A module-level store rather than React context: the top bar and the page
// are siblings under the layout, and a page should not have to thread a
// provider around itself to say what it is.
// ---------------------------------------------------------------------------

export type AskContextType =
  | "job_lead"
  | "requirement"
  | "company"
  | "project"
  | "worker"
  | "contact";

export interface AskRecordContext {
  kind: "record";
  type: AskContextType;
  id: string;
  /** What to call it in the box: "Wienerberger", "Stahlwerk Linz". */
  label: string;
  /** The project this record belongs to, so Scout's work files under it too. */
  projectId?: string | null;
  companyId?: string | null;
}

export interface AskMissionContext {
  kind: "mission";
  missionId: string;
}

export type AskPageContextValue = AskRecordContext | AskMissionContext;

let current: AskPageContextValue | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useAskPageContext(): AskPageContextValue | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

/** Mount on a record or mission page. Clears itself when the page goes. */
export function AskPageContext(props: AskPageContextValue) {
  const key = JSON.stringify(props);
  useEffect(() => {
    const value = JSON.parse(key) as AskPageContextValue;
    current = value;
    emit();
    return () => {
      if (current === value) {
        current = null;
        emit();
      }
    };
  }, [key]);
  return null;
}
