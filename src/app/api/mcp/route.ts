import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createServiceSupabaseClient,
  requireApiAccess,
} from "@/lib/supabase/server";
import {
  acceptResearchSuggestion,
  createResearchSuggestion,
  logAiToolCall,
  logResearchSource,
  rejectResearchSuggestion,
} from "@/lib/data/research";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const WINDOW_MS = 60_000;
const MAX_CALLS_PER_WINDOW = 80;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const uuidish = z.string().min(1);
const evidenceFields = {
  confidence: z.number().int().min(0).max(100).optional(),
  source_url: z.string().min(1),
  source_date: z.string().optional(),
  evidence_text: z.string().min(10),
};

const toolSchemas = {
  list_projects: z.object({
    status: z.string().optional(),
    sector_id: z.string().optional(),
    search: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  get_project: z.object({ project_id: uuidish }),
  get_research_context: z.object({ project_id: uuidish }),
  list_chain_nodes: z.object({ project_id: uuidish }),
  list_buyer_contacts: z.object({ project_id: uuidish }),
  list_project_notes: z.object({ project_id: uuidish }),
  list_research_sources: z.object({ project_id: uuidish }),
  list_research_suggestions: z.object({ project_id: uuidish }),
  log_research_source: z.object({
    project_id: uuidish,
    source_url: z.string().min(1),
    source_title: z.string().optional(),
    source_type: z.string().optional(),
    source_date: z.string().optional(),
    evidence_text: z.string().min(10),
    relevance_score: z.number().int().min(0).max(100).optional(),
  }),
  propose_chain_node: z.object({
    project_id: uuidish,
    company: z.string().min(1),
    role: z.string().min(1),
    package: z.string().optional(),
    status: z.enum(["confirmed", "inferred", "historical", "weak", "rejected"]),
    ...evidenceFields,
  }),
  propose_buyer_contact: z.object({
    project_id: uuidish,
    name: z.string().min(1),
    company: z.string().min(1),
    title: z.string().optional(),
    linkedin_url: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    role_reason: z.string().min(1),
    ...evidenceFields,
  }),
  propose_package_opportunity: z.object({
    project_id: uuidish,
    package_type: z.string().min(1),
    likely_buyer: z.string().optional(),
    reason: z.string().min(1),
    ...evidenceFields,
  }),
  propose_note: z.object({
    project_id: uuidish,
    note_type: z.string().min(1),
    content: z.string().min(1),
    ...evidenceFields,
  }),
  accept_research_suggestion: z.object({ suggestion_id: uuidish }),
  reject_research_suggestion: z.object({
    suggestion_id: uuidish,
    reason: z.string().min(1).max(1000),
  }),
  edit_and_accept_research_suggestion: z.object({
    suggestion_id: uuidish,
    edited_payload: z.record(z.string(), z.unknown()),
  }),
} satisfies Record<string, z.ZodTypeAny>;

const TOOLS: ToolDefinition[] = [
  tool("list_projects", "List discovered projects scoped to the authenticated organization.", {
    status: "optional status filter",
    sector_id: "optional sector UUID",
    search: "optional project-name search",
    limit: "1-100, default 20",
  }),
  tool("get_project", "Read one discovered project.", { project_id: "project UUID" }),
  tool("get_research_context", "Read project, contractor chain, buyer contacts, sources, and suggestions.", {
    project_id: "project UUID",
  }),
  tool("list_chain_nodes", "Read final contractor-chain nodes for a project.", {
    project_id: "project UUID",
  }),
  tool("list_buyer_contacts", "Read final buyer contacts for a project.", {
    project_id: "project UUID",
  }),
  tool("list_project_notes", "Read accepted research-note suggestions for a project.", {
    project_id: "project UUID",
  }),
  tool("list_research_sources", "Read research sources logged for a project.", {
    project_id: "project UUID",
  }),
  tool("log_research_source", "Log a source checked during research.", {
    project_id: "project UUID",
    source_url: "source URL",
    source_title: "optional title",
    source_type: "news, official, pdf, contractor_site, etc.",
    source_date: "optional YYYY-MM-DD",
    evidence_text: "required extracted evidence",
    relevance_score: "0-100",
  }),
  tool("propose_chain_node", "Suggest a contractor-chain node. Does not write final chain data.", {
    project_id: "project UUID",
    company: "company name",
    role: "owner/operator/SPV/developer/GC/EPC/MEP/electrical/etc.",
    package: "optional package controlled",
    status: "confirmed/inferred/historical/weak/rejected",
    confidence: "0-100",
    source_url: "required",
    source_date: "optional YYYY-MM-DD",
    evidence_text: "required",
  }),
  tool("propose_buyer_contact", "Suggest a buyer contact. Does not create a final contact.", {
    project_id: "project UUID",
    name: "person name",
    company: "company",
    title: "optional title",
    linkedin_url: "optional user-provided visible page URL",
    email: "optional",
    phone: "optional",
    role_reason: "why this person may influence buying",
    confidence: "0-100",
    source_url: "required",
    evidence_text: "required",
  }),
  tool("propose_package_opportunity", "Suggest a package opportunity for human review.", {
    project_id: "project UUID",
    package_type: "electrical, mechanical, welding, PLC, commissioning, etc.",
    likely_buyer: "optional buyer company",
    reason: "why this package fits",
    confidence: "0-100",
    source_url: "required",
    evidence_text: "required",
  }),
  tool("propose_note", "Suggest a research note for human review.", {
    project_id: "project UUID",
    note_type: "fact/inference/unknown/risk/next_action",
    content: "note content",
    confidence: "0-100",
    source_url: "required",
    evidence_text: "required",
  }),
  tool("list_research_suggestions", "List pending and reviewed research suggestions.", {
    project_id: "project UUID",
  }),
  tool("accept_research_suggestion", "Accept a suggestion. Chain/contact suggestions become final records.", {
    suggestion_id: "suggestion UUID",
  }),
  tool("reject_research_suggestion", "Reject a suggestion with a reason.", {
    suggestion_id: "suggestion UUID",
    reason: "review reason",
  }),
  tool("edit_and_accept_research_suggestion", "Edit payload JSON and accept a suggestion.", {
    suggestion_id: "suggestion UUID",
    edited_payload: "replacement payload object",
  }),
];

function tool(name: string, description: string, properties: Record<string, string>) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(properties).map(([key, description]) => [
          key,
          { type: "string", description },
        ]),
      ),
    },
  };
}

