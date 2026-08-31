import { NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  requireApiRole,
} from "@/lib/supabase/server";

const BUCKET = "documents";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
]);
const VISIBILITIES = new Set([
  "internal",
  "admin_only",
  "partner_only",
  "researcher_allowed",
]);
const SENSITIVITIES = new Set([
  "normal",
  "confidential",
  "highly_confidential",
  "personal_data",
  "financial",
  "legal",
]);

function formString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function POST(request: Request) {
  const access = await requireApiRole(request, ["admin", "partner"]);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json(
      { error: "Document upload is not available in demo mode." },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form data." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File is larger than the 25 MB limit." },
      { status: 400 },
    );
  }

  const extension = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase() ?? ""
    : "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: "Unsupported file type." },
      { status: 400 },
    );
  }

  const title = formString(form, "title").slice(0, 200);
  const documentCategory = formString(form, "documentCategory").slice(0, 100);
  const checklistItemId = formString(form, "checklistItemId");
  const visibility = formString(form, "visibility") || "internal";
  const sensitivity = formString(form, "sensitivity") || "normal";
  const reviewDate = optionalDate(formString(form, "reviewDate"));
  const expiryDate = optionalDate(formString(form, "expiryDate"));

  if (!title || !documentCategory) {
    return NextResponse.json(
      { error: "Title and document category are required." },
      { status: 400 },
    );
  }
  if (!VISIBILITIES.has(visibility) || !SENSITIVITIES.has(sensitivity)) {
    return NextResponse.json(
      { error: "Invalid visibility or sensitivity." },
      { status: 400 },
    );
  }

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  if (checklistItemId) {
    const { data: checklistItem } = await service
      .from("document_checklist_items")
      .select("id")
      .eq("id", checklistItemId)
      .eq("organization_id", access.organizationId)
      .maybeSingle();
    if (!checklistItem) {
      return NextResponse.json(
        { error: "Checklist item not found in this organization." },
        { status: 404 },
      );
    }
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${access.organizationId}/organization/${crypto.randomUUID()}-${safeName}`;
  const { error: storageError } = await service.storage
    .from(BUCKET)
    .upload(storagePath, await file.arrayBuffer(), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (storageError) {
    return NextResponse.json(
      { error: `Storage error: ${storageError.message}` },
      { status: 500 },
    );
  }

  const { data: document, error: insertError } = await service
    .from("documents")
    .insert({
      organization_id: access.organizationId,
      title,
      document_category: documentCategory,
      linked_entity_type: "organization",
      linked_entity_id: access.organizationId,
      storage_bucket: BUCKET,
      storage_path: storagePath,
      file_name: file.name,
      file_extension: extension,
      mime_type: file.type || null,
      file_size: file.size,
      visibility,
      sensitivity,
      review_date: reviewDate,
      expiry_date: expiryDate,
      uploaded_by: access.userId,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .single();

  if (insertError || !document) {
    await service.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json(
      { error: `Database error: ${insertError?.message ?? "insert failed"}` },
      { status: 500 },
    );
  }

  if (checklistItemId) {
    await service
      .from("document_checklist_items")
      .update({
        linked_document_id: document.id,
        status: "uploaded",
        review_date: reviewDate,
        updated_by: access.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", checklistItemId)
      .eq("organization_id", access.organizationId);
  }

  return NextResponse.json({ documentId: document.id }, { status: 201 });
}
