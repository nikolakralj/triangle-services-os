// ---------------------------------------------------------------------------
// Which external communication an employee may send on its own.
//
// Today every class is approval-required: an employee drafts, a person sends.
// That is a setting, not a law of the architecture. The CEO may later let
// Hanna confirm an interview or ask for an updated CV on her own, while cold
// client outreach stays behind approval — without rebuilding anything.
//
// Two limits hold whatever is configured:
//   - a commitment (a rate, a date, a headcount, a contract) is never an
//     employee's to make;
//   - "auto" only takes effect once Triangle records what was sent. Until that
//     exists, an "auto" class is treated as approval-required and says why.
// ---------------------------------------------------------------------------

export type CommunicationMode = "auto" | "approval" | "forbidden";

export const COMMUNICATION_CLASSES = {
  candidate_availability_check: "Asking someone in the pool whether they are available",
  candidate_cv_request: "Asking a candidate for an updated CV or a certificate",
  interview_confirmation: "Confirming or moving an interview a person already agreed",
  client_reply: "Replying in a conversation a client started",
  client_first_contact: "First contact with a buyer or company",
  follow_up: "Following up on a message a person sent",
  price_or_rate: "Naming a price, a rate or a margin",
  commitment: "Committing a date, a headcount, a contract or terms",
} as const;

export type CommunicationClass = keyof typeof COMMUNICATION_CLASSES;

const NEVER_AUTO: ReadonlySet<CommunicationClass> = new Set(["price_or_rate", "commitment"]);

const DEFAULTS: Record<CommunicationClass, CommunicationMode> = {
  candidate_availability_check: "approval",
  candidate_cv_request: "approval",
  interview_confirmation: "approval",
  client_reply: "approval",
  client_first_contact: "approval",
  follow_up: "approval",
  price_or_rate: "forbidden",
  commitment: "forbidden",
};

/** Whether Triangle can record a message an employee sent itself. Not yet. */
export const SENT_MESSAGES_RECORDED = false;

export interface CommunicationPolicy {
  classes: Record<CommunicationClass, { mode: CommunicationMode; means: string; note?: string }>;
  rule: string;
}

function isMode(value: unknown): value is CommunicationMode {
  return value === "auto" || value === "approval" || value === "forbidden";
}

/** The policy in force for one employee, from its config over the defaults. */
export function communicationPolicyFor(config: Record<string, unknown> | null | undefined): CommunicationPolicy {
  const configured = (config?.communication_policy as Record<string, unknown> | undefined) ?? {};
  const classes = {} as CommunicationPolicy["classes"];
  for (const key of Object.keys(COMMUNICATION_CLASSES) as CommunicationClass[]) {
    let mode: CommunicationMode = isMode(configured[key]) ? (configured[key] as CommunicationMode) : DEFAULTS[key];
    let note: string | undefined;
    if (mode === "auto" && NEVER_AUTO.has(key)) {
      mode = "forbidden";
      note = "A commitment is never an employee's to make.";
    } else if (mode === "auto" && !SENT_MESSAGES_RECORDED) {
      mode = "approval";
      note = "Allowed to send on its own once Triangle records sent messages; until then, draft it.";
    }
    classes[key] = { mode, means: COMMUNICATION_CLASSES[key], ...(note ? { note } : {}) };
  }
  return {
    classes,
    rule:
      "approval: write the draft into Triangle (the words on the target, or your reply) and stop — a person sends it. " +
      "forbidden: never, not even as a draft offer. auto: you may send it yourself through an account you legitimately hold, and must record exactly what you sent.",
  };
}