function rpcError(id: string | number | null, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

function rpcResult(id: string | number, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function assertRateLimit(userId: string) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(userId);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
  if (bucket.count > MAX_CALLS_PER_WINDOW) {
    throw new Error("Rate limit exceeded. Please slow down MCP tool calls.");
  }
}

async function assertProjectInOrg(projectId: string, orgId: string) {
  const service = createServiceSupabaseClient();
  if (!service) throw new Error("Database unavailable");
  const { data, error } = await service
    .from("discovered_projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project not found");
}

async function executeTool(
  name: keyof typeof toolSchemas,
  args: Record<string, unknown>,
  organizationId: string,
  userId: string,
) {
  const service = createServiceSupabaseClient();
  if (!service) throw new Error("Database unavailable");

  const parsed = toolSchemas[name].parse(args);

  if ("project_id" in parsed && parsed.project_id) {
    await assertProjectInOrg(String(parsed.project_id), organizationId);
  }

  switch (name) {
    case "list_projects": {
      const p = parsed as z.infer<typeof toolSchemas.list_projects>;
      let query = service
        .from("discovered_projects")
        .select("id, project_name, country, city, phase, status, ai_opportunity_score, ai_match_score, client_company, general_contractor, source_url, source_date, created_at")
        .eq("organization_id", organizationId)
        .order("ai_opportunity_score", { ascending: false, nullsFirst: false })
        .limit(p.limit ?? 20);
      if (p.status) query = query.eq("status", p.status);
      if (p.sector_id) query = query.eq("sector_id", p.sector_id);
      if (p.search) query = query.ilike("project_name", `%${p.search}%`);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case "get_project": {
      const p = parsed as z.infer<typeof toolSchemas.get_project>;
      const { data, error } = await service
        .from("discovered_projects")
        .select("*")
        .eq("id", p.project_id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }

    case "get_research_context": {
      const p = parsed as z.infer<typeof toolSchemas.get_research_context>;
      const [project, chain, contacts, sources, suggestions] = await Promise.all([
        selectOne("discovered_projects", p.project_id, organizationId),
        selectMany("contractor_chain_nodes", "discovered_project_id", p.project_id, organizationId),
        selectMany("buyer_contacts", "discovered_project_id", p.project_id, organizationId),
        selectMany("research_sources", "project_id", p.project_id, organizationId, "org_id"),
        selectMany("research_suggestions", "project_id", p.project_id, organizationId, "org_id"),
      ]);
      return { project, chain, contacts, sources, suggestions };
    }

    case "list_chain_nodes": {
      const p = parsed as z.infer<typeof toolSchemas.list_chain_nodes>;
      return selectMany("contractor_chain_nodes", "discovered_project_id", p.project_id, organizationId);
    }

    case "list_buyer_contacts": {
      const p = parsed as z.infer<typeof toolSchemas.list_buyer_contacts>;
      return selectMany("buyer_contacts", "discovered_project_id", p.project_id, organizationId);
    }

    case "list_project_notes": {
      const p = parsed as z.infer<typeof toolSchemas.list_project_notes>;
      const { data, error } = await service
        .from("research_suggestions")
        .select("*")
        .eq("project_id", p.project_id)
        .eq("org_id", organizationId)
        .eq("suggestion_type", "note")
        .eq("status", "accepted")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case "list_research_sources": {
      const p = parsed as z.infer<typeof toolSchemas.list_research_sources>;
      return selectMany("research_sources", "project_id", p.project_id, organizationId, "org_id");
    }

    case "list_research_suggestions": {
      const p = parsed as z.infer<typeof toolSchemas.list_research_suggestions>;
      return selectMany("research_suggestions", "project_id", p.project_id, organizationId, "org_id");
    }

    case "log_research_source": {
      const p = parsed as z.infer<typeof toolSchemas.log_research_source>;
      return logResearchSource({
        projectId: p.project_id,
        orgId: organizationId,
        sourceUrl: p.source_url,
        sourceTitle: p.source_title,
        sourceType: p.source_type,
        sourceDate: p.source_date,
        extractedText: p.evidence_text,
        relevanceScore: p.relevance_score,
      });
    }

    case "propose_chain_node": {
      const p = parsed as z.infer<typeof toolSchemas.propose_chain_node>;
      return createResearchSuggestion({
        projectId: p.project_id,
        orgId: organizationId,
        suggestionType: "chain_node",
        payload: {
          company: p.company,
          role: p.role,
          package: p.package ?? null,
          status: p.status,
        },
        confidence: p.confidence,
        sourceUrl: p.source_url,
        sourceDate: p.source_date,
        evidenceText: p.evidence_text,
        createdByAgent: "mcp_research_agent",
      });
    }

    case "propose_buyer_contact": {
      const p = parsed as z.infer<typeof toolSchemas.propose_buyer_contact>;
      return createResearchSuggestion({
        projectId: p.project_id,
        orgId: organizationId,
        suggestionType: "buyer_contact",
        payload: {
          name: p.name,
          company: p.company,
          title: p.title ?? null,
          linkedin_url: p.linkedin_url ?? null,
          email: p.email ?? null,
          phone: p.phone ?? null,
          role_reason: p.role_reason,
        },
        confidence: p.confidence,
        sourceUrl: p.source_url,
        sourceDate: p.source_date,
        evidenceText: p.evidence_text,
        createdByAgent: "mcp_people_assistant",
      });
    }

    case "propose_package_opportunity": {
      const p = parsed as z.infer<typeof toolSchemas.propose_package_opportunity>;
      return createResearchSuggestion({
        projectId: p.project_id,
        orgId: organizationId,
        suggestionType: "package_opportunity",
        payload: {
          package_type: p.package_type,
          likely_buyer: p.likely_buyer ?? null,
          reason: p.reason,
        },
        confidence: p.confidence,
        sourceUrl: p.source_url,
        sourceDate: p.source_date,
        evidenceText: p.evidence_text,
        createdByAgent: "mcp_commercial_strategy_agent",
      });
    }

    case "propose_note": {
      const p = parsed as z.infer<typeof toolSchemas.propose_note>;
      return createResearchSuggestion({
        projectId: p.project_id,
        orgId: organizationId,
        suggestionType: "note",
        payload: { note_type: p.note_type, content: p.content },
        confidence: p.confidence,
        sourceUrl: p.source_url,
        sourceDate: p.source_date,
        evidenceText: p.evidence_text,
        createdByAgent: "mcp_research_agent",
      });
    }

    case "accept_research_suggestion": {
      const p = parsed as z.infer<typeof toolSchemas.accept_research_suggestion>;
      return acceptResearchSuggestion({
        suggestionId: p.suggestion_id,
        orgId: organizationId,
        userId,
      });
    }

    case "reject_research_suggestion": {
      const p = parsed as z.infer<typeof toolSchemas.reject_research_suggestion>;
      return rejectResearchSuggestion({
        suggestionId: p.suggestion_id,
        orgId: organizationId,
        userId,
        reason: p.reason,
      });
    }

    case "edit_and_accept_research_suggestion": {
      const p = parsed as z.infer<typeof toolSchemas.edit_and_accept_research_suggestion>;
      return acceptResearchSuggestion({
        suggestionId: p.suggestion_id,
        orgId: organizationId,
        userId,
        editedPayload: p.edited_payload,
      });
    }
  }
}

async function selectOne(table: string, projectId: string, orgId: string) {
  const service = createServiceSupabaseClient();
  if (!service) throw new Error("Database unavailable");
  const { data, error } = await service
    .from(table)
    .select("*")
    .eq("id", projectId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function selectMany(
  table: string,
  projectColumn: string,
  projectId: unknown,
  orgId: string,
  orgColumn = "organization_id",
) {
  const service = createServiceSupabaseClient();
  if (!service) throw new Error("Database unavailable");
  const { data, error } = await service
    .from(table)
    .select("*")
    .eq(projectColumn, String(projectId))
    .eq(orgColumn, orgId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) return rpcError(null, -32001, access.error ?? "Unauthorized");

  try {
    assertRateLimit(access.userId);
  } catch (err) {
    return rpcError(null, -32029, err instanceof Error ? err.message : "Rate limit exceeded");
  }

  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error: invalid JSON");
  }

  const { id, method, params } = body;
  if (id === undefined) return new Response(null, { status: 202 });

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "triangle-research-mcp", version: "2.0.0" },
    });
  }

  if (method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }

  if (method !== "tools/call") {
    return rpcError(id, -32601, `Method not found: ${method}`);
  }

  const toolName = (params?.name as keyof typeof toolSchemas) ?? "";
  const toolArgs = (params?.arguments as Record<string, unknown>) ?? {};
  const projectId = typeof toolArgs.project_id === "string" ? toolArgs.project_id : null;

  if (!(toolName in toolSchemas)) {
    return rpcError(id, -32602, `Unknown tool: ${String(toolName)}`);
  }

  try {
    const output = await executeTool(toolName, toolArgs, access.organizationId, access.userId);
    await logAiToolCall({
      orgId: access.organizationId,
      userId: access.userId,
      agentName: "mcp_client",
      toolName,
      inputJson: toolArgs,
      outputJson: { output },
      projectId,
      success: true,
    });
    return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    await logAiToolCall({
      orgId: access.organizationId,
      userId: access.userId,
      agentName: "mcp_client",
      toolName: String(toolName),
      inputJson: toolArgs,
      outputJson: {},
      projectId,
      success: false,
      errorMessage: message,
    });
    return rpcError(id, -32000, message);
  }
}

export async function GET() {
  return NextResponse.json({
    name: "triangle-research-mcp",
    version: "2.0.0",
    description:
      "Triangle Services research workbench MCP. Read context, log sources, propose evidence-backed suggestions, and review them.",
    protocol: "MCP Streamable HTTP",
    endpoint: "/api/mcp",
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
  });
}
