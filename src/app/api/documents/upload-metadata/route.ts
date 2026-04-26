import { NextResponse } from "next/server";
import { documentMetadataSchema } from "@/lib/validation";
import { createServiceSupabaseClient, requireApiRole } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const access = await requireApiRole(request, ["admin", "partner"]);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const parsed = documentMetadataSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", issues: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceSupabaseClient();
  if (service && !access.demo) {
    const input = parsed.data;
    const { data, error } = await service
      .from("documents")
      .insert({
        organization_id: access.organizationId,
        title: input.title,
        description: input.description ?? null,
        document_category: input.documentCategory,
        linked_entity_type: input.linkedEntityType ?? null,
        linked_entity_id: input.linkedEntityId ?? null,
        storage_bucket: input.storageBucket,
        storage_path: input.storagePath,
        file_name: input.fileName,
        file_extension: input.fileExtension ?? null,
        mime_type: input.mimeType ?? null,
        file_size: input.fileSize ?? null,
        visibility: input.visibility,
        sensitivity: input.sensitivity,
        expiry_date: input.expiryDate ?? null,
        review_date: input.reviewDate ?? null,
        uploaded_by: access.userId,
        created_by: access.userId,
        updated_by: access.userId,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ documentId: data.id });
  }

  return NextResponse.json({ documentId: "demo-document", message: "Document metadata accepted in demo mode." });
}
