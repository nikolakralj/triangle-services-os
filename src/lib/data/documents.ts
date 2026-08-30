import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// The document store, as it actually is.
//
// The Compliance page rendered `sample-data.documents` — eight invented files
// including a "Triangle Services capability statement" that has never existed
// — under a description promising "Supabase Storage private buckets and signed
// URLs". The storage and the table are real; the page simply never used them.
//
// Worse for a product about to be sold: an empty document store and a fake one
// look identical to the person reading the screen, and only one of them tells
// you that a worker's A1 is missing.
// ---------------------------------------------------------------------------

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
  /** expired | expiring_soon | valid | no_expiry — drives the compliance view. */
  expiryStatus: "expired" | "expiring_soon" | "valid" | "no_expiry";
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  /** Resolved name of the worker/project the document belongs to. */
  linkedEntityName: string | null;
  createdAt: string;
}

function expiryStatus(expiry: string | null): StoredDocument["expiryStatus"] {
  if (!expiry) return "no_expiry";
  const days = Math.floor(
    (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0) return "expired";
  if (days <= 30) return "expiring_soon";
  return "valid";
}

export async function listDocuments(
  orgId: string,
  opts: { category?: string; limit?: number } = {},
): Promise<StoredDocument[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  let q = svc
    .from("documents")
    .select(
      "id, title, document_category, file_name, file_size, mime_type, visibility, sensitivity, expiry_date, linked_entity_type, linked_entity_id, created_at",
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.category) q = q.eq("document_category", opts.category);

  const { data } = await q;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Resolve who or what each document belongs to. A certificate that does not
  // say whose it is cannot be acted on.
  const workerIds = rows
    .filter((r) => r.linked_entity_type === "worker" && r.linked_entity_id)
    .map((r) => r.linked_entity_id as string);
  const projectIds = rows
    .filter((r) => r.linked_entity_type === "project" && r.linked_entity_id)
    .map((r) => r.linked_entity_id as string);

  const names = new Map<string, string>();
  if (workerIds.length > 0) {
    const { data: ws } = await svc
      .from("workers")
      .select("id, full_name")
      .in("id", Array.from(new Set(workerIds)));
    for (const w of ws ?? []) names.set(w.id as string, w.full_name as string);
  }
  if (projectIds.length > 0) {
    const { data: ps } = await svc
      .from("discovered_projects")
      .select("id, project_name")
      .in("id", Array.from(new Set(projectIds)));
    for (const p of ps ?? []) names.set(p.id as string, p.project_name as string);
  }

  return rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    category: (r.document_category as string) ?? "other",
    fileName: r.file_name as string,
    fileSize: (r.file_size as number) ?? null,
    mimeType: (r.mime_type as string) ?? null,
    visibility: (r.visibility as string) ?? "internal",
    sensitivity: (r.sensitivity as string) ?? "normal",
    expiryDate: (r.expiry_date as string) ?? null,
    expiryStatus: expiryStatus((r.expiry_date as string) ?? null),
    linkedEntityType: (r.linked_entity_type as string) ?? null,
    linkedEntityId: (r.linked_entity_id as string) ?? null,
    linkedEntityName: r.linked_entity_id
      ? names.get(r.linked_entity_id as string) ?? null
      : null,
    createdAt: r.created_at as string,
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
    expired: docs.filter((d) => d.expiryStatus === "expired").length,
    expiringSoon: docs.filter((d) => d.expiryStatus === "expiring_soon").length,
    // A document nobody owns is the one that goes missing when a client asks.
    unlinked: docs.filter((d) => !d.linkedEntityId).length,
  };
}
