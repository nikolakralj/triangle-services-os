import "server-only";
import { z } from "zod";
import { getOpenAIClient } from "@/lib/ai/openai-client";

// ---------------------------------------------------------------------------
// Reading a CV.
//
// The rule this exists to satisfy: is a machine better, cheaper and more
// capable at this than Nikola or Ralph? For working out that "PCS7, TIA Portal,
// Sinamics" means PLC commissioning, that fifteen years of shutdowns is a
// supervisor and not a mate, that a CV in German describes a Obermonteur — yes,
// obviously, and it is not close. So a person never does it.
//
// Before this, upload extracted an email address and a few language lines by
// regex and then asked a human to approve the result. The card said "Nikola
// Kralj · Croatia" and nothing else: no role, no skills, no seniority, no way
// to see the CV it came from. Approving that is not a decision, it is data
// entry with a confirmation step, and the reasoning half was parked behind an
// HR agent that had never once authenticated.
//
// What is deliberately NOT automated: making somebody placeable. A CV is a
// claim — "10 years", "A1 certified", "fluent German". Turning a claim into a
// person who can be put on a live site is the decision a human owns, and it
// stays owned. The machine reads; the human vouches.
// ---------------------------------------------------------------------------

const listOfStrings = z.preprocess(
  (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []),
  z.array(z.string().trim().min(1).max(120)).max(40),
);

const nullableText = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v == null || v === "unknown" ? null : v),
    z.string().trim().max(max).nullable(),
  );

const cvReadingSchema = z.object({
  role: nullableText(120),
  seniority: nullableText(60),
  years_experience: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().int().min(0).max(60).nullable(),
  ),
  city: nullableText(120),
  country: nullableText(120),
  skills: listOfStrings,
  certificates: listOfStrings,
  languages: listOfStrings,
  industries: listOfStrings,
  summary: nullableText(600),
  /** How much of this the CV actually supports. */
  confidence: z.preprocess(
    (v) => (v == null ? 50 : Number(v)),
    z.number().int().min(0).max(100),
  ),
  /** Anything a human should look at before vouching for this person. */
  concerns: listOfStrings,
});

export type CvReading = z.infer<typeof cvReadingSchema>;

const SYSTEM = `You read CVs for a cross-border technical staffing company that
supplies electrical, mechanical, instrumentation and commissioning crews to
industrial and data-centre projects in Europe.

Return ONLY what the CV supports. This is the whole job:

- role: the trade or job title this person is actually hired as, in English and
  in the industry's own words — "Commissioning Engineer", "Industrial
  Electrician", "Cable Puller", "E&I Supervisor". Not a summary of their
  career. Null if the CV does not make it clear.
- seniority: helper / skilled / lead / supervisor / manager. Null if unclear.
- years_experience: whole years of relevant hands-on experience. Work it out
  from the dates rather than repeating a claim in the profile blurb.
- skills: concrete, checkable capabilities. "Siemens S7 commissioning", "cable
  pulling", "HV termination". Not soft skills, not "team player".
- certificates: ONLY tickets actually named in the CV — SCC, VCA, ECS, CSCS,
  IPAF, PASMA, EX, A1, BOSIET, first aid, driving licence categories. Never
  infer one from a job title. An invented certificate puts an uncertified
  person on a live site.
- languages: as stated, keeping the level — "German fluent", "English basic".
- industries: the sectors worked in — data centres, steel, pharma, automotive,
  oil and gas, pulp and paper.
- summary: two sentences a staffing manager could read out loud, saying what
  this person does and where they have done it.
- concerns: anything a human should check before vouching for them — a long
  unexplained gap, a certificate that appears expired, a claim the CV does not
  back up, unclear right to work. Empty when there is nothing.

If the text is not a CV at all, set role null, confidence 0, and say so in
concerns.`;

/**
 * Read a CV and return what a staffing manager would want to know.
 *
 * Never throws. A reading that fails leaves the record as the regex pass left
 * it — thin but honest — rather than blocking the upload.
 */
export async function readCv(
  cvText: string,
  alreadyRead: { fullName?: string | null; country?: string | null } = {},
): Promise<CvReading | null> {
  const text = cvText.trim();
  if (text.length < 100) return null;

  let client: ReturnType<typeof getOpenAIClient>;
  try {
    client = getOpenAIClient();
  } catch {
    return null;
  }

  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      instructions: SYSTEM,
      // Turn 0 of a Responses call takes a plain string.
      input: [
        alreadyRead.fullName ? `Name on file: ${alreadyRead.fullName}` : null,
        alreadyRead.country ? `Country on file: ${alreadyRead.country}` : null,
        "",
        "CV TEXT:",
        // A very long CV costs tokens for pages of references and page
        // furniture; the first 24k characters carry the working history.
        text.slice(0, 24_000),
      ]
        .filter((l) => l !== null)
        .join("\n"),
      text: {
        format: {
          type: "json_schema",
          name: "cv_reading",
          strict: false,
          schema: {
            type: "object",
            properties: {
              role: { type: ["string", "null"] },
              seniority: { type: ["string", "null"] },
              years_experience: { type: ["integer", "null"] },
              city: { type: ["string", "null"] },
              country: { type: ["string", "null"] },
              skills: { type: "array", items: { type: "string" } },
              certificates: { type: "array", items: { type: "string" } },
              languages: { type: "array", items: { type: "string" } },
              industries: { type: "array", items: { type: "string" } },
              summary: { type: ["string", "null"] },
              confidence: { type: "integer" },
              concerns: { type: "array", items: { type: "string" } },
            },
            required: ["role", "skills", "certificates", "confidence"],
          },
        },
      },
    });

    const raw = response.output_text?.trim();
    if (!raw) return null;

    // safeParse rather than parse: a model that returns a float where an int
    // belongs should cost one field, not the whole reading.
    const parsed = cvReadingSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (err) {
    console.error("readCv:", err instanceof Error ? err.message : err);
    return null;
  }
}
