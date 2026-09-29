// One diagnostics sentence for a connected mailbox.
//
// last_synced_at is the read-through cursor (how far older mail has been
// covered). updated_at is when the last attempt wrote the row. They match
// after a caught-up read. During a catch-up the cursor stays in the past
// while the attempt time moves, which is how "last successful read" stays
// honest without a second column.

export const CATCH_UP_GAP_MS = 15 * 60 * 1000;

export interface MailboxReadInput {
  emailAddress?: string;
  /** last_synced_at */
  readThrough: string | null;
  /** updated_at of the mailbox row */
  lastAttempt: string | null;
  failure: string | null;
  paused?: boolean;
  /** Stable formatting for tests. Defaults to a minute-resolution ISO. */
  format?: (iso: string) => string;
}

function stamp(iso: string | null, format?: (iso: string) => string): string | null {
  if (!iso) return null;
  return format ? format(iso) : iso.slice(0, 16) + "Z";
}

function when(iso: string | null, format?: (iso: string) => string): string {
  return stamp(iso, format) ?? "never";
}

function gapMs(later: string | null, earlier: string | null): number | null {
  if (!later || !earlier) return null;
  const a = Date.parse(later);
  const b = Date.parse(earlier);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a - b;
}

export function mailboxReadSentence(input: MailboxReadInput): string {
  const prefix = input.emailAddress ? `${input.emailAddress} — ` : "";
  const format = input.format;

  if (input.paused) {
    return `${prefix}Paused. Last successful read ${when(input.readThrough, format)}.`;
  }

  if (input.failure) {
    return `${prefix}Last check failed: ${input.failure} Last successful read ${when(input.readThrough, format)}.`;
  }

  if (!input.readThrough) {
    return `${prefix}No successful read yet.`;
  }

  const behind = gapMs(input.lastAttempt, input.readThrough);
  if (behind !== null && behind > CATCH_UP_GAP_MS) {
    const attempt = stamp(input.lastAttempt, format) ?? stamp(input.readThrough, format);
    return `${prefix}Last successful read ${attempt}. Still reading older mail, through ${when(input.readThrough, format)}.`;
  }

  const recent = stamp(input.lastAttempt, format) ?? stamp(input.readThrough, format);
  return `${prefix}Last successful read ${recent}.`;
}
