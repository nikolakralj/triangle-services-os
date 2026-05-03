import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { requireApiAccess } from "@/lib/supabase/server";
import {
  getConversationContext,
  getConversationById,
  saveMessage,
  setConversationTitle,
  type ResearchMessageRow,
} from "@/lib/data/research-chat";
import { getOrCreateGlobalConversation } from "@/lib/data/global-scout-chat";
import { searchCrmCompanies, searchTalent } from "@/lib/data/global-scout";
import { logAiToolCall } from "@/lib/data/research";

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    type: "web_search" as const,
    user_location: { type: "approximate" as const, country: "HR", city: "Zagreb" },
  },
  {
    type: "function" as const,
    name: "search_crm_companies",
    description: "Search for companies already in our CRM by name, industry, or city.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    type: "function" as const,
    name: "search_talent",
    description: "Search our worker database for matching skills, languages, and location.",
    parameters: {
      type: "object",
      properties: {
        skills: { type: "array", items: { type: "string" } },
        languages: { type: "array", items: { type: "string" } },
        country: { type: "string" },
      },
    },
  },
  {
    type: "function" as const,
    name: "create_crm_lead",
    description: "Create a new company lead in the CRM.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        industry: { type: "string" },
        country: { type: "string" },
        website: { type: "string" },
        description: { type: "string" },
      },
      required: ["name"],
    },
  },
];

// ── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are the Triangle Services Global Scout. Your mission is to identify business development opportunities and match them with our available talent pool.

Triangle Services provides specialist labor (Electrical, Mechanical, Welding, PLC, Commissioning) to industrial projects, EPCs, and agencies.

## Your Capabilities:
1. **Research**: Use 'web_search' to find EPCs, agencies, or contractors winning projects in specific regions or sectors.
2. **CRM Check**: Use 'search_crm_companies' to see if we already know a company.
3. **Talent Matching**: Use 'search_talent' to find workers in our database that match a specific project's needs (skills, language, location).
4. **Lead Generation**: Use 'create_crm_lead' to add a promising discovery to our pipeline.

## Your Tone:
- Sharp, commercial, and professional. 
- You don't just find names; you find *placements*.
- Always try to correlate a found opportunity with our actual worker supply.

## Strategy:
If a user asks for "EPCs in Germany", don't just list them. 
Search for them, check our CRM, and then proactively search our talent for "German speakers" or "EU-ready workers" to present a complete placement hypothesis.
`;

// ── Agent Loop ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const access = await requireApiAccess(request);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const conversation = await getOrCreateGlobalConversation({
    orgId: access.organizationId,
    userId: access.userId,
  });

  const ctx = await getConversationContext({
    conversationId: conversation.id,
    orgId: access.organizationId,
  });

  return NextResponse.json({
    conversationId: conversation.id,
    messages: ctx.recentMessages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: m.tool_calls || [],
      citations: m.citations || [],
      createdAt: m.created_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  const access = await requireApiAccess(request);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await request.json();
  const { message, conversationId } = body;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const conversation = conversationId 
    ? await getConversationById({ conversationId, orgId: access.organizationId })
    : await getOrCreateGlobalConversation({ orgId: access.organizationId, userId: access.userId });

  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  await saveMessage({
    conversationId: conversation.id,
    orgId: access.organizationId,
    role: "user",
    content: message,
    createdBy: access.userId,
  });

  const ctx = await getConversationContext({ conversationId: conversation.id, orgId: access.organizationId });
  
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const history = ctx.recentMessages.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content ?? "",
  })).filter(m => m.content);

  let toolCallRecords: any[] = [];
  let citations: any[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  let turnInput: string | any[] = message;
  let lastResponseId: string | undefined;

  for (let turn = 0; turn < 6; turn++) {
    const callParams: any = {
      model,
      instructions: SYSTEM_PROMPT,
      input: turnInput,
      tools: TOOL_DEFINITIONS,
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
    };
    if (lastResponseId) callParams.previous_response_id = lastResponseId;

    const response: any = await client.responses.create(callParams);
    lastResponseId = response.id;
    totalPromptTokens += response.usage?.input_tokens ?? 0;
    totalCompletionTokens += response.usage?.output_tokens ?? 0;

    const output = response.output ?? [];
    const newFunctionOutputs: any[] = [];

    for (const item of output) {
      if (item.type === "web_search_call") {
        const sources = item.action?.sources ?? [];
        citations.push(...sources.map((s: any) => ({ source_url: s.url, title: s.title, snippet: s.snippet })));
      }

      if (item.type === "function_call") {
        const args = typeof item.arguments === "string" ? JSON.parse(item.arguments) : item.arguments;
        let result: any = { ok: false };

        try {
          if (item.name === "search_crm_companies") {
            result = await searchCrmCompanies({ orgId: access.organizationId, query: args.query });
          } else if (item.name === "search_talent") {
            result = await searchTalent({ orgId: access.organizationId, ...args });
          } else if (item.name === "create_crm_lead") {
            const { createCompany } = await import("@/lib/data/companies");
            result = await createCompany(access.organizationId, access.userId, {
              name: args.name,
              company_type: args.industry || "other",
              country: args.country,
              website: args.website,
              description: args.description,
              company_status: "lead",
              priority: "medium",
              research_status: "not_reviewed",
            });
          }
          
          await logAiToolCall({
            orgId: access.organizationId,
            userId: access.userId,
            agentName: "global_scout",
            toolName: item.name,
            inputJson: args,
            outputJson: result,
            success: true,
          });
        } catch (err: any) {
          result = { error: err.message };
        }

        toolCallRecords.push({ name: item.name, arguments: args, result });
        newFunctionOutputs.push({
          type: "function_call_output",
          call_id: item.call_id ?? item.id,
          output: JSON.stringify(result),
        });
      }
    }

    if (newFunctionOutputs.length === 0) {
      const finalText = response.output_text || "";
      await saveMessage({
        conversationId: conversation.id,
        orgId: access.organizationId,
        role: "assistant",
        content: finalText,
        toolCalls: toolCallRecords,
        citations,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        createdBy: access.userId,
      });

      return NextResponse.json({
        text: finalText,
        toolCalls: toolCallRecords,
        citations,
      });
    }

    turnInput = newFunctionOutputs;
  }

  return NextResponse.json({ error: "Max turns reached" }, { status: 500 });
}
