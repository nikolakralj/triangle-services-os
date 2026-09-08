import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { parseScoutCaseReport } from "@/lib/ai/scout-case-report";
import { loadAgentFaces } from "@/lib/data/agent-identity";

// ---------------------------------------------------------------------------
// What came back while you were away.
//
// "So I am handing out in Workforce and then I see details in Cockpit and also
// Workforce ... it is so confusing."
//
// It was. One event — an employee finished a job — appeared in the Cockpit's
// Agent Desk, again in "What you handed out" on Workforce, again in the
// Decision Inbox, and its evidence again in the Signal Inbox. Four
// vocabularies for the same thing, and no single place where a decision could
// actually be taken.
//
// This is that one place. Every item carries the state migration 041 forced it
// into, and every item's buttons write a real record — a discard writes a
// rejection with a reason so the lead never comes back, which is the state the
// app previously could not express at all.
// ---------------------------------------------------------------------------

export type FindingState = "reachable" | "one_thing_missing" | "dead";

export interface CameBackItem {
  /** `finding:<id>` or `assignment:<id>` — the source is part of the identity. */
  key: string;
  kind: "finding" | "assignment";
  id: string;
  state: FindingState | null;
  title: string;
  /** One line a CEO can read without opening anything. */
  line: string;
  authorName: string;
  authorEmoji: string;
  at: string;

  /** reachable: how to actually reach them. */
  reach: { kind: string; value: string; howToOpen: string | null } | null;
  /** one_thing_missing: the single fact, and who fetches it. */
  missing: { fact: string; owner: string } | null;
  /** dead: why, so it is never presented again. */
  deadReason: string | null;
  /** The employee's full hand-in, for progressive disclosure. */
  fullReport: string | null;

  sourceUrl: string | null;
}

/** Newest first, and the ones you can act on today first within that. */
const STATE_RANK: Record<string, number> = {
  reachable: 0,
  one_thing_missing: 1,
  dead: 2,
};

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Does this read as JSON rather than as a sentence? */
function looksLikeJson(text: string): boolean {
  const t = text.trimStart();
  return t.startsWith("{") || t.startsWith("[") || /"\s*:\s*"/.test(t.slice(0, 200));
}

/**
 * A sentence a person can read, or an honest admission there isn't one.
 *
 * This is the third time raw JSON has reached the CEO's screen. The mechanism
 * here: a reachability report is valid JSON but not a case report, so
 * parseScoutCaseReport's schema check fails and it falls through to the LEGACY
 * PROSE parser — which dutifully treats the JSON source text as prose and
 * returns it as `executiveSummary`. Reading executiveSummary first therefore
 * printed `{"version":1,"found":true,"headline":…` straight onto the page.
 *
 * So the known shapes are read first, and anything that still looks like JSON
 * is refused rather than truncated. "No readable summary" is a worse-looking
 * line and a more honest one.
 */
function humanLine(
  raw: Record<string, unknown> | null,
  report: { executiveSummary?: string } | null,
  fallback: string,
): string {
  const candidate =
    firstString(raw?.headline, raw?.howToOpen, raw?.notFoundReason) ??
    firstString(report?.executiveSummary) ??
    fallback.slice(0, 240);
  if (!candidate || looksLikeJson(candidate)) {
    return "No readable summary — open the whole report.";
  }
  return candidate;
}

/**
 * How many things actually need a decision, for the sidebar badge.
 *
 * The badge read 52 while the screen it links to said "nothing to decide".
 * It was counting `countDecisionAttention` — every pending proposal ever
 * filed, including the thirty that predate the contract and carry no state.
 * A number in the chrome that overstates what needs a human is the same lie
 * as a pipeline that looks fuller than it is, and it trains you to ignore
 * the badge.
 *
 * Only rows the contract can describe are counted, because only those can
 * be acted on.
 */
export async function countDecisions(orgId: string): Promise<number> {
  const svc = createServiceSupabaseClient();
  if (!svc) return 0;
  const { count } = await svc
    .from("agent_findings")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "pending")
    .not("finding_state", "is", null)
    .in("finding_type", ["project", "company", "contact", "contact_channel"]);
  return count ?? 0;
}

