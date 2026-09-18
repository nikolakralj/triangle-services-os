// ---------------------------------------------------------------------------
// Ask Hanna: who we put forward, on the case that is already open.
//
// Client-safe. No database here, so the offline check can load it without
// mocking Supabase — the same reason `ask-bob-policy.ts` is split out.
//
// The split of labour, written down once:
//
//   Bob    chases the thread. Digs the mail, drafts the reply, lists the
//          decisions only a person can make. Sends nothing.
//   Hanna  says who we put forward, and in which form — the anonymised
//          capability packet or, when a person has decided to release the
//          identity, the full CV. Proposes only; contacts nobody.
//
// Handing the resourcing half to Hanna changes the owner of that half. It does
// not move the work: the answer returns on the same Today case, beside Bob's
// draft, where the human presses Send.
// ---------------------------------------------------------------------------

import {
  packIntentLabel,
  type PackIntent,
} from "@/lib/data/put-forward";

/**
 * Hanna's role keys. `hr` is the hire preset; `triangle_hr` is the badge name
 * the live employee carries. Matching on the display name too is deliberate:
 * an org that renamed the role should not silently lose the handoff.
 */
export const HANNA_ROLE_KEYS = new Set(["hr", "triangle_hr", "resourcing"]);

export const WORKER_PROPOSE_SCOPE = "worker.propose";

export interface AskHannaContext {
  instruction: string;
  intent: PackIntent;
  who?: string | null;
  about?: string | null;
  /** The person to put forward, when a human or Bob already named one. */
  workerId?: string | null;
  workerName?: string | null;
  leadId?: string | null;
  contactId?: string | null;
  personId?: string | null;
  companyId?: string | null;
  missionId?: string | null;
  /** The Bob assignment this was asked from, so the two halves stay joined. */
  fromAssignmentId?: string | null;
}

export function isHannaRole(roleKey: string | null | undefined): boolean {
  return Boolean(roleKey && HANNA_ROLE_KEYS.has(roleKey));
}

export function isHannaEmployee(employee: {
  roleKey: string;
  displayName: string;
}): boolean {
  return (
    isHannaRole(employee.roleKey) ||
    employee.displayName.trim().toLowerCase() === "hanna"
  );
}

/**
 * Why Hanna cannot take this case. Null when she can.
 *
 * Narrower than Bob's gate on purpose. Bob's chase is worthless unless his
 * bot actually runs, so DEV-004 refuses without a wake-up routine. Hanna's
 * half is not: Triangle builds the packet itself from the worker record, so
 * the human has something to send the moment the case is hers. What her
 * runtime decides is when her *check* of those facts arrives, and the case
 * says so in words rather than leaving a row nobody picks up.
 */
export function hannaPutForwardBlockedReason(params: {
  hanna: { id: string; name: string } | null;
  scopes: readonly string[];
}): string | null {
  if (!params.hanna) {
    return "Nobody named Hanna is on the workforce. Hire resourcing in Settings → Team.";
  }
  const mayPropose =
    params.scopes.includes(WORKER_PROPOSE_SCOPE) || params.scopes.includes("admin");
  if (!mayPropose) {
    return `${params.hanna.name} can't propose who we put forward until her badge has ${WORKER_PROPOSE_SCOPE}.`;
  }
  return null;
}

/**
 * What the case says while Hanna has it. Honest about pickup: a wake that was
 * not configured is not a wake, and pretending otherwise is how "queued"
 * became a black hole.
 */
export function hannaPickupNotice(params: {
  hannaName: string;
  runtime: "bot" | "in_app";
  wake: { status: "sent" | "failed" | "not_configured" } | null;
}): string {
  const who = params.hannaName;
  if (params.runtime !== "bot") {
    return `${who} has it. Her runtime is in-app, so her check arrives on her next run — the packet below is Triangle's own record and is ready now.`;
  }
  switch (params.wake?.status) {
    case "sent":
      return `${who} was woken. Her answer returns on this case.`;
    case "failed":
      return `${who} has it. Her wake-up webhook did not answer, so she picks it up at her next scheduled check.`;
    default:
      return `${who} has it. No wake-up webhook is set for her, so she picks it up at her next scheduled check.`;
  }
}

export function askHannaTitle(params: {
  intent: PackIntent;
  workerName?: string | null;
  who?: string | null;
}): string {
  const form = params.intent === "full_cv" ? "Full CV" : "Bio";
  const subject = params.workerName?.trim() || "who we put forward";
  const to = params.who?.trim() ? ` for ${params.who.trim()}` : "";
  return `${form}: ${subject}${to}`.slice(0, 120);
}

export function askHannaObjective(params: AskHannaContext): string {
  const bio = params.intent !== "full_cv";
  const lines = [
    params.instruction.trim(),
    "",
    `What was asked for: ${packIntentLabel(params.intent)}.`,
    bio
      ? "Initials only. No name, no contact details, no rate. The filename is the Triangle reference, never the person's name."
      : "A person has released the identity for this one. The named CV is the deliverable; it still carries no rate.",
    "",
    "Context from the Today case (ids only — Triangle is truth):",
    params.who ? `Asked by / for: ${params.who}` : null,
    params.about ? `About: ${params.about}` : null,
    params.workerName ? `Person named in the ask: ${params.workerName}` : null,
    params.workerId ? `workerId: ${params.workerId}` : null,
    params.leadId ? `leadId: ${params.leadId}` : null,
    params.contactId ? `contactId: ${params.contactId}` : null,
    params.personId ? `personId: ${params.personId}` : null,
    params.companyId ? `companyId: ${params.companyId}` : null,
    params.missionId ? `missionId: ${params.missionId}` : null,
    params.fromAssignmentId
      ? `Asked from the commercial thread on this case: ${params.fromAssignmentId}`
      : null,
    "",
    params.workerId
      ? "Check the three things that decide whether this person is sellable: right to work for that country, tickets valid there, and language on that site. Name what is not recorded rather than leaving it out."
      : "Nobody is bound to this case yet. Name candidates from the pool with your reasons, and say what is missing on each. Do not invent a person.",
    "Availability counts only while a human has confirmed it inside 14 days. Say the date and say it is unconfirmed when it is.",
    "",
    "Triangle generates the document itself from the worker record; your part is whether the facts behind it are true. Propose only — do not create or accept a worker, and never contact the candidate.",
    "Finish with { assignmentId, result }. This is not a research finding: do not file reachable / one_thing_missing / dead.",
  ];
  return lines.filter((line) => line !== null).join("\n").slice(0, 8_000);
}

export function askHannaExpectedOutput(intent: PackIntent): string {
  return intent === "full_cv"
    ? "Who to put forward and whether the named CV is safe to release: right to work, tickets, language, dated availability, and what is not recorded. Do not send it."
    : "Who to put forward as an anonymised profile — initials only — with right to work, tickets, language, dated availability, and what is not recorded. Do not send it.";
}
