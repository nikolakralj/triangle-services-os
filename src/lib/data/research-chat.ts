/**
 * Data layer for the conversational research agent.
 *
 * Handles:
 *   - Conversation lifecycle (find-or-create per project)
 *   - Message persistence
 *   - Memory context assembly (accepted/rejected suggestions + history)
 *
 * The HTTP layer in /api/research/chat reads from here, calls OpenAI with
 * tools, then writes back via createResearchSuggestion + saveMessage.
 */

import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type ResearchMessageRole =
  | "user"
  | "assistant"
  | "tool_result"
  | "system_note";

export interface ResearchMessageRow {
  id: string;
  conversation_id: string;
  org_id: string;
  role: ResearchMessageRole;
  content: string | null;
  tool_calls: unknown[];
  citations: unknown[];
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: string;
  created_by: string | null;
}

export interface ResearchConversationRow {
  id: string;
  org_id: string;
  project_id: string;
  started_by: string | null;
  title: string | null;
  summary: string | null;
  message_count: number;
  last_active_at: string;
  created_at: string;
}

// ── Conversation: find-or-create ─────────────────────────────────────────────

/**
 * Returns the most recent conversation for a project, creating one if needed.
 * Each project has a single "current" conversation that gets resumed across
 * sessions — keeps memory stitched together.
 */
export async function getOrCreateConversation(params: {
  projectId: string;
  orgId: string;
  userId: string;
}): Promise<ResearchConversationRow> {
  const svc = createServiceSupabaseClient();
  if (!svc) throw new Error("Database unavailable");

  const { data: existing } = await svc
    .from("research_conversations")
    .select("*")
    .eq("project_id", params.projectId)
    .eq("org_id", params.orgId)
    .order("last_active_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as ResearchConversationRow;

  const { data: created, error } = await svc
    .from("research_conversations")
    .insert({
      org_id: params.orgId,
      project_id: params.projectId,
      started_by: params.userId,
    })
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return created as ResearchConversationRow;
}

export async function getConversationById(params: {
  conversationId: string;
  orgId: string;
}): Promise<ResearchConversationRow | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) throw new Error("Database unavailable");

  const { data } = await svc
    .from("research_conversations")
    .select("*")
    .eq("id", params.conversationId)
    .eq("org_id", params.orgId)
    .maybeSingle();

  return (data as ResearchConversationRow) ?? null;
}

export async function setConversationTitle(params: {
  conversationId: string;
  title: string;
}): Promise<void> {
  const svc = createServiceSupabaseClient();
  if (!svc) return;
  await svc
    .from("research_conversations")
    .update({ title: params.title.substring(0, 200) })
    .eq("id", params.conversationId);
}

export async function setConversationSummary(params: {
  conversationId: string;
  summary: string;
}): Promise<void> {
  const svc = createServiceSupabaseClient();
  if (!svc) return;
  await svc
    .from("research_conversations")
    .update({ summary: params.summary })
    .eq("id", params.conversationId);
}

// ── Auto-summarization ───────────────────────────────────────────────────────
// Long conversations blow context budget. Once the conversation passes a
// threshold, we compress everything except the most recent N messages into a
// concise paragraph stored on the conversation row. The chat agent's system
// prompt reads this summary alongside the recent verbatim window.

const RECENT_WINDOW_MESSAGES = 16; // last N messages stay verbatim
const SUMMARIZATION_THRESHOLD = 24; // start summarizing once we exceed this many total messages

export interface ConversationContextForLLM {
  summaryOfOlder: string | null;
  recentMessages: ResearchMessageRow[];
  totalMessageCount: number;
}

/**
 * Build the chat context for the LLM:
 *   - `summaryOfOlder` is the compressed memory of messages older than the recent window
 *   - `recentMessages` is the last N messages verbatim
 *
 * The agent gets the summary as part of its system prompt, and the recent
 * messages as actual conversation history.
 */
export async function getConversationContext(params: {
  conversationId: string;
  orgId: string;
}): Promise<ConversationContextForLLM> {
  const svc = createServiceSupabaseClient();
  if (!svc) {
    return { summaryOfOlder: null, recentMessages: [], totalMessageCount: 0 };
  }

  const conv = await getConversationById({
    conversationId: params.conversationId,
    orgId: params.orgId,
  });
  if (!conv) {
    return { summaryOfOlder: null, recentMessages: [], totalMessageCount: 0 };
  }

  const all = await listMessages({
    conversationId: params.conversationId,
    orgId: params.orgId,
    limit: 500,
  });

  const recent = all.slice(-RECENT_WINDOW_MESSAGES);

  return {
    summaryOfOlder: conv.summary,
    recentMessages: recent,
    totalMessageCount: all.length,
  };
}

