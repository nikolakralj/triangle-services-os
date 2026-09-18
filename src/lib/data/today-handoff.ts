import { isBobRole } from "@/lib/data/ask-bob-policy";
import { PUT_FORWARD_CASE_TYPE } from "@/lib/data/put-forward";

// Client-safe: match a Today card to an open assignment so the same
// company / person / requirement can show "With Bob" anywhere. Handoff
// changes the owner of the work; it does not change where the work lives.

export interface HandoffIds {
  leadId?: string | null;
  contactId?: string | null;
  personId?: string | null;
}

/**
 * Enough of a case to hand its resourcing half to somebody else without
 * leaving it. Carried by the thread drawer so "ask Hanna for the bio", typed
 * in Bob's thread, can become a real job on this same case.
 */
export interface CaseRef extends HandoffIds {
  who: string;
  about?: string | null;
  companyId?: string | null;
  missionId?: string | null;
}

export interface InProgressWait {
  assignmentId: string;
  title: string;
  agentName: string;
  agentEmoji: string;
  roleKey: string;
  withLabel: string;
  status: "queued" | "active";
  leadId: string | null;
  contactId: string | null;
  personId: string | null;
  companyId: string | null;
  missionId: string | null;
  entityIds: string[];
  messageCount: number;
  awaitingAgent: number;
  createdAt: string;
  /** Last thing the employee wrote in the Triangle thread. Not a Grok chat. */
  lastAgentBody: string | null;
  /** `constraints.case_type` — which half of the case this owns. */
  caseType: string | null;
}

/**
 * The waits that own the chase on a case.
 *
 * Who we put forward is the other half, and it has its own place on the card.
 * Without this split, asking Hanna for a bio made the card read "With Hanna",
 * hid Ask Bob, and dropped a follow-up out of Needs you — the handoff eating
 * the case, which is the bug DEV-015 exists to prevent.
 */
export function chaseWaits(waits: InProgressWait[]): InProgressWait[] {
  return waits.filter((wait) => wait.caseType !== PUT_FORWARD_CASE_TYPE);
}

export function withLabelFor(roleKey: string, displayName: string): string {
  const name = displayName.trim();
  const lower = name.toLowerCase();
  if (isBobRole(roleKey) || lower === "bob") return "With Bob";
  if (roleKey === "project_researcher" || lower === "scout") return "With Scout";
  if (roleKey === "hr" || roleKey === "triangle_hr" || lower === "hanna") {
    return "With Hanna";
  }
  return name ? `With ${name}` : "With the team";
}

export function handoffKeys(ids: HandoffIds): string[] {
  return [ids.leadId, ids.contactId, ids.personId].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
}

/** True when this row is the same business situation as the card. */
export function matchesIds(
  row: HandoffIds & { entityIds?: string[] },
  ids: HandoffIds,
): boolean {
  const candidates = handoffKeys(ids);
  if (candidates.length === 0) return false;
  if (row.leadId && candidates.includes(row.leadId)) return true;
  if (row.contactId && candidates.includes(row.contactId)) return true;
  if (row.personId && candidates.includes(row.personId)) return true;
  return (row.entityIds ?? []).some((id) => candidates.includes(id));
}

/** True when this wait is the same business situation as the card. */
export function matchesWait(wait: InProgressWait, ids: HandoffIds): boolean {
  return matchesIds(wait, ids);
}

export function findWait(
  waits: InProgressWait[],
  ids: HandoffIds,
): InProgressWait | null {
  return waits.find((w) => matchesWait(w, ids)) ?? null;
}

/** One wait covering any of several roles on the same person card. */
export function findWaitForAny(
  waits: InProgressWait[],
  idsList: HandoffIds[],
): InProgressWait | null {
  for (const ids of idsList) {
    const found = findWait(waits, ids);
    if (found) return found;
  }
  return null;
}

/** The finished end of the same match: what an employee handed back on this case. */
export function findDone<T extends HandoffIds & { entityIds?: string[] }>(
  items: T[],
  ids: HandoffIds,
): T | null {
  return items.find((item) => matchesIds(item, ids)) ?? null;
}

/** Every row that is the same business situation as any of these ids. */
export function findAllMatching<T extends HandoffIds & { entityIds?: string[] }>(
  items: T[],
  idsList: HandoffIds[],
): T[] {
  return items.filter((item) => idsList.some((ids) => matchesIds(item, ids)));
}

/** Enough of a wait to hand Hanna the same case from In progress Open thread. */
export function caseRefFromWait(wait: InProgressWait, who = wait.title): CaseRef {
  return {
    who,
    about: wait.title,
    leadId: wait.leadId,
    contactId: wait.contactId,
    personId: wait.personId,
    companyId: wait.companyId,
    missionId: wait.missionId,
  };
}
