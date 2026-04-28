import "server-only";
import OpenAI from "openai";

type WebSource = {
  title?: string;
  url?: string;
};

type OutputAnnotation = {
  type?: string;
  url?: string;
  title?: string;
};

type OutputContent = {
  type?: string;
  text?: string;
  annotations?: OutputAnnotation[];
};

type ResponseOutputItem = {
  type?: string;
  action?: {
    type?: string;
    sources?: WebSource[];
  };
  content?: OutputContent[];
};

export type OpenAIHunterResponse = {
  id: string;
  model: string;
  output_text?: string;
  output?: ResponseOutputItem[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local to use the Hunter.",
    );
  }

  return new OpenAI({ apiKey });
}

export async function callOpenAIHunter(params: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
}) {
  const client = getOpenAIClient();
  const model = params.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const response = await client.responses.create({
    model,
    instructions: params.systemPrompt,
    input: params.userPrompt,
    tools: [
      {
        type: "web_search",
        user_location: {
          type: "approximate",
          country: "HR",
          city: "Zagreb",
          region: "Zagreb",
        },
      },
    ],
    tool_choice: "auto",
    include: ["web_search_call.action.sources"],
  });

  return response as OpenAIHunterResponse;
}

export function extractOpenAIText(response: OpenAIHunterResponse) {
  if (response.output_text?.trim()) return response.output_text;

  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .filter((content) => content.type === "output_text" && content.text)
      .map((content) => content.text ?? "")
      .join("\n") ?? ""
  );
}

export function parseOpenAIJson<T>(text: string): T {
  let cleaned = text.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned) as T;
}

export function collectWebSources(response: OpenAIHunterResponse) {
  const citedSources =
    response.output
      ?.flatMap((item) => item.content ?? [])
      .flatMap((content) => content.annotations ?? [])
      .filter((annotation) => annotation.type === "url_citation" && annotation.url)
      .map((annotation) => ({
        title: annotation.title ?? annotation.url ?? "Source",
        url: annotation.url ?? "",
      })) ?? [];

  const searchedSources =
    response.output
      ?.filter((item) => item.type === "web_search_call")
      .flatMap((item) => item.action?.sources ?? [])
      .filter((source) => source.url)
      .map((source) => ({
        title: source.title ?? source.url ?? "Source",
        url: source.url ?? "",
      })) ?? [];

  const seen = new Set<string>();
  return [...citedSources, ...searchedSources].filter((source) => {
    if (!source.url || seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

export function estimateOpenAICost(response: OpenAIHunterResponse) {
  const usage = response.usage;
  if (!usage) {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
  }

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? inputTokens + outputTokens;

  const inputCostPer1M = 0.4;
  const outputCostPer1M = 1.6;
  const webSearchCost = 0.01;

  const tokenCost =
    (inputTokens / 1_000_000) * inputCostPer1M +
    (outputTokens / 1_000_000) * outputCostPer1M;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: Number((tokenCost + webSearchCost).toFixed(4)),
  };
}
