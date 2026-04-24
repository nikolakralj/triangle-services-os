import { NextResponse } from "next/server";
import { documents } from "@/lib/sample-data";
import { createServiceSupabaseClient, requireApiAccess } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await context.params;
  const service = createServiceSupabaseClient();

  if (!service || access.demo) {
    const document = documents.find((item) => item.id === id);
    if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      signedUrl: "#demo-signed-url",
      message: "Demo mode: configure Supabase Storage to generate real private signed URLs.",
    });
  }

  const { data: document, error } = await service
    .from("documents")
    .select("storage_bucket, storage_path, sensitivity, visibility")
    .eq("id", id)
    .eq("organization_id", access.organizationId)
    .single();

  if (error || !document) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error: signedError } = await service.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 60 * 5);

  if (signedError) return NextResponse.json({ error: signedError.message }, { status: 500 });
  return NextResponse.json({ signedUrl: data.signedUrl });
}
