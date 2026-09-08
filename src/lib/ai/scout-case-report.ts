import { z } from "zod";

export const scoutCaseReportSchema = z.object({
  version: z.literal(1),
  verdict: z.enum(["pursue", "hold", "no_go"]),
  headline: z.string().max(280),
  executiveSummary: z.string().max(700),
  namedProject: z
    .object({
      name: z.string().max(240),
      location: z.string().max(180).nullable(),
      timing: z.string().max(240).nullable(),
      owner: z.string().max(240).nullable(),
      evidence: z.string().max(900),
    })
    .nullable(),
  buyerPath: z
    .object({
      laborBuyer: z.string().max(240),
      decisionMaker: z.string().max(240).nullable(),
      publicDoor: z.string().max(500).nullable(),
      rationale: z.string().max(900),
    })
    .nullable(),
  crewPackage: z
    .object({
      title: z.string().max(240),
      scope: z.string().max(900),
      exclusions: z.array(z.string().max(280)).max(8),
    })
    .nullable(),
  nextCommercialAction: z
    .object({
      owner: z.string().max(180),
      action: z.string().max(900),
      channel: z.string().max(500).nullable(),
      requiresApproval: z.boolean(),
    })
    .nullable(),
  unknowns: z.array(z.string().max(320)).max(8),
  /**
   * Who goes and gets the one missing fact. Required by the database whenever
   * this report resolves to `one_thing_missing`, because "we do not know who
   * buys the labour" with nobody assigned to find out is the research job
   * handed back to the CEO.
   */
  missingOwner: z.string().max(240).nullable().default(null),
  /**
   * Why this is not worth chasing. Required by the database whenever this
   * report resolves to `dead`, so the same weak lead is never presented again.
   */
  deadReason: z.string().max(600).nullable().default(null),
  risks: z.array(z.string().max(320)).max(8),
  questionsAnswered: z.array(z.string().max(500)).max(8),
  sources: z.array(
    z.object({
      url: z.string().max(1_000),
      title: z.string().max(240),
      claim: z.string().max(500),
      quote: z.string().max(500).nullable(),
    }),
  ).max(10),
  confidence: z.number().int().min(0).max(100),
  workerNarrative: z.string().max(4_000),
});

export type ScoutCaseReport = z.infer<typeof scoutCaseReportSchema>;

/** The only three things a finished piece of research may be. */
export type FindingState = "reachable" | "one_thing_missing" | "dead";

/**
 * What this report actually is — decided here and nowhere else.
 *
 * `verdict` was ("pursue" | "hold" | "no_go") and "hold" required no evidence
 * of any kind, so a model that was unsure always picked it. That is how the
 * CEO opened a result reading "Hold until the missing commercial proof is
 * found · 60% sure · 3 sources" and correctly said he could have used Chrome.
 *
 * The state is derived from what the report CONTAINS rather than from what the
 * model called it, because the model's own label is the thing that drifted. A
 * report claiming "pursue" with no named person is not reachable, whatever it
 * says about itself.
 *
 * Migration 041 checks the same conditions in Postgres and refuses the row.
 * This function exists so the app agrees with the database instead of finding
 * out at INSERT time — but the database is the one that decides. There is
 * deliberately no fourth return value: an "unknown" state would be the hedge
 * coming back under a new name.
 */
export function findingStateOf(report: ScoutCaseReport): FindingState {
  const person = report.buyerPath?.decisionMaker?.trim();
  const door =
    report.buyerPath?.publicDoor?.trim() || report.nextCommercialAction?.channel?.trim();
  const words = report.nextCommercialAction?.action?.trim();

  if (person && door && words) return "reachable";
  if (report.deadReason?.trim()) return "dead";
  if (report.unknowns.length === 1 && report.missingOwner?.trim()) {
    return "one_thing_missing";
  }

  // Nothing carried. A no_go with no reason written is still a refusal, so
  // give it one rather than losing the judgement — the reason is what stops it
  // coming back next week.
  if (report.verdict === "no_go") return "dead";

  // Everything else is research that did not finish. It resolves to
  // one_thing_missing, and the caller must name the one fact and its owner
  // before Postgres will accept it — which is the point.
  return "one_thing_missing";
}

