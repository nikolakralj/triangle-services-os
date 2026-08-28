import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/supabase/server";
import {
  previewWorkerImport,
  commitWorkerImport,
  guessMapping,
  type ColumnMapping,
} from "@/lib/data/worker-import";

// ---------------------------------------------------------------------------
// POST /api/import/workers
//
// Three modes, one endpoint:
//   { mode: "guess",   headers }            → a suggested column mapping
//   { mode: "preview", rows, mapping }      → what would happen, changing nothing
//   { mode: "commit",  rows, mapping }      → do it
//
// Preview is not decoration. The old importer answered "240 rows accepted" and
// created nothing; the fix is not only to make it write, but to show exactly
// what it will write before it writes it.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

const MAX_ROWS = 5000;

export async function POST(request: Request) {
  const access = await requireApiRole(request, ["admin", "partner", "researcher"]);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: {
    mode?: string;
    headers?: unknown;
    rows?: unknown;
    mapping?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const mode = String(body.mode ?? "preview");

  if (mode === "guess") {
    const headers = Array.isArray(body.headers) ? body.headers.map(String) : [];
    if (headers.length === 0) {
      return NextResponse.json({ error: "No column headers found." }, { status: 400 });
    }
    return NextResponse.json({ mapping: guessMapping(headers) });
  }

  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: "rows must be an array." }, { status: 400 });
  }
  if (body.rows.length === 0) {
    return NextResponse.json({ error: "The file has no rows." }, { status: 400 });
  }
  if (body.rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `That is ${body.rows.length} rows; the limit is ${MAX_ROWS}. Split the file.` },
      { status: 400 },
    );
  }

  const rows = body.rows.map((r) => {
    const obj = (r ?? {}) as Record<string, unknown>;
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) clean[k] = v == null ? "" : String(v);
    return clean;
  });

  const mapping = (body.mapping ?? {}) as ColumnMapping;
  if (!Object.values(mapping).some((v) => v === "full_name")) {
    return NextResponse.json(
      { error: "Map one column to Full name — a worker without a name cannot be saved." },
      { status: 400 },
    );
  }

  if (mode === "preview") {
    const preview = await previewWorkerImport({
      orgId: access.organizationId,
      rows,
      mapping,
    });
    // Send back a bounded slice: a 5000-row preview would be unreadable and
    // would not survive the response size anyway.
    return NextResponse.json({
      counts: preview.counts,
      unmappedHeaders: preview.unmappedHeaders,
      rows: preview.rows.slice(0, 50),
      totalRows: preview.rows.length,
    });
  }

  if (mode === "commit") {
    if (access.demo) {
      return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
    }
    const result = await commitWorkerImport({
      orgId: access.organizationId,
      userId: access.userId,
      rows,
      mapping,
    });
    return NextResponse.json(result);
  }

  return NextResponse.json(
    { error: "mode must be guess, preview or commit." },
    { status: 400 },
  );
}
