import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// The structured facts a project needs before any filter on this app works.
//
// Eighteen discovered projects carried sector_id = NULL, country_code = NULL,
// phase = NULL and estimated_crew_size = NULL. The consequence was not cosmetic:
// Signal Inbox filters by sector, so the one unlocked sector tab returned an
// empty page, and the country pills filtered on a column that was null on every
// row. Tabs that render, accept a click, and can never match anything.
//
// The fix is not for a human to sit and type them in. A researcher who has
// already read the source knows the country, the phase and roughly how many
// people it takes — so filling these in is part of the research, and it comes
// back as a proposal like every other claim.
// ---------------------------------------------------------------------------

/** Fields an agent may propose for an existing project. Nothing else is read. */
export const PROJECT_FACT_FIELDS = [
  "country",
  "country_code",
  "city",
  "region",
  "phase",
  "project_type",
  "capacity",
  "client_company",
  "general_contractor",
  "estimated_crew_size",
  "estimated_value_eur",
  "estimated_start_date",
  "estimated_completion_date",
  "peak_workforce_month",
] as const;

/**
 * The phases the database actually accepts.
 *
 * `discovered_projects.phase` carries a CHECK constraint. A researcher writing
 * the obvious English word — "construction", "planning", "tender" — fails the
 * whole acceptance with a Postgres constraint error, taking every other good
 * field on the finding down with it. Normalised here so one wrong word costs
 * that one field, and the rest still lands.
 */
export const PROJECT_PHASES = [
  "announced",
  "permits_filed",
  "permits_approved",
  "groundbreaking",
  "foundation",
  "shell",
  "fit_out",
  "mep_install",
  "commissioning",
  "operational",
  "unknown",
] as const;

/** Everyday words a researcher will reach for, mapped to the real values. */
const PHASE_SYNONYMS: Record<string, string> = {
  planning: "announced",
  planned: "announced",
  proposed: "announced",
  announced: "announced",
  tender: "permits_filed",
  tendering: "permits_filed",
  permitting: "permits_filed",
  permits: "permits_filed",
  approved: "permits_approved",
  construction: "shell",
  building: "shell",
  structure: "shell",
  groundworks: "groundbreaking",
  breaking_ground: "groundbreaking",
  foundations: "foundation",
  "fit-out": "fit_out",
  fitout: "fit_out",
  finishing: "fit_out",
  mep: "mep_install",
  "m&e": "mep_install",
  electrical: "mep_install",
  installation: "mep_install",
  commissioned: "commissioning",
  testing: "commissioning",
  live: "operational",
  operating: "operational",
  complete: "operational",
  completed: "operational",
};

/** null when nothing sensible maps — a dropped field beats a failed accept. */
export function normalizePhase(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).trim().toLowerCase().replace(/\s+/g, "_");
  if ((PROJECT_PHASES as readonly string[]).includes(raw)) return raw;
  const hyphen = raw.replace(/_/g, "-");
  return PHASE_SYNONYMS[raw] ?? PHASE_SYNONYMS[hyphen] ?? null;
}

/**
 * ISO-3166 alpha-2 for the countries Triangle's sectors actually target, plus
 * the near neighbours that turn up in sourcing. A name Triangle cannot map is
 * left null rather than guessed — a wrong country code silently files a project
 * under a market nobody is selling into.
 */
const COUNTRY_CODES: Record<string, string> = {
  germany: "DE", deutschland: "DE",
  austria: "AT", österreich: "AT", osterreich: "AT",
  switzerland: "CH", schweiz: "CH",
  netherlands: "NL", holland: "NL",
  belgium: "BE", luxembourg: "LU",
  france: "FR", spain: "ES", españa: "ES", espana: "ES",
  portugal: "PT", italy: "IT", italia: "IT",
  ireland: "IE", "united kingdom": "GB", uk: "GB", britain: "GB",
  england: "GB", scotland: "GB", wales: "GB",
  poland: "PL", polska: "PL",
  "czech republic": "CZ", czechia: "CZ",
  slovakia: "SK", hungary: "HU", romania: "RO",
  slovenia: "SI", croatia: "HR", serbia: "RS", bulgaria: "BG",
  sweden: "SE", norway: "NO", denmark: "DK", finland: "FI",
  estonia: "EE", latvia: "LV", lithuania: "LT",
  turkey: "TR", türkiye: "TR", turkiye: "TR",
  greece: "GR",
};

/**
 * Derive an ISO code from whatever the record holds — "Valencia, Spain",
 * "Bursa, Turkey", "Germany". Returns null when nothing matches, which is the
 * honest answer for "Europe" or a blank.
 */
