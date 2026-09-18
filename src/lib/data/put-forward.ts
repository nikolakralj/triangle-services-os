// ---------------------------------------------------------------------------
// What we put in front of a buyer, and under which name.
//
// Client-safe on purpose: the Today card, the Bob thread drawer, the API route
// and the offline check all read the same rules, so the button a person sees
// and the row the database gets cannot disagree.
//
// Two shapes only:
//
//   bio_anonymised  the capability packet — initials, role, tickets, languages,
//                   right-to-work, dated availability. No name, no contact
//                   details, no rate. The filename is the Triangle reference.
//   full_cv         identity released. A deliberate human choice for a buyer
//                   who has actually committed to something.
//
// Anonymised is the default and stays the default when the wording is mixed.
// "Matej as M.P., not a full named CV" contains the words "full named CV" and
// means the opposite; a parser that read the last marker it found would send
// the name. So a bio marker anywhere wins, every time. The cost of being
// wrong in that direction is a re-ask; the cost of being wrong in the other
// direction is a candidate's identity in a stranger's inbox.
// ---------------------------------------------------------------------------

export type PackIntent = "bio_anonymised" | "full_cv";

export const DEFAULT_PACK_INTENT: PackIntent = "bio_anonymised";

export const PACK_INTENTS: readonly PackIntent[] = ["bio_anonymised", "full_cv"];

/**
 * Who we put forward is resourcing work, not a research finding. Migration
 * 041 reads a missing `case_type` as `open_research` and would then refuse a
 * plain `{ assignmentId, result }` hand-in from Hanna.
 */
export const PUT_FORWARD_CASE_TYPE = "who_we_put_forward";

export const PUT_FORWARD_SOURCE = "today_ask_hanna";

/** Bio wording. Any one of these decides it, wherever it appears. */
const BIO_MARKERS: RegExp[] = [
  /\bbios?\b/,
  /\banonymi[sz]/,
  /\binitials?\b/,
  /\bblind(ed)?\b/,
  /\bno\s+names?\b/,
  /\bwithout\s+(the\s+|his\s+|her\s+|their\s+)?names?\b/,
  /\bnot\s+(the\s+|his\s+|her\s+|their\s+)?(full\s+)?names?\b/,
  /\bcapability\s+(packet|profile|pack)\b/,
  /\bunnamed\b/,
  /\bredact/,
  // "M.P.", "M. P." — the CEO's own shorthand for a person he will not name.
  /\b[A-Za-z]\.\s?[A-Za-z]\.(?!\w)/,
];

/** Identity-released wording. Only read when no bio marker is present. */
const FULL_MARKERS: RegExp[] = [
  /\bfull\s+(named\s+)?cvs?\b/,
  /\bnamed\s+(cvs?|profiles?|packs?)\b/,
  /\bcvs?\s+with\s+(the\s+|his\s+|her\s+|their\s+)?names?\b/,
  /\bwith\s+(the\s+|his\s+|her\s+|their\s+)?full\s+names?\b/,
  /\brelease\s+(the\s+|his\s+|her\s+|their\s+)?(identity|names?)\b/,
  /\bidentity\s+released?\b/,
];

/**
 * What the human asked for, from the words they wrote. Defaults to the
 * anonymised packet — including when they wrote nothing recognisable.
 */
export function parsePackIntent(text: string | null | undefined): PackIntent {
  const lower = (text ?? "").toLowerCase();
  if (!lower.trim()) return DEFAULT_PACK_INTENT;
  if (BIO_MARKERS.some((re) => re.test(lower))) return "bio_anonymised";
  if (FULL_MARKERS.some((re) => re.test(lower))) return "full_cv";
  return DEFAULT_PACK_INTENT;
}

export function isPackIntent(value: unknown): value is PackIntent {
  return value === "bio_anonymised" || value === "full_cv";
}

export function packIntentLabel(intent: PackIntent): string {
  return intent === "full_cv" ? "Full named CV" : "Bio — initials only";
}

