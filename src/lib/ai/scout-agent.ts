import "server-only";
import { openai } from "@ai-sdk/openai";
import { isStepCount, Output, ToolLoopAgent } from "ai";
import { reachabilityReportSchema } from "@/lib/ai/reachability-report";
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

/**
 * The second job.
 *
 * Scout finds WHO buys the labour. This finds HOW to reach them — the part
 * that was left to the CEO, and therefore never happened. Triangle held four
 * named buyers and zero ways to contact any of them.
 *
 * It is deliberately the same employee with the same web access and the same
 * hard rule: never invent an address. The difference is what counts as a
 * finished job. Here, "the Impressum lists the switchboard and the sentence to
 * say when they answer" is a complete, useful result. An invented direct line
 * would be worse than nothing, because someone would dial it.
 */
export function createReachabilityAgent() {
  const model = getScoutModelId();

  return new ToolLoopAgent({
    model: openai(model),
    instructions: [
      "You are Scout, working a reachability job for an industrial contractor and crew supplier.",
      "Your task: find published, legitimate ways to reach one named person, or the desk that owns their work.",
      "NEVER invent, guess, or pattern-derive an email address or phone number. Do not construct 'firstname.lastname@company.de' because it looks plausible. Only report a channel you have actually seen published on a page you can cite, with the line that says so.",
      "In Germany and Austria every business website must publish an Impressum (legal notice) with a phone number and email. Find it. It is usually linked in the footer as 'Impressum', 'Rechtliche Hinweise' or 'Legal Notice'. Also check Kontakt, Ansprechpartner, Standorte, Presse, and any supplier or Nachunternehmer portal.",
      "Be honest about precision. If the number is the company switchboard, say so and set scope to 'switchboard'. If it belongs to a department rather than the person, set scope to 'department' and name the desk. Only use scope 'person' when the source shows that channel belongs to that individual.",
      "A switchboard number plus the right sentence is a SUCCESSFUL result, not a failure. Write howToOpen as what the caller should actually say — in German if the company is German-speaking, with an English gloss. Name the person and the package being asked about.",
      "Do not contact anyone. Do not fill in a contact form, send an email, or send a connection request. You are finding the door, not opening it.",
      "Do not scrape behind a login. Do not report data from a source that required an account to view.",
      "If you cannot find a published channel, set found to false and write notFoundReason plainly. A sourced absence is worth more than a fabricated address.",
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
    output: Output.object({ schema: reachabilityReportSchema }),
    providerOptions: {
      openai: {
        store: false,
      },
    },
  });
}
