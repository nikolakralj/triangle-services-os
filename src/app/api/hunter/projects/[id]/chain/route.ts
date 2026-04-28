import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { getDiscoveredProjectById } from "@/lib/data/discovered-projects";
import {
  upsertChainNode,
  CHAIN_ROLE_LABELS,
  CHAIN_ROLE_ORDER,
  type ChainRole,
  type ChainKnowledgeLevel,
} from "@/lib/data/contractor-chain";

const VALID_ROLES: ChainRole[] = [
  "owner", "developer", "epc", "gc", "mep", "electrical", "intermediary", "other",
];
const VALID_LEVELS: ChainKnowledgeLevel[] = ["known", "inferred", "unknown"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  // Verify project belongs to org
  const row = await getDiscoveredProjectById(id);
  if (!row || row.organization_id !== access.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    role,
    label,
    company_name,
    company_id,
    level,
    confidence,
    rationale,
    notes,
  } = body as {
    role?: string;
    label?: string;
    company_name?: string;
    company_id?: string;
    level?: string;
    confidence?: number;
    rationale?: string;
    notes?: string;
  };

  if (!role || !VALID_ROLES.includes(role as ChainRole)) {
    return NextResponse.json(
      { error: `Invalid role. Valid: ${VALID_ROLES.join(", ")}` },
      { status: 400 },
    );
  }
  if (level && !VALID_LEVELS.includes(level as ChainKnowledgeLevel)) {
    return NextResponse.json(
      { error: `Invalid level. Valid: ${VALID_LEVELS.join(", ")}` },
      { status: 400 },
    );
  }

  const typedRole = role as ChainRole;
  const node = await upsertChainNode(
    access.organizationId,
    id,
    {
      role: typedRole,
      label: label ?? CHAIN_ROLE_LABELS[typedRole],
      company_name: company_name ?? null,
      company_id: company_id ?? null,
      level: (level as ChainKnowledgeLevel) ?? "unknown",
      confidence: confidence ?? null,
      rationale: rationale ?? null,
      notes: notes ?? null,
      sort_order: CHAIN_ROLE_ORDER[typedRole],
      created_by: access.userId,
    },
    access.userId,
  );

  if (!node) {
    return NextResponse.json({ error: "Failed to create node" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, node }, { status: 201 });
}
