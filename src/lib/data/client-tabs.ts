import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { listReportsForCompany } from "@/lib/data/employee-reports";
import { reportSentence } from "@/lib/data/employee-report-policy";
import {
  composeClientTab,
  planClientTabLine,
  planPin,
  sameClient,
  tabIsQuiet,
  type ClientTabCloseReason,
  type ClientTabLine,
  type ClientTabView,
  type OpenTab,
} from "@/lib/data/client-tab-policy";

// ---------------------------------------------------------------------------
// Pinned client tabs — reads and writes (migration 056).
//
// The service client writes. A missing table (056 not applied) reads as "no
// tabs", and the agent endpoint refuses with a sentence a bot can repeat. The
// lines are keyed by company, not by tab, so a closed tab folds back into the
// company record and the bots still find them.
// ---------------------------------------------------------------------------

type Svc = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;

const LINE_COLUMNS =
  "id, kind, topic, text, said_by, said_on, due_on, source_kind, source_ref, firm_name, posting_ok, firm_answered, replaces_id, employee_name, created_at";

export const MIGRATION_MISSING = "Triangle cannot hold client tabs yet. Migration 056 has not been applied.";

function tableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table/i.test(error.message ?? "") ||
    (/client_tab/i.test(error.message ?? "") && /does not exist/i.test(error.message ?? ""))
  );
}

