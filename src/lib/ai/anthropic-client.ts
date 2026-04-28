/**
 * Lightweight Anthropic API client (no SDK needed).
 * Uses the Claude API with web_search built-in tool.
 */

import "server-only";

export type ClaudeMessage = {
  role: "user" | "assistant";
  content:
    | string
    | Array<{
        type: string;
        text?: string;
        [key: string]: unknown;
      }>;
};

export type ClaudeResponse = {
  id: string;
  model: string;
  role: string;
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    server_tool_use?: {
      web_search_requests?: number;
    };
  };
};

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

export async function callClaudeWithWebSearch(params: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  maxWebSearches?: number;
}): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local to use the Hunter.",
    );
  }

  const model = params.model ?? "claude-sonnet-4-5-20250929";

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: params.maxTokens ?? 8000,
      system: params.systemPrompt,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: params.maxWebSearches ?? 8,
        },
      ],
      messages: [
        {
          role: "user",
          content: params.userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Anthropic API error ${response.status}: ${errorText.substring(0, 500)}`,
    );
  }

  return (await response.json()) as ClaudeResponse;
}

/**
 * Extract the final text response from a Claude message that used tools.
 * Joins all text blocks (after tool uses are done).
 */
export function extractFinalText(response: ClaudeResponse): string {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
}

/**
 * Try to parse JSON from Claude's response.
 * Handles cases where Claude might wrap in markdown code blocks despite instructions.
 */
export function parseClaudeJson<T>(text: string): T {
  let cleaned = text.trim();

  // Strip markdown code blocks if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  // Find first { and last } to be tolerant of preamble/postamble
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned) as T;
}

/**
 * Estimate cost in USD for Claude usage.
 * Sonnet 4.5 pricing: $3/MTok input, $15/MTok output, web search ~$10/1k searches
 */
export function estimateClaudeCost(usage: ClaudeResponse["usage"]): number {
  const inputCostPer1k = 0.003; // $3 / MTok
  const outputCostPer1k = 0.015; // $15 / MTok
  const webSearchCostPer1 = 0.01; // $10/1000

  const inputCost = (usage.input_tokens / 1000) * inputCostPer1k;
  const outputCost = (usage.output_tokens / 1000) * outputCostPer1k;
  const webSearchCost =
    (usage.server_tool_use?.web_search_requests ?? 0) * webSearchCostPer1;

  return Number((inputCost + outputCost + webSearchCost).toFixed(4));
}
