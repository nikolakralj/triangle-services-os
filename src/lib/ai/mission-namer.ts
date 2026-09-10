import "server-only";
import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getScoutModelId } from "@/lib/ai/scout-agent";
import type { MissionKind } from "@/lib/data/mission-shared";

// ---------------------------------------------------------------------------
// A name for the tab, and the objective behind the sentence.
//
// "OK I WILL FIND PEOPLE ... PREPARE EVERTYHING SO THAT I CAN CONTACT THEM"
// is a real instruction the CEO typed, and it was also, until now, the title
// of the job it created. Six months of those is a list nobody can read. A tab
// says "EPC Germany"; the objective says what the work is for.
//
// One small call, and it also decides which kind of work this is — the
// market (companies, buyers, projects) or people to staff (candidates, partner
// firms). A keyword rule sent "find me 8 PCS7 engineers" to the market
// researcher because it began with "find".
//
// It must never block the work. If the call fails or is slow, the mission
// starts under a plain name and the objective is the sentence as typed.
//
// Who the company is comes from its operating profile, never from this file:
// the tenant-identity check refuses an operator's name hardcoded here.
// ---------------------------------------------------------------------------

export interface MissionNaming {
  title: string;
  emoji: string | null;
  objective: string;
  kind: MissionKind;
}

export interface NamingOrganization {
  name: string;
  /** What the company does, in its own words. */
  companyProfile: string | null;
}

const namingSchema = z.object({
  title: z.string().max(40),
  emoji: z.string().max(8).nullable(),
  objective: z.string().max(240),
  kind: z.enum(["research", "recruiting"]),
});

function systemPrompt(org: NamingOrganization): string {
  return `You name a piece of work that the CEO of ${org.name} has delegated to an employee.${
    org.companyProfile ? ` What the company does: ${org.companyProfile.slice(0, 400)}` : ""
  }

Return:
- title: 2 to 4 words, at most 32 characters, naming the objective rather than repeating the sentence. Examples: "EPC Germany", "PCS7 engineers", "Siemens Vienna crew", "Data centres Ireland". No quotes, no trailing punctuation.
- emoji: one country flag when the work is about one country, otherwise one fitting emoji, or null.
- objective: one sentence stating the outcome the work is for, e.g. "Find EPC and electrical contractors in Germany that buy subcontract automation and commissioning labour."
- kind: "recruiting" when the work is finding, checking or preparing PEOPLE to staff a job — candidates, engineers, a crew, availability, certificates — from the company's own pool or its partner firms. "research" for everything about the market: companies, buyers, contractors, projects, tenders, contacts.`;
}

export function fallbackNaming(text: string): MissionNaming {
  const clean = text.replace(/\s+/g, " ").trim();
  const words = clean.split(" ").slice(0, 5).join(" ");
  return {
    title: (words.length > 40 ? `${words.slice(0, 39)}…` : words) || "New mission",
    emoji: null,
    objective: clean.slice(0, 240) || "New mission",
    kind: "research",
  };
}

/** One flag or pictograph, or nothing. A model's "EPC" in the emoji field is not an emoji. */
function cleanEmoji(value: string | null): string | null {
  const v = value?.trim();
  if (!v || v.length > 8) return null;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(v) ? v : null;
}

export async function nameMission(text: string, org: NamingOrganization): Promise<MissionNaming> {
  const fallback = fallbackNaming(text);
  if (!process.env.OPENAI_API_KEY) return fallback;

  try {
    const { output } = await generateText({
      model: openai(getScoutModelId()),
      system: systemPrompt(org),
      prompt: text.slice(0, 2_000),
      output: Output.object({ schema: namingSchema }),
      timeout: 12_000,
      providerOptions: { openai: { store: false } },
    });
    if (!output) return fallback;

    const title = output.title.replace(/["“”.]+$/g, "").trim();
    const objective = output.objective.trim();
    return {
      title: title ? title.slice(0, 40) : fallback.title,
      emoji: cleanEmoji(output.emoji),
      objective: objective || fallback.objective,
      kind: output.kind,
    };
  } catch (err) {
    console.error("nameMission:", err instanceof Error ? err.message : err);
    return fallback;
  }
}
