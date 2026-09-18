import { asksForAPutForward } from "@/lib/data/put-forward";

// ---------------------------------------------------------------------------
// One Ask on the case: which employees the words are for.
//
// A person says what they want in one place and never picks the employee
// ("Employees, not buttons", 18 September). Bob holds the conversation — the
// mail, the draft, whether it already went. Hanna holds who we put forward
// and in which form. Words that need both reach both. Words that name
// neither half go to Bob, who owns the chase and can bring Hanna in.
//
// Client-safe and pure, so the card can say who will take it before anything
// is sent, and the offline check can pin the routing down.
// ---------------------------------------------------------------------------

export interface CaseAskRoute {
  bob: boolean;
  hanna: boolean;
}

/** What one click on Ask hands over when the person types nothing else. */
export const DEFAULT_CASE_ASK =
  "Take this on: decide who we propose and in which form, and draft the reply.";

/** Who we put forward, beyond the CV / bio / Hanna words `asksForAPutForward` reads. */
const PEOPLE_WORDS: RegExp[] = [
  /\bwho\s+(fits|could|can|would|should)\b/,
  /\bfind\s+(someone|somebody|people|a\s+person|candidates?|engineers?|workers?|who)\b/,
  /\bpropos(e|es|ed|al|ing)\b/,
  /\bcandidates?\b/,
  /\b(available|free)\s+(people|engineers?|workers?|electricians?|technicians?)\b/,
  /\b(use|take|send|offer|choose|pick)\s+(him|her|them)\s+instead\b/,
  /\binstead\s+of\b/,
];

/** The conversation itself: the mail, the reply, the chase. */
const CONVERSATION_WORDS: RegExp[] = [
  /\brepl(y|ies|ied)\b/,
  /\brespond(ed)?\b/,
  /\banswer(ed|s)?\b/,
  /\bfollow[\s-]?up\b/,
  /\bchase\b/,
  /\bremind(er)?\b/,
  /\bnudge\b/,
  /\be-?mails?\b/,
  /\bmail\b/,
  /\bthread\b/,
  /\bdraft\b/,
  /\bwrite\b/,
  /\bsen[dt]\b/,
  /\bcall\b/,
  /\bphone\b/,
  /\brates?\b/,
  /\bprice\b/,
  /\bbob\b/,
];

/**
 * "Was the profile already sent?" is about what happened in the conversation,
 * even though it says "profile". Such a question is Bob's unless it also asks
 * for work to be done.
 */
const ASKS_WHAT_HAPPENED =
  /\b(was|were|did|has|have|had)\b[^.?!]*\b(sen[dt]|repl(y|ied)|answer(ed)?|receiv(e|ed)|open(ed)?)\b/;
const ASKS_FOR_WORK = /\b(prepare|make|build|find|propos(e|al)|use|pick|choose|attach|add|swap|replace)\b/;

/**
 * Which halves of the case the words ask for.
 *
 * `namesSomeoneOnTheBooks` is set by the server when the words name a person
 * Triangle holds ("use Matej"): choosing who goes forward is Hanna's half
 * even when no CV word was used.
 */
export function routeCaseAsk(
  text: string,
  opts: { namesSomeoneOnTheBooks?: boolean } = {},
): CaseAskRoute {
  const lower = ` ${(text ?? "").toLowerCase()} `;
  const onlyAsksWhatHappened =
    ASKS_WHAT_HAPPENED.test(lower) && !ASKS_FOR_WORK.test(lower);
  const hanna =
    Boolean(opts.namesSomeoneOnTheBooks) ||
    (!onlyAsksWhatHappened &&
      (asksForAPutForward(text) || PEOPLE_WORDS.some((re) => re.test(lower))));
  const bob = CONVERSATION_WORDS.some((re) => re.test(lower));
  if (!hanna && !bob) return { bob: true, hanna: false };
  return { bob, hanna };
}

/** "Bob has it." / "Bob and Hanna have it." — then where the answer comes back. */
export function routedSentence(names: string[]): string {
  const unique = [...new Set(names.filter((name) => name.trim()))];
  if (unique.length === 0) return "Nobody on the team could take that.";
  const who =
    unique.length === 1
      ? unique[0]
      : `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
  return `${who} ${unique.length === 1 ? "has" : "have"} it. The answer comes back on this card.`;
}
