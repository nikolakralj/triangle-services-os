import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import {
  createServiceSupabaseClient,
  requireApiAccess,
} from "@/lib/supabase/server";
import {
  completeResearchRun,
  createResearchSuggestion,
  logAiToolCall,
  logResearchSource,
  startResearchRun,
} from "@/lib/data/research";
import {
  collectWebSources,
  estimateOpenAICost,
  extractOpenAIText,
  parseOpenAIJson,
} from "@/lib/ai/openai-client";

const requestSchema = z.object({
  projectId: z.string().uuid(),
});

// ── Drift-resilient coercion helpers ──────────────────────────────────────────
// LLMs occasionally return wrapped objects, floats for ints, or strings where
// arrays are expected. These helpers normalize common drift patterns before
// strict validation.

function coerceToString(val: unknown): string {
  if (typeof val === "string") return val;
  if (val == null) return "";
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    for (const key of ["text", "content", "summary", "value", "description"]) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
    return JSON.stringify(val);
  }
  return String(val);
}

function coerceToArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (val == null) return [];
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];
    return [{ content: trimmed }];
  }
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    for (const key of ["items", "list", "data", "results", "values"]) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
    // Object of objects (e.g. { "0": {...}, "1": {...} })
    const numericKeys = Object.keys(obj).every((k) => /^\d+$/.test(k));
    if (numericKeys && Object.keys(obj).length > 0) return Object.values(obj);
    // Single object → wrap in array
    return [val];
  }
  return [];
}

function coerceSources(val: unknown): unknown[] {
  const arr = coerceToArray(val);
  return arr.map((item) => {
    if (typeof item === "string") {
      return {
        source_url: item,
        evidence_text: "Source URL captured during research.",
      };
    }
    return item;
  });
}

function coerceInt(val: unknown): number | undefined {
  if (val == null) return undefined;
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n);
}

function clampedInt(val: unknown): number {
  const n = coerceInt(val) ?? 0;
  return Math.max(0, Math.min(100, n));
}

const looseUrl = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, "url required");

const sourceItemSchema = z.object({
  source_url: looseUrl,
  source_title: z.string().optional().catch(undefined),
  source_type: z.string().optional().catch(undefined),
  source_date: z.string().optional().catch(undefined),
  evidence_text: z.string().default("Captured during research."),
  relevance_score: z.preprocess(coerceInt, z.number().int().min(0).max(100).optional()).catch(undefined),
});

const chainNodeSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  package: z.string().nullable().optional().catch(null),
  status: z
    .preprocess(
      (v) => (typeof v === "string" ? v.toLowerCase() : v),
      z.enum(["confirmed", "inferred", "historical", "weak", "rejected"]),
    )
    .catch("inferred" as const),
  confidence: z.preprocess(clampedInt, z.number().int().min(0).max(100)),
  source_url: looseUrl,
  source_date: z.string().optional().catch(undefined),
  evidence_text: z.string().default("Captured during research."),
});

const buyerContactSchema = z.object({
  name: z.string().min(1),
  company: z.string().min(1),
  title: z.string().nullable().optional().catch(null),
  linkedin_url: z.string().nullable().optional().catch(null),
  email: z.string().nullable().optional().catch(null),
  phone: z.string().nullable().optional().catch(null),
  role_reason: z.string().default("Identified as relevant buyer contact."),
  confidence: z.preprocess(clampedInt, z.number().int().min(0).max(100)),
  source_url: looseUrl,
  source_date: z.string().optional().catch(undefined),
  evidence_text: z.string().default("Captured during research."),
});

const packageOppSchema = z.object({
  package_type: z.string().min(1),
  likely_buyer: z.string().nullable().optional().catch(null),
  reason: z.string().default("Identified as package opportunity."),
  confidence: z.preprocess(clampedInt, z.number().int().min(0).max(100)),
  source_url: looseUrl,
  source_date: z.string().optional().catch(undefined),
  evidence_text: z.string().default("Captured during research."),
});