function rowToLine(row: Record<string, unknown>): ClientTabLine {
  return {
    id: String(row.id),
    kind: row.kind as ClientTabLine["kind"],
    topic: (row.topic as string | null) ?? null,
    text: String(row.text ?? ""),
    saidBy: (row.said_by as string | null) ?? null,
    saidOn: row.said_on ? String(row.said_on).slice(0, 10) : null,
    dueOn: row.due_on ? String(row.due_on).slice(0, 10) : null,
    sourceKind: (row.source_kind as ClientTabLine["sourceKind"]) ?? null,
    sourceRef: (row.source_ref as string | null) ?? null,
    firmName: (row.firm_name as string | null) ?? null,
    postingOk: (row.posting_ok as ClientTabLine["postingOk"]) ?? null,
    firmAnswered: (row.firm_answered as boolean | null) ?? null,
    replacesId: (row.replaces_id as string | null) ?? null,
    employeeName: String(row.employee_name ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

async function readOpenTabs(svc: Svc, orgId: string): Promise<OpenTab[] | "missing"> {
  const { data, error } = await svc
    .from("client_tabs")
    .select("id, company_id, company_name, pinned_at")
    .eq("org_id", orgId)
    .is("closed_at", null)
    .order("pinned_at", { ascending: true })
    .limit(20);
  if (tableMissing(error)) return "missing";
  if (error || !data) return [];
  const tabs: OpenTab[] = [];
  for (const row of data) {
    const last = await svc
      .from("client_tab_lines")
      .select("created_at")
      .eq("org_id", orgId)
      .ilike("company_name", String(row.company_name))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    tabs.push({
      id: String(row.id),
      companyId: (row.company_id as string | null) ?? null,
      companyName: String(row.company_name),
      pinnedAt: String(row.pinned_at),
      lastActivityAt: (last.data?.created_at as string | undefined) ?? null,
    });
  }
  return tabs;
}

/** The strip in the shell. Quiet tabs are shown, marked, until closed. */
export async function listOpenClientTabs(
  orgId: string,
): Promise<(OpenTab & { quiet: boolean })[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const tabs = await readOpenTabs(svc, orgId);
  if (tabs === "missing") return [];
  const now = new Date();
  return tabs.map((tab) => ({ ...tab, quiet: tabIsQuiet(tab, now) }));
}

async function findCompany(
  svc: Svc,
  orgId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const exact = await svc
    .from("companies")
    .select("id, name")
    .eq("organization_id", orgId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (exact.data) return { id: String(exact.data.id), name: String(exact.data.name) };
  const like = await svc
    .from("companies")
    .select("id, name")
    .eq("organization_id", orgId)
    .ilike("name", `%${name.replace(/[%_]/g, "")}%`)
    .limit(2);
  // Only a single, unambiguous match. Two hits means the owner's name is the
  // tab's name, and the bots can link the company later.
  if (like.data && like.data.length === 1) {
    return { id: String(like.data[0].id), name: String(like.data[0].name) };
  }
  return null;
}

export type PinResult =
  | { ok: true; companyId: string | null; companyName: string; alreadyOpen: boolean }
  | { ok: false; status: number; error: string };

/**
 * Pin a client by name (Ask) or by id (the pin action on a company page).
 * The owner named it, so this is the one write the owner makes; everything
 * on the page after that is written by the bots.
 */
export async function pinClientTab(params: {
  orgId: string;
  userId: string | null;
  companyId?: string | null;
  companyName?: string | null;
}): Promise<PinResult> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, status: 503, error: "Database unavailable." };

  let companyId = params.companyId ?? null;
  let companyName = (params.companyName ?? "").trim();
  if (companyId) {
    const { data } = await svc
      .from("companies")
      .select("id, name")
      .eq("organization_id", params.orgId)
      .eq("id", companyId)
      .maybeSingle();
    if (!data) return { ok: false, status: 404, error: "That company is not in this organisation." };
    companyName = String(data.name);
  } else if (companyName) {
    const found = await findCompany(svc, params.orgId, companyName);
    if (found) {
      companyId = found.id;
      companyName = found.name;
    }
  }

  const open = await readOpenTabs(svc, params.orgId);
  if (open === "missing") return { ok: false, status: 503, error: MIGRATION_MISSING };
  const plan = planPin(open, companyName);
  if (!plan.ok) return { ok: false, status: 409, error: plan.error };
  if (plan.alreadyOpen) {
    return {
      ok: true,
      companyId: plan.alreadyOpen.companyId,
      companyName: plan.alreadyOpen.companyName,
      alreadyOpen: true,
    };
  }

  const { error } = await svc.from("client_tabs").insert({
    org_id: params.orgId,
    company_id: companyId,
    company_name: companyName,
    pinned_by: params.userId,
  });
  if (error?.code === "23505") return { ok: true, companyId, companyName, alreadyOpen: true };
  if (tableMissing(error)) return { ok: false, status: 503, error: MIGRATION_MISSING };
  if (error) return { ok: false, status: 500, error: "Could not pin that client." };
  return { ok: true, companyId, companyName, alreadyOpen: false };
}

export async function closeClientTab(params: {
  orgId: string;
  tabId: string;
  reason: ClientTabCloseReason;
}): Promise<{ ok: boolean; error?: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, error: "Database unavailable." };
  const { error } = await svc
    .from("client_tabs")
    .update({ closed_at: new Date().toISOString(), closed_reason: params.reason })
    .eq("org_id", params.orgId)
    .eq("id", params.tabId)
    .is("closed_at", null);
  if (tableMissing(error)) return { ok: false, error: MIGRATION_MISSING };
  return error ? { ok: false, error: "Could not close that tab." } : { ok: true };
}

/** The tab key in the URL is the company id, or the pinned name when no company row matched. */
export async function getClientTab(
  orgId: string,
  key: string,
): Promise<
  | { found: false }
  | { found: true; tab: OpenTab | null; companyId: string | null; companyName: string; view: ClientTabView }
> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { found: false };
  const open = await readOpenTabs(svc, orgId);
  const tabs = open === "missing" ? [] : open;
  const decoded = decodeURIComponent(key);
  let tab = tabs.find((t) => t.companyId === decoded || sameClient(t.companyName, decoded)) ?? null;

  let companyId = tab?.companyId ?? null;
  let companyName = tab?.companyName ?? "";
  if (!tab) {
    // A closed tab folds back into the company record: the page still reads.
    const { data } = await svc
      .from("companies")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("id", /^[0-9a-f-]{36}$/i.test(decoded) ? decoded : "00000000-0000-0000-0000-000000000000")
      .maybeSingle();
    if (!data) return { found: false };
    companyId = String(data.id);
    companyName = String(data.name);
    tab = null;
  }

  const lines = await readLines(svc, orgId, companyId, companyName);
  const reports = companyId ? await listReportsForCompany(orgId, companyId, companyName) : [];
  const view = composeClientTab({
    lines: lines === "missing" ? [] : lines,
    reports: reports.map((r) => ({
      id: r.id,
      occurredOn: r.occurredOn,
      employeeName: r.source === "mailbox" ? "From the mailbox" : r.employeeName,
      sentence: [reportSentence(r), r.note].filter(Boolean).join(" "),
      evidenceUrl: r.evidenceUrl,
    })),
  });
  return { found: true, tab, companyId, companyName, view };
}

