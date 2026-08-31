import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { ChecklistItem } from "@/lib/types";

export type DocumentAccessRole =
  | "admin"
  | "partner"
  | "researcher"
  | "viewer";

export interface StoredDocument {
  id: string;
  title: string;
  category: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  visibility: string;
  sensitivity: string;
  expiryDate: string | null;
  expiryStatus: "expired" | "expiring_soon" | "valid" | "no_expiry";
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  linkedEntityName: string | null;
  createdAt: string;
}

type DocumentRow = {
  id: string;
  title: string;
  document_category: string | null;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  visibility: string | null;
  sensitivity: string | null;
  expiry_date: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  created_at: string;
};

type ChecklistRow = {
  id: string;
  title: string;
  category: string;
  status: ChecklistItem["status"] | null;
  owner_id: string | null;
  linked_document_id: string | null;
  review_date: string | null;
  notes: string | null;
};

function expiryStatus(expiry: string | null): StoredDocument["expiryStatus"] {
  if (!expiry) return "no_expiry";
  const days = Math.floor(
    (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0) return "expired";
  if (days <= 30) return "expiring_soon";
  return "valid";
}

function canReadDocument(role: DocumentAccessRole, row: DocumentRow) {
  if (role === "admin" || role === "partner") return true;
  if (role === "researcher") {
    return (
      ["internal", "researcher_allowed"].includes(row.visibility ?? "") &&
      row.sensitivity === "normal"
    );
  }
  return (
    row.visibility === "researcher_allowed" && row.sensitivity === "normal"
  );
}

function displayName(profile: {
  display_name: string | null;
  full_name: string | null;
  email: string;
}) {
  return profile.display_name || profile.full_name || profile.email;
}

async function loadProfileNames(userIds: string[]) {
  const service = createServiceSupabaseClient();
  if (!service || userIds.length === 0) return new Map<string, string>();

  const { data } = await service
    .from("profiles")
    .select("id,display_name,full_name,email")
    .in("id", [...new Set(userIds)]);

  return new Map(
    (data ?? []).map((profile) => [profile.id, displayName(profile)]),
  );
}

export async function listDocuments(
  organizationId: string,
  options: {
    category?: string;
    limit?: number;
    role: DocumentAccessRole;
  },
): Promise<StoredDocument[]> {
  const service = createServiceSupabaseClient();
  if (!service) return [];

  let query = service
    .from("documents")
    .select(
      "id,title,document_category,file_name,file_size,mime_type,visibility,sensitivity,expiry_date,linked_entity_type,linked_entity_id,created_at",
    )
    .eq("organization_id", organizationId)
    .eq("is_current_version", true)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 200);

  if (options.category) {
    query = query.eq("document_category", options.category);
  }

  const { data, error } = await query;
  if (error) {
    console.error("listDocuments error", error);
    return [];
  }

  const rows = ((data ?? []) as DocumentRow[]).filter((row) =>
    canReadDocument(options.role, row),
  );
  if (rows.length === 0) return [];

  const workerIds = rows.flatMap((row) =>
    row.linked_entity_type === "worker" && row.linked_entity_id
      ? [row.linked_entity_id]
      : [],
  );
  const projectIds = rows.flatMap((row) =>
    row.linked_entity_type === "project" && row.linked_entity_id
      ? [row.linked_entity_id]
      : [],
  );
  const names = new Map<string, string>();

  if (workerIds.length > 0) {
    const { data: workers } = await service
      .from("workers")
      .select("id,full_name")
      .eq("organization_id", organizationId)
      .in("id", [...new Set(workerIds)]);
    for (const worker of workers ?? []) names.set(worker.id, worker.full_name);
  }
  if (projectIds.length > 0) {
    const { data: projects } = await service
      .from("discovered_projects")
      .select("id,project_name")
      .eq("organization_id", organizationId)
      .in("id", [...new Set(projectIds)]);
    for (const project of projects ?? []) {
      names.set(project.id, project.project_name);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.document_category ?? "other",
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    visibility: row.visibility ?? "internal",
    sensitivity: row.sensitivity ?? "normal",
    expiryDate: row.expiry_date,
    expiryStatus: expiryStatus(row.expiry_date),
    linkedEntityType: row.linked_entity_type,
    linkedEntityId: row.linked_entity_id,
    linkedEntityName: row.linked_entity_id
      ? names.get(row.linked_entity_id) ?? null
      : null,
    createdAt: row.created_at,
  }));
}

export async function listDocumentChecklist(
  organizationId: string,
): Promise<ChecklistItem[]> {
  const service = createServiceSupabaseClient();
  if (!service) return [];

  const { data, error } = await service
    .from("document_checklist_items")
    .select(
      "id,title,category,status,owner_id,linked_document_id,review_date,notes",
    )
    .eq("organization_id", organizationId)
    .order("category")
    .order("title");

  if (error) {
    console.error("listDocumentChecklist error", error);
    return [];
  }

  const rows = (data ?? []) as ChecklistRow[];
  const names = await loadProfileNames(
    rows.flatMap((row) => (row.owner_id ? [row.owner_id] : [])),
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    status: row.status ?? "missing",
    ownerId: row.owner_id ?? undefined,
    ownerName: row.owner_id ? names.get(row.owner_id) : undefined,
    reviewDate: row.review_date ?? undefined,
    linkedDocumentId: row.linked_document_id ?? undefined,
    notes: row.notes ?? undefined,
  }));
}

export interface DocumentStats {
  total: number;
  expired: number;
  expiringSoon: number;
  unlinked: number;
}

export function summarizeDocuments(docs: StoredDocument[]): DocumentStats {
  return {
    total: docs.length,
    expired: docs.filter((document) => document.expiryStatus === "expired")
      .length,
    expiringSoon: docs.filter(
      (document) => document.expiryStatus === "expiring_soon",
    ).length,
    unlinked: docs.filter((document) => !document.linkedEntityId).length,
  };
}
