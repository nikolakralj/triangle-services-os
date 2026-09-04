import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Filling in a requirement without a human typing thirty fields.
//
// The requirement editor asks for scope, exclusions, roles, headcount,
// seniority, country, city, site, dates, duration, shifts, skills, documents,
// engagement model, budget, currency, rate unit, payment terms, feasibility,
// onboarding, unknowns and evidence. Faced with that, the honest reaction is
// the one management had: "for what? I have to handle a shitload of data."
//
// The object is right — it is the commercial success object AGENTS.md names,
// and the one the database refuses to let anyone fake. The FORM was wrong.
// Most of those fields are research, not decisions: a person who has read the
// tender knows the country, the duration and the shift pattern.
//
// So a researcher proposes them and a human accepts. What is left for the human
// is the part that is genuinely theirs: whether the buyer has confirmed demand,
// and what the next action is.
// ---------------------------------------------------------------------------

/**
 * What an agent may propose. Deliberately excludes `status`,
 * `buyer_confirmed_at` and `decision_reason` — a commercial decision is not
 * research, and no agent gets to move this record toward "qualified".
 */
export const REQUIREMENT_FACT_FIELDS = [
  "scope_summary",
  "exclusions",
  "roles",
  "headcount_min",
  "headcount_max",
  "seniority",
  "country",
  "city",
  "site_location",
  "start_date_from",
  "start_window_text",
  "duration_weeks",
  "duration_text",
  "shift_pattern",
  "required_skills",
  "required_documents",
  "engagement_model",
  "currency",
  "rate_unit",
  "commercial_notes",
  "unknowns",
  "demand_evidence_url",
  "demand_evidence_date",
  "demand_evidence_summary",
] as const;

const NUMERIC = new Set(["headcount_min", "headcount_max", "duration_weeks"]);
const LIST = new Set(["roles", "required_skills", "required_documents", "exclusions"]);

export interface RequirementFactsResult {
  updated: string[];
  skipped: string[];
}

export async function applyRequirementFacts(params: {
  requirementId: string;
  orgId: string;
  payload: Record<string, unknown>;
}): Promise<RequirementFactsResult | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data: row } = await svc
    .from("commercial_requirements")
    .select("id, " + REQUIREMENT_FACT_FIELDS.join(", "))
    .eq("org_id", params.orgId)
    .eq("id", params.requirementId)
    .maybeSingle();
  if (!row) return null;

  const current = row as unknown as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const field of REQUIREMENT_FACT_FIELDS) {
    const incoming = params.payload[field];
    if (incoming === undefined || incoming === null || incoming === "") continue;

    // Only blanks. A value a human already set is theirs, and an agent
    // overwriting it is a change nobody would ever notice happened.
    const existing = current[field];
    const isEmpty =
      existing === null ||
      existing === undefined ||
      existing === "" ||
      (Array.isArray(existing) && existing.length === 0);
    if (!isEmpty) {
      skipped.push(field);
      continue;
    }

    const value = coerce(field, incoming);
    if (value === null) {
      skipped.push(field);
      continue;
    }
    updates[field] = value;
    updated.push(field);
  }

  if (updated.length === 0) return { updated, skipped };

  const { error } = await svc
    .from("commercial_requirements")
    .update(updates)
    .eq("id", params.requirementId)
    .eq("org_id", params.orgId);
  if (error) throw new Error(error.message);

  return { updated, skipped };
}

function coerce(field: string, value: unknown): unknown {
  if (NUMERIC.has(field)) {
    const n = Number(String(value).replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  if (LIST.has(field)) {
    const list = Array.isArray(value)
      ? value.map(String)
      : String(value).split(",");
    const clean = list.map((v) => v.trim()).filter(Boolean).slice(0, 40);
    return clean.length > 0 ? clean : null;
  }
  return String(value).slice(0, 4000);
}
