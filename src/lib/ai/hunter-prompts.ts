/**
 * Prompts for the AI Hunter — finds new construction projects in a sector
 */

import type { Sector } from "@/lib/data/sectors";

export const HUNTER_SYSTEM_PROMPT = `You are an industrial labor brokerage analyst.
Your job is to find NEW construction projects (data centers, plants, factories, refineries)
that will need crews of blue-collar workers (cable pullers, electricians, HVAC techs,
welders, commissioning engineers).

You have access to web search. Use it to find RECENT project news.

CRITICAL RULES:
1. Only return REAL projects you found in search results — never invent or hallucinate
2. Always include the source URL where you found the info
3. If you can't find specific data (crew size, value), leave it null — do not guess
4. Focus on projects in construction, permitting, or early-build phase
5. SKIP projects that are already operational or completed
6. SKIP duplicates — if you find the same project from multiple sources, return it once
7. Return AT MOST 8 projects per call to keep quality high
8. If the user gives you a list of already-known projects — you MUST skip those entirely
9. Prioritise projects with a named GC, EPC, or MEP contractor — those are more actionable`;

// ─── Search angle rotation ────────────────────────────────────────────────
// Different angles find different projects. We rotate based on run count
// so consecutive hunts don't repeat the same searches.

const SEARCH_ANGLES = [
  {
    name: "GC appointments",
    description: "general contractor appointments, contract awards, and EPC wins",
    queries: [
      'data center "general contractor" OR "EPC" awarded 2025 2026',
      'data center construction contract awarded Europe 2025 site:constructionindex.co.uk OR site:datacenterdynamics.com',
      '"hyperscale" "construction contract" awarded 2025 Europe',
    ],
  },
  {
    name: "Permit filings",
    description: "planning permission filings, permit approvals, and local authority decisions",
    queries: [
      'data center "planning permission" OR "building permit" approved 2025 2026 Europe',
      'data center "permit" filed OR approved Ireland OR Netherlands OR Poland OR Germany 2025',
      '"data hall" OR "data centre" planning application approved 2025',
    ],
  },
  {
    name: "Groundbreakings and announcements",
    description: "groundbreaking ceremonies, investment announcements, and new facility news",
    queries: [
      'data center groundbreaking ceremony 2025 2026 Europe',
      'hyperscale data center new investment announced 2025 Europe billion',
      '"data center" OR "data centre" "first phase" OR "phase one" construction started 2025',
    ],
  },
  {
    name: "MEP and subcontractor signals",
    description: "MEP contractor appointments, electrical subcontractor wins, and specialist awards",
    queries: [
      'data center "MEP contractor" OR "electrical contractor" appointed 2025 Europe',
      '"data centre" "Kirby" OR "Mercury" OR "Spie" OR "Imtech" contract 2025',
      'data center "fit-out" OR "commissioning" contractor appointed Europe 2025',
    ],
  },
  {
    name: "Hyperscaler capex",
    description: "hyperscaler capital expenditure announcements and campus expansions",
    queries: [
      'Microsoft OR Google OR AWS OR Meta OR Oracle data center Europe 2025 new campus construction',
      '"data center campus" expansion 2025 2026 Europe construction underway',
      'hyperscaler "new data center" announced 2025 2026 Germany OR Ireland OR Netherlands OR Spain OR Poland',
    ],
  },
  {
    name: "Smaller and regional operators",
    description: "colocation providers, cloud-edge, and regional operator projects under 100MW",
    queries: [
      'colocation data center new construction 2025 Europe "under construction"',
      '"edge data center" OR "carrier-neutral" new facility 2025 Europe',
      'data center 10MW OR 20MW OR 30MW OR 50MW new construction 2025 Europe',
    ],
  },
];

// ─── Prompt builder ───────────────────────────────────────────────────────

export type HunterPromptOptions = {
  knownProjects?: Array<{ name: string; country: string | null }>;
  huntRunIndex?: number; // rotates the search angle each run
};