/**
 * Should we trigger summarization on this turn? Yes when:
 *   - total messages > SUMMARIZATION_THRESHOLD AND
 *   - there are at least RECENT_WINDOW_MESSAGES + 4 messages older than the recent window
 *     (so summarizing actually compresses something meaningful)
 */
export function shouldSummarize(totalMessageCount: number): boolean {
  return totalMessageCount > SUMMARIZATION_THRESHOLD;
}

/**
 * Generates a summary by calling OpenAI on the older portion of the chat,
 * then writes it to the conversation row. This is meant to run in the
 * background (fire-and-forget) so it doesn't slow down the user response.
 */
export async function refreshConversationSummary(params: {
  conversationId: string;
  orgId: string;
  openAiApiKey: string;
  model?: string;
  /** Existing summary if any — we incrementally extend it rather than start over. */
  existingSummary?: string | null;
}): Promise<void> {
  const svc = createServiceSupabaseClient();
  if (!svc) return;

  const all = await listMessages({
    conversationId: params.conversationId,
    orgId: params.orgId,
    limit: 500,
  });

  if (all.length <= SUMMARIZATION_THRESHOLD) return;

  const olderMessages = all.slice(0, -RECENT_WINDOW_MESSAGES);
  if (olderMessages.length === 0) return;

  const transcript = olderMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const role = m.role === "user" ? "User" : "Agent";
      const text = m.content ?? "";
      const tools =
        Array.isArray(m.tool_calls) && m.tool_calls.length > 0
          ? `\n  [tools: ${(m.tool_calls as Array<{ name: string }>)
              .map((t) => t.name)
              .join(", ")}]`
          : "";
      return `${role}: ${text}${tools}`;
    })
    .join("\n\n");

  const existing = params.existingSummary
    ? `\n\nPREVIOUS SUMMARY (extend with new info):\n${params.existingSummary}\n`
    : "";

  const prompt = [
    "You compress research conversations into running notes for an AI agent.",
    "Goal: preserve facts, decisions, and the user's stated intent / preferences. Drop chit-chat.",
    "Format: bullet list, ≤400 words, third person.",
    "",
    "Capture:",
    "- Concrete findings (companies, contacts, packages identified)",
    "- User preferences and constraints stated during the conversation",
    "- What's been searched / explored already (so the agent doesn't repeat)",
    "- Open questions and pending follow-ups",
    "",
    "Do NOT include:",
    "- Pleasantries or filler",
    "- Things already in the project's accepted suggestions list (the agent has those separately)",
    existing,
    "TRANSCRIPT TO SUMMARIZE:",
    transcript,
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: params.model ?? "gpt-4.1-mini",
        messages: [
          { role: "system", content: "You write concise, faithful research notes." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 800,
      }),
    });
    if (!res.ok) return; // silent — summary is best-effort
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const summary = json.choices?.[0]?.message?.content?.trim();
    if (!summary) return;

    await setConversationSummary({
      conversationId: params.conversationId,
      summary: summary.substring(0, 4000),
    });
  } catch {
    // Best-effort — don't propagate
  }
}

// ── Messages ─────────────────────────────────────────────────────────────────

export async function listMessages(params: {
  conversationId: string;
  orgId: string;
  limit?: number;
}): Promise<ResearchMessageRow[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const { data } = await svc
    .from("research_messages")
    .select("*")
    .eq("conversation_id", params.conversationId)
    .eq("org_id", params.orgId)
    .order("created_at", { ascending: true })
    .limit(params.limit ?? 200);

  return (data as ResearchMessageRow[]) ?? [];
}