const noteItemSchema = z.object({
  note_type: z
    .preprocess(
      (v) => (typeof v === "string" ? v.toLowerCase() : v),
      z.enum(["fact", "inference", "unknown", "risk", "next_action"]),
    )
    .catch("inference" as const),
  content: z.string().min(1),
  confidence: z.preprocess(clampedInt, z.number().int().min(0).max(100)),
  source_url: looseUrl.optional().catch(undefined),
  source_date: z.string().optional().catch(undefined),
  evidence_text: z.string().default("Captured during research."),
});

// Use safeParse on each item so one bad row doesn't kill the whole response.
function arrayOfPartial<T>(itemSchema: z.ZodType<T>) {
  return z.preprocess(
    (val) => coerceToArray(val),
    z.array(z.unknown()).transform((items): T[] => {
      const out: T[] = [];
      for (const item of items) {
        const r = itemSchema.safeParse(item);
        if (r.success) out.push(r.data);
      }
      return out;
    }),
  );
}

const structuredOutputSchema = z.object({
  summary: z.preprocess(coerceToString, z.string().default("")),
  confidence_score: z.preprocess(clampedInt, z.number().int().min(0).max(100)).catch(0),
  sources: z.preprocess(coerceSources, arrayOfPartial(sourceItemSchema)).catch([]),
  chain_nodes: arrayOfPartial(chainNodeSchema).catch([]),
  buyer_contacts: arrayOfPartial(buyerContactSchema).catch([]),
  package_opportunities: arrayOfPartial(packageOppSchema).catch([]),
  notes: arrayOfPartial(noteItemSchema).catch([]),
});

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function toIsoDate(value?: string) {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json(
      { error: "Advanced research is not available in demo mode." },
      { status: 403 },
    );
  }
  if (access.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { projectId } = parsed.data;
  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  const { data: project, error: projectError } = await service
    .from("discovered_projects")
    .select("*")
    .eq("id", projectId)
    .eq("organization_id", access.organizationId)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const researchRun = await startResearchRun({
    orgId: access.organizationId,
    projectId,
    userId: access.userId,
    researchGoal:
      "Map contractor chain, buyer routes, and package opportunities with evidence-backed suggestions.",
  });

  const client = getOpenAIClient();
  if (!client) {
    await completeResearchRun(researchRun.id, {
      status: "failed",
      summary: "OPENAI_API_KEY is missing.",
      confidenceScore: 0,
      sourcesChecked: 0,
      suggestionsCreated: 0,
    });
    return NextResponse.json(
      { error: "AI is not configured. Add OPENAI_API_KEY." },
      { status: 503 },
    );
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const startedAt = Date.now();

  try {
    const [chainNodes, buyerContacts] = await Promise.all([
      service
        .from("contractor_chain_nodes")
        .select("role,label,company_name,level,confidence,rationale")
        .eq("discovered_project_id", projectId)
        .eq("organization_id", access.organizationId),
      service
        .from("buyer_contacts")
        .select("full_name,company_name,job_title,buyer_role,linkedin_url,email")
        .eq("discovered_project_id", projectId)
        .eq("organization_id", access.organizationId),
    ]);

    const context = {
      project: {
        id: project.id,
        name: project.project_name,
        country: project.country,
        city: project.city,
        phase: project.phase,
        value_eur: project.estimated_value_eur,
        project_type: project.project_type,
        client_company: project.client_company,
        general_contractor: project.general_contractor,
        source_url: project.source_url,
        ai_summary: project.ai_summary,
      },
      existing_chain_nodes: chainNodes.data ?? [],
      existing_buyer_contacts: buyerContacts.data ?? [],
    };

    const researchPrompt = [
      "Research this industrial project and find contractor-chain and buyer-route intelligence.",
      "Rules:",
      "- Separate facts, inferences, and unknowns.",
      "- Do not invent facts.",
      "- Prefer fewer strong findings over many weak findings.",
      "- Owner is often not the labor buyer; try to identify GC/EPC/MEP/electrical package owners.",
      "- Consider labor packages: electrical, mechanical, welding, PLC, commissioning, supervision.",
      "Return plain analysis notes; structured JSON will be requested in the next step.",
      `Context JSON:\n${JSON.stringify(context, null, 2)}`,
    ].join("\n");

    const researchCall = await client.responses.create({
      model,
      instructions:
        "You are a commercial research agent for Triangle Services. Use web search and provide evidence-backed notes.",
      input: researchPrompt,
      tools: [
        {
          type: "web_search",
          user_location: { type: "approximate", country: "HR", city: "Zagreb", region: "Zagreb" },
        },
      ],
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
    });

    const researchText = extractOpenAIText(researchCall as never);
    const webSources = collectWebSources(researchCall as never);

    await logAiToolCall({
      orgId: access.organizationId,
      userId: access.userId,
      agentName: "advanced_research_agent",
      toolName: "openai_research_call",
      inputJson: { projectId, model },
      outputJson: {
        responseId: researchCall.id,
        usage: researchCall.usage ?? null,
        sources: webSources,
      },
      projectId,
      success: true,
      durationMs: Date.now() - startedAt,
    });

    const structPrompt = [
      "Convert the research notes below into a single JSON object that EXACTLY matches this shape:",
      "",
      "{",
      '  "summary": "<plain string, 1-3 sentences>",',
      '  "confidence_score": <integer 0-100, no decimals>,',
      '  "sources": [ { "source_url": "https://...", "source_title": "...", "evidence_text": "...", "source_date": "YYYY-MM-DD" } ],',
      '  "chain_nodes": [ { "company": "...", "role": "owner|developer|gc|epc|mep|electrical|hvac|commissioning", "package": "...|null", "status": "confirmed|inferred|historical|weak", "confidence": <int 0-100>, "source_url": "https://...", "evidence_text": "..." } ],',
      '  "buyer_contacts": [ { "name": "...", "company": "...", "title": "...", "linkedin_url": "...|null", "email": "...|null", "role_reason": "...", "confidence": <int 0-100>, "source_url": "https://...", "evidence_text": "..." } ],',
      '  "package_opportunities": [ { "package_type": "...", "likely_buyer": "...|null", "reason": "...", "confidence": <int 0-100>, "source_url": "https://...", "evidence_text": "..." } ],',
      '  "notes": [ { "note_type": "fact|inference|unknown|risk|next_action", "content": "...", "confidence": <int 0-100>, "source_url": "https://...", "evidence_text": "..." } ]',
      "}",
      "",
      "Hard rules:",
      "- ALL top-level keys are required and must be the exact types shown.",
      "- summary must be a plain string, NOT an object.",
      "- All arrays must be JSON arrays, NEVER wrapped in an object like { items: [...] }.",
      "- confidence and confidence_score must be integers 0-100, no decimals.",
      "- sources must be an array of objects, NEVER an array of bare URL strings.",
      "- notes must be an array of note objects, NEVER a single string.",
      "- Return fewer items rather than guessing. Empty array [] is fine.",
      "- Do not add commentary or markdown — JSON only.",
      "",
      `Research notes:\n${researchText}`,
    ].join("\n");

    const structCall = await client.responses.create({
      model,
      instructions:
        "Return only a valid JSON object. Keep evidence text concise and practical.",
      input: structPrompt,
    });

    const structText = extractOpenAIText(structCall as never);
    const rawParsed = parseOpenAIJson<unknown>(structText);
    const structured = structuredOutputSchema.parse(rawParsed);

    const sourceWrites = [
      ...structured.sources.map((s) =>
        logResearchSource({
          projectId,
          orgId: access.organizationId,
          researchRunId: researchRun.id,
          sourceUrl: s.source_url,
          sourceTitle: s.source_title,
          sourceType: s.source_type,
          sourceDate: toIsoDate(s.source_date),
          extractedText: s.evidence_text,
          relevanceScore: s.relevance_score,
        }),
      ),
      ...webSources
        .filter((s) => s.url)
        .slice(0, 10)
        .map((s) =>
          logResearchSource({
            projectId,
            orgId: access.organizationId,
            researchRunId: researchRun.id,
            sourceUrl: s.url,
            sourceTitle: s.title,
            sourceType: "web_search",
            extractedText: "Captured by web search during advanced research run.",
          }),
        ),
    ];
    await Promise.all(sourceWrites);

    const suggestionWrites = [
      ...structured.chain_nodes.map((item) =>
        createResearchSuggestion({
          projectId,
          orgId: access.organizationId,
          researchRunId: researchRun.id,
          suggestionType: "chain_node",
          payload: {
            company: item.company,
            role: item.role,
            package: item.package ?? null,
            status: item.status,
          },
          confidence: item.confidence,
          sourceUrl: item.source_url,
          sourceDate: toIsoDate(item.source_date),
          evidenceText: item.evidence_text,
          createdByAgent: "advanced_research_agent",
        }),
      ),
      ...structured.buyer_contacts.map((item) =>
        createResearchSuggestion({
          projectId,
          orgId: access.organizationId,
          researchRunId: researchRun.id,
          suggestionType: "buyer_contact",
          payload: {
            name: item.name,
            company: item.company,
            title: item.title ?? null,
            linkedin_url: item.linkedin_url ?? null,
            email: item.email ?? null,
            phone: item.phone ?? null,
            role_reason: item.role_reason,
          },
          confidence: item.confidence,
          sourceUrl: item.source_url,
          sourceDate: toIsoDate(item.source_date),
          evidenceText: item.evidence_text,
          createdByAgent: "advanced_research_agent",
        }),
      ),
      ...structured.package_opportunities.map((item) =>
        createResearchSuggestion({
          projectId,
          orgId: access.organizationId,
          researchRunId: researchRun.id,
          suggestionType: "package_opportunity",
          payload: {
            package_type: item.package_type,
            likely_buyer: item.likely_buyer ?? null,
            reason: item.reason,
          },
          confidence: item.confidence,
          sourceUrl: item.source_url,
          sourceDate: toIsoDate(item.source_date),
          evidenceText: item.evidence_text,
          createdByAgent: "advanced_research_agent",
        }),
      ),
      ...structured.notes.map((item) =>
        createResearchSuggestion({
          projectId,
          orgId: access.organizationId,
          researchRunId: researchRun.id,
          suggestionType: "note",
          payload: { note_type: item.note_type, content: item.content },
          confidence: item.confidence,
          // Notes don't always have a specific source URL — fall back to the
          // project's source URL, then a placeholder. The DB column is NOT NULL.
          sourceUrl:
            item.source_url ?? project.source_url ?? "https://triangle-services.local/research-note",
          sourceDate: toIsoDate(item.source_date),
          evidenceText: item.evidence_text,
          createdByAgent: "advanced_research_agent",
        }),
      ),
    ];
    await Promise.all(suggestionWrites);

    const totalSources = structured.sources.length + Math.min(webSources.length, 10);
    const totalSuggestions =
      structured.chain_nodes.length +
      structured.buyer_contacts.length +
      structured.package_opportunities.length +
      structured.notes.length;

    await completeResearchRun(researchRun.id, {
      status: "completed",
      summary: structured.summary,
      confidenceScore: structured.confidence_score,
      sourcesChecked: totalSources,
      suggestionsCreated: totalSuggestions,
    });

    const usage1 = estimateOpenAICost(researchCall as never);
    const usage2 = estimateOpenAICost(structCall as never);

    return NextResponse.json({
      ok: true,
      researchRunId: researchRun.id,
      sourcesChecked: totalSources,
      suggestionsCreated: totalSuggestions,
      confidenceScore: structured.confidence_score,
      estimatedCostUsd: Number(
        ((usage1.estimatedCostUsd ?? 0) + (usage2.estimatedCostUsd ?? 0)).toFixed(4),
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await completeResearchRun(researchRun.id, {
      status: "failed",
      summary: message,
      confidenceScore: 0,
      sourcesChecked: 0,
      suggestionsCreated: 0,
    });
    await logAiToolCall({
      orgId: access.organizationId,
      userId: access.userId,
      agentName: "advanced_research_agent",
      toolName: "openai_research_call",
      inputJson: { projectId, model },
      outputJson: {},
      projectId,
      success: false,
      errorMessage: message,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