/**
 * Why the database will refuse this report, in the words an agent can act on.
 *
 * Deliberately a mirror of the trigger in migration 041 rather than a
 * replacement for it. The database is the authority — there are two Scouts, a
 * provider bot and whoever is hired next, and a rule enforced only here is a
 * rule the other paths do not have. This function exists so an agent gets a
 * usable sentence and a retry instead of a Postgres exception, and so the
 * refusal is recorded against the employee that earned it.
 *
 * Returns null when the report will be accepted.
 */
export function contractViolation(
  report: ScoutCaseReport,
  state: FindingState,
): string | null {
  if (state === "reachable") {
    if (!report.buyerPath?.decisionMaker?.trim()) {
      return "A reachable finding needs a named person at the labour buyer. Name them, or file this as one_thing_missing with the name as the one missing fact.";
    }
    if (!report.buyerPath?.publicDoor?.trim() && !report.nextCommercialAction?.channel?.trim()) {
      return `A reachable finding needs a published way to reach ${report.buyerPath.decisionMaker} — a phone number, an address, or the page it is published on. Without one this is UNREACHABLE and must be filed as one_thing_missing or dead.`;
    }
    if (!report.nextCommercialAction?.action?.trim()) {
      return "A reachable finding needs the words to say. Write the approach — the sentence a human reads out or copies into an email. Leaving it blank hands the job back.";
    }
    return null;
  }

  if (state === "one_thing_missing") {
    if (report.unknowns.length !== 1) {
      return `one_thing_missing means exactly ONE named fact, and this report lists ${report.unknowns.length}. Either carry the research far enough that only one thing is unknown, or file it as dead with the reason. Research still in progress is not a finding.`;
    }
    if (!report.missingOwner?.trim()) {
      return `Name who goes and gets it. "${report.unknowns[0]}" with nobody assigned is homework handed to the CEO.`;
    }
    return null;
  }

  if (!report.deadReason?.trim()) {
    return "A dead finding needs its reason recorded, so this lead is never presented again. Say what makes it not worth chasing — wrong trade, no buyer to name, wrong country.";
  }
  return null;
}

const SECTION_ALIASES: Record<string, string> = {
  "NAMED PROJECT": "project",
  PROJECT: "project",
  "BUYER PATH (OWNER IS NOT ENOUGH)": "buyer",
  "BUYER PATH": "buyer",
  "BUYER CONTACT": "contact",
  "CREW PACKAGE": "package",
  "NEXT COMMERCIAL ACTION (HUMAN ONLY)": "action",
  "NEXT COMMERCIAL ACTION": "action",
  "WATCH, NOT THIS CASE": "risks",
  RISKS: "risks",
  UNKNOWNS: "unknowns",
};

function compact(value: string, max = 360): string {
  const normalized = value
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b(?:Direct LSA|NUB|Source):\s*(?=(?:NUB|Scout|Do not|$))/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= max) return normalized;
  const clipped = normalized.slice(0, max);
  const sentence = clipped.lastIndexOf(". ");
  return `${clipped.slice(0, sentence > 120 ? sentence + 1 : max).trim()}…`;
}

function firstNonEmptyLine(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

/**
 * Pull the cited links out of a report written as prose.
 *
 * `new URL()` used to be called here bare, and it THROWS on anything the regex
 * matched that is not a real URL — a bare "https://", a link the model cut off
 * mid-word, a trailing unicode ellipsis from its own truncation. This function
 * runs inside a React render (AgentReport), so that throw took down the whole
 * Cockpit with "Failed to construct 'URL': Invalid URL" and the CEO lost the
 * page, not just the one card.
 *
 * Model output is untrusted input. Nothing derived from it may be allowed to
 * throw on a render path: a malformed link is dropped, and the rest of the
 * report still renders.
 */
function extractUrls(value: string): ScoutCaseReport["sources"] {
  const urls = Array.from(new Set(value.match(/https?:\/\/[^\s)]+/g) ?? []));
  const sources: ScoutCaseReport["sources"] = [];
  for (const raw of urls) {
    // Trailing punctuation and the ellipsis the truncator leaves behind.
    const cleaned = raw.replace(/[.,;…]+$/, "");
    let hostname: string;
    try {
      hostname = new URL(cleaned).hostname;
    } catch {
      continue;
    }
    if (!hostname) continue;
    sources.push({
      url: cleaned,
      title: hostname.replace(/^www\./, ""),
      claim: "Source cited in the worker report.",
      quote: null,
    });
  }
  return sources;
}

