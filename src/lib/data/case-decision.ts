import type { PackIntent } from "@/lib/data/put-forward";

// ---------------------------------------------------------------------------
// The team's decision on a case, in words a person reads.
//
// "Employees, not buttons" (18 September): the card shows what the team
// decided and why, not the machinery behind it. These helpers are pure and
// client-safe: they turn an employee's report into its opening lines without
// ids, and say which form a document goes out in and why.
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** "Drive 1_wpvuPFgKcSsCaP7KBxnGP7GnQcoPmhs" and bare Drive file ids. */
const DRIVE_REF = /\bDrive\s+[A-Za-z0-9_-]{20,}/g;
const DRIVE_ID = /\b1[A-Za-z0-9_-]{24,}\b/g;
/** "Thread 1a0ae1c9394c47a0" keeps the word, loses the id. */
const THREAD_ID = /\b([Tt]hread)\s+[0-9a-f]{12,}\b/g;
const ISO_TIME = /\b(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?Z\b/g;

/**
 * An employee's report without the machinery: no uuids, no Drive or thread
 * ids, dates a person reads, no markdown marks. The ids stay in the thread,
 * where Evidence belongs.
 */
export function humaniseReport(text: string | null | undefined): string {
  let out = (text ?? "").replace(/\r\n/g, "\n");
  out = out.replace(ISO_TIME, (_m, _y, mo, d, h, mi) => `${Number(d)} ${MONTHS[Number(mo) - 1] ?? mo} ${h}:${mi}`);
  out = out.replace(DRIVE_REF, "").replace(DRIVE_ID, "");
  out = out.replace(THREAD_ID, "$1").replace(UUID, "");
  // "(worker )" and "(lead )" are what an id leaves behind in its brackets.
  out = out.replace(/\s*\((?:worker|lead|assignment|contact|person|mission|case|id)\s*\)/gi, "");
  out = out.replace(/\*\*/g, "").replace(/^#{1,6}\s+/gm, "");
  // What removing ids leaves behind: "(… · lead )", "( , )", doubled spaces.
  out = out
    .replace(/\s*·\s*lead\s*(?=\))/gi, "")
    .replace(/\(\s*[,·;:]?\s*\)/g, "")
    .replace(/[,;]\s*\)/g, ")")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/[ \t]+,/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "");
  return out.trim();
}

/** Paragraphs that are about the report rather than the decision. */
const NOT_THE_DECISION = /^(status on\b|evidence\b|sources?\b|bob did not send|hanna did not send|i did not send|this ask .* wake arrived)/i;

/**
 * The first lines worth reading: the decision and the one thing a person
 * must do, in at most `max` characters. The rest folds under Read all.
 */
export function reportOpening(text: string | null | undefined, max = 420): string {
  const clean = humaniseReport(text);
  if (!clean) return "";
  const paragraphs = clean
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const kept = paragraphs.filter((p) => !NOT_THE_DECISION.test(p));
  const opening = (kept.length > 0 ? kept : paragraphs).slice(0, 2).join("\n\n");
  if (opening.length <= max) return opening;
  const cut = opening.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"));
  return `${(stop > max * 0.5 ? cut.slice(0, stop + 1) : cut).trim()}…`;
}

/** Which form the document goes out in, and why — one sentence. */
export function formSentence(intent: PackIntent, agency: string | null | undefined): string {
  if (intent === "full_cv") {
    return "As the full named CV — a person released the name.";
  }
  if (intent === "short_bio") {
    return "As a short anonymised bio, one screen — initials only, as asked.";
  }
  const who = agency?.trim();
  return who
    ? `As an anonymised bio — ${who} is an agency, so the name stays with us until there is an engagement.`
    : "As an anonymised bio — the name is released only when there is an engagement.";
}

/** "Anna Horvat, Luka Babić and 3 more" — the others who fit, as words, not controls. */
export function othersSentence(names: string[], shown = 3): string {
  const list = names.filter((n) => n.trim());
  if (list.length === 0) return "";
  const head = list.slice(0, shown);
  const more = list.length - head.length;
  const joined =
    head.length === 1
      ? head[0]
      : more > 0
        ? head.join(", ")
        : `${head.slice(0, -1).join(", ")} and ${head[head.length - 1]}`;
  return more > 0 ? `${joined} and ${more} more` : joined;
}
