import { z } from "zod";

// ---------------------------------------------------------------------------
// What one step of a mission hands back.
//
// The case report (scout-case-report.ts) describes ONE company and ends in one
// state. A mission step is different work: "find EPC contractors in Germany"
// has a dozen answers, each of which is its own company, its own person, its
// own way in and its own state. Squeezing that into one case report is how
// the CEO got "3 links" — the shape could only ever hold one.
//
// So the step returns a list of targets, and each target must pay for itself
// the same way a finding does: reachable, one thing missing, or dead. The
// three-state contract is enforced per target by migration 041's trigger when
// each one is filed, not on the step as a whole. A step that found twelve
// companies has no single state.
//
// Model output is untrusted input. `cleanTargets` below is where a target is
// allowed to become a fact: no source, no row; a phone number that is not a
// phone number is dropped; and a target is only called reachable when it
// actually carries a person, a published channel and the words — whatever the
// model labelled it.
// ---------------------------------------------------------------------------

export const MISSION_TARGET_LIMIT = 12;

const channelKinds = ["phone", "email", "linkedin", "contact_form"] as const;
export type MissionChannelKind = (typeof channelKinds)[number];
export type ChannelWhose = "person" | "department" | "switchboard";
export type TargetState = "reachable" | "one_thing_missing" | "dead";

const sourceSchema = z.object({ url: z.string().max(1_000), claim: z.string().max(300) });

// Every key required and nullable, never `.default()`. A default makes the
// key optional and OpenAI refuses the whole schema — the Ask box once answered
// every question with that schema error.
export const missionTargetSchema = z.object({
  company: z.string().max(160),
  website: z.string().max(300).nullable(),
  city: z.string().max(120).nullable(),
  country: z.string().max(80).nullable(),
  role: z.string().max(120).nullable(),
  why: z.string().max(400),
  person: z.string().max(160).nullable(),
  personTitle: z.string().max(160).nullable(),
  channelKind: z.enum(channelKinds).nullable(),
  channelValue: z.string().max(300).nullable(),
  channelWhose: z.enum(["person", "department", "switchboard"]).nullable(),
  words: z.string().max(700).nullable(),
  project: z.string().max(200).nullable(),
  projectEvidence: z.string().max(400).nullable(),
  state: z.enum(["reachable", "one_thing_missing", "dead"]),
  missing: z.string().max(240).nullable(),
  missingOwner: z.string().max(160).nullable(),
  deadReason: z.string().max(400).nullable(),
  sources: z.array(sourceSchema).max(3),
});

export const missionStepReportSchema = z.object({
  version: z.literal(1),
  /** What the worker says back in the conversation. Plain, short, no links. */
  reply: z.string().max(900),
  /** The mission as a whole after this step — what a CEO reads first. */
  brief: z.object({
    headline: z.string().max(220),
    summary: z.string().max(700),
    recommended: z.string().max(400).nullable(),
  }),
  targets: z.array(missionTargetSchema).max(MISSION_TARGET_LIMIT),
  /** Only when the work genuinely cannot go well without the CEO deciding. */
  questionForCeo: z.string().max(300).nullable(),
  suggestedNext: z
    .array(z.object({ label: z.string().max(40), instruction: z.string().max(300) }))
    .max(3),
});

/**
 * The way into one company, read off its own site.
 *
 * The first real missions filed twenty companies and not one was reachable.
 * The runs show why: one search per step and zero pages opened. Every "way
 * in" came from a search snippet or a LinkedIn job advert, and no snippet
 * carries the Geschäftsführung, the switchboard or the procurement desk. Those
 * are on the company's Impressum and Kontakt pages, which nobody opened.
 *
 * So after a step finds its companies, each one still missing a person or a
 * door gets its own short run whose only job is to open that site. It also
 * says what the company IS from what the site says: a firm that sells crews
 * is a competitor, and a person's profile is not a company at all.
 */
export const companyReachSchema = z.object({
  verdict: z.enum(["buyer", "competitor", "not_a_company", "unclear"]),
  verdictReason: z.string().max(300),
  website: z.string().max(300).nullable(),
  city: z.string().max(120).nullable(),
  country: z.string().max(80).nullable(),
  person: z.string().max(160).nullable(),
  personTitle: z.string().max(160).nullable(),
  channelKind: z.enum(channelKinds).nullable(),
  channelValue: z.string().max(300).nullable(),
  channelWhose: z.enum(["person", "department", "switchboard"]).nullable(),
  words: z.string().max(700).nullable(),
  notFoundReason: z.string().max(400).nullable(),
  sources: z.array(sourceSchema).max(3),
});

export type MissionTarget = z.infer<typeof missionTargetSchema>;
export type MissionStepReport = z.infer<typeof missionStepReportSchema>;
export type CompanyReach = z.infer<typeof companyReachSchema>;

