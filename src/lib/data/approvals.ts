import "server-only";
import { loadAgentFaces } from "@/lib/data/agent-identity";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// One approvals queue across every agent.
//
// Built because of a real complaint: "when Scout finds potential clients I
// couldn't see." He filed sourced suggestions on the Salzgitter plant — but
// they lived inside one project page's collapsed panel, so unless you already
// knew which project to open, the work was invisible.
//
// Research suggestions and net-new findings are different tables with
// different shapes. Here they become one list of decisions, newest first,
// so nothing an employee produces can hide.
// ---------------------------------------------------------------------------

export type ApprovalKind = "research_suggestion" | "finding";
export type ApprovalStatus = "pending" | "accepted" | "rejected";

export interface ApprovalItem {
  id: string;
  kind: ApprovalKind;
  /** research_suggestion: chain_node | buyer_contact | package_opportunity | note */
  itemType: string;
  headline: string;
  detail: string | null;
  confidence: number | null;
  sourceUrl: string | null;
  evidenceText: string | null;
  createdAt: string;
  /** Where it belongs — the project for a suggestion, null for a net-new finding. */
  projectId: string | null;
  projectName: string | null;
  agentName: string | null;
  agentEmoji: string | null;
}

/** Turn a suggestion payload into one readable line. */
function summarize(
  type: string,
  p: Record<string, unknown>,
): { headline: string; detail: string | null } {
  const s = (k: string) => (p[k] == null ? null : String(p[k]));
  const join = (parts: (string | null)[]) => parts.filter(Boolean).join(" · ") || null;

  if (type === "chain_node") {
    return {
      headline: `${s("company") ?? "Unknown company"} — ${s("role") ?? "role unclear"}`,
      detail: join([s("package") ? `Package: ${s("package")}` : null, s("status")]),
    };
  }
  if (type === "buyer_contact") {
    return {
      headline: `${s("name") ?? "Unknown person"} — ${s("title") ?? "title unknown"}`,
      detail: join([s("company"), s("role_reason")]),
    };
  }
  if (type === "package_opportunity") {
    return {
      headline: s("package_type") ?? "Package opportunity",
      detail: join([
        s("likely_buyer") ? `Likely buyer: ${s("likely_buyer")}` : null,
        s("reason"),
      ]),
    };
  }
  if (type === "note") {
    const content = s("content") ?? "";
    return {
      headline: content.length > 110 ? `${content.slice(0, 110)}…` : content || "Note",
      detail: s("note_type"),
    };
  }
  return { headline: type, detail: null };
}

export async function listApprovals(
  orgId: string,
  opts: { status?: ApprovalStatus; limit?: number } = {},
): Promise<ApprovalItem[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const status = opts.status ?? "pending";
  const limit = opts.limit ?? 200;

  // Suggestions distinguish "accepted" from "edited and accepted"; to a
  // manager reviewing history those are the same decision.
  const suggestionStatuses =
    status === "accepted" ? ["accepted", "edited_and_accepted"] : [status];

  const [sugRes, findRes] = await Promise.all([
    svc
      .from("research_suggestions")
      .select(
        "id, suggestion_type, payload_json, confidence, source_url, evidence_text, created_at, project_id, created_by_agent",
      )
      .eq("org_id", orgId)
      .in("status", suggestionStatuses)
      .order("created_at", { ascending: false })
      .limit(limit),
    svc
      .from("agent_findings")
      .select(
        "id, finding_type, payload, confidence, source_url, evidence_text, created_at, agent_instance_id",
      )
      .eq("org_id", orgId)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const suggestions = sugRes.data ?? [];
  const findings = findRes.data ?? [];

  // Project names, so a decision has context without opening anything.
  const projectIds = Array.from(
    new Set(suggestions.map((s) => s.project_id).filter(Boolean) as string[]),
  );
  const projects = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data } = await svc
      .from("discovered_projects")
      .select("id, project_name")
      .in("id", projectIds);
    for (const p of data ?? []) projects.set(p.id as string, p.project_name as string);
  }

  // Suggestions store a free-text `created_by_agent` (the machine credential's
  // name); findings link to an instance directly. Both resolve through the same
  // shared lookup so one person doesn't appear under two names.
  const { byId, fromCredentialName } = await loadAgentFaces(orgId);

  const items: ApprovalItem[] = [];

  for (const s of suggestions) {
    const { headline, detail } = summarize(
      s.suggestion_type as string,
      (s.payload_json as Record<string, unknown>) ?? {},
    );
    const who = fromCredentialName((s.created_by_agent as string | null) ?? null);
    items.push({
      id: s.id as string,
      kind: "research_suggestion",
      itemType: s.suggestion_type as string,
      headline,
      detail,
      confidence: (s.confidence as number) ?? null,
      sourceUrl: (s.source_url as string) ?? null,
      evidenceText: (s.evidence_text as string) ?? null,
      createdAt: s.created_at as string,
      projectId: (s.project_id as string) ?? null,
      projectName: s.project_id ? projects.get(s.project_id as string) ?? null : null,
      agentName: who?.name ?? null,
      agentEmoji: who?.emoji ?? null,
    });
  }

  for (const f of findings) {
    const p = (f.payload as Record<string, unknown>) ?? {};
    const who = f.agent_instance_id ? byId.get(f.agent_instance_id as string) : undefined;
    items.push({
      id: f.id as string,
      kind: "finding",
      itemType: f.finding_type as string,
      // A channel proposal is about the channel, not the person. Three
      // findings for Peter Östlund all rendered as "Peter Östlund" and could
      // only be told apart by reading their quotes — the CEO was being asked
      // to accept three identical-looking cards.
      headline: p.kind && p.value
        ? `${String(p.full_name ?? "Contact")} — ${String(p.value)}`
        : String(
            p.full_name ??
              p.project_name ??
              p.company_name ??
              p.name ??
              p.company ??
              f.finding_type,
          ),
      // Never the CV text itself — that is tens of thousands of characters and
      // belongs behind the decision, not in the queue.
      detail:
        [
          // Whose desk this actually is. "switchboard" next to a number is
          // the difference between calling and expecting the right voice.
          p.scope
            ? `${String(p.scope)}${p.belongs_to ? ` — ${String(p.belongs_to)}` : ""}`
            : null,
          p.role,
          p.parent ? `Part of ${String(p.parent)}` : null,
          p.project ? `On ${String(p.project)}` : null,
          p.country,
          Array.isArray(p.certificates) && p.certificates.length
            ? (p.certificates as string[]).join(", ")
            : null,
          Array.isArray(p.languages) && p.languages.length
            ? (p.languages as string[]).join(", ")
            : null,
          p.client_company,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      confidence: (f.confidence as number) ?? null,
      sourceUrl: (f.source_url as string) ?? null,
      evidenceText: (f.evidence_text as string) ?? null,
      createdAt: f.created_at as string,
      projectId: null,
      projectName: null,
      agentName: who?.name ?? null,
      agentEmoji: who?.emoji ?? null,
    });
  }

  return items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** Badge count for the sidebar: how many decisions are waiting on a human. */
export async function countPendingApprovals(orgId: string): Promise<number> {
  const svc = createServiceSupabaseClient();
  if (!svc) return 0;
  const head = { count: "exact" as const, head: true };
  const [a, b] = await Promise.all([
    svc
      .from("research_suggestions")
      .select("id", head)
      .eq("org_id", orgId)
      .eq("status", "pending"),
    svc.from("agent_findings").select("id", head).eq("org_id", orgId).eq("status", "pending"),
  ]);
  return (a.count ?? 0) + (b.count ?? 0);
}
