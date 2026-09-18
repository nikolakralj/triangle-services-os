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