export async function saveMessage(params: {
  conversationId: string;
  orgId: string;
  role: ResearchMessageRole;
  content?: string | null;
  toolCalls?: unknown[];
  citations?: unknown[];
  promptTokens?: number | null;
  completionTokens?: number | null;
  createdBy?: string | null;
}): Promise<{ id: string }> {
  const svc = createServiceSupabaseClient();
  if (!svc) throw new Error("Database unavailable");

  const { data, error } = await svc
    .from("research_messages")
    .insert({
      conversation_id: params.conversationId,
      org_id: params.orgId,
      role: params.role,
      content: params.content ?? null,
      tool_calls: params.toolCalls ?? [],
      citations: params.citations ?? [],
      prompt_tokens: params.promptTokens ?? null,
      completion_tokens: params.completionTokens ?? null,
      created_by: params.createdBy ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return { id: data!.id };
}

// ── Memory context: what the agent already knows about this project ─────────

export interface ProjectMemorySnapshot {
  project: {
    id: string;
    name: string | null;
    country: string | null;
    city: string | null;
    phase: string | null;
    project_type: string | null;
    client_company: string | null;
    general_contractor: string | null;
    source_url: string | null;
    ai_summary: string | null;
    estimated_value_eur: number | null;
  };
  /** Suggestions that were accepted — agent should treat these as ground truth. */
  acceptedFacts: Array<{
    id: string;
    type: string;
    summary: string;
    confidence: number | null;
    source_url: string | null;
  }>;
  /** Suggestions that were rejected — agent should NOT propose these again. */
  rejectedAttempts: Array<{
    id: string;
    type: string;
    summary: string;
    rejection_reason: string | null;
  }>;
  /** Currently pending suggestions (already proposed, awaiting human review). */
  pendingProposals: Array<{
    id: string;
    type: string;
    summary: string;
    confidence: number | null;
  }>;
}

/**
 * Build the project memory snapshot that goes into the agent's system prompt.
 * This is what makes the agent "remember" past decisions.
 */
export async function buildProjectMemory(params: {
  projectId: string;
  orgId: string;
}): Promise<ProjectMemorySnapshot> {
  const svc = createServiceSupabaseClient();
  if (!svc) {
    return {
      project: {
        id: params.projectId,
        name: null,
        country: null,
        city: null,
        phase: null,
        project_type: null,
        client_company: null,
        general_contractor: null,
        source_url: null,
        ai_summary: null,
        estimated_value_eur: null,
      },
      acceptedFacts: [],
      rejectedAttempts: [],
      pendingProposals: [],
    };
  }

  const [projectRes, suggestionsRes] = await Promise.all([
    svc
      .from("discovered_projects")
      .select(
        "id, project_name, country, city, phase, project_type, client_company, general_contractor, source_url, ai_summary, estimated_value_eur",
      )
      .eq("id", params.projectId)
      .eq("organization_id", params.orgId)
      .maybeSingle(),
    svc
      .from("research_suggestions")
      .select(
        "id, suggestion_type, payload_json, status, confidence, source_url, rejection_reason",
      )
      .eq("project_id", params.projectId)
      .eq("org_id", params.orgId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const project = projectRes.data ?? {
    id: params.projectId,
    project_name: null,
    country: null,
    city: null,
    phase: null,
    project_type: null,
    client_company: null,
    general_contractor: null,
    source_url: null,
    ai_summary: null,
    estimated_value_eur: null,
  };

  const accepted: ProjectMemorySnapshot["acceptedFacts"] = [];
  const rejected: ProjectMemorySnapshot["rejectedAttempts"] = [];
  const pending: ProjectMemorySnapshot["pendingProposals"] = [];

  for (const s of (suggestionsRes.data ?? []) as Array<{
    id: string;
    suggestion_type: string;
    payload_json: Record<string, unknown>;
    status: string;
    confidence: number | null;
    source_url: string | null;
    rejection_reason: string | null;
  }>) {
    const summary = summarizeSuggestion(s.suggestion_type, s.payload_json);
    if (s.status === "accepted" || s.status === "edited_and_accepted") {
      accepted.push({
        id: s.id,
        type: s.suggestion_type,
        summary,
        confidence: s.confidence,
        source_url: s.source_url,
      });
    } else if (s.status === "rejected") {
      rejected.push({
        id: s.id,
        type: s.suggestion_type,
        summary,
        rejection_reason: s.rejection_reason,
      });
    } else if (s.status === "pending") {
      pending.push({ id: s.id, type: s.suggestion_type, summary, confidence: s.confidence });
    }
  }

  return {
    project: {
      id: (project as { id: string }).id,
      name: (project as { project_name: string | null }).project_name,
      country: (project as { country: string | null }).country,
      city: (project as { city: string | null }).city,
      phase: (project as { phase: string | null }).phase,
      project_type: (project as { project_type: string | null }).project_type,
      client_company: (project as { client_company: string | null }).client_company,
      general_contractor: (project as { general_contractor: string | null })
        .general_contractor,
      source_url: (project as { source_url: string | null }).source_url,
      ai_summary: (project as { ai_summary: string | null }).ai_summary,
      estimated_value_eur: (project as { estimated_value_eur: number | null })
        .estimated_value_eur,
    },
    acceptedFacts: accepted,
    rejectedAttempts: rejected,
    pendingProposals: pending,
  };
}

function summarizeSuggestion(
  type: string,
  payload: Record<string, unknown>,
): string {
  if (type === "chain_node") {
    return `${String(payload.company ?? "?")} as ${String(payload.role ?? "?")}`;
  }
  if (type === "buyer_contact") {
    return `${String(payload.name ?? "?")} @ ${String(payload.company ?? "?")} (${String(payload.title ?? "?")})`;
  }
  if (type === "package_opportunity") {
    return `${String(payload.package_type ?? "?")} → ${String(payload.likely_buyer ?? "?")}`;
  }
  if (type === "note") {
    return String(payload.content ?? "").substring(0, 120);
  }
  return JSON.stringify(payload).substring(0, 120);
}