/** One line on a card: what Hanna is preparing, in the CEO's words. */
export function packIntentSentence(intent: PackIntent): string {
  return intent === "full_cv"
    ? "Full named CV. Identity released — a person chose that."
    : "Anonymised profile: initials, no contact details, filename is the Triangle reference.";
}

export function packIntentVerb(intent: PackIntent): string {
  return intent === "full_cv" ? "preparing the full CV" : "preparing the bio";
}

// ── the human review gate ───────────────────────────────────────────────────
//
// Nothing about a real person leaves Triangle because a checkbox was already
// ticked. Before this, picking somebody in the Send review turned the attach
// on for you, and the server took the tick on trust: it never looked at the
// case, never checked that anyone had read the document, and built an
// anonymised profile even when the case said a full CV had been asked for.
//
// So the tick is now the last step of a decision, not the decision. A person
// opens the document, approves it on the case, and only then may it be
// attached — and only to the case it was approved on, in the version it was
// approved as.
//
// The approval is recorded in migration 042's review columns, with who and
// when. "acknowledged" there already means "a person read this and agrees",
// kept beside the employee's own claim rather than over it, which is exactly
// what this is.

export const PACK_APPROVED_OUTCOME = "acknowledged";
export const PACK_NOT_USED_OUTCOME = "discarded";

/**
 * `not_checked`  nobody has approved it — it cannot be attached
 * `approved`     a person opened it and approved it
 * `superseded`   approved, then the employee said something after that
 * `not_used`     a person ruled it out, with a reason
 */
export type PackApproval = "not_checked" | "approved" | "superseded" | "not_used";

export function packApprovalOf(params: {
  reviewOutcome: string | null | undefined;
  reviewedAt: string | null | undefined;
  /** When the employee handed her check in. */
  completedAt: string | null | undefined;
}): PackApproval {
  if (params.reviewOutcome === PACK_NOT_USED_OUTCOME) return "not_used";
  if (params.reviewOutcome !== PACK_APPROVED_OUTCOME) return "not_checked";
  // Approving the document Triangle already holds does not have to wait for
  // Hanna. But if she answered afterwards, what was approved is not what the
  // case now says, and a stale approval must not carry an attachment.
  if (
    params.completedAt &&
    params.reviewedAt &&
    params.completedAt > params.reviewedAt
  ) {
    return "superseded";
  }
  return "approved";
}

/** The one state in which a document may ride on a message. */
export function mayAttachPack(approval: PackApproval): boolean {
  return approval === "approved";
}

export const PACK_NOT_APPROVED =
  "Nobody has approved this one for sending. Open it on the case and approve it first.";

export const PACK_SUPERSEDED =
  "This was approved, and then Hanna answered. Read what she said and approve it again before it goes.";

export const PACK_WRONG_CASE =
  "That was approved on a different case. Ask Hanna for one on this case.";

/** What the card says about where the approval stands. */
export function packApprovalSentence(params: {
  approval: PackApproval;
  agentName: string;
  finished: boolean;
  intent: PackIntent;
}): string {
  const what = params.intent === "full_cv" ? "full named CV" : "bio";
  switch (params.approval) {
    case "approved":
      return `Approved. Tick it in the Send review to attach the ${what}.`;
    case "superseded":
      return PACK_SUPERSEDED;
    case "not_used":
      return "Ruled out. It cannot be attached.";
    default:
      return params.finished
        ? `${params.agentName} has checked it. Open it, then approve it — nothing attaches until you do.`
        : `${params.agentName} has not checked the facts yet. You can still open this and approve it; nothing attaches until you do.`;
  }
}

/**
 * What a person is recorded as having approved. Written into `review_note`
 * so the decision survives without a second table, and so "he approved it"
 * can be read back as a sentence months later.
 */