// ── what gets stored on the step ────────────────────────────────────────────

/**
 * The step's own record, kept in `agent_assignments.result_summary`.
 *
 * The targets are not repeated here: each one became a finding and a record,
 * and a second copy in a JSON blob is a second answer that can disagree with
 * the first. What is kept is what only the step knows — what it said, what it
 * recommends, what it asked, and how many of each state it filed.
 */
export interface MissionStepRecord {
  kind: "mission_step";
  version: 1;
  reply: string;
  brief: { headline: string; summary: string; recommended: string | null };
  questionForCeo: string | null;
  suggestedNext: Array<{ label: string; instruction: string }>;
  filed: {
    companies: number;
    people: number;
    reachable: number;
    oneThingMissing: number;
    dead: number;
    dropped: number;
  };
  /** For a recruiting step: the pool records the answer named. */
  candidates?: {
    workerIds: string[];
    partnerIds: string[];
    blockers: string[];
    missing: string[];
  };
}

export function parseMissionStepRecord(value: string | null): MissionStepRecord | null {
  if (!value?.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Partial<MissionStepRecord> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.kind !== "mission_step" || typeof parsed.reply !== "string") return null;
    return {
      kind: "mission_step",
      version: 1,
      reply: parsed.reply,
      brief: {
        headline: String(parsed.brief?.headline ?? ""),
        summary: String(parsed.brief?.summary ?? ""),
        recommended: parsed.brief?.recommended ? String(parsed.brief.recommended) : null,
      },
      questionForCeo: parsed.questionForCeo ? String(parsed.questionForCeo) : null,
      suggestedNext: Array.isArray(parsed.suggestedNext)
        ? parsed.suggestedNext
            .filter((s) => s && typeof s.label === "string" && typeof s.instruction === "string")
            .slice(0, 3)
        : [],
      filed: {
        companies: Number(parsed.filed?.companies ?? 0),
        people: Number(parsed.filed?.people ?? 0),
        reachable: Number(parsed.filed?.reachable ?? 0),
        oneThingMissing: Number(parsed.filed?.oneThingMissing ?? 0),
        dead: Number(parsed.filed?.dead ?? 0),
        dropped: Number(parsed.filed?.dropped ?? 0),
      },
      candidates: parsed.candidates
        ? {
            workerIds: stringList(parsed.candidates.workerIds),
            partnerIds: stringList(parsed.candidates.partnerIds),
            blockers: stringList(parsed.candidates.blockers),
            missing: stringList(parsed.candidates.missing),
          }
        : undefined,
    };
  } catch {
    // A step that failed stores a sentence, not JSON. That is not a record.
    return null;
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

// ── turning model output into facts ─────────────────────────────────────────

export interface CleanTarget {
  company: string;
  /** For matching a company already on file: lower case, no legal form. */
  companyKey: string;
  website: string | null;
  domain: string | null;
  city: string | null;
  country: string | null;
  role: string | null;
  why: string;
  person: string | null;
  personTitle: string | null;
  channel: { kind: MissionChannelKind; value: string; whose: ChannelWhose } | null;
  words: string | null;
  project: { name: string; evidence: string | null } | null;
  state: TargetState;
  /** one_thing_missing: the single named fact, and who fetches it. */
  missing: string | null;
  missingOwner: string | null;
  /** dead: why, so it is not presented again. */
  deadReason: string | null;
  sources: Array<{ url: string; claim: string }>;
  /** Its own site has been opened for the person and the door. */
  reachChecked?: boolean;
  /** What reading the site did not turn up, in the worker's words. */
  reachNote?: string | null;
  /**
   * The record this target already is. Set for companies the mission holds,
   * so they are filed onto exactly that row and never matched again by a name
   * or a domain that happens to resemble somebody else's.
   */
  knownCompanyId?: string;
}

const LEGAL_FORMS =
  /\b(gmbh|mbh|ag|se|kg|kgaa|ohg|ug|co|ltd|limited|llc|inc|corp|plc|bv|nv|sa|sas|sarl|srl|spa|oy|ab|as|aps|doo|d o o)\b/g;

/** "GOLDBECK GmbH" and "Goldbeck" are one company to anybody looking for a buyer. */
export function companyKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(LEGAL_FORMS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function text(value: string | null | undefined): string | null {
  const t = value?.replace(/\s+/g, " ").trim();
  return t ? t : null;
}

/**
 * One person, because a contact row is one person.
 *
 * Asked for the buyer at Reinartz GmbH, the worker filed "Josef Peter
 * Reinartz; Elzbieta Prokopowicz" — both managing directors, as one name — and
 * a single People record was created for two people. The first named is kept;
 * the page that names both is still the source.
 */
function onePerson(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(/\s*(?:;|\/|\|)\s*|\s+(?:&|and|und)\s+/i)[0]?.trim();
  return first || null;
}

/** An absolute http(s) URL with a real host, or nothing. */
export function httpUrl(value: string | null | undefined): string | null {
  const raw = value?.trim().replace(/[.,;…]+$/, "");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "yahoo.de", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
  "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "web.de", "t-online.de", "freenet.de", "arcor.de",
  "posteo.de", "mailbox.org", "email.de", "seznam.cz", "wp.pl", "o2.pl", "onet.pl",
  "libero.it", "orange.fr", "wanadoo.fr", "free.fr", "laposte.net", "mail.ru", "yandex.ru",
]);

/**
 * A company's site, read off its published email address.
 *
 * "info@reinartz-gmbh.de" says where Reinartz GmbH lives on the web. Without
 * it, the site-reading run went looking by name and read a different
 * Reinartz. A free-mail address says nothing about anybody's company.
 */
export function siteOfEmail(email: string | null | undefined): string | null {
  const domain = email?.split("@")[1]?.trim().toLowerCase();
  if (!domain || !domain.includes(".") || FREE_MAIL.has(domain)) return null;
  return httpUrl(`https://${domain}`);
}

/** "shop.reinartz-gmbh.de" and "reinartz-gmbh.de" are one company's web. */
function registrable(domain: string): string {
  const parts = domain.split(".");
  const compound = parts.length > 2 && /^(co|com|org|net|ac|gov)$/.test(parts[parts.length - 2]);
  return parts.slice(compound ? -3 : -2).join(".");
}

/**
 * A channel is kept only when it is shaped like what it claims to be.
 *
 * This cannot prove a number was published — the prompt forbids inventing one
 * and every target must cite where it was read. It can refuse "call the
 * procurement team" in the phone field, which is the drift that actually
 * happens.
 */
function cleanChannel(
  kind: MissionChannelKind | null,
  value: string | null,
  whose: ChannelWhose | null,
): CleanTarget["channel"] {
  const v = text(value);
  if (!kind || !v) return null;
  const who: ChannelWhose = whose ?? (kind === "linkedin" ? "person" : "switchboard");

  if (kind === "email") {
    const email = v.replace(/^mailto:/i, "");
    return /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i.test(email)
      ? { kind, value: email, whose: who }
      : null;
  }
  if (kind === "phone") {
    const phone = v.replace(/^tel:/i, "");
    const digits = phone.replace(/\D/g, "").length;
    return /^[+(\d][\d\s()./-]+$/.test(phone) && digits >= 7 && digits <= 16
      ? { kind, value: phone, whose: who }
      : null;
  }
  const url = httpUrl(v);
  if (!url) return null;
  if (kind === "linkedin") {
    return domainOf(url)?.endsWith("linkedin.com") ? { kind, value: url, whose: "person" } : null;
  }
  return { kind, value: url, whose: who };
}

function cleanSources(raw: Array<{ url: string; claim: string }>): Array<{ url: string; claim: string }> {
  return Array.from(
    new Map(
      raw
        .map((s) => ({ url: httpUrl(s.url), claim: text(s.claim) ?? "" }))
        .filter((s): s is { url: string; claim: string } => Boolean(s.url))
        .map((s) => [s.url, s]),
    ).values(),
  );
}

/** Whether a target cites at least one source that is a real web address. */
export function citesASource(t: { sources: Array<{ url: string; claim: string }> }): boolean {
  return cleanSources(t.sources).length > 0;
}

type Unsettled = Omit<CleanTarget, "state" | "missing" | "missingOwner" | "deadReason">;

/**
 * Which of the three states a target is actually in.
 *
 * Reachable is decided by what the target carries, not by its label. A dead
 * judgement stands with its reason. Everything else is one thing missing, and
 * the one thing is the first gap on the way to a call — the person, then their
 * door, then the words.
 */
function settle(
  t: Unsettled,
  hints: { dead: boolean; deadReason: string | null; missingOwner: string | null },
): Pick<CleanTarget, "state" | "missing" | "missingOwner" | "deadReason"> {
  if (t.person && t.channel && t.words) {
    return { state: "reachable", missing: null, missingOwner: null, deadReason: null };
  }
  if (hints.dead) {
    return { state: "dead", missing: null, missingOwner: null, deadReason: hints.deadReason ?? t.why };
  }
  return {
    state: "one_thing_missing",
    missingOwner: hints.missingOwner ?? "Scout",
    deadReason: null,
    missing: !t.person
      ? `The person at ${t.company} who buys subcontract labour`
      : !t.channel
        ? `A published phone number or email for ${t.person}`
        : `What to say to ${t.person}`,
  };
}

const STATE_RANK: Record<TargetState, number> = {
  reachable: 0,
  one_thing_missing: 1,
  dead: 2,
};

export function cleanTargets(raw: MissionTarget[]): {
  kept: CleanTarget[];
  dropped: Array<{ company: string; reason: string }>;
} {
  const byKey = new Map<string, CleanTarget>();
  const dropped: Array<{ company: string; reason: string }> = [];

  for (const t of raw) {
    const company = text(t.company);
    if (!company) continue;
    const key = companyKey(company);
    if (!key) continue;

    const sources = cleanSources(t.sources);
    // No source, no fact. A company with nothing to cite is a guess.
    if (sources.length === 0) {
      dropped.push({ company, reason: "no source to cite" });
      continue;
    }

    const person = onePerson(text(t.person));
    const channel = cleanChannel(t.channelKind, t.channelValue, t.channelWhose);
    const website =
      httpUrl(t.website) ?? (channel?.kind === "email" ? siteOfEmail(channel.value) : null);
    const projectName = text(t.project);
    const base: Unsettled = {
      company,
      companyKey: key,
      website,
      domain: domainOf(website),
      city: text(t.city),
      country: text(t.country),
      role: text(t.role),
      why: text(t.why) ?? "No reason given.",
      person,
      personTitle: person ? text(t.personTitle) : null,
      channel,
      words: person ? text(t.words) : null,
      project: projectName ? { name: projectName, evidence: text(t.projectEvidence) } : null,
      sources,
    };
    const target: CleanTarget = {
      ...base,
      ...settle(base, {
        dead: t.state === "dead",
        deadReason: text(t.deadReason),
        missingOwner: text(t.missingOwner),
      }),
    };

    // The same company twice in one step keeps the more actionable version.
    const existing = byKey.get(key);
    if (!existing || STATE_RANK[target.state] < STATE_RANK[existing.state]) {
      if (existing) {
        const seen = new Set(target.sources.map((s) => s.url));
        for (const s of existing.sources) if (!seen.has(s.url)) target.sources.push(s);
        target.sources = target.sources.slice(0, 3);
      }
      byKey.set(key, target);
    }
  }

  return { kept: Array.from(byKey.values()), dropped };
}

/**
 * What reading the company's own site changes about a target.
 *
 * The site is the better witness: a person and a door read off the Impressum
 * replace what a search snippet suggested, and the site's own sources go
 * first, because they are what the CEO will check before dialling. A company
 * whose site shows it sells crews is dead with that reason, sourced.
 *
 * But only its OWN site. Asked about Reinartz GmbH in Essen, the run read a
 * machine builder called Reinartz in Neuss, and the reply announced a buyer
 * for the wrong company. When the target's domain is known and the site read
 * is somewhere else, nothing is taken from it and the mismatch is recorded.
 */
export function mergeReach(t: CleanTarget, reach: CompanyReach): CleanTarget {
  const readDomain = domainOf(httpUrl(reach.website));
  if (t.domain && readDomain && registrable(t.domain) !== registrable(readDomain)) {
    return {
      ...t,
      reachChecked: true,
      reachNote: `The site that was read (${readDomain}) is not ${t.company}'s own (${t.domain}), so nothing was taken from it.`,
    };
  }

  const reachSources = cleanSources(reach.sources);
  const seen = new Set(reachSources.map((s) => s.url));
  const sources = [...reachSources, ...t.sources.filter((s) => !seen.has(s.url))].slice(0, 3);

  if (reach.verdict === "competitor" || reach.verdict === "not_a_company") {
    return {
      ...t,
      sources,
      state: "dead",
      deadReason:
        text(reach.verdictReason) ??
        (reach.verdict === "competitor"
          ? "Supplies crews itself — a competitor, not a buyer."
          : "Not a company that buys subcontract labour."),
      missing: null,
      missingOwner: null,
      reachChecked: true,
      reachNote: null,
    };
  }

  const website = t.website ?? httpUrl(reach.website);
  const reachPerson = onePerson(text(reach.person));
  const person = reachPerson ?? t.person;
  const personTitle = reachPerson ? text(reach.personTitle) : t.personTitle;
  const channel = cleanChannel(reach.channelKind, reach.channelValue, reach.channelWhose) ?? t.channel;
  const words = text(reach.words) ?? t.words;

  const base: Unsettled = {
    ...t,
    website,
    domain: domainOf(website),
    city: t.city ?? text(reach.city),
    country: t.country ?? text(reach.country),
    person,
    personTitle,
    channel,
    words: person ? words : null,
    sources,
  };
  const settled = settle(base, {
    dead: t.state === "dead",
    deadReason: t.deadReason,
    missingOwner: t.missingOwner,
  });
  return {
    ...base,
    ...settled,
    reachChecked: true,
    reachNote: settled.state === "reachable" ? null : text(reach.notFoundReason),
  };
}
