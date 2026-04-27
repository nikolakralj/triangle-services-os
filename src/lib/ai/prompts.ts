import { companies, contacts, opportunities } from "@/lib/sample-data";
import type { AIGenerationRequest } from "@/lib/types";

export const TRIANGLE_AI_SYSTEM_PROMPT = `You are an internal business development assistant for Triangle Services.
Triangle Services provides supervised electrical installation crews, site support, commissioning engineers, automation engineers and technical manpower for industrial, rail, data-center, HVAC/MEP and EPC projects in Austria, Germany and CEE.
You help Nikola and Ralph prepare professional B2B outreach, lead scoring, call scripts, proposal outlines and internal documents.

Rules:
- Do not invent facts.
- Use only the data provided from the app.
- If information is missing, say what is missing.
- Keep messages practical and commercially useful.
- Do not claim legal compliance is guaranteed.
- For legal/compliance documents, mark the result as draft requiring expert review.
- Avoid spammy language.
- Keep outreach short and direct.
- Focus on client pain: shortage of reliable electrical crews, peak workload, supervised teams, documentation, fast mobilization, site discipline.`;

export function buildTrianglePrompt(input: AIGenerationRequest) {
  const company = companies.find((item) => item.id === input.companyId);
  const contact = contacts.find((item) => item.id === input.contactId);
  const opportunity = opportunities.find(
    (item) => item.id === input.opportunityId,
  );

  return `Generation type: ${input.generationType}
Language: ${input.language ?? "en"}
Tone: ${input.tone ?? "professional"}
Offer type: ${input.offerType ?? "not specified"}
Custom instructions: ${input.customInstructions ?? "none"}

Company data:
${company ? JSON.stringify(company, null, 2) : "No company selected."}

Contact data:
${contact ? JSON.stringify(contact, null, 2) : "No contact selected."}

Opportunity data:
${opportunity ? JSON.stringify(opportunity, null, 2) : "No opportunity selected."}

Return a useful draft/output only. If this is lead_score, return JSON with score, priority, reason, recommended_next_action and missing_information.`;
}

export function fallbackAIOutput(input: AIGenerationRequest) {
  const company = companies.find((item) => item.id === input.companyId);
  if (input.generationType === "lead_score") {
    return JSON.stringify(
      {
        score: company?.leadScore ?? 15,
        priority: company?.priority ?? "medium",
        reason:
          company?.leadScoreReason ??
          "Needs AI scoring after more project/source data is added.",
        recommended_next_action:
          "Find decision maker and generate a short first outreach email.",
        missing_information: [
          "Verified contact",
          "Current project evidence",
          "Vendor registration requirements",
        ],
      },
      null,
      2,
    );
  }

  return `AI is not configured. Add OPENAI_API_KEY to environment variables.

Draft direction for ${company?.name ?? "selected company"}:
Keep the message short, practical and B2B. Position Triangle Services as a technical subcontracting and manpower delivery partner for supervised electrical installation crews, commissioning/site support and documentation-disciplined teams. Mention only verified facts from the app.`;
}
