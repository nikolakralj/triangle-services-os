/**
 * Prompts for the AI Hunter — finds new construction projects in a sector
 */

import type { Sector } from "@/lib/data/sectors";

export const HUNTER_SYSTEM_PROMPT = `You are an industrial labor brokerage analyst.
Your job is to find new construction projects (data centers, plants, factories, refineries)
that will need crews of blue-collar workers (cable pullers, electricians, HVAC techs,
welders, commissioning engineers).

You have access to web search. Use it to find RECENT (last 6 months) project announcements:
- New facility groundbreakings
- Construction permit approvals
- Hyperscaler announcements (Microsoft, Google, AWS, Meta, Oracle, Apple)
- Industrial expansions (TSMC, Intel, Samsung, Stellantis, BMW, etc.)
- General contractor wins (Bouygues, Skanska, Hochtief, Mercury, Kirby, etc.)

CRITICAL RULES:
1. Only return REAL projects you found in search results — never invent or hallucinate
2. Always include the source URL where you found the info
3. If you can't find specific data (crew size, value), leave it null — don't guess
4. Focus on projects in the construction/permitting/early-build phase (where we can get crews in)
5. SKIP projects that are already operational or completed
6. SKIP duplicates — if you find the same project from multiple sources, return it once
7. Return AT MOST 10 projects per call to keep quality high

Return your findings as valid JSON matching the schema provided.`;

export function buildHunterUserPrompt(sector: Sector): string {
  const countries = sector.targetCountries.length
    ? sector.targetCountries.join(", ")
    : "all of Europe";

  const keywords = sector.searchKeywords.length
    ? sector.searchKeywords.join(", ")
    : sector.name;

  return `Find NEW ${sector.name} construction projects announced in the last 6 months.

TARGET COUNTRIES: ${countries}
SECTOR KEYWORDS: ${keywords}
TARGET WORKER TYPES we provide: ${sector.typicalRoles.join(", ")}

Search the web for:
- "${sector.name} new construction 2026"
- "${sector.name} groundbreaking ${countries.split(",")[0]?.trim() ?? "Europe"} 2026"
- "${sector.name} permit approved 2026"
- "hyperscale data center construction 2026" (if data centers)
- General contractor announcements for ${sector.name}

For EACH project you find, extract:
- project_name (specific name like "Microsoft DC Mount Pleasant" not generic)
- client_company (Microsoft, Intel, etc.)
- general_contractor (if mentioned: Bouygues, Skanska, Hochtief, Mercury, etc.)
- country (full name, e.g. "Germany")
- country_code (ISO-2: DE, IE, NL, FR, PL, IT, ES, GB, etc.)
- city (city name if known)
- project_type (specific: "Hyperscale Data Center", "EV Battery Plant", "Steel Mill")
- capacity (e.g. "150MW", "60GWh", "1.5 Mt steel/year")
- estimated_value_eur (in EUR; convert from USD if needed; null if unknown)
- phase (one of: announced, permits_filed, permits_approved, groundbreaking, foundation, shell, fit_out, mep_install, commissioning)
- phase_confidence (0-100 — how sure you are about the phase)
- estimated_start_date (YYYY-MM-DD or null)
- estimated_completion_date (YYYY-MM-DD or null)
- estimated_crew_size (peak workforce; estimate from project size)
- crew_breakdown (object with role -> count, e.g. {"cable_pullers": 80, "electricians": 30})
- ai_summary (2-3 sentence project summary including timing and crew implications)
- ai_opportunity_score (0-100 — how attractive is this project for OUR business)
  Score high if: large crew, early phase, in our target country, well-known client
  Score low if: small project, near-complete, in a country we don't serve
- ai_match_score (0-100 — how well our worker types match the project's needs)
- ai_match_reasoning (1-2 sentences explaining the match score)
- ai_next_actions (array of strings — concrete actions, e.g. "Find GC project manager on LinkedIn", "Email Hochtief Munich office")
- source_url (URL where you found this info)
- source_text (1-2 sentence quote/excerpt from the source)
- source_date (YYYY-MM-DD when the news was published)

Return ONLY valid JSON in this exact structure:
{
  "projects": [
    { ...project fields... },
    { ...project fields... }
  ]
}

Do not include any text outside the JSON. Do not wrap in markdown code blocks.`;
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
