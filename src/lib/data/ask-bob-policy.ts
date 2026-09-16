// Client-safe Bob follow-through rules. DEV-004 is the gate; the API
// refuses honestly when it is closed. No database here so the check can
// load this without mocking Supabase.

export const BOB_ROLE_KEYS = new Set([
  "inbox_coordinator",
  "inbox_courier",
  "commercial_ops",
]);

export const MISSION_WORK_SCOPE = "mission.work";

export interface AskBobContext {
  instruction: string;
  who?: string | null;
  about?: string | null;
  leadId?: string | null;
  contactId?: string | null;
  personId?: string | null;
  missionId?: string | null;
  channelKind?: string | null;
  value?: string | null;
}

export function isBobEmployee(employee: { roleKey: string; displayName: string }): boolean {
  const name = employee.displayName.trim().toLowerCase();
  return BOB_ROLE_KEYS.has(employee.roleKey) || name === "bob";
}

/**
 * Why Bob cannot take this Today card. Null when he can.
 *
 * DEV-004 is two things: a mission scope on the badge, and a bot wake-up
 * routine. Either missing is an honest stop, not a silent queue.
 */
export function bobFollowThroughBlockedReason(params: {
  bob: { id: string; name: string } | null;
  scopes: readonly string[];
  runtime: "bot" | "in_app";
}): string | null {
  if (!params.bob) {
    return "Nobody named Bob is on the workforce.";
  }
  const mayWork =
    params.scopes.includes(MISSION_WORK_SCOPE) || params.scopes.includes("admin");
  if (!mayWork) {
    return "Bob can't take mission work until his badge has a mission scope (DEV-004).";
  }
  if (params.runtime !== "bot") {
    return "Bob can't take mission work until his wake-up routine is on (DEV-004).";
  }
  return null;
}

export function askBobTitle(instruction: string, who?: string | null): string {
  const first = instruction.split("\n")[0]?.trim() || "";
  if (first) return first.slice(0, 120);
  return who ? `Follow up with ${who}`.slice(0, 120) : "Today follow-up";
}

export function askBobObjective(params: AskBobContext): string {
  const lines = [
    params.instruction.trim(),
    "",
    "Context from the Today card (ids only — Triangle is truth):",
    params.who ? `Person: ${params.who}` : null,
    params.about ? `About: ${params.about}` : null,
    params.leadId ? `leadId: ${params.leadId}` : null,
    params.contactId ? `contactId: ${params.contactId}` : null,
    params.personId ? `personId: ${params.personId}` : null,
    params.missionId ? `missionId: ${params.missionId}` : null,
    params.channelKind && params.value
      ? `Channel: ${params.channelKind} ${params.value}`
      : params.channelKind
        ? `Channel: ${params.channelKind}`
        : null,
    "",
    "Draft the next commercial move. Do not send anything. Report what needs a human decision.",
  ];
  return lines.filter((line) => line !== null).join("\n").slice(0, 8_000);
}
