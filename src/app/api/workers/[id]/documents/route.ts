import { NextResponse } from "next/server";
import { requireApiAccess, createServiceSupabaseClient } from "@/lib/supabase/server";
import { listWorkerDocuments } from "@/lib/data/worker-documents";
import type { CertType } from "@/lib/data/worker-documents-types";

const BUCKET = "documents";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// GET /api/workers/[id]/documents  — list documents for a worker
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { id: workerId } = await params;

  if (access.demo) {
    return NextResponse.json([]);
  }

  const docs = await listWorkerDocuments(workerId, access.organizationId);
  return NextResponse.json(docs);
}

// ---------------------------------------------------------------------------
// POST /api/workers/[id]/documents  — upload a document for a worker
// Accepts multipart/form-data with fields:
//   file      (File, required)
//   certType  (string, required — one of CertType values)
//   title     (string, optional — defaults to file name)
//   expiryDate (string, optional — ISO date YYYY-MM-DD)
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { id: workerId } = await params;

  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum 10 MB." }, { status: 400 });
  }

  const certType = (formData.get("certType") as string | null)?.trim();
  if (!certType) {
    return NextResponse.json({ error: "certType is required." }, { status: 400 });
  }

  const title = ((formData.get("title") as string | null)?.trim()) || file.name;
  const expiryDate = (formData.get("expiryDate") as string | null)?.trim() || null;

  // Verify worker belongs to org
  const svc = createServiceSupabaseClient();
  if (!svc) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  const { data: worker } = await svc
    .from("workers")
    .select("id")
    .eq("id", workerId)
    .eq("organization_id", access.organizationId)
    .single();

  if (!worker) return NextResponse.json({ error: "Worker not found." }, { status: 404 });

  // Build storage path: org/workers/{workerId}/{timestamp}-{filename}
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${access.organizationId}/workers/${workerId}/${Date.now()}-${safeName}`;

  // Upload to Supabase Storage
  const arrayBuffer = await file.arrayBuffer();
  const { error: storageError } = await svc.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (storageError) {
    return NextResponse.json({ error: `Storage error: ${storageError.message}` }, { status: 500 });
  }

  // Save metadata record
  const { data: docRow, error: dbError } = await svc
    .from("documents")
    .insert({
      organization_id: access.organizationId,
      title,
      document_category: certType as CertType,
      linked_entity_type: "worker",
      linked_entity_id: workerId,
      storage_bucket: BUCKET,
      storage_path: storagePath,
      file_name: file.name,
      file_extension: ext ?? null,
      mime_type: file.type || null,
      file_size: file.size,
      visibility: "internal",
      sensitivity: "normal",
      expiry_date: expiryDate || null,
      uploaded_by: access.userId,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .single();

  if (dbError) {
    // Attempt to clean up storage
    await svc.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: `Database error: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json({ documentId: docRow.id }, { status: 201 });
}
