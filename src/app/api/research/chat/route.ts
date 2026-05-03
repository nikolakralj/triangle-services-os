/**
 * POST /api/research/chat
 *
 * Conversational research agent. The user types a request like
 * "Find Eclairion's MEP subcontractors", and the agent:
 *   1. Loads project memory (accepted/rejected/pending suggestions)
 *   2. Loads recent conversation history
 *   3. Calls OpenAI Responses API with custom tools
 *   4. Iteratively executes tool calls (web search + propose_*) until done
 *   5. Saves user message + assistant reply (with tool calls) to research_messages
 *
 * GET /api/research/chat?projectId=...
 * Returns the conversation history for a project.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { requireApiAccess } from "@/lib/supabase/server";
import {
  buildProjectMemory,
  getConversationContext,
  getOrCreateConversation,
  getConversationById,
  listMessages,
  refreshConversationSummary,
  saveMessage,
  setConversationTitle,
  shouldSummarize,
  type ProjectMemorySnapshot,
} from "@/lib/data/research-chat";
import { createResearchSuggestion, logAiToolCall } from "@/lib/data/research";

// ── Request validation ───────────────────────────────────────────────────────

const postSchema = z.object({
  projectId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});

// ── Tool definitions for the OpenAI Responses API ────────────────────────────

const TOOL_DEFINITIONS = [
  {
    type: "web_search" as const,
    user_location: {
      type: "approximate" as const,
      country: "HR",
      city: "Zagreb",
      region: "Zagreb",
    },
  },
  {
    type: "function" as const,
    name: "propose_chain_node",
    description:
      "Propose a contractor-chain node (owner, developer, GC, EPC, MEP, electrical, etc.) for review. Creates a pending research_suggestion. Always include source_url and evidence_text.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name" },
        role: {
          type: "string",
          description:
            "One of: owner, developer, gc, epc, mep, electrical, intermediary, operator, other",
        },
        status: {
          type: "string",
          enum: ["confirmed", "inferred", "historical", "weak"],
          description: "Confirmed = explicitly named in source. Inferred = strong signal but not stated.",
        },
        confidence: { type: "integer", minimum: 0, maximum: 100 },
        package: {
          type: "string",
          description: "Optional package detail (e.g. 'liquid cooling', 'LV/MV cable')",
        },
        source_url: { type: "string" },
        evidence_text: {
          type: "string",
          description: "1-2 sentences quoting or paraphrasing the evidence",
        },
        source_date: { type: "string", description: "YYYY-MM-DD if known" },
      },
      required: ["company", "role", "status", "confidence", "source_url", "evidence_text"],
    },
  },
  {
    type: "function" as const,
    name: "propose_buyer_contact",
    description:
      "Propose a buyer / decision-maker contact. Always include source_url and evidence_text.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        company: { type: "string" },
        title: { type: "string" },
        linkedin_url: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        role_reason: {
          type: "string",
          description: "Why this person is a decision-maker for our packages",
        },
        confidence: { type: "integer", minimum: 0, maximum: 100 },
        source_url: { type: "string" },
        evidence_text: { type: "string" },
        source_date: { type: "string" },
      },
      required: ["name", "company", "role_reason", "confidence", "source_url", "evidence_text"],
    },
  },
  {
    type: "function" as const,
    name: "propose_package",
    description:
      "Propose a labor-package opportunity (electrical, mechanical, welding, PLC, commissioning, supervision).",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        package_type: { type: "string" },
        likely_buyer: { type: "string" },
        reason: { type: "string" },
        confidence: { type: "integer", minimum: 0, maximum: 100 },
        source_url: { type: "string" },
        evidence_text: { type: "string" },
        source_date: { type: "string" },
      },
      required: ["package_type", "reason", "confidence", "source_url", "evidence_text"],
    },
  },
  {
    type: "function" as const,
    name: "add_note",
    description:
      "Record a research note (fact, inference, unknown, risk, or next_action) without it being a chain node or contact.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        note_type: {
          type: "string",
          enum: ["fact", "inference", "unknown", "risk", "next_action"],
        },
        content: { type: "string" },
        confidence: { type: "integer", minimum: 0, maximum: 100 },
        source_url: { type: "string" },
        evidence_text: { type: "string" },
        source_date: { type: "string" },
      },
      required: ["note_type", "content", "confidence", "evidence_text"],
    },
  },
  {
    type: "function" as const,
    name: "accept_research_suggestion",
    description:
      "Accept a pending research suggestion (propose_chain_node, propose_buyer_contact, etc.) by its ID. Call this when the user asks you to store or accept a suggestion.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        suggestion_id: { type: "string", description: "The UUID of the suggestion to accept" },
      },
      required: ["suggestion_id"],
    },
  },
];

// ── System prompt: builds the agent's "memory" from project state ───────────

function buildSystemPrompt(
  memory: ProjectMemorySnapshot,
  olderSummary?: string | null,
): string {
  const { project, acceptedFacts, rejectedAttempts, pendingProposals } = memory;

  const projectFacts = [
    project.name && `Name: ${project.name}`,
    project.country && `Country: ${project.country}`,
    project.city && `City: ${project.city}`,
    project.phase && `Phase: ${project.phase}`,
    project.project_type && `Type: ${project.project_type}`,
    project.client_company && `Client: ${project.client_company}`,
    project.general_contractor && `Listed GC: ${project.general_contractor}`,
    project.estimated_value_eur && `Value: €${project.estimated_value_eur.toLocaleString()}`,
    project.source_url && `Original source: ${project.source_url}`,
    project.ai_summary && `Summary: ${project.ai_summary}`,
  ]
    .filter(Boolean)
    .join("\n");

  const acceptedList =
    acceptedFacts.length === 0
      ? "(none yet)"
      : acceptedFacts
          .map(
            (f) =>
              `  • [${f.type}] ${f.summary}` +
              (f.confidence !== null ? ` (${f.confidence}%)` : ""),
          )
          .join("\n");

  const rejectedList =
    rejectedAttempts.length === 0
      ? "(none)"
      : rejectedAttempts
          .map(
            (r) =>
              `  • [${r.type}] ${r.summary}` +
              (r.rejection_reason ? ` — reason: "${r.rejection_reason}"` : ""),
          )
          .join("\n");

  const pendingList =
    pendingProposals.length === 0
      ? "(none)"
      : pendingProposals
          .slice(0, 30)
          .map((p) => `  • ID: ${p.id} | [${p.type}] ${p.summary}`)
          .join("\n") +
        (pendingProposals.length > 30
          ? `\n  ... and ${pendingProposals.length - 30} more`
          : "");

  return [
    "You are a commercial research agent for Triangle Services, a labor-supply business that provides specialist contractors (electrical, mechanical, welding, PLC, commissioning) to large industrial projects.",
    "",
    "Your job: research projects, map the contractor chain, find buyer contacts, identify package opportunities. You communicate with the user in chat.",
    "",
    "## Tools you have",
    "- web_search: search the public web for evidence",
    "- propose_chain_node: propose a contractor or owner. Goes into the human review queue.",
    "- propose_buyer_contact: propose a buyer / decision-maker.",
    "- propose_package: propose a labor-package opportunity.",
    "- add_note: record a fact, inference, unknown, risk, or next-action.",
    "- accept_research_suggestion: IMMEDIATELY save a pending suggestion into the final Graph/CRM. Use this when the user says 'store it', 'accept', or similar.",
    "",
    "## Hard rules",
    "1. Never invent facts. If you don't know, say so or use add_note(note_type=unknown).",
    "2. Always include source_url + evidence_text on propose_* calls. Quote or paraphrase the source.",
    "3. Do not re-propose anything in the 'Already accepted' or 'Pending review' lists below.",
    "4. Do not re-propose anything in the 'Rejected' list — and respect the rejection reason.",
    "5. Confidence is an integer 0-100. Be honest: 95+ for explicit statements in primary sources, 60-80 for strong inferences, <50 for guesses.",
    "6. Owner is often NOT the labor buyer. The actual buyer is usually the GC, EPC, or MEP package owner.",
    "7. Prefer fewer strong findings over many weak ones.",
    "",
    "## Project facts",
    projectFacts || "(no facts loaded)",
    "",
    "## Already accepted (ground truth — don't re-propose)",
    acceptedList,
    "",
    "## Pending review (already proposed — don't duplicate)",
    pendingList,
    "",
    "## Rejected (don't re-propose — respect the reasons)",
    rejectedList,
    "",
    ...(olderSummary && olderSummary.trim().length > 0
      ? [
          "## Earlier in this conversation (compressed memory)",
          olderSummary,
          "",
        ]
      : []),
    "## How to converse",
    "- Be concise. Speak like a research analyst, not a chatbot.",
    "- When the user asks for something, do the work via tools, then summarize what you found.",
    "- If a request is unclear, ask one clarifying question — don't waste a research run.",
    "- End substantive replies with one suggested next action.",
  ].join("\n");
}

// ── OpenAI Responses-API agentic loop ───────────────────────────────────────
//
// The Responses API accepts an `input` array of typed items. For tool-calling,
// we append function_call_output items as the loop progresses, and re-call
// responses.create until the model stops calling tools.

interface AgentLoopResult {
  finalText: string;
  toolCallRecords: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result: { ok: boolean; suggestion_id?: string; error?: string };
  }>;
  citations: Array<{ source_url: string; title?: string; snippet?: string }>;
  totalPromptTokens: number;
  totalCompletionTokens: number;
}

interface OpenAIResponseLike {
  id: string;
  output?: Array<Record<string, unknown>>;
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

async function runAgentLoop(params: {
  client: OpenAI;
  model: string;
  systemPrompt: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  orgId: string;
  userId: string;
  projectId: string;
}): Promise<AgentLoopResult> {
  const {
    client,
    model,
    systemPrompt,
    conversationHistory,
    userMessage,
    orgId,
    userId,
    projectId,
  } = params;

  const toolCallRecords: AgentLoopResult["toolCallRecords"] = [];
  const citations: AgentLoopResult["citations"] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  // ── Agentic loop ────────────────────────────────────────────────────────────
  // Turn 0: pass conversation history + user message as a single text block
  //         (matches the working research/run pattern, no duplicate-id risk).
  // Turn N: switch to previous_response_id + only function_call_output items.
  const historyText = conversationHistory
    .slice(-12)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const initialInput =
    historyText.length > 0
      ? `## Recent conversation\n${historyText}\n\n## New user message\n${userMessage}`
      : userMessage;

  const seenCallIds = new Set<string>(); // dedupe across turns
  const MAX_TURNS = 8;

  // First-turn input is a string. Subsequent turns use array of tool outputs.
  let nextInput: string | Array<Record<string, unknown>> = initialInput;
  let lastResponseId: string | undefined;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const callParams: Record<string, unknown> = {
      model,
      instructions: systemPrompt,
      input: nextInput,
      tools: TOOL_DEFINITIONS,
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
    };
    if (lastResponseId) {
      callParams.previous_response_id = lastResponseId;
    }

    const response = (await client.responses.create(
      callParams as never,
    )) as unknown as OpenAIResponseLike;
    lastResponseId = response.id;

    totalPromptTokens += response.usage?.input_tokens ?? 0;
    totalCompletionTokens += response.usage?.output_tokens ?? 0;

    const output = response.output ?? [];
    const newFunctionOutputs: Array<Record<string, unknown>> = [];

    for (const item of output) {
      if (item.type === "web_search_call") {
        const action = (item.action as Record<string, unknown> | undefined) ?? {};
        const sources = (action.sources as Array<Record<string, unknown>> | undefined) ?? [];
        for (const src of sources) {
          if (typeof src.url === "string") {
            citations.push({
              source_url: src.url,
              title: typeof src.title === "string" ? src.title : undefined,
              snippet: typeof src.snippet === "string" ? src.snippet : undefined,
            });
          }
        }
      }

      if (item.type === "function_call") {
        const name = String(item.name ?? "");
        const callId = String(item.call_id ?? item.id ?? "");
        if (!callId || seenCallIds.has(callId)) continue;
        seenCallIds.add(callId);

        let args: Record<string, unknown> = {};
        try {
          args =
            typeof item.arguments === "string"
              ? (JSON.parse(item.arguments) as Record<string, unknown>)
              : ((item.arguments as Record<string, unknown>) ?? {});
        } catch {
          args = {};
        }

        const result = await executeProposalTool({
          name,
          args,
          orgId,
          userId,
          projectId,
        });

        toolCallRecords.push({ name, arguments: args, result });
        newFunctionOutputs.push({
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(result),
        });
      }
    }

    if (newFunctionOutputs.length === 0) {
      // No tool calls this turn → assistant is done
      const finalText = extractAssistantText(response);
      return {
        finalText,
        toolCallRecords,
        citations,
        totalPromptTokens,
        totalCompletionTokens,
      };
    }

    // Subsequent turns: send only the tool outputs. State for the function
    // calls themselves lives in the previous response (previous_response_id).
    nextInput = newFunctionOutputs;
  }

  // Hit max turns without a clean stop — return whatever we have
  return {
    finalText:
      "I ran out of research turns. Here's what I found so far — ask a follow-up to continue.",
    toolCallRecords,
    citations,
    totalPromptTokens,
    totalCompletionTokens,
  };
}

function extractAssistantText(response: OpenAIResponseLike): string {
  if (typeof response.output_text === "string" && response.output_text.length > 0) {
    return response.output_text;
  }
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type === "message") {
      const content = (item.content as Array<Record<string, unknown>> | undefined) ?? [];
      for (const block of content) {
        if (block.type === "output_text" && typeof block.text === "string") {
          parts.push(block.text);
        }
      }
    }
  }
  return parts.join("\n").trim();
}

// ── Tool execution: write proposals to research_suggestions ──────────────────

async function executeProposalTool(params: {
  name: string;
  args: Record<string, unknown>;
  orgId: string;
  userId: string;
  projectId: string;
}): Promise<{ ok: boolean; suggestion_id?: string; error?: string }> {
  const { name, args, orgId, userId, projectId } = params;
  const startedAt = Date.now();

  try {
    if (name === "propose_chain_node") {
      const result = await createResearchSuggestion({
        projectId,
        orgId,
        suggestionType: "chain_node",
        payload: {
          company: String(args.company ?? ""),
          role: String(args.role ?? "other").toLowerCase(),
          status: String(args.status ?? "inferred"),
          package: args.package ? String(args.package) : null,
        },
        confidence: clampInt(args.confidence),
        sourceUrl: String(args.source_url ?? ""),
        sourceDate: typeof args.source_date === "string" ? args.source_date : undefined,
        evidenceText: String(args.evidence_text ?? ""),
        createdByAgent: "research_chat_agent",
      });
      await audit(
        orgId,
        userId,
        projectId,
        name,
        args,
        { suggestion_id: result.id },
        Date.now() - startedAt,
      );
      return { ok: true, suggestion_id: result.id };
    }

    if (name === "propose_buyer_contact") {
      const result = await createResearchSuggestion({
        projectId,
        orgId,
        suggestionType: "buyer_contact",
        payload: {
          name: String(args.name ?? ""),
          company: String(args.company ?? ""),
          title: args.title ? String(args.title) : null,
          linkedin_url: args.linkedin_url ? String(args.linkedin_url) : null,
          email: args.email ? String(args.email) : null,
          phone: args.phone ? String(args.phone) : null,
          role_reason: String(args.role_reason ?? ""),
        },
        confidence: clampInt(args.confidence),
        sourceUrl: String(args.source_url ?? ""),
        sourceDate: typeof args.source_date === "string" ? args.source_date : undefined,
        evidenceText: String(args.evidence_text ?? ""),
        createdByAgent: "research_chat_agent",
      });
      await audit(
        orgId,
        userId,
        projectId,
        name,
        args,
        { suggestion_id: result.id },
        Date.now() - startedAt,
      );
      return { ok: true, suggestion_id: result.id };
    }

    if (name === "propose_package") {
      const result = await createResearchSuggestion({
        projectId,
        orgId,
        suggestionType: "package_opportunity",
        payload: {
          package_type: String(args.package_type ?? ""),
          likely_buyer: args.likely_buyer ? String(args.likely_buyer) : null,
          reason: String(args.reason ?? ""),
        },
        confidence: clampInt(args.confidence),
        sourceUrl: String(args.source_url ?? ""),
        sourceDate: typeof args.source_date === "string" ? args.source_date : undefined,
        evidenceText: String(args.evidence_text ?? ""),
        createdByAgent: "research_chat_agent",
      });
      await audit(
        orgId,
        userId,
        projectId,
        name,
        args,
        { suggestion_id: result.id },
        Date.now() - startedAt,
      );
      return { ok: true, suggestion_id: result.id };
    }

    if (name === "add_note") {
      // Notes don't always have a source URL — fall back to the project page.
      const sourceUrl =
        typeof args.source_url === "string" && args.source_url.length > 0
          ? args.source_url
          : "https://triangle-services.local/research-note";
      const result = await createResearchSuggestion({
        projectId,
        orgId,
        suggestionType: "note",
        payload: {
          note_type: String(args.note_type ?? "inference"),
          content: String(args.content ?? ""),
        },
        confidence: clampInt(args.confidence),
        sourceUrl,
        sourceDate: typeof args.source_date === "string" ? args.source_date : undefined,
        evidenceText: String(args.evidence_text ?? args.content ?? ""),
        createdByAgent: "research_chat_agent",
      });
      await audit(
        orgId,
        userId,
        projectId,
        name,
        args,
        { suggestion_id: result.id },
        Date.now() - startedAt,
      );
      return { ok: true, suggestion_id: result.id };
    }

    if (name === "accept_research_suggestion") {
      const { acceptResearchSuggestion } = await import("@/lib/data/research");
      const suggestionId = String(args.suggestion_id ?? "");
      if (!suggestionId) return { ok: false, error: "Missing suggestion_id" };

      const ok = await acceptResearchSuggestion(suggestionId, orgId, userId);
      await audit(
        orgId,
        userId,
        projectId,
        name,
        args,
        { success: ok },
        Date.now() - startedAt,
      );
      return ok ? { ok: true } : { ok: false, error: "Suggestion not found or could not be accepted" };
    }

    return { ok: false, error: `Unknown tool: ${name}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await audit(
      orgId,
      userId,
      projectId,
      name,
      args,
      { error: message },
      Date.now() - startedAt,
      false,
    );
    return { ok: false, error: message };
  }
}

function clampInt(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

async function audit(
  orgId: string,
  userId: string,
  projectId: string,
  toolName: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  durationMs: number,
  success = true,
): Promise<void> {
  try {
    await logAiToolCall({
      orgId,
      userId,
      agentName: "research_chat_agent",
      toolName,
      inputJson: input,
      outputJson: output,
      projectId,
      success,
      durationMs,
    });
  } catch {
    // never throw from audit
  }
}

// ── Route handlers ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI is not configured. Add OPENAI_API_KEY." },
      { status: 503 },
    );
  }

  // Resolve conversation
  const conversation = body.conversationId
    ? await getConversationById({
        conversationId: body.conversationId,
        orgId: access.organizationId,
      })
    : await getOrCreateConversation({
        projectId: body.projectId,
        orgId: access.organizationId,
        userId: access.userId,
      });

  if (!conversation || conversation.project_id !== body.projectId) {
    return NextResponse.json(
      { error: "Conversation not found or does not belong to this project" },
      { status: 404 },
    );
  }

  // Save user message immediately so it appears even if the model fails
  await saveMessage({
    conversationId: conversation.id,
    orgId: access.organizationId,
    role: "user",
    content: body.message,
    createdBy: access.userId,
  });

  // Set conversation title from the first user message
  if (!conversation.title) {
    const title =
      body.message.length > 80
        ? body.message.substring(0, 77) + "..."
        : body.message;
    await setConversationTitle({ conversationId: conversation.id, title });
  }

  // Build context: project memory + conversation context (recent messages + summary of older)
  const [memory, conversationCtx] = await Promise.all([
    buildProjectMemory({
      projectId: body.projectId,
      orgId: access.organizationId,
    }),
    getConversationContext({
      conversationId: conversation.id,
      orgId: access.organizationId,
    }),
  ]);

  const systemPrompt = buildSystemPrompt(memory, conversationCtx.summaryOfOlder);

  // Recent history excluding the just-saved user message (it's already at the end)
  const conversationHistory = conversationCtx.recentMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(0, -1) // drop the just-inserted user message — we pass it separately
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content ?? "",
    }))
    .filter((m) => m.content.length > 0);

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  let result: AgentLoopResult;
  try {
    result = await runAgentLoop({
      client,
      model,
      systemPrompt,
      conversationHistory,
      userMessage: body.message,
      orgId: access.organizationId,
      userId: access.userId,
      projectId: body.projectId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    await saveMessage({
      conversationId: conversation.id,
      orgId: access.organizationId,
      role: "system_note",
      content: `Error: ${message}`,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Persist assistant reply with tool-call records and citations
  const assistantMsg = await saveMessage({
    conversationId: conversation.id,
    orgId: access.organizationId,
    role: "assistant",
    content: result.finalText,
    toolCalls: result.toolCallRecords,
    citations: result.citations,
    promptTokens: result.totalPromptTokens,
    completionTokens: result.totalCompletionTokens,
    createdBy: access.userId,
  });

  // Fire-and-forget: refresh the conversation summary if the conversation is
  // long enough that we'd benefit from compressing older messages. The user
  // gets their response immediately; this runs in the background.
  // +2 because we just saved user msg + assistant msg.
  if (shouldSummarize(conversationCtx.totalMessageCount + 2)) {
    void refreshConversationSummary({
      conversationId: conversation.id,
      orgId: access.organizationId,
      openAiApiKey: apiKey,
      model: process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4.1-mini",
      existingSummary: conversationCtx.summaryOfOlder,
    });
  }

  return NextResponse.json({
    conversationId: conversation.id,
    messageId: assistantMsg.id,
    text: result.finalText,
    toolCalls: result.toolCallRecords,
    citations: result.citations,
    suggestionsCreated: result.toolCallRecords.filter(
      (t) => t.result.ok && t.result.suggestion_id,
    ).length,
    usage: {
      promptTokens: result.totalPromptTokens,
      completionTokens: result.totalCompletionTokens,
    },
  });
}

export async function GET(request: NextRequest) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const conversation = await getOrCreateConversation({
    projectId,
    orgId: access.organizationId,
    userId: access.userId,
  });

  const messages = await listMessages({
    conversationId: conversation.id,
    orgId: access.organizationId,
  });

  return NextResponse.json({
    conversationId: conversation.id,
    title: conversation.title,
    summary: conversation.summary,
    messageCount: conversation.message_count,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: m.tool_calls,
      citations: m.citations,
      createdAt: m.created_at,
    })),
  });
}
