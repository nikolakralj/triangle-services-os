// Email body cleaning. Pure functions, no server imports.
//
// Why this exists: real agency mail is ~95% signature markup. A single
// g2 Recruitment thread measured 53,259 characters, of which the actual
// job spec was roughly 600. Sending raw bodies to the model multiplies
// the token bill by ~80x for zero gain, so cleaning happens BEFORE the
// LLM, never after.

/** Hard cap on what we hand to the model, after cleaning. */
const MAX_CLEAN_CHARS = 6000;

/**
 * Lines at/after which the rest of the message is signature or boilerplate.
 * Matched case-insensitively against a trimmed line.
 */
const SIGNATURE_CUTOFFS: RegExp[] = [
  /^--\s*$/,
  /^confidentiality notice/i,
  /^this e-?mail (and its attachment|is intended)/i,
  /^to find details of how .* process and hold data/i,
  /^to stop receiving emails from us/i,
  /^all and any business undertaken by/i,
  /^registered (office|number|in england)/i,
  /^sent from my (iphone|ipad|android|samsung)/i,
  /^this text is used to prevent multiple signatures/i,
  /^(kind|best) regards,?\s*$/i,
  /^unsubscribe\b/i,
];

/** Whole lines that are pure noise wherever they appear. */
const NOISE_LINE: RegExp[] = [
  /^[\s.\-_=*~•·]+$/,          // rule / bullet-only lines
  /^\s*(e|w|a|t|m|p):\s*\S*$/i, // signature contact rows: "e: x@y.com"
  /^https?:\/\/\S+$/i,          // bare URLs on their own line
  /^linkedin$/i,
  /^\|+$/,
];

/**
 * Strip HTML to plain text without a DOM. Order matters: kill non-content
 * elements wholesale first, then convert structure, then drop remaining tags.
 */
export function htmlToText(html: string): string {
  let s = html;

  // Remove elements whose content is never body copy.
  s = s.replace(/<(script|style|head|noscript)[\s\S]*?<\/\1>/gi, " ");
  // Tracking pixels and images carry no text.
  s = s.replace(/<img[^>]*>/gi, " ");
  // Comments (incl. Outlook conditionals).
  s = s.replace(/<!--[\s\S]*?-->/g, " ");

  // Preserve block structure as newlines before dropping tags.
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|tr|li|h[1-6]|table)\s*>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "\n- ");

  // Everything else goes.
  s = s.replace(/<[^>]+>/g, " ");

  return decodeEntities(s);
}

function decodeEntities(input: string): string {
  const named: Record<string, string> = {
    nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
    middot: "·", bull: "•", ndash: "–", mdash: "—", hellip: "…",
    rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", euro: "€", pound: "£",
  };
  return input
    .replace(/&([a-z]+);/gi, (m, name: string) => named[name.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_m, code: string) =>
      String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) =>
      String.fromCodePoint(parseInt(code, 16)));
}

/** Drop the signature/boilerplate tail and per-line noise. */
export function stripSignature(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (SIGNATURE_CUTOFFS.some((re) => re.test(line))) break;
    if (line.length === 0) { kept.push(""); continue; }
    if (NOISE_LINE.some((re) => re.test(line))) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

/** Collapse runs of blank lines and stray whitespace. */
function collapse(text: string): string {
  return text
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── cheap envelope noise filter ─────────────────────────────────────────────
//
// Runs on sender/subject alone, before any body handling or LLM call. These
// are infrastructure senders that are never a human recruiter writing about a
// real project. The model still classifies everything that gets past this —
// the filter only has to be *safe*, not clever.
//
// Shared by both intake paths: the IMAP fetcher (skips the body download) and
// /api/job-intake/ingest (skips the LLM call when a deliberately-dumb bot
// forwards its whole inbox — see JOB_INTAKE.md, "Make Bob dumber").

const NOISE_SENDER = [
  /@.*\.linkedin\.com$/i,
  /noreply@.*linkedin\.com$/i,
  /@builtin\.com$/i,
  /@indeed(mail)?\.com$/i,
  /@.*\.glassdoor\.com$/i,
  /@substack\.com$/i,
  /@udemy(mail)?\.com$/i,
  /@.*\.harvard\.edu$/i,
  /@.*mygreatlearning\.com$/i,
  /@freecodecamp\.org$/i,
  /^(no-?reply|donotreply|mailer-daemon|bounce|notifications?)@/i,
];

const NOISE_SUBJECT = [
  /is popular in your network/i,
  /your (job )?application (to|was)/i,
  /new .* job matches/i,
  /job alert/i,
  /^re-?engage|unsubscribe/i,
];

export function isObviousNoiseHeader(
  fromAddress: string | null | undefined,
  subject: string | null | undefined,
): boolean {
  if (fromAddress && NOISE_SENDER.some((re) => re.test(fromAddress))) return true;
  if (subject && NOISE_SUBJECT.some((re) => re.test(subject))) return true;
  return false;
}

export interface CleanedEmail {
  text: string;
  originalLength: number;
  cleanedLength: number;
  /** Fraction of the original that was discarded, 0–1. */
  reduction: number;
  truncated: boolean;
}

/**
 * Full pipeline: HTML (or plaintext) in, model-ready text out.
 * Pass the plaintext body when the provider gives one; otherwise the HTML.
 */
export function cleanEmailBody(body: string, isHtml = true): CleanedEmail {
  const originalLength = body.length;
  const asText = isHtml ? htmlToText(body) : body;
  let text = collapse(stripSignature(asText));

  const truncated = text.length > MAX_CLEAN_CHARS;
  if (truncated) text = text.slice(0, MAX_CLEAN_CHARS);

  return {
    text,
    originalLength,
    cleanedLength: text.length,
    reduction: originalLength > 0 ? 1 - text.length / originalLength : 0,
    truncated,
  };
}