export async function listWhatCameBack(
  orgId: string,
  limit = 30,
): Promise<CameBackItem[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const [findingsRes, assignmentsRes, faces] = await Promise.all([
    svc
      .from("agent_findings")
      .select(
        "id, finding_type, finding_state, payload, source_url, evidence_text, created_at, agent_instance_id, status",
      )
      .eq("org_id", orgId)
      .eq("status", "pending")
      .in("finding_type", ["project", "company", "contact", "contact_channel"])
      .order("created_at", { ascending: false })
      .limit(limit),
    svc
      .from("agent_assignments")
      .select(
        "id, title, finding_state, result_summary, completed_at, created_at, agent_instance_id, constraints",
      )
      .eq("org_id", orgId)
      .eq("status", "completed")
      .not("result_summary", "is", null)
      .order("completed_at", { ascending: false })
      .limit(limit),
    loadAgentFaces(orgId),
  ]);

  const items: CameBackItem[] = [];

  for (const row of findingsRes.data ?? []) {
    const p = (row.payload as Record<string, unknown>) ?? {};
    const face = faces.byId.get(row.agent_instance_id as string);
    const state = (row.finding_state as FindingState | null) ?? null;

    const name = firstString(p.full_name, p.name, p.decision_maker, p.labour_buyer);
    const company = firstString(p.company, p.company_name, p.client_company);
    const channelValue = firstString(p.value, p.phone, p.email);

    items.push({
      key: `finding:${row.id}`,
      kind: "finding",
      id: row.id as string,
      state,
      title: [name, company].filter(Boolean).join(" · ") ||
        firstString(p.project_name) ||
        "Untitled finding",
      line:
        firstString(row.evidence_text, p.how_to_open, p.summary, p.notes, p.note) ??
        "No evidence recorded.",
      authorName: face?.name ?? "An employee",
      authorEmoji: face?.emoji ?? "🤖",
      at: (row.created_at as string) ?? "",
      reach:
        state === "reachable" && channelValue
          ? {
              kind: firstString(p.kind) ?? (channelValue.includes("@") ? "email" : "phone"),
              value: channelValue,
              howToOpen: firstString(p.how_to_open),
            }
          : null,
      missing:
        state === "one_thing_missing"
          ? {
              fact: firstString(p.missing) ?? "Not recorded.",
              owner: firstString(p.missing_owner) ?? "Nobody",
            }
          : null,
      deadReason: state === "dead" ? firstString(p.dead_reason) : null,
      fullReport: null,
      sourceUrl: (row.source_url as string) ?? null,
    });
  }

  for (const row of assignmentsRes.data ?? []) {
    const face = faces.byId.get(row.agent_instance_id as string);
    const state = (row.finding_state as FindingState | null) ?? null;
    const report = parseScoutCaseReport((row.result_summary as string) ?? null);

    // A reachability report is a different shape and does not parse as a case
    // report; read its channel directly rather than showing nothing.
    let raw: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse((row.result_summary as string) ?? "");
      if (parsed && typeof parsed === "object") raw = parsed as Record<string, unknown>;
    } catch {
      raw = null;
    }
    const channels = Array.isArray(raw?.channels)
      ? (raw!.channels as Array<Record<string, unknown>>)
      : [];

    items.push({
      key: `assignment:${row.id}`,
      kind: "assignment",
      id: row.id as string,
      state,
      title: (row.title as string) ?? "Untitled job",
      line: humanLine(raw, report, (row.result_summary as string) ?? ""),
      authorName: face?.name ?? "An employee",
      authorEmoji: face?.emoji ?? "🤖",
      at: (row.completed_at as string) ?? (row.created_at as string) ?? "",
      reach:
        state === "reachable"
          ? channels.length > 0 && typeof channels[0].value === "string"
            ? {
                kind: String(channels[0].kind ?? "phone"),
                value: String(channels[0].value),
                howToOpen: firstString(raw?.howToOpen),
              }
            : report?.buyerPath?.publicDoor || report?.nextCommercialAction?.channel
              ? {
                  kind: "link",
                  value: String(
                    report?.buyerPath?.publicDoor ??
                      report?.nextCommercialAction?.channel,
                  ),
                  howToOpen: report?.nextCommercialAction?.action ?? null,
                }
              : null
          : null,
      missing:
        state === "one_thing_missing" && report
          ? {
              fact: report.unknowns[0] ?? "Not recorded.",
              owner: report.missingOwner ?? "Nobody",
            }
          : null,
      deadReason:
        state === "dead"
          ? report?.deadReason ?? firstString(raw?.notFoundReason)
          : null,
      fullReport: (row.result_summary as string) ?? null,
      sourceUrl: report?.sources[0]?.url ?? null,
    });
  }

  return items
    .sort((a, b) => {
      const s =
        (STATE_RANK[a.state ?? ""] ?? 3) - (STATE_RANK[b.state ?? ""] ?? 3);
      if (s !== 0) return s;
      return (b.at || "").localeCompare(a.at || "");
    })
    .slice(0, limit);
}
