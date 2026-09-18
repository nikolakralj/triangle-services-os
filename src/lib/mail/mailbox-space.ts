// ---------------------------------------------------------------------------
// Personal mailbox vs the common shared space (DEV-020).
//
// Each person sees mail that arrived in their connected inbox. A lead stays
// private to that mailbox's owner until they put it in the shared space.
// Colleagues, Bob's automatic wake, cron follow-up sweeps, and the next-move
// banner for anyone else do not see it until then.
//
// Sending is a separate opt-in on the mailbox (DEV-013): a message leaves
// from the address that person owns, and only if they turned sending on.
// This module does not send.
//
// Pure: the database read and the Share write live in the data layer.
// ---------------------------------------------------------------------------

export type MailSpace = "mine" | "shared";

export interface LeadSpace {
  /**
   * When the lead entered the shared space.
   * - string: shared
   * - null: personal (migration 051 is applied)
   * - undefined: column not in the row (pre-051) — read as already shared so
   *   the live pipeline does not vanish before the backfill runs
   */
  sharedAt: string | null | undefined;
  /** Owner of the mailbox the mail arrived through. Null = unowned org mailbox. */
  mailboxOwnerUserId: string | null;
  mailAccountId?: string | null;
}

/** Already in the common space, or predates the personal/shared split. */
export function isInSharedSpace(sharedAt: string | null | undefined): boolean {
  return sharedAt !== null;
}

/**
 * Who may see this lead.
 *
 * `viewerUserId` null is a machine or cron: shared (and unowned) only.
 * An unowned mailbox is treated as org-visible so a connected inbox without
 * an owner does not disappear.
 */
export function canViewLead(space: LeadSpace, viewerUserId: string | null): boolean {
  if (isInSharedSpace(space.sharedAt)) return true;
  if (!space.mailboxOwnerUserId) return true;
  if (!viewerUserId) return false;
  return space.mailboxOwnerUserId === viewerUserId;
}

/** The mailbox owner may put an unshared personal lead into the common space. */
export function canShareLead(space: LeadSpace, viewerUserId: string): boolean {
  if (!viewerUserId) return false;
  if (isInSharedSpace(space.sharedAt)) return false;
  if (!space.mailboxOwnerUserId) return false;
  return space.mailboxOwnerUserId === viewerUserId;
}

/** Unshared mail that arrived in this person's mailbox. */
export function isPersonalUnshared(space: LeadSpace, viewerUserId: string): boolean {
  if (!viewerUserId) return false;
  if (isInSharedSpace(space.sharedAt)) return false;
  return space.mailboxOwnerUserId === viewerUserId;
}

/**
 * Bob may wake on ingest only when the org can already see the lead.
 * A personal unshared arrival stays quiet until a person shares it.
 */
export function shouldWakeOnIngest(space: LeadSpace): boolean {
  return isInSharedSpace(space.sharedAt) || !space.mailboxOwnerUserId;
}

export const SHARE_NOT_YOURS =
  "Only the person whose mailbox received this mail can put it in the shared space.";

export const SHARE_ALREADY =
  "This is already in the shared space.";

export const SHARE_NEEDS_MIGRATION =
  "Sharing needs migration 051 on this database.";
