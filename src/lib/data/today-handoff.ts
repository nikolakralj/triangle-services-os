import { isBobRole } from "@/lib/data/ask-bob-policy";

// Client-safe: match a Today card to an open assignment so the same
// company / person / requirement can show "With Bob" anywhere. Handoff
// changes the owner of the work; it does not change where the work lives.

export interface HandoffIds {
  leadId?: string | null;
  contactId?: string | null;
  personId?: string | null;
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

function idsOf(ids: HandoffIds): string[] {
  return [ids.leadId, ids.contactId, ids.personId].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
}

/** True when this wait is the same business situation as the card. */
export function matchesWait(wait: InProgressWait, ids: HandoffIds): boolean {
  const candidates = idsOf(ids);
  if (candidates.length === 0) return false;
  if (wait.leadId && candidates.includes(wait.leadId)) return true;
  if (wait.contactId && candidates.includes(wait.contactId)) return true;
  if (wait.personId && candidates.includes(wait.personId)) return true;
  return wait.entityIds.some((id) => candidates.includes(id));
}

export function findWait(
  waits: InProgressWait[],
  ids: HandoffIds,
): InProgressWait | null {
  return waits.find((w) => matchesWait(w, ids)) ?? null;
}
