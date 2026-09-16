import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { listWorkForContext, type ContextualType } from "@/lib/data/contextual-work";

export const runtime = "nodejs";

const TYPES = new Set<ContextualType>([
  "job_lead",
  "company",
  "contact",
  "project",
  "worker",
]);

export async function GET(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!TYPES.has(type as ContextualType) || !id) {
    return NextResponse.json({ error: "Say which item." }, { status: 400 });
  }
  const assignments = await listWorkForContext(
    access.organizationId,
    type as ContextualType,
    id,
  );
  return NextResponse.json(
    { ok: true, assignments },
    { headers: { "Cache-Control": "no-store" } },
  );
}
