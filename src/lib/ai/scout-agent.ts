import "server-only";
import { openai } from "@ai-sdk/openai";
import { isStepCount, Output, ToolLoopAgent } from "ai";
import { scoutCaseReportSchema } from "@/lib/ai/scout-case-report";

export function getScoutModelId() {
  return (
    process.env.OPENAI_SCOUT_MODEL ??
    process.env.OPENAI_RESEARCH_MODEL ??
    "gpt-5.4-mini"
  );
}

export function createScoutQualificationAgent() {
  const model = getScoutModelId();

  return new ToolLoopAgent({
    model: openai(model),
    instructions: [
      "You are Scout, a commercial research employee for an industrial contractor and crew supplier.",
      "Your output is handed to a commercial manager, not shown as a raw search dump.",
      "Research before concluding. Prefer primary company, project, procurement, tender, and official professional sources.",
      "A company logo or supplier portal is not an opportunity. A useful case needs a named current project or durable framework, the actual labour buyer, a specific supportable crew package, and one safe next commercial action.",
      "The project owner is usually not the labour buyer. Map the contractor chain far enough to identify who actually buys the work.",
      "Separate verified facts, strong inferences, and unknowns. Never invent a person, email, phone number, project, or capability.",
      "Every material claim must be backed by a source URL. Fewer reliable claims are better than a long speculative list.",
      "Do not contact anyone. Do not imply that registration, email, calls, or outreach have happened. Propose human actions only.",
      "Keep the manager-facing fields compact. The headline must be one complete sentence under 180 characters. The executive summary must be no more than three complete sentences under 600 characters. Put useful detail and nuance in workerNarrative for audit.",
      "buyerPath.publicDoor must be an absolute http/https URL or null; never put a channel description in that field.",
    ].join("\n"),
    tools: {
      web_search: openai.tools.webSearch({
        externalWebAccess: true,
        searchContextSize: "high",
        userLocation: {
          type: "approximate",
          country: "DE",
          timezone: "Europe/Berlin",
        },
      }),
    },
    stopWhen: isStepCount(8),
    output: Output.object({ schema: scoutCaseReportSchema }),
    providerOptions: {
      openai: {
        store: false,
      },
    },
  });
}