export function packApprovalNote(params: {
  intent: PackIntent;
  who: string;
  filename: string;
  agentName: string;
  finished: boolean;
}): string {
  const what = params.intent === "full_cv" ? "full named CV" : "anonymised bio";
  return `Approved the ${what} for ${params.who} (${params.filename}). ${
    params.finished
      ? `${params.agentName}'s check was in.`
      : `${params.agentName} had not checked the facts yet.`
  }`.slice(0, 1000);
}

/**
 * Does this sentence ask for a person to be put forward? Used to notice that
 * a message typed into Bob's thread is really resourcing work, and offer the
 * handoff instead of letting it sit in his queue.
 */
export function asksForAPutForward(text: string | null | undefined): boolean {
  const lower = (text ?? "").toLowerCase();
  if (!lower.trim()) return false;
  if (/\bhann?a\b/.test(lower)) return true;
  if (/\bwho\s+(we|to)\s+put\s+forward\b/.test(lower)) return true;
  if (/\bput\s+(him|her|them|\w+)\s+forward\b/.test(lower)) return true;
  if (/\b(cvs?|bios?|profiles?|packets?)\b/.test(lower)) return true;
  if (/\bshortlist\b/.test(lower)) return true;
  if (BIO_MARKERS.some((re) => re.test(lower))) return true;
  return false;
}

/**
 * "Matej Pavlović" -> "M. P." The same shape `worker-cv.ts` prints on the
 * document, so a card and the PDF beside it call the person the same thing.
 */
export function initialsOf(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.map((part) => `${part[0].toUpperCase()}.`).join(" ");
}

/**
 * How the case names the person for the intent in force. A bio never shows
 * the name on the card either — the card is read out loud in meetings.
 */
export function packDisplayName(
  fullName: string | null | undefined,
  intent: PackIntent,
): string {
  const name = (fullName ?? "").trim();
  if (!name) return "Nobody picked yet";
  return intent === "full_cv" ? name : initialsOf(name);
}

/** The default instruction the Ask Hanna box opens with. */
export function defaultPutForwardAsk(params: {
  who?: string | null;
  about?: string | null;
  workerName?: string | null;
  intent: PackIntent;
}): string {
  const subject = params.workerName?.trim()
    ? params.intent === "full_cv"
      ? `the full CV for ${params.workerName.trim()}`
      : `the anonymised bio for ${params.workerName.trim()} — initials only`
    : params.intent === "full_cv"
      ? "the full CV for whoever fits"
      : "the anonymised bio for whoever fits — initials only";
  const to = params.who?.trim() ? ` for ${params.who.trim()}` : "";
  const about = params.about?.trim() ? ` about ${params.about.trim()}` : "";
  return `Prepare ${subject}${to}${about}. Say what is not recorded before it goes out.`;
}

/** The file Triangle already holds, shown on the case while Hanna checks it. */
export interface PutForwardPack {
  workerId: string;
  /** "M. P." for a bio, the full name once a person has released identity. */
  displayName: string;
  /** The real name, for the internal card only. Never the outbound filename. */
  workerName: string;
  reference: string;
  filename: string;
  /** The human-only PDF route. Anonymised unless identity was released. */
  href: string;
  role: string;
  basedIn: string | null;
  availability: string;
  certificates: string[];
  languages: string[];
  /** What Triangle does not hold. Stated, because silence reads as a yes. */
  notRecorded: string[];
}

/** Hanna's half of a Today case. Ids match the chase so it stays on the card. */
export interface PutForwardCase {
  assignmentId: string;
  status: "queued" | "active" | "completed" | "failed" | "cancelled";
  finished: boolean;
  agentName: string;
  agentEmoji: string;
  intent: PackIntent;
  intentLabel: string;
  intentSentence: string;
  /** "Hanna is preparing the bio" — the line the card shows while she works. */
  workingLine: string;
  title: string;
  leadId?: string | null;
  contactId?: string | null;
  personId?: string | null;
  entityIds: string[];
  companyId: string | null;
  missionId: string | null;
  fromAssignmentId: string | null;
  messageCount: number;
  awaitingAgent: number;
  hannaSaid: string | null;
  resultSummary: string | null;
  createdAt: string;
  completedAt: string | null;
  pack: PutForwardPack | null;
  nobodyBound: boolean;
  /** Where the human review gate stands. Only `approved` may be attached. */
  approval: PackApproval;
  approvedAt: string | null;
  /** What the person wrote when they approved it or ruled it out. */
  decidedNote: string | null;
}