function parseLegacyReport(value: string): ScoutCaseReport | null {
  if (!value.trim()) return null;

  const sections = new Map<string, string[]>();
  let current = "intro";
  sections.set(current, []);

  for (const line of value.split("\n")) {
    const normalized = line.trim().replace(/:$/, "").toUpperCase();
    const alias = SECTION_ALIASES[normalized];
    if (alias) {
      current = alias;
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    sections.get(current)?.push(line);
  }

  const section = (key: string) => (sections.get(key) ?? []).join("\n").trim();
  const intro = section("intro");
  const project = section("project");
  const buyer = section("buyer");
  const contact = section("contact");
  const crewPackage = section("package");
  const action = section("action");
  const risks = section("risks");
  const verdict = /CALL IT AN OPPORTUNITY:\s*YES|OPPORTUNITY:\s*YES/i.test(intro)
    ? "pursue"
    : /NO[-_ ]?GO|OPPORTUNITY:\s*NO/i.test(intro)
      ? "no_go"
      : "hold";

  return {
    version: 1,
    verdict,
    // This is where the CEO's sentence came from. "Hold until the missing
    // commercial proof is found" was never written by any model — it is a
    // hardcoded headline this parser stamped on every prose report it could
    // not classify, complete with an invented 60% confidence below. It read
    // like a judgement and was a parse failure.
    headline:
      verdict === "pursue"
        ? "Pursue through the verified buyer route."
        : verdict === "no_go"
          ? "Do not pursue this case."
          : "Older report, filed before the three-state contract — read it below.",
    // The legacy path reads history; it does not write new rows, and it cannot
    // know who was going to fetch a missing fact. Null is the honest answer,
    // and the contract does not apply retroactively.
    missingOwner: null,
    deadReason: verdict === "no_go" ? compact(intro, 500) || null : null,
    executiveSummary: compact(
      intro
        .split("\n")
        .filter((line) => !/CEO DECISION BRIEF/i.test(line))
        .join(" ") || value,
      420,
    ),
    namedProject: project
      ? {
          name: compact(firstNonEmptyLine(project), 180),
          location: null,
          timing: null,
          owner: null,
          evidence: compact(project, 420),
        }
      : null,
    buyerPath: buyer || contact
      ? {
          laborBuyer:
            buyer.match(/Labour buyer\s*=\s*([^\.\n]+)/i)?.[1]?.trim() ??
            (compact(firstNonEmptyLine(buyer), 180) ||
              "Buyer still needs confirmation"),
          decisionMaker: contact ? compact(firstNonEmptyLine(contact), 180) : null,
          publicDoor:
            action.match(/https?:\/\/[^\s)]+/)?.[0]?.replace(/[.,;]+$/, "") ?? null,
          rationale: compact(buyer, 360),
        }
      : null,
    crewPackage: crewPackage
      ? {
          title: compact(firstNonEmptyLine(crewPackage), 180),
          scope: compact(crewPackage, 360),
          exclusions: Array.from(
            crewPackage.matchAll(/(?:do not|not in|not this case)[^.!?]*[.!?]/gi),
          ).map((match) => compact(match[0], 180)),
        }
      : null,
    nextCommercialAction: action
      ? {
          owner: "Human commercial owner",
          action: compact(action, 380),
          channel:
            action.match(/https?:\/\/[^\s)]+/)?.[0]?.replace(/[.,;]+$/, "") ?? null,
          requiresApproval: true,
        }
      : null,
    unknowns: Array.from(value.matchAll(/(?:No public|Unknown|still needs?)[^.!?]*[.!?]/gi))
      .map((match) => compact(match[0], 200))
      .slice(0, 5),
    risks: risks ? [compact(risks, 300)] : [],
    questionsAnswered: [],
    sources: extractUrls(value),
    confidence: verdict === "pursue" ? 82 : 60,
    workerNarrative: value,
  };
}

export function parseScoutCaseReport(value: string | null): ScoutCaseReport | null {
  if (!value?.trim()) return null;
  try {
    const parsed = scoutCaseReportSchema.safeParse(JSON.parse(value));
    if (parsed.success) return parsed.data;
  } catch {
    // Older agents returned a readable sectioned brief. Keep those useful.
  }
  try {
    return parseLegacyReport(value);
  } catch {
    // The legacy path was outside the catch above, so anything it threw while
    // parsing a model's prose escaped into a React render and blanked the
    // page. A report this function cannot read is worth losing; the screen
    // around it is not.
    return null;
  }
}

export function serializeScoutCaseReport(report: ScoutCaseReport): string {
  return JSON.stringify(report);
}
