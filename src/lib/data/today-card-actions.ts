// Client-safe: what a Today email card may ask a human to do.
//
// Machines observe sent / replied / follow-up due from the connected mailbox
// (DEV-019). The primary rail is Open mail, Ask Bob, and a scoped Dismiss —
// not a row of "report what happened" buttons. Recorded outside Triangle
// remains under Dismiss when the mailbox has not caught up.

export const EMAIL_DISMISS_REASONS = [
  "not_now",
  "not_this_opportunity",
  "wrong_person",
  "dont_contact",
  "recorded_outside",
] as const;

export type EmailDismissReason = (typeof EMAIL_DISMISS_REASONS)[number];

export const EMAIL_DISMISS_OPTIONS: Array<{
  reason: EmailDismissReason;
  label: string;
  hint: string;
}> = [
  {
    reason: "not_now",
    label: "Not now",
    hint: "Look again in a few days. Nothing is recorded as sent.",
  },
  {
    reason: "not_this_opportunity",
    label: "Not this opportunity",
    hint: "This lead or door is not for us. Not a forever ban.",
  },
  {
    reason: "wrong_person",
    label: "Wrong person",
    hint: "This contact is off Today. The opportunity can stay.",
  },
  {
    reason: "dont_contact",
    label: "Don't contact",
    hint: "Don't contact them on this opportunity. Not a blacklist.",
  },
];

export const EMAIL_DISMISS_ADVANCED: Array<{
  reason: EmailDismissReason;
  label: string;
  hint: string;
}> = [
  {
    reason: "recorded_outside",
    label: "Recorded outside Triangle",
    hint: "You already handled this in the mailbox. Today will stop asking.",
  },
];

export function isEmailDismissReason(value: string): value is EmailDismissReason {
  return (EMAIL_DISMISS_REASONS as readonly string[]).includes(value);
}

export function dismissSentence(reason: EmailDismissReason): string {
  switch (reason) {
    case "not_now":
      return "Looking again in four days";
    case "not_this_opportunity":
      return "Not this opportunity";
    case "wrong_person":
      return "Wrong person";
    case "dont_contact":
      return "Don't contact on this opportunity";
    case "recorded_outside":
      return "Handled outside Triangle";
  }
}
