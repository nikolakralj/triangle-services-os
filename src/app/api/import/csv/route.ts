import { NextResponse } from "next/server";
import { csvImportSchema } from "@/lib/validation";
import { createServiceSupabaseClient, requireApiRole } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const access = await requireApiRole(request, ["admin", "partner", "researcher"]);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const parsed = csvImportSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { importType, rows } = parsed.data;
  const service = createServiceSupabaseClient();

  if (service && !access.demo) {
    const { data: batch, error } = await service
      .from("import_batches")
      .insert({
        organization_id: access.organizationId,
        import_type: importType,
        source_name: "manual_csv_upload",
        status: "completed",
        total_rows: rows.length,
        processed_rows: rows.length,
        created_by: access.userId,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await service.from("import_rows").insert(
      rows.map((row, index) => ({
        organization_id: access.organizationId,
        import_batch_id: batch.id,
        row_number: index + 1,
        raw_data: row,
        normalized_data: row,
        status: "pending",
      })),
    );
  }

  return NextResponse.json({
    message: `Import batch accepted: ${rows.length} ${importType.replace("csv_", "")} rows.`,
    totalRows: rows.length,
  });
}