export function buildHunterUserPrompt(
  sector: Sector,
  options: HunterPromptOptions = {},
): string {
  const { knownProjects = [], huntRunIndex = 0 } = options;

  const countries = sector.targetCountries.length
    ? sector.targetCountries.join(", ")
    : "all of Europe";

  const keywords = sector.searchKeywords.length
    ? sector.searchKeywords.join(", ")
    : sector.name;

  // Rotate angle so each hunt searches differently
  const angle = SEARCH_ANGLES[huntRunIndex % SEARCH_ANGLES.length];

  // Recency cutoff — 60 days back
  const cutoffDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // Build exclusion block
  const exclusionBlock =
    knownProjects.length > 0
      ? `
PROJECTS TO SKIP (already in our database — return NONE of these):
${knownProjects.map((p) => `- ${p.name}${p.country ? ` (${p.country})` : ""}`).join("\n")}

These are already known. Do not return them. Only return projects NOT on this list.
`
      : "";

  return `Find NEW ${sector.name} construction projects with news or signals published AFTER ${cutoffDate}.

TARGET COUNTRIES: ${countries}
SECTOR KEYWORDS: ${keywords}
WORKER TYPES we supply: ${sector.typicalRoles.join(", ")}
${exclusionBlock}
THIS HUNT'S ANGLE: ${angle.name}
Focus on: ${angle.description}

Run these targeted searches:
${angle.queries.map((q) => `- ${q}`).join("\n")}

Also try:
- "${sector.name} construction news ${new Date().getFullYear()}"
- "${sector.name} contractor appointed ${countries.split(",")[0]?.trim() ?? "Europe"} ${new Date().getFullYear()}"

ONLY include projects where:
- The source article or permit notice was published after ${cutoffDate}
- The project is in a pre-construction or construction phase (not operational)
- There is a real source URL you found it at

For EACH qualifying project extract:
- project_name (specific name, e.g. "Microsoft DC Bissen Phase 2" not "Microsoft Data Center")
- client_company (operator / owner)
- general_contractor (if named in source)
- country (full name), country_code (ISO-2), city, region
- project_type (e.g. "Hyperscale Data Center", "Colocation Campus", "Edge Data Center")
- capacity (e.g. "150MW", "4,000 racks")
- estimated_value_eur (EUR; convert from USD/GBP if needed; null if not stated)
- phase: one of announced | permits_filed | permits_approved | groundbreaking | foundation | shell | fit_out | mep_install | commissioning
- phase_confidence (0-100)
- estimated_start_date (YYYY-MM-DD or null)
- estimated_completion_date (YYYY-MM-DD or null)
- peak_workforce_month (YYYY-MM or null)
- estimated_crew_size (peak workers on site; estimate from project scale)
- crew_breakdown (object: e.g. {"cable_pullers": 80, "electricians": 30, "supervisors": 5})
- ai_summary (2-3 sentences: what, where, when, and what it means for crew demand)
- ai_opportunity_score (0-100: how attractive for a labor broker; high if large crew + early phase + named GC)
- ai_match_score (0-100: how well our worker types match the project needs)
- ai_match_reasoning (1-2 sentences explaining match score)
- ai_next_actions (array of strings: specific next steps e.g. "Find GC project manager on LinkedIn", "Contact Kirby Group procurement")
- source_url (URL of the article or permit notice)
- source_text (1-2 sentence quote or excerpt from the source)
- source_date (YYYY-MM-DD when the article was published)

Return ONLY valid JSON — no markdown, no text outside the JSON:
{
  "projects": [ { ...all fields above... } ]
}`;
}

/**
 * Generate a deterministic fingerprint to dedupe projects.
 * Same project name + same country = same fingerprint.
 */
export function generateProjectFingerprint(
  projectName: string,
  country: string | null | undefined,
): string {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const namePart = normalize(projectName);
  const countryPart = country ? normalize(country) : "global";
  return `${namePart}__${countryPart}`;
}
