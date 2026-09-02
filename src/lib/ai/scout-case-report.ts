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

function extractUrls(value: string): ScoutCaseReport["sources"] {
  const urls = Array.from(new Set(value.match(/https?:\/\/[^\s)]+/g) ?? []));
  return urls.map((url) => ({
    url: url.replace(/[.,;]+$/, ""),
    title: new URL(url.replace(/[.,;]+$/, "")).hostname.replace(/^www\./, ""),
    claim: "Source cited in the worker report.",
    quote: null,
  }));
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
    headline:
      verdict === "pursue"
        ? "Pursue through the verified buyer route."
        : verdict === "no_go"
          ? "Do not pursue this case."
          : "Hold until the missing commercial proof is found.",
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
  return parseLegacyReport(value);
}

export function serializeScoutCaseReport(report: ScoutCaseReport): string {
  return JSON.stringify(report);
}
