// ---------------------------------------------------------------------------
// Who may send from Triangle.
//
// Connected mailboxes are for ingest by default. Outbound is a separate
// permission on the mailbox, and only the owner of that mailbox may use it.
// A colleague's inbox is never used as a fallback sender.
// ---------------------------------------------------------------------------

export interface SendableMailbox {
  email_address: string;
  owner_user_id?: string | null;
  can_send?: boolean;
}

export function pickSendableMailbox<T extends SendableMailbox>(
  accounts: T[],
  userId: string,
  preferred: string | null,
): T | null {
  const mine = accounts.filter(
    (a) => a.can_send && a.owner_user_id === userId,
  );
  if (mine.length === 0) return null;
  if (preferred) {
    const match = mine.find(
      (a) => a.email_address.toLowerCase() === preferred.toLowerCase(),
    );
    if (match) return match;
  }
  return mine[0];
}

export function userMaySendFromApp(
  accounts: SendableMailbox[],
  userId: string,
): boolean {
  return pickSendableMailbox(accounts, userId, null) !== null;
}

export const SEND_FORBIDDEN =
  "Sending from Triangle is limited to approved mailboxes you own.";
