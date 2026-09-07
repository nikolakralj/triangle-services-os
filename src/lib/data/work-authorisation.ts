// ---------------------------------------------------------------------------
// Whether a person may legally stand on the site.
//
// The most useful fact here is not stored at all — it is derived. A Croatian
// passport carries the right to work in every EU/EEA state and Switzerland, so
// recording "authorised in Germany, Austria, Poland, …" for an EU national
// would be thirty rows of the same fact, going stale the moment a country
// joins or leaves.
//
// So: nationality settles the EU, and work_authorisation records only what
// somebody actually established beyond it.
//
// An empty work_authorisation means NOBODY HAS CHECKED. It does not mean the
// person cannot work there, and nothing in this file may report it as such —
// a shortlist that quietly drops people because a field is blank is worse than
// no shortlist, because it looks like an answer.
//
// No `server-only`: the profile is a client component and needs the labels.
// ---------------------------------------------------------------------------

/** EU + EEA + Switzerland. Free movement of workers applies across all of it. */
const FREE_MOVEMENT = new Set([
  "austria", "belgium", "bulgaria", "croatia", "cyprus", "czechia",
  "czech republic", "denmark", "estonia", "finland", "france", "germany",
  "greece", "hungary", "ireland", "italy", "latvia", "lithuania", "luxembourg",
  "malta", "netherlands", "poland", "portugal", "romania", "slovakia",
  "slovenia", "spain", "sweden",
  // EEA and the bilateral agreements that work the same way in practice.
  "iceland", "liechtenstein", "norway", "switzerland",
]);

/** Adjectival forms, because a CV says "Croatian" rather than "Croatia". */
const DEMONYMS: Record<string, string> = {
  austrian: "austria", belgian: "belgium", bulgarian: "bulgaria",
  croatian: "croatia", cypriot: "cyprus", czech: "czechia", danish: "denmark",
  estonian: "estonia", finnish: "finland", french: "france", german: "germany",
  greek: "greece", hungarian: "hungary", irish: "ireland", italian: "italy",
  latvian: "latvia", lithuanian: "lithuania", luxembourgish: "luxembourg",
  maltese: "malta", dutch: "netherlands", polish: "poland",
  portuguese: "portugal", romanian: "romania", slovak: "slovakia",
  slovenian: "slovenia", spanish: "spain", swedish: "sweden",
  icelandic: "iceland", norwegian: "norway", swiss: "switzerland",
  british: "united kingdom", english: "united kingdom", scottish: "united kingdom",
  american: "united states", canadian: "canada", ukrainian: "ukraine",
  serbian: "serbia", bosnian: "bosnia and herzegovina", turkish: "turkey",
  indian: "india", filipino: "philippines",
};

/** "Croatian" and "HR" and "Croatia " all mean the same country. */
export function normalizeCountry(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, " ");
  return DEMONYMS[cleaned] ?? cleaned;
}

export function hasFreeMovement(nationality: string | null | undefined): boolean {
  const country = normalizeCountry(nationality);
  return country !== null && FREE_MOVEMENT.has(country);
}

export interface WorkRightCheck {
  /** True only when a right to work has actually been established. */
  allowed: boolean;
  /** True when nobody has checked — which is not the same as "no". */
  unknown: boolean;
  /** One sentence a person can read. */
  reason: string;
}

export interface WorkerRights {
  nationality?: string | null;
  workAuthorisation?: string[] | null;
  work_authorisation?: string[] | null;
  visaNotes?: string | null;
  visa_notes?: string | null;
}

/**
 * Can this person work in `country`?
 *
 * Three answers, and the third is the one that matters: yes, no-idea, and
 * "nobody has recorded it". Only a real established right returns allowed.
 */
export function canWorkIn(worker: WorkerRights, country: string): WorkRightCheck {
  const target = normalizeCountry(country);
  const nationality = normalizeCountry(worker.nationality);
  const authorised = (worker.workAuthorisation ?? worker.work_authorisation ?? [])
    .map((c) => normalizeCountry(c))
    .filter(Boolean) as string[];
  const notes = worker.visaNotes ?? worker.visa_notes ?? null;

  if (!target) {
    return { allowed: false, unknown: true, reason: "No country given to check against." };
  }

  if (nationality && nationality === target) {
    return { allowed: true, unknown: false, reason: `Own nationality (${country}).` };
  }

  if (FREE_MOVEMENT.has(target) && hasFreeMovement(nationality)) {
    return {
      allowed: true,
      unknown: false,
      reason: `${titleCase(nationality!)} passport — free movement across the EU/EEA.`,
    };
  }

  if (authorised.includes(target)) {
    return {
      allowed: true,
      unknown: false,
      reason: notes ? `Recorded as authorised. ${notes}` : "Recorded as authorised.",
    };
  }

  if (!nationality && authorised.length === 0) {
    return {
      allowed: false,
      unknown: true,
      reason: "No nationality or work authorisation on file — nobody has checked.",
    };
  }

  return {
    allowed: false,
    unknown: true,
    reason: notes
      ? `Nothing on file for ${titleCase(target)}. ${notes}`
      : `Nothing on file for ${titleCase(target)}. A visa or sponsorship would need checking.`,
  };
}

/** How to say a person's right to work in one line, with no country in mind. */
export function describeRights(worker: WorkerRights): string {
  const nationality = worker.nationality?.trim();
  const authorised = worker.workAuthorisation ?? worker.work_authorisation ?? [];
  const parts: string[] = [];

  if (nationality) {
    parts.push(
      hasFreeMovement(nationality)
        ? `${nationality} — works anywhere in the EU/EEA`
        : nationality,
    );
  }
  if (authorised.length > 0) parts.push(`also cleared for ${authorised.join(", ")}`);
  if (parts.length === 0) return "No nationality or work authorisation recorded";
  return parts.join(" · ");
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
