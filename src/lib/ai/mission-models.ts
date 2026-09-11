import "server-only";
import { openai } from "@ai-sdk/openai";
import { xai } from "@ai-sdk/xai";
import type { generateText } from "ai";

// ---------------------------------------------------------------------------
// Which AI does mission work.
//
// On 11 September the CEO chose Grok for missions: the strongest model xAI
// offers, with full freedom inside the mission's rules. The model is
// configuration, not identity — Scout is Scout whichever provider runs him
// (AGENTS.md) — so every mission model is chosen here and nowhere else:
//
//   XAI_API_KEY set     Grok — XAI_MISSION_MODEL, default grok-4.6
//   otherwise           OpenAI, only until the xAI key is in place
//
// What stays out of a model's hands is enforced by the database and the
// routes, so changing the model changes nothing about what a mission may do.
// ---------------------------------------------------------------------------

export type MissionProvider = "xai" | "openai";

/** The jobs an employee does inside a mission. Each gets its own reasoning depth and time. */
export type MissionRole = "research" | "reach" | "plan" | "memory" | "name" | "talent";

type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]["providerOptions"]>;

export function missionProvider(): MissionProvider | null {
  if (process.env.XAI_API_KEY) return "xai";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

/** The OpenAI research model, for the fallback and the older case-research agents. */
export function openAiResearchModelId(): string {
  return process.env.OPENAI_SCOUT_MODEL ?? process.env.OPENAI_RESEARCH_MODEL ?? "gpt-5.4-mini";
}

/** The provider and model a run is recorded under. */
export function missionModelLabel(role: MissionRole): { provider: MissionProvider; model: string } {
  if (missionProvider() === "xai") {
    return { provider: "xai", model: process.env.XAI_MISSION_MODEL ?? "grok-4.6" };
  }
  return { provider: "openai", model: role === "talent" ? "gpt-4.1-mini" : openAiResearchModelId() };
}

export function missionModel(role: MissionRole) {
  const { provider, model } = missionModelLabel(role);
  return provider === "xai" ? xai(model) : openai(model);
}

/**
 * How hard Grok thinks, by job. Research and reading a company's site decide
 * what gets filed, so they think longest; naming a tab does not need to.
 */
const GROK_EFFORT: Record<MissionRole, "low" | "medium" | "high"> = {
  research: "high",
  reach: "medium",
  memory: "medium",
  talent: "medium",
  plan: "low",
  name: "low",
};

export function missionProviderOptions(role: MissionRole): ProviderOptions {
  return missionProvider() === "xai"
    ? { xai: { store: false, reasoningEffort: GROK_EFFORT[role] } }
    : { openai: { store: false } };
}

/**
 * How long one call may take. Grok reasoning at full depth is slower per step
 * than the small model it replaces; these are starting points to tune against
 * real runs, not measurements.
 */
export function missionTimeout(role: MissionRole): number {
  const grok = missionProvider() === "xai";
  switch (role) {
    case "research":
      return grok ? 150_000 : 120_000;
    case "reach":
      return grok ? 90_000 : 75_000;
    case "plan":
      return grok ? 30_000 : 20_000;
    case "memory":
      return grok ? 25_000 : 15_000;
    case "name":
      return grok ? 15_000 : 12_000;
    case "talent":
      return 60_000;
  }
}

/**
 * Where the search is anchored, for OpenAI's search.
 *
 * Both agents once hardcoded Germany. That is right today — the demand queue
 * is German and Austrian — and wrong the moment Triangle hunts from its
 * Croatian side, because an anchored search quietly ranks German results first
 * and nobody sees it happening. Overridable now; it should come from the
 * organisation profile once there is more than one entity to ask.
 */
export function searchLocation() {
  return {
    type: "approximate" as const,
    country: process.env.SCOUT_SEARCH_COUNTRY ?? "DE",
    timezone: process.env.SCOUT_SEARCH_TIMEZONE ?? "Europe/Berlin",
  };
}

/** Web search as the mission's provider runs it, on its own servers. */
export function missionWebSearch() {
  return missionProvider() === "xai"
    ? xai.tools.webSearch({})
    : openai.tools.webSearch({
        externalWebAccess: true,
        searchContextSize: "high",
        userLocation: searchLocation(),
      });
}
