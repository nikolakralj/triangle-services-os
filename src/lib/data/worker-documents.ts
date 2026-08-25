import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// Re-export shared types so server-side callers can import from one place
export type { CertType, WorkerDocument } from "@/lib/data/worker-documents-types";
export { CERT_TYPES } from "@/lib/data/worker-documents-types";
import type { WorkerDocument } from "@/lib/data/worker-documents-types";

function computeExpiryStatus(expiryDate: string | null): WorkerDocument["expiryStatus"] {
  if (!expiryDate) return "no_expiry";
  const expiry = new Date(expiryDate);
  const now = new Date();
  const diffDays = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "expiring_soon";
  return "valid";
}

export async function listWorkerDocuments(
  workerId: string,
  orgId: string,
): Promise<WorkerDocument[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const { data } = await svc
    .from("documents")
    .select("id, title, document_category, file_name, file_size, storage_bucket, storage_path, expiry_date, linked_entity_id, created_at")
    .eq("organization_id", orgId)
    .eq("linked_entity_type", "worker")
    .eq("linked_entity_id", workerId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    workerId: row.linked_entity_id ?? workerId,
    title: row.title,
    certType: row.document_category,
    fileName: row.file_name,
    fileSize: row.file_size,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    expiryDate: row.expiry_date,
    expiryStatus: computeExpiryStatus(row.expiry_date),
    createdAt: row.created_at,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Cert expiry alert row — used by the /workers/cert-checklist page
// ─────────────────────────────────────────────────────────────────────────
export type CertAlertRow = {
  documentId: string;
  workerId: string;
  workerName: string;
  certType: string;
  title: string;
  expiryDate: string;
  expiryStatus: "expired" | "expiring_soon" | "valid";
  daysUntilExpiry: number; // negative = already expired
};

export async function listCertAlerts(orgId: string): Promise<CertAlertRow[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  // All worker docs with an expiry date
  const { data: docRows } = await svc
    .from("documents")
    .select("id, title, document_category, linked_entity_id, expiry_date")
    .eq("organization_id", orgId)
    .eq("linked_entity_type", "worker")
    .not("expiry_date", "is", null)
    .order("expiry_date", { ascending: true });

  if (!docRows || docRows.length === 0) return [];

  // Fetch names for all referenced workers in one query
  const workerIds = [...new Set(docRows.map((d) => d.linked_entity_id as string))];
  const { data: workerRows } = await svc
    .from("workers")
    .select("id, full_name")
    .in("id", workerIds);

  const nameMap = new Map((workerRows ?? []).map((w) => [w.id, w.full_name as string]));
  const now = Date.now();

  return docRows
    .map((row) => {
      const expiry = new Date(row.expiry_date as string);
      const daysUntilExpiry = Math.floor((expiry.getTime() - now) / (1000 * 60 * 60 * 24));
      const status: CertAlertRow["expiryStatus"] =
        daysUntilExpiry < 0 ? "expired" : daysUntilExpiry <= 30 ? "expiring_soon" : "valid";
      return {
        documentId: row.id as string,
        workerId: row.linked_entity_id as string,
        workerName: nameMap.get(row.linked_entity_id as string) ?? "Unknown",
        certType: row.document_category as string,
        title: row.title as string,
        expiryDate: row.expiry_date as string,
        expiryStatus: status,
        daysUntilExpiry,
      };
    })
    // Show only expired + expiring_soon (< 60 days) — filter out far-future
    .filter((r) => r.daysUntilExpiry < 60)
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

export async function deleteWorkerDocument(
  documentId: string,
  orgId: string,
): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;

  // Get storage path before deleting
  const { data: doc } = await svc
    .from("documents")
    .select("storage_bucket, storage_path")
    .eq("id", documentId)
    .eq("organization_id", orgId)
    .single();

  if (!doc) return false;

  // Delete from storage
  await svc.storage.from(doc.storage_bucket).remove([doc.storage_path]);

  // Delete record
  const { error } = await svc
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("organization_id", orgId);

  return !error;
}
