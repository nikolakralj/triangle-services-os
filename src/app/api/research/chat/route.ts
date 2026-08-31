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
import {
  createOutreachDraft,
  type OutreachChannel,
} from "@/lib/data/outreach";
import {
  getOrganizationOperatingProfile,
  isOrganizationProfileComplete,
  type OrganizationOperatingProfile,
} from "@/lib/data/organization-profile";

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
      "Propose a sellable labor package — a concrete crew or specialist offering the active organization could pitch to a specific contractor (the likely buyer). When accepted, this becomes a real project_packages row that drives outreach. Be specific: what crew, what scope, what size, to whom.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Short package name, e.g. 'LV/MV cable pulling crew — 80 electricians, 6 months' or 'Commissioning supervision — 8 senior engineers'",
        },
        summary: {
          type: "string",
          description:
            "1-3 sentences: what scope, why it fits this project, and what approved seller capabilities support delivery",
        },
        roles: {
          type: "array",
          items: { type: "string" },
          description:
            "List of worker roles, e.g. ['electrician', 'cable puller', 'supervisor']",
        },
        size: {
          type: "integer",
          description:
            "Estimated peak crew size (number of workers) for this package",
        },
        likely_buyer: {
          type: "string",
          description:
            "Company most likely to buy this package — usually a GC, EPC, or MEP contractor (NOT the project owner)",
        },
        contractor_node_id: {
          type: "string",
          description:
            "Optional: UUID of an existing accepted contractor_chain_node this package attaches to. Omit if the buyer isn't yet a tracked node.",
        },
        confidence: { type: "integer", minimum: 0, maximum: 100 },
        source_url: { type: "string" },
        evidence_text: {
          type: "string",
          description:
            "Why this package is realistic — quote the source signals (project phase, scale, named contractor, etc.)",
        },
        source_date: { type: "string" },
      },
      required: ["title", "summary", "roles", "confidence", "source_url", "evidence_text"],
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
  {
    type: "function" as const,
    name: "draft_outreach",
    description:
      "Draft an outreach message to a specific buyer contact. Always pair with the most relevant project package. Drafts are saved to the outreach queue — they are NEVER auto-sent. The user reviews, edits, copies, and sends manually. Always provide ALL THREE message types in one call so the user has a complete first-touch sequence: (1) LinkedIn connection note (≤300 chars, soft, curious tone), (2) LinkedIn DM after acceptance (medium length, mentions the package), (3) Email cold (full pitch with subject + body). For follow-ups, use email_followup channel.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        buyer_contact_id: {
          type: "string",
          description:
            "UUID of an accepted buyer_contact. Use this if the buyer is already in the CRM.",
        },
        buyer_suggestion_id: {
          type: "string",
          description:
            "UUID of a PENDING buyer_contact research_suggestion. Use this when the buyer hasn't been accepted yet but you still want to draft outreach.",
        },
        project_package_id: {
          type: "string",
          description:
            "Optional — UUID of a project_package this outreach is pitching. Pair drafts with packages when possible.",
        },
        drafts: {
          type: "array",
          description:
            "Array of message drafts. Provide variants across channels in a single call.",
          items: {
            type: "object",
            properties: {
              channel: {
                type: "string",
                enum: ["linkedin_connect", "linkedin_message", "email_cold", "email_followup"],
              },
              subject: {
                type: "string",
                description: "Email subject. Required for email_*; null for LinkedIn.",
              },
              body: { type: "string", description: "The full message body." },
              variant_label: {
                type: "string",
                description:
                  "Short label for this variant, e.g. 'Curious', 'Direct', 'Warm'. Helps the user pick.",
              },
            },
            required: ["channel", "body"],
          },
        },
      },
      required: ["drafts"],
    },
  },
];

// ── System prompt: builds the agent's "memory" from project state ───────────

