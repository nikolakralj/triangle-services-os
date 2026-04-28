import { NextResponse } from "next/server";
import { requireApiAccess, createServiceSupabaseClient } from "@/lib/supabase/server";
import type { ChainKnowledgeLevel } from "@/lib/data/contractor-chain";

const VALID_LEVELS: ChainKnowledgeLevel[] = ["known", "inferred", "unknown"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  const { nodeId } = await params;
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const { company_name, company_id, level, confidence, rationale, notes, label } =
    body as {
      company_name?: string;
      company_id?: string;
      level?: string;
      confidence?: number;
      rationale?: string;
      notes?: string;
      label?: string;
    };

  if (level && !VALID_LEVELS.includes(level as ChainKnowledgeLevel)) {
    return NextResponse.json(
      { error: `Invalid level. Valid: ${VALID_LEVELS.join(", ")}` },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (company_name !== undefined) updates.company_name = company_name;
  if (company_id !== undefined) updates.company_id = company_id;
  if (level !== undefined) updates.level = level;
  if (confidence !== undefined) updates.confidence = confidence;
  if (rationale !== undefined) updates.rationale = rationale;
  if (notes !== undefined) updates.notes = notes;
  if (label !== undefined) updates.label = label;

  const { data, error } = await service
    .from("contractor_chain_nodes")
    .update(updates)
    .eq("id", nodeId)
    .eq("organization_id", access.organizationId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  const { nodeId } = await params;
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  const { error } = await service
    .from("contractor_chain_nodes")
    .delete()
    .eq("id", nodeId)
    .eq("organization_id", access.organizationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
