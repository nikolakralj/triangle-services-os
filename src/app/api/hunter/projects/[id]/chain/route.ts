import { NextResponse } from "next/server";
import { requireApiAccess, createServiceSupabaseClient } from "@/lib/supabase/server";
import {
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

  // Verify project belongs to org using service client (avoids cookie-context issues)
  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }
  const { data: projectCheck } = await service
    .from("discovered_projects")
    .select("id")
    .eq("id", id)
    .eq("organization_id", access.organizationId)
    .maybeSingle();
  if (!projectCheck) {
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

  const { data: node, error: insertError } = await service
    .from("contractor_chain_nodes")
    .insert({
      organization_id: access.organizationId,
      discovered_project_id: id,
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
    })
    .select()
    .maybeSingle();

  if (insertError || !node) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to create node" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, node }, { status: 201 });
}
