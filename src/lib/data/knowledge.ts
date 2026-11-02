import "server-only";
import { BOB_ROLE_KEYS } from "@/lib/data/ask-bob-policy";
import { HANNA_ROLE_KEYS } from "@/lib/data/ask-hanna-policy";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// The knowledge list (migration 057).
//
// knowledge_items is where a new decision is proposed. knowledge_view reads
// that table together with the stores that already hold the same kind of
// fact: the current house rules, active mission decisions, worker notes,
// intake rules, project notes, and accepted research notes.
//
// This module only reads. Nothing here approves, retires, or hands an item
// to an employee. A missing table (057 not applied) reads as an empty list.
// ---------------------------------------------------------------------------

export const KNOWLEDGE_CATEGORIES = [
  "house_rule",
  "decision",
  "process",
  "rate",
  "worker_note",
  "project_note",
  "intake_rule",
] as const;

export const KNOWLEDGE_STATUSES = [
  "proposed",
  "approved",
  "retired",
  "superseded",
  "rejected",
] as const;

export const KNOWLEDGE_SOURCE_KINDS = [
  "voice",
  "whatsapp",
  "email",
  "chat",
  "call_note",
  "migrated",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];
export type KnowledgeSourceKind = (typeof KNOWLEDGE_SOURCE_KINDS)[number];

export interface KnowledgeItem {
  id: string;
  orgId: string;
  category: KnowledgeCategory;
  topic: string | null;
  title: string;
  body: string;
  /** Empty means every employee. */
  appliesToRoles: string[];
  missionId: string | null;
  companyId: string | null;
  workerId: string | null;
  projectId: string | null;
  sourceKind: KnowledgeSourceKind | null;
  sourceRef: string | null;
  quote: string | null;
  saidBy: string | null;
  saidOn: string | null;
  proposedByAgentInstanceId: string | null;
  sourceFindingId: string | null;
  status: KnowledgeStatus;
  supersedesId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  retiredBy: string | null;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One row of knowledge_view. category and status keep the source's own words. */
export interface KnowledgeViewRow {
  sourceTable: string;
  id: string;
  orgId: string;
  category: string;
  title: string;
  body: string;
  /** Empty means every employee. */
  appliesTo: string[];
  source: string;
  status: string;
  createdAt: string;
}

export interface KnowledgeListFilters {
  status?: KnowledgeStatus | readonly KnowledgeStatus[];
  category?: KnowledgeCategory | readonly KnowledgeCategory[];
  /**
   * When set, keep items whose applies-to list is empty and items that name
   * this role or an alias the routers treat as the same employee
   * (HANNA_ROLE_KEYS, BOB_ROLE_KEYS). An empty list means every employee.
   */
  roleKey?: string | null;
  limit?: number;
}

const ITEM_COLUMNS =
  "id, org_id, category, topic, title, body, applies_to_roles, mission_id, company_id, worker_id, project_id, source_kind, source_ref, quote, said_by, said_on, proposed_by_agent_instance_id, source_finding_id, status, supersedes_id, approved_by, approved_at, retired_by, retired_at, created_at, updated_at";

const VIEW_COLUMNS =
  "source_table, id, org_id, category, title, body, applies_to, source, status, created_at";

const DEFAULT_LIMIT = 200;
const ROLE_SCAN_CAP = 1000;

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(limit), ROLE_SCAN_CAP));
}

function roleAliases(roleKey: string): ReadonlySet<string> | null {
  const key = roleKey.trim().toLowerCase();
  if (HANNA_ROLE_KEYS.has(key)) return HANNA_ROLE_KEYS;
  if (BOB_ROLE_KEYS.has(key)) return BOB_ROLE_KEYS;
  return null;
}

/**
 * Empty applies-to means every role. No role filter means every item.
 * Hanna and Bob aliases match the way the routers do: a filter of
 * `triangle_hr` sees an item stored for `hr`, and `inbox_courier` sees one
 * stored for `inbox_coordinator`.
 */
export function knowledgeVisibleToRole(
  appliesTo: readonly string[] | null | undefined,
  roleKey: string | null | undefined,
): boolean {
  if (!roleKey) return true;
  const roles = (appliesTo ?? [])
    .map((role) => role.trim().toLowerCase())
    .filter((role) => role.length > 0);
  if (roles.length === 0) return true;
  const aliases = roleAliases(roleKey);
  if (!aliases) return roles.includes(roleKey.trim().toLowerCase());
  return roles.some((role) => aliases.has(role));
}

