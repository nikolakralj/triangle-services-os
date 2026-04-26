import { NextResponse } from "next/server";
import { normalizeDomain } from "@/lib/utils";
import { externalLeadSchema } from "@/lib/validation";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const secret = request.headers.get("x-import-api-secret");
  if (!process.env.IMPORT_API_SECRET || secret !== process.env.IMPORT_API_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = externalLeadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", issues: parsed.error.flatten() }, { status: 400 });
  }

  const organizationId = process.env.DEFAULT_ORGANIZATION_ID || "00000000-0000-0000-0000-000000000001";
  const payload = parsed.data;
  const service = createServiceSupabaseClient();

  if (service) {
    const { data: batch, error } = await service
      .from("import_batches")
      .insert({
        organization_id: organizationId,
        import_type: "external_scraper",
        source_name: payload.source_name,
        source_query: payload.source_query ?? null,
        source_url: payload.source_url ?? null,
        status: "completed",
        total_rows: payload.items.length,
        processed_rows: payload.items.length,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await service.from("import_rows").insert(
      payload.items.map((item, index) => ({
        organization_id: organizationId,
        import_batch_id: batch.id,
        row_number: index + 1,
        raw_data: item,
        normalized_data: {
          ...item,
          website_domain: normalizeDomain(item.website),
          research_status: "not_reviewed",
        },
        status: "pending",
      })),
    );
  }

  return NextResponse.json({
    message: "External leads accepted for review. No outreach was sent.",
    itemCount: payload.items.length,
  });
}
