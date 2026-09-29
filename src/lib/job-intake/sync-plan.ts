// Which messages a mailbox read takes, and how far the cursor may move.
//
// Pure on purpose: the IMAP session and the database stay outside this, so
// the rules can be checked without a mailbox or a secret.
//
// Two budgets, every run:
//   - fresh: mail from the last few minutes, newest first, so a message
//     that just arrived is in Triangle within the next read even while an
//     older gap is still draining;
//   - backlog: the oldest mail not yet stored, so a gap is walked forward
//     and never skipped.
//
// The cursor advances to "now" only when the gap fits in the backlog budget.
// Otherwise it advances to the newest message of the oldest chunk we took.
// A message-level failure does not move the cursor (the next read retries
// it). New mail still arrives, because the fresh budget does not wait for
// the cursor.

export const FRESH_WINDOW_MS = 20 * 60 * 1000;
export const SCHEDULED_FRESH_LIMIT = 8;
export const SCHEDULED_BACKLOG_LIMIT = 8;
export const MANUAL_FRESH_LIMIT = 20;
export const MANUAL_BACKLOG_LIMIT = 20;

export interface SyncEnvelope {
  id: string;
  /** ISO-8601, or null when the mailbox gave no date. */
  sentAt: string | null;
}

export interface MailboxSyncPlan {
  /** Ids to download and classify, fresh first, then the backlog chunk. */
  ids: string[];
  /** Backlog ids in oldest-first order. The cursor walks this list. */
  backlogIds: string[];
  /** ISO time to store as the read-through cursor when the run is clean. */
  advanceTo: string;
  truncated: boolean;
  sentAtById: Record<string, string | null>;
}

function time(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function planMailboxSync(input: {
  now: string;
  cursor: string;
  envelopes: SyncEnvelope[];
  freshWindowMs?: number;
  freshLimit?: number;
  backlogLimit?: number;
}): MailboxSyncPlan {
  const nowMs = Date.parse(input.now);
  const freshWindowMs = input.freshWindowMs ?? FRESH_WINDOW_MS;
  const freshLimit = input.freshLimit ?? SCHEDULED_FRESH_LIMIT;
  const backlogLimit = input.backlogLimit ?? SCHEDULED_BACKLOG_LIMIT;
  const freshCutoff = nowMs - freshWindowMs;

  const rows = input.envelopes.map((envelope) => ({
    ...envelope,
    t: time(envelope.sentAt),
  }));

  const freshAll = rows
    .filter((row) => row.t !== null && row.t >= freshCutoff)
    .sort((a, b) => b.t! - a.t!);
  const fresh = freshAll.slice(0, freshLimit);
  // What did not fit in the fresh budget is still unseen. It joins the
  // backlog instead of being skipped when the cursor moves to now.
  const freshLeftover = freshAll.slice(freshLimit);

  const older = [...rows.filter((row) => row.t === null || row.t < freshCutoff), ...freshLeftover]
    .sort((a, b) => {
      if (a.t === null && b.t === null) return 0;
      if (a.t === null) return -1;
      if (b.t === null) return 1;
      return a.t - b.t;
    });

  const backlog = older.slice(0, backlogLimit);
  const truncated = older.length > backlog.length;

  const sentAtById: Record<string, string | null> = {};
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of [...fresh, ...backlog]) {
    sentAtById[row.id] = row.sentAt;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    ids.push(row.id);
  }

  let advanceTo = input.now;
  if (truncated) {
    const dated = backlog.filter((row) => row.t !== null);
    if (dated.length === 0) {
      // Undated mail only. Leave the cursor where it is so we retry rather
      // than jump past messages we cannot order.
      advanceTo = input.cursor;
    } else {
      const newest = dated.reduce((max, row) => Math.max(max, row.t!), 0);
      advanceTo = new Date(newest).toISOString();
    }
  }

  return {
    ids,
    backlogIds: backlog.map((row) => row.id),
    advanceTo,
    truncated,
    sentAtById,
  };
}

/**
 * Where the read-through cursor goes after a run.
 * Message errors keep the cursor put: the stored rows are already
 * idempotent, and the failed one has to be seen again.
 */
export function nextReadThrough(input: {
  cursor: string;
  plannedAdvance: string;
  hadMessageErrors: boolean;
}): string {
  if (input.hadMessageErrors) return input.cursor;
  return input.plannedAdvance;
}
