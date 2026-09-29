// ---------------------------------------------------------------------------
// The reply to a recruiter, as far as it names who we put forward.
//
// Client-safe: the server writes the first draft with these, and the Today
// card rebuilds the same sentences when the team's decision changes the
// person. Two copies of this wording drifted before — the card rewrote the
// background line for the new person and left the old person's role and a
// claim of availability in the sentence above it.
//
// Skill fit and availability are separate facts. "Available" is only written
// when a person confirmed it; otherwise the draft says the person is on our
// books and that availability is being confirmed.
// ---------------------------------------------------------------------------

/** Availability is only a yes when a person confirmed it; any caveat about it is a no. */
export function availabilityConfirmed(caveats: string[] | undefined): boolean {
  return !(caveats ?? []).some((c) => /availab/i.test(c));
}

/** The one sentence that says what we have for the role. */
export function offerSentence(params: {
  role: string | null;
  roleTitle: string | null;
  country: string | null;
  availabilityConfirmed: boolean;
}): string {
  const who = params.role?.trim() || "an engineer";
  const article = /^an? /i.test(who) ? "" : /^[aeiou]/i.test(who) ? "an " : "a ";
  const where = params.country ? ` in ${params.country}` : "";
  const have = params.availabilityConfirmed
    ? `we have ${article}${who} available who fits it`
    : `we have ${article}${who} on our books who fits it — I am confirming their availability now`;
  return `On the ${params.roleTitle?.trim() || "role"}${where} — ${have}.`;
}

const OFFER_LINE = /^On the .* — we have .*$/m;
const BACKGROUND_LINE = /^Relevant background:.*$/m;
const PROFILE_OFFER = /^Happy to send an anonymised profile.*$/m;

/**
 * The draft, rewritten for the person the team decided to put forward.
 *
 * Both sentences that name the person follow the decision: the offer
 * sentence (their role, and availability only if confirmed) and the
 * background line (their skills — or no line at all, rather than somebody
 * else's). Everything else in the draft is left as it was.
 */
export function redraftForPerson(
  script: string,
  person: { role: string | null; why: string; caveats: string[] },
  context: {
    roleTitle: string | null;
    country: string | null;
    /** An approved document goes with this reply: say so instead of offering it. */
    attaching?: "bio" | "cv" | null;
  },
): string {
  let out = script;
  if (OFFER_LINE.test(out)) {
    out = out.replace(
      OFFER_LINE,
      offerSentence({
        role: person.role,
        roleTitle: context.roleTitle,
        country: context.country,
        availabilityConfirmed: availabilityConfirmed(person.caveats),
      }),
    );
  }
  if (BACKGROUND_LINE.test(out)) {
    out = person.why.trim()
      ? out.replace(BACKGROUND_LINE, `Relevant background: ${person.why.trim()}.`)
      : out.replace(BACKGROUND_LINE, "");
  }
  if (context.attaching && PROFILE_OFFER.test(out)) {
    out = out.replace(
      PROFILE_OFFER,
      context.attaching === "cv"
        ? "Their CV is attached. We can talk rates once you have seen it."
        : "The anonymised profile is attached — initials only. We can talk rates once you have seen it.",
    );
  }
  // Removing a line must not leave a double gap in a letter.
  return out.replace(/\n{3,}/g, "\n\n");
}
