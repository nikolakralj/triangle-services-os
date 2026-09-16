// ---------------------------------------------------------------------------
// Who may press Send in Triangle (DEV-013).
//
// A connected mailbox is for reading. Sending is a second, opt-in permission
// on the mailbox (mail_accounts.can_send), and only the person who owns that
// mailbox may use it: a message from an address is pressed by that address's
// owner, never by a colleague through their inbox and never by an employee
// (agent). This module is plain so the rule can be checked offline.
// ---------------------------------------------------------------------------

export interface SendableMailbox {
  id: string;
  email_address: string;
  owner_user_id?: string | null;
  can_send?: boolean | null;
  status?: string | null;
}

/** The mailbox this person may send from, or null. Preferred address wins if it is theirs. */
export function pickSendableMailbox<T extends SendableMailbox>(
  accounts: T[],
  userId: string,
  preferredId: string | null = null,
): T | null {
  const mine = accounts.filter(
    (a) => a.can_send === true && a.owner_user_id === userId && (a.status ?? "active") === "active",
  );
  if (mine.length === 0) return null;
  if (preferredId) {
    const match = mine.find((a) => a.id === preferredId);
    if (match) return match;
  }
  return mine[0];
}

export const SEND_NOT_ENABLED =
  "Sending from Triangle is off for your mailbox. Turn it on under Settings → Mailboxes, or use Open mail.";

export const SEND_NOT_YOURS = "Only the owner of a mailbox may send from it.";