async function readLines(
  svc: Svc,
  orgId: string,
  companyId: string | null,
  companyName: string,
): Promise<ClientTabLine[] | "missing"> {
  const queries = [
    svc
      .from("client_tab_lines")
      .select(LINE_COLUMNS)
      .eq("org_id", orgId)
      .ilike("company_name", companyName)
      .order("created_at", { ascending: false })
      .limit(300),
  ];
  if (companyId) {
    queries.push(
      svc
        .from("client_tab_lines")
        .select(LINE_COLUMNS)
        .eq("org_id", orgId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(300),
    );
  }
  const results = await Promise.all(queries);
  if (results.some((r) => tableMissing(r.error))) return "missing";
  const byId = new Map<string, ClientTabLine>();
  for (const r of results) for (const row of r.data ?? []) byId.set(String(row.id), rowToLine(row));
  return Array.from(byId.values());
}

// ── Bots ───────────────────────────────────────────────────────────────────

export async function fileClientTabLine(params: {
  orgId: string;
  agentInstanceId: string;
  body: unknown;
}): Promise<
  | { ok: true; duplicate: boolean; lineId: string; companyName: string; pinned: boolean }
  | { ok: false; status: number; error: string }
> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, status: 503, error: "Database unavailable." };
  const { data: employee } = await svc
    .from("agent_instances")
    .select("display_name")
    .eq("id", params.agentInstanceId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  if (!employee) return { ok: false, status: 403, error: "This badge is not an employee of this organisation." };

  const planned = planClientTabLine(params.body);
  if (!planned.ok) return { ok: false, status: 400, error: planned.error };
  const p = planned.planned;

  let companyId = p.companyId;
  let companyName = p.companyName;
  if (companyId) {
    const { data } = await svc
      .from("companies")
      .select("id, name")
      .eq("organization_id", params.orgId)
      .eq("id", companyId)
      .maybeSingle();
    if (!data) return { ok: false, status: 404, error: "companyId is not a company of this organisation." };
    companyName = String(data.name);
  } else {
    const open = await readOpenTabs(svc, params.orgId);
    if (open === "missing") return { ok: false, status: 503, error: MIGRATION_MISSING };
    const tab = open.find((t) => sameClient(t.companyName, companyName));
    if (tab) {
      companyId = tab.companyId;
      companyName = tab.companyName;
    } else {
      const found = await findCompany(svc, params.orgId, companyName);
      if (found) {
        companyId = found.id;
        companyName = found.name;
      }
    }
  }

  const insert = {
    org_id: params.orgId,
    company_id: companyId,
    company_name: companyName,
    agent_instance_id: params.agentInstanceId,
    employee_name: String(employee.display_name ?? "Employee"),
    kind: p.kind,
    topic: p.topic,
    text: p.text,
    said_by: p.saidBy,
    said_on: p.saidOn,
    due_on: p.dueOn,
    source_kind: p.sourceKind,
    source_ref: p.sourceRef,
    firm_name: p.firmName,
    posting_ok: p.postingOk,
    firm_answered: p.firmAnswered,
    replaces_id: p.replacesId,
    idempotency_key: p.idempotencyKey,
  };
  const { data, error } = await svc.from("client_tab_lines").insert(insert).select("id").maybeSingle();
  if (error?.code === "23505") {
    const existing = await svc
      .from("client_tab_lines")
      .select("id")
      .eq("org_id", params.orgId)
      .eq("idempotency_key", p.idempotencyKey)
      .maybeSingle();
    if (existing.data) {
      return { ok: true, duplicate: true, lineId: String(existing.data.id), companyName, pinned: true };
    }
  }
  if (tableMissing(error)) return { ok: false, status: 503, error: MIGRATION_MISSING };
  if (error || !data) return { ok: false, status: 500, error: "Could not file that line." };

  const open = await readOpenTabs(svc, params.orgId);
  const pinned = open !== "missing" && open.some((t) => sameClient(t.companyName, companyName));
  return { ok: true, duplicate: false, lineId: String(data.id), companyName, pinned };
}

/** Firms that answered once, on any client: Scout reuses them first. */
export async function listFirmsOnFile(orgId: string): Promise<
  { firmName: string; clientName: string; reason: string; postingOk: string | null; sourceRef: string | null; on: string }[]
> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data, error } = await svc
    .from("client_tab_lines")
    .select("firm_name, company_name, text, posting_ok, source_ref, created_at")
    .eq("org_id", orgId)
    .eq("kind", "firm")
    .eq("firm_answered", true)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  const seen = new Set<string>();
  const out = [];
  for (const row of data) {
    const key = String(row.firm_name ?? "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      firmName: String(row.firm_name),
      clientName: String(row.company_name),
      reason: String(row.text),
      postingOk: (row.posting_ok as string | null) ?? null,
      sourceRef: (row.source_ref as string | null) ?? null,
      on: String(row.created_at).slice(0, 10),
    });
  }
  return out;
}

export async function listOpenTabsForBots(orgId: string) {
  const tabs = await listOpenClientTabs(orgId);
  return tabs.map((t) => ({
    tabId: t.id,
    company: t.companyName,
    companyId: t.companyId,
    pinnedAt: t.pinnedAt,
    lastLineAt: t.lastActivityAt,
    quiet: t.quiet,
  }));
}