export function toCountryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^[A-Z]{2}$/.test(raw)) return raw;

  const lower = raw.toLowerCase();
  // Longest key first, so "united kingdom" wins over "uk" inside other words.
  const keys = Object.keys(COUNTRY_CODES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (new RegExp(`(^|[^a-z])${key}([^a-z]|$)`).test(lower)) {
      return COUNTRY_CODES[key];
    }
  }
  return null;
}

/**
 * Which sector this project belongs to.
 *
 * Extracted from the accept-a-project branch so a project created by an
 * approval and one corrected later cannot disagree about the answer. Matches
 * the words in a sector's own name against the text — no model call, no
 * invented taxonomy.
 *
 * Returns null when nothing matches, and that is deliberate. This previously
 * fell back to "whichever sector is active", which filed an EV plant in
 * Valencia under Data Centers — a project sitting in a filter it does not
 * belong to, and missing from the one it does. An unclassified project is
 * visible under "All" and honest; a misfiled one is neither.
 */
export async function classifySector(
  orgId: string,
  text: string,
  statedSector?: string | null,
): Promise<string | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data: sectors } = await svc
    .from("sectors")
    .select("id, name")
    .eq("organization_id", orgId);
  const all = sectors ?? [];

  // A researcher who names the sector outright is the best signal available.
  if (statedSector) {
    const stated = String(statedSector).toLowerCase();
    const named = all.find((s) => {
      const n = String(s.name).toLowerCase();
      return n === stated || n.includes(stated) || stated.includes(n);
    });
    if (named) return named.id as string;
  }

  const haystack = text.toLowerCase();
  const words = (n: string) =>
    n.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);

  const matched = all.find((s) =>
    words(s.name as string).some((w) => haystack.includes(w)),
  );
  return (matched?.id as string | undefined) ?? null;
}

export interface ProjectFactsResult {
  updated: string[];
  skipped: string[];
}

/**
 * Write proposed facts onto an existing project.
 *
 * Only fills what is genuinely empty. A researcher correcting a blank is
 * useful; an agent overwriting a value a human already set is not, and there is
 * no way for the human to notice it happened.
 */
export async function applyProjectFacts(params: {
  projectId: string;
  orgId: string;
  payload: Record<string, unknown>;
}): Promise<ProjectFactsResult | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data: project } = await svc
    .from("discovered_projects")
    .select(
      "id, project_name, sector_id, ai_summary, " + PROJECT_FACT_FIELDS.join(", "),
    )
    .eq("organization_id", params.orgId)
    .eq("id", params.projectId)
    .maybeSingle();
  if (!project) return null;

  const row = project as unknown as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const field of PROJECT_FACT_FIELDS) {
    const incoming = params.payload[field];
    if (incoming === undefined || incoming === null || incoming === "") continue;
    if (row[field] !== null && row[field] !== undefined && row[field] !== "") {
      skipped.push(field);
      continue;
    }
    const value = coerce(field, incoming);
    // A field the database would reject is dropped, not forced through. It is
    // reported back as skipped so the reason is visible.
    if (value === null || value === undefined) {
      skipped.push(field);
      continue;
    }
    updates[field] = value;
    updated.push(field);
  }

  // country_code is derivable, so a researcher who gave only "Valencia, Spain"
  // still fixes the country filter without being asked for an ISO code.
  if (!updates.country_code && !row.country_code) {
    const code = toCountryCode(
      (updates.country as string) ?? (row.country as string) ?? null,
    );
    if (code) {
      updates.country_code = code;
      updated.push("country_code");
    }
  }

  if (!row.sector_id) {
    const sectorId = await classifySector(
      params.orgId,
      [
        row.project_name,
        updates.project_type ?? row.project_type,
        row.ai_summary,
      ]
        .filter(Boolean)
        .join(" "),
      params.payload.sector ? String(params.payload.sector) : null,
    );
    if (sectorId) {
      updates.sector_id = sectorId;
      updated.push("sector_id");
    }
  }

  if (updated.length === 0) return { updated, skipped };

  const { error } = await svc
    .from("discovered_projects")
    .update(updates)
    .eq("id", params.projectId)
    .eq("organization_id", params.orgId);
  if (error) throw new Error(error.message);

  return { updated, skipped };
}

function coerce(field: string, value: unknown): unknown {
  if (field === "phase") return normalizePhase(value);
  if (
    field === "estimated_crew_size" ||
    field === "estimated_value_eur" ||
    field === "peak_workforce_month"
  ) {
    const n = Number(String(value).replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  if (field === "country_code") return String(value).toUpperCase().slice(0, 2);
  return String(value).slice(0, 500);
}
