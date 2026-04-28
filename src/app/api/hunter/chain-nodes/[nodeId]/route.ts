import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import {
  updateChainNode,
  deleteChainNode,
  type ChainKnowledgeLevel,
} from "@/lib/data/contractor-chain";

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

  const updates: Parameters<typeof updateChainNode>[2] = {};
  if (company_name !== undefined) updates.company_name = company_name;
  if (company_id !== undefined) updates.company_id = company_id;
  if (level !== undefined) updates.level = level as ChainKnowledgeLevel;
  if (confidence !== undefined) updates.confidence = confidence;
  if (rationale !== undefined) updates.rationale = rationale;
  if (notes !== undefined) updates.notes = notes;
  if (label !== undefined) updates.label = label;

  const ok = await updateChainNode(nodeId, access.organizationId, updates);
  if (!ok) {
    return NextResponse.json({ error: "Update failed or node not found" }, { status: 404 });
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

  const ok = await deleteChainNode(nodeId, access.organizationId);
  if (!ok) {
    return NextResponse.json({ error: "Delete failed or node not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