function buildSystemPrompt(
  memory: ProjectMemorySnapshot,
  profile: OrganizationOperatingProfile,
  olderSummary?: string | null,
): string {
  const {
    project,
    acceptedFacts,
    rejectedAttempts,
    pendingProposals,
    existingPackages,
    acceptedChainNodes,
    note,
  } = memory;

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
    `You are a commercial research agent for ${profile.name}.`,
    `Approved seller profile: ${profile.companyProfile}`,
    `Operating model: ${profile.operatingModel}. Offer mode: ${profile.offerMode}.`,
    "",
    "Your job: research projects, map the contractor chain, find buyer contacts, identify package opportunities. You communicate with the user in chat.",
    "",
    "## Tools you have",
    "- web_search: search the public web for evidence",
    "- propose_chain_node: propose a contractor or owner. Goes into the human review queue.",
    "- propose_buyer_contact: propose a buyer / decision-maker.",
    "- propose_package: propose a SELLABLE labor package — concrete crew offering with title, summary, roles, size, and likely buyer. When accepted, it becomes a real project_package row that drives outreach. Be specific: 'LV/MV cable pulling crew — 80 electricians, 6 months, sold to Bouygues E&S' beats 'electrical work'.",
    "- add_note: record a fact, inference, unknown, risk, or next-action.",
    "- accept_research_suggestion: IMMEDIATELY save a pending suggestion into the final Graph/CRM. Use this when the user says 'store it', 'accept', or similar.",
    "- draft_outreach: Draft outreach messages (LinkedIn note + LinkedIn DM + email cold) for a specific buyer. NEVER auto-sends — saves drafts the user reviews and copies. Always provide all three channels in one call so the user gets a complete first-touch sequence. Pair with a project_package_id when possible.",
    "",
    "## Hard rules",
    "1. Never invent facts. If you don't know, say so or use add_note(note_type=unknown).",
    "2. Always include source_url + evidence_text on propose_* calls. Quote or paraphrase the source.",
    "3. Do not re-propose anything in the 'Already accepted' or 'Pending review' lists below.",
    "4. Do not re-propose anything in the 'Rejected' list — and respect the rejection reason.",
    "5. Confidence is an integer 0-100. Be honest: 95+ for explicit statements in primary sources, 60-80 for strong inferences, <50 for guesses.",
    "6. Owner is often NOT the labor buyer. The actual buyer is usually the GC, EPC, or MEP package owner.",
    "7. Prefer fewer strong findings over many weak ones.",
    "8. When proposing a package, ALWAYS attach it to the most likely buyer (a GC/EPC/MEP, not the owner). Estimate a real crew size based on project scale and phase. Example: a 100MW data center in fit-out phase typically needs 60-120 electricians + 20-40 mechanical workers + 8-15 commissioning engineers. Use these heuristics, don't return vague 'electrical package' suggestions.",
    "8a. Never propose capabilities, worker roles, delivery coverage, certifications, or scale that are not supported by the approved seller profile or verified app records.",
    "9. Outreach drafts must be specific and personalized. Reference the project name, the buyer's role, and the package being pitched. NO generic templates ('I am writing to introduce...'). LinkedIn connection notes are short and curious — NOT sales pitches. The DM after acceptance is where you mention the package. Email cold has a short subject (≤7 words), opens with a specific observation about the project, then the package, then a low-friction CTA ('worth a 15-min intro call?'). Always match the language of the project's country (English for UK/Ireland, French for France, etc. — but if unsure, default to English).",
    "",
    "## Project facts",
    projectFacts || "(no facts loaded)",
    "",
    ...(note
      ? [
          "## Project memory (notes written by the user — treat as authoritative context)",
          note,
          "",
        ]
      : []),
    "## Already accepted (ground truth — don't re-propose)",
    acceptedList,
    "",
    "## Pending review (already proposed — don't duplicate)",
    pendingList,
    "",
    "## Rejected (don't re-propose — respect the reasons)",
    rejectedList,
    "",
    "## Live contractor chain nodes (use these node IDs when proposing packages)",
    acceptedChainNodes.length === 0
      ? "(none yet — chain is still empty)"
      : acceptedChainNodes
          .map(
            (n) =>
              `  • node_id: ${n.id} | ${n.label}: ${n.company} (role=${n.role})` +
              (n.confidence !== null ? ` (${n.confidence}%)` : ""),
          )
          .join("\n"),
    "",
    "## Existing project packages (concrete crew offerings — don't duplicate)",
    existingPackages.length === 0
      ? "(none yet — propose new packages if there's enough chain context)"
      : existingPackages
          .map(
            (p) =>
              `  • [${p.status}] ${p.title}` +
              (p.size ? ` — ${p.size} workers` : "") +
              (p.roles.length > 0 ? ` [${p.roles.join(", ")}]` : ""),
          )
          .join("\n"),
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
    result: {
      ok: boolean;
      suggestion_id?: string;
      outreach_count?: number;
      variant_group_id?: string;
      skipped?: Array<{ index: number; reason: string }>;
      error?: string;
    };
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
}): Promise<{
  ok: boolean;
  suggestion_id?: string;
  outreach_count?: number;
  variant_group_id?: string;
  skipped?: Array<{ index: number; reason: string }>;
  error?: string;
}> {
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
      const rolesInput = args.roles;
      const roles: string[] = Array.isArray(rolesInput)
        ? rolesInput.map((r) => String(r)).filter(Boolean)
        : [];

      const sizeInput = args.size;
      const size =
        typeof sizeInput === "number"
          ? Math.max(0, Math.round(sizeInput))
          : typeof sizeInput === "string" && sizeInput.match(/^\d+$/)
            ? Number(sizeInput)
            : undefined;

      const result = await createResearchSuggestion({
        projectId,
        orgId,
        suggestionType: "package_opportunity",
        payload: {
          title: String(args.title ?? "Discovered Package"),
          summary: String(args.summary ?? args.evidence_text ?? ""),
          roles,
          size: size ?? null,
          likely_buyer: args.likely_buyer ? String(args.likely_buyer) : null,
          contractor_node_id:
            typeof args.contractor_node_id === "string" && args.contractor_node_id.length > 0
              ? args.contractor_node_id
              : null,
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
          : "https://local.invalid/research-note";
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
      const suggestionId = String(args.suggestion_id ?? "").trim();
      // The model sometimes emits a placeholder ("undefined", "", a non-UUID)
      // when it doesn't actually hold the suggestion's UUID — e.g. when it
      // tries to accept in the same turn it proposed, before the propose
      // result came back. Guard here so an invalid id never reaches Postgres
      // (which would throw a raw "invalid input syntax for type uuid" error).
      // Returning an actionable message lets the agent recover on the next turn.
      if (!isUuid(suggestionId)) {
        return {
          ok: false,
          error:
            "suggestion_id must be the real UUID of a pending suggestion. Look it up in the 'Pending review' list (each line starts with 'ID: <uuid>'), then call accept_research_suggestion again with that exact id. Do not guess or pass placeholders.",
        };
      }

      const { ok } = await acceptResearchSuggestion({
        suggestionId,
        orgId,
        userId,
      });
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

    if (name === "draft_outreach") {
      const buyerContactId =
        typeof args.buyer_contact_id === "string" && args.buyer_contact_id.length > 0
          ? args.buyer_contact_id
          : null;
      const buyerSuggestionId =
        typeof args.buyer_suggestion_id === "string" && args.buyer_suggestion_id.length > 0
          ? args.buyer_suggestion_id
          : null;

      if (!buyerContactId && !buyerSuggestionId) {
        return {
          ok: false,
          error:
            "Need either buyer_contact_id (for accepted contacts) or buyer_suggestion_id (for pending ones).",
        };
      }

      const projectPackageId =
        typeof args.project_package_id === "string" && args.project_package_id.length > 0
          ? args.project_package_id
          : null;

      const draftsInput = Array.isArray(args.drafts) ? args.drafts : [];
      if (draftsInput.length === 0) {
        return { ok: false, error: "No drafts provided." };
      }

      // Group drafts together so the UI can show variants side-by-side
      const variantGroupId = crypto.randomUUID();
      const validChannels: ReadonlySet<OutreachChannel> = new Set([
        "linkedin_connect",
        "linkedin_message",
        "email_cold",
        "email_followup",
      ]);

      const created: string[] = [];
      const skipped: Array<{ index: number; reason: string }> = [];

      for (let i = 0; i < draftsInput.length; i++) {
        const d = draftsInput[i] as Record<string, unknown>;
        const channel = String(d.channel ?? "");
        const body = String(d.body ?? "").trim();

        if (!validChannels.has(channel as OutreachChannel)) {
          skipped.push({ index: i, reason: `invalid channel: ${channel}` });
          continue;
        }
        if (body.length === 0) {
          skipped.push({ index: i, reason: "empty body" });
          continue;
        }

        const subject =
          typeof d.subject === "string" && d.subject.trim().length > 0
            ? d.subject.trim()
            : null;
        const variantLabel =
          typeof d.variant_label === "string" && d.variant_label.length > 0
            ? d.variant_label
            : null;

        const result = await createOutreachDraft({
          orgId,
          projectId,
          buyerContactId,
          buyerSuggestionId,
          projectPackageId,
          channel: channel as OutreachChannel,
          subject,
          body,
          variantGroupId,
          variantLabel,
          createdByAgent: "research_chat_agent",
          createdByUserId: userId,
        });
        if (result?.id) created.push(result.id);
        else skipped.push({ index: i, reason: "insert failed" });
      }

      await audit(
        orgId,
        userId,
        projectId,
        name,
        args,
        { created_count: created.length, skipped_count: skipped.length, variant_group_id: variantGroupId },
        Date.now() - startedAt,
      );

      return {
        ok: created.length > 0,
        outreach_count: created.length,
        skipped: skipped.length > 0 ? skipped : undefined,
        variant_group_id: variantGroupId,
        error: created.length === 0 ? "No drafts could be saved." : undefined,
      };
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value.trim());
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
  if (access.demo) {
    return NextResponse.json(
      { error: "Research chat is not available in demo mode." },
      { status: 403 },
    );
  }

  const profile = await getOrganizationOperatingProfile(access.organizationId);
  if (!isOrganizationProfileComplete(profile)) {
    return NextResponse.json(
      { error: "Complete the organization profile before running research." },
      { status: 409 },
    );
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

  const systemPrompt = buildSystemPrompt(
    memory,
    profile,
    conversationCtx.summaryOfOlder,
  );

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