function toItem(row: Record<string, unknown>): KnowledgeItem | null {
  const category = oneOf(row.category, KNOWLEDGE_CATEGORIES);
  const status = oneOf(row.status, KNOWLEDGE_STATUSES);
  const id = asText(row.id);
  const orgId = asText(row.org_id);
  const title = asText(row.title);
  const body = asText(row.body);
  if (!category || !status || !id || !orgId || !title || !body) return null;
  return {
    id,
    orgId,
    category,
    topic: asText(row.topic),
    title,
    body,
    appliesToRoles: asStringArray(row.applies_to_roles),
    missionId: asText(row.mission_id),
    companyId: asText(row.company_id),
    workerId: asText(row.worker_id),
    projectId: asText(row.project_id),
    sourceKind: oneOf(row.source_kind, KNOWLEDGE_SOURCE_KINDS),
    sourceRef: asText(row.source_ref),
    quote: asText(row.quote),
    saidBy: asText(row.said_by),
    saidOn: asText(row.said_on),
    proposedByAgentInstanceId: asText(row.proposed_by_agent_instance_id),
    sourceFindingId: asText(row.source_finding_id),
    status,
    supersedesId: asText(row.supersedes_id),
    approvedBy: asText(row.approved_by),
    approvedAt: asText(row.approved_at),
    retiredBy: asText(row.retired_by),
    retiredAt: asText(row.retired_at),
    createdAt: asText(row.created_at) ?? "",
    updatedAt: asText(row.updated_at) ?? "",
  };
}

function toViewRow(row: Record<string, unknown>): KnowledgeViewRow | null {
  const id = asText(row.id);
  const orgId = asText(row.org_id);
  const sourceTable = asText(row.source_table);
  const title = asText(row.title);
  if (!id || !orgId || !sourceTable || !title) return null;
  return {
    sourceTable,
    id,
    orgId,
    category: asText(row.category) ?? "",
    title,
    body: typeof row.body === "string" ? row.body : "",
    appliesTo: asStringArray(row.applies_to),
    source: asText(row.source) ?? "",
    status: asText(row.status) ?? "",
    createdAt: asText(row.created_at) ?? "",
  };
}

function asList(value: string | readonly string[] | undefined): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter((item): item is string => typeof item === "string" && item.length > 0);
}

async function readRows(
  table: "knowledge_items" | "knowledge_view",
  columns: string,
  orgId: string,
  filters: KnowledgeListFilters,
  appliesColumn: "applies_to_roles" | "applies_to",
): Promise<Record<string, unknown>[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const limit = clampLimit(filters.limit);
  const roleKey = filters.roleKey?.trim() || null;
  if (roleKey && !/^[a-z0-9_]+$/i.test(roleKey)) return [];

  let query = svc.from(table).select(columns).eq("org_id", orgId);
  const statuses = asList(filters.status);
  if (statuses.length === 1) query = query.eq("status", statuses[0]);
  else if (statuses.length > 1) query = query.in("status", statuses);
  const categories = asList(filters.category);
  if (categories.length === 1) query = query.eq("category", categories[0]);
  else if (categories.length > 1) query = query.in("category", categories);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(roleKey ? ROLE_SCAN_CAP : limit);
  // A missing migration and a failed read both mean there is nothing to show.
  // This module does not write, so it does not invent a row to fill the gap.
  if (error || !data) return [];
  const rows = data as unknown as Record<string, unknown>[];
  if (!roleKey) return rows;
  return rows
    .filter((row) => knowledgeVisibleToRole(asStringArray(row[appliesColumn]), roleKey))
    .slice(0, limit);
}

/** Proposed and approved items in knowledge_items. Does not read the other stores. */
export async function listKnowledgeItems(
  orgId: string,
  filters: KnowledgeListFilters = {},
): Promise<KnowledgeItem[]> {
  const rows = await readRows("knowledge_items", ITEM_COLUMNS, orgId, filters, "applies_to_roles");
  const items: KnowledgeItem[] = [];
  for (const row of rows) {
    const item = toItem(row);
    if (item) items.push(item);
  }
  return items;
}

/**
 * The combined list: knowledge_items plus house rules, mission decisions,
 * worker notes, intake rules, project notes, and accepted research notes.
 */
export async function listKnowledge(
  orgId: string,
  filters: KnowledgeListFilters = {},
): Promise<KnowledgeViewRow[]> {
  const rows = await readRows("knowledge_view", VIEW_COLUMNS, orgId, filters, "applies_to");
  const items: KnowledgeViewRow[] = [];
  for (const row of rows) {
    const item = toViewRow(row);
    if (item) items.push(item);
  }
  return items;
}
