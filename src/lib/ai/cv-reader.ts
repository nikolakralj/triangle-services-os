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

// ---------------------------------------------------------------------------
// Every cap below TRUNCATES. None of them reject.
//
// This schema used to validate lengths — `z.array(z.string().max(120)).max(40)`
// — and a single over-long string failed the array, which failed the object,
// which threw the entire reading away. Igor Pejkovic's seven-page CV came back
// with a role, twenty-one skills, six languages and twenty-four projects on it,
// and all of it was discarded because one skill ran past a hundred and twenty
// characters. What reached the screen was "read failed".
//
// AGENTS.md says this in as many words — coerce and safeParse each item so one
// bad row does not kill the whole response — and this file did the opposite.
// A length limit exists to stop a runaway string reaching the database. Cutting
// it short does that. Throwing away the other ninety fields does not.
// ---------------------------------------------------------------------------

const listOfStrings = z.preprocess(
  (v) =>
    Array.isArray(v)
      ? v
          .filter((x) => typeof x === "string" && x.trim())
          .map((x) => (x as string).trim().slice(0, 120))
          .slice(0, 40)
      : [],
  z.array(z.string()),
);

const nullableText = (max: number) =>
  z.preprocess((v) => {
    if (v === "" || v == null || v === "unknown") return null;
    return typeof v === "string" ? v.trim().slice(0, max) : String(v).slice(0, max);
  }, z.string().nullable());

const cvReadingSchema = z.object({
  role: nullableText(120),
  seniority: nullableText(60),
  years_experience: z.preprocess((v) => {
    if (v === "" || v == null) return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(60, Math.max(0, n)) : null;
  }, z.number().nullable()),
  city: nullableText(120),
  country: nullableText(120),
  nationality: nullableText(120),
  work_authorisation: listOfStrings,
  visa_notes: nullableText(400),
  skills: listOfStrings,
  certificates: listOfStrings,
  languages: listOfStrings,
  industries: listOfStrings,
  /**
   * The projects themselves — the part of a CV that does the selling.
   *
   * safeParse per entry rather than for the array: one malformed project
   * should cost that project, not the whole history.
   */
  work_history: z.preprocess(
    (v) => {
      if (!Array.isArray(v)) return [];
      const entry = z.object({
        customer: nullableText(160),
        project: nullableText(240),
        position: nullableText(120),
        period: nullableText(80),
        scope: nullableText(400),
      });
      return v
        .map((row) => entry.safeParse(row))
        .filter((r) => r.success)
        .map((r) => (r as { data: unknown }).data)
        .filter((row) => {
          const e = row as Record<string, unknown>;
          return Boolean(e.project || e.customer);
        })
        .slice(0, 40);
    },
    z.array(
      z.object({
        customer: z.string().nullable(),
        project: z.string().nullable(),
        position: z.string().nullable(),
        period: z.string().nullable(),
        scope: z.string().nullable(),
      }),
    ),
  ),
  summary: nullableText(600),
  /** How much of this the CV actually supports. */
  confidence: z.preprocess((v) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50;
  }, z.number()),
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
- city / country: where THIS PERSON lives. A CV is usually written on a
  company's letterhead, and the address in the header or footer is that
  company's, not theirs. Reading one off the top of the page put a candidate in
  Sofia because his agency is registered there. Use the person's own stated
  address, place of residence or home town; null if the CV does not say.
- skills: concrete, checkable capabilities. "Siemens S7 commissioning", "cable
  pulling", "HV termination". Not soft skills, not "team player".
- certificates: ONLY tickets actually named in the CV — SCC, VCA, ECS, CSCS,
  IPAF, PASMA, EX, A1, BOSIET, first aid, driving licence categories. Never
  infer one from a job title. An invented certificate puts an uncertified
  person on a live site.
  A visa or a residence permit is not a certificate — it belongs in
  work_authorisation and visa_notes, not here.
  Name each one EXACTLY as the CV writes it, in the CV's own language, and do
  not translate it. "Schaltberechtigung bis 30 kV" stays German. A person's CV
  gets read more than once — when a newer one arrives, or when the reading is
  re-run — and a ticket translated differently each time becomes two tickets on
  the same profile.
- nationality: the passport the CV states — "Croatian", "German", "Filipino".
  Take it only from an explicit nationality or citizenship line. It is not the
  country they live in and not where they last worked. Null if not stated.
- work_authorisation: countries OUTSIDE their own nationality where the CV
  shows a right to PERFORM WORK. Use the country: ["UK"], ["US"].
  A visitor visa is not a work permit and must never be listed here. B-1, B-2,
  ESTA, a Schengen tourist or business visa, and "visa on arrival" all permit
  meetings and site visits and forbid productive labour. Listing a B-1 as
  authorisation to work is how a supervisor ends up on an American site
  illegally.
  What does count: a work permit, a Blue Card, a Skilled Worker or Tier 2
  visa, an H-1B, H-2B or L-1, a green card or permanent residence, a residence
  permit that explicitly allows employment, or citizenship of that country.
  Do NOT list EU states for an EU national; that is understood from
  nationality. Do NOT infer a right to work from having worked somewhere years
  ago. Empty unless the CV actually shows it.
- visa_notes: the qualifying sentence if there is one — which permit, expiring
  when, sponsorship needed. If the CV names a visitor visa, say so here
  ("holds a US B-1 business visa — visits only, not work"), because it is
  worth knowing and it is not authorisation. Null otherwise.
- languages: as stated, keeping the level — "German fluent", "English basic".
- industries: the sectors worked in — data centres, steel, pharma, automotive,
  oil and gas, pulp and paper.
- work_history: the projects themselves, newest first. This is the part of a
  CV that does the selling — a buyer does not buy "PLC commissioning" as a
  skill, they buy somebody who has commissioned a down coiler at a steel plant,
  and they want to see where. Each entry:
    customer — the end client or plant owner: "MMK Iskenderun (Turkey)",
               "Tata Steel Port Talbot". Null if only the employer is named.
    project  — what the job was: "Down Coiler (Hot Strip Mill) commissioning",
               "Galvanizing Line, process and entry/exit PLC".
    position — what they did on it: "Automation Engineer", "E&I Supervisor".
    period   — as written: "2016 - 2019", "2021", "6 months 2023". Null if
               the CV does not date it.
    scope    — one line of what the work involved, including the equipment or
               systems named: "Siemens S7 400 — Step7, WinCC, Intouch".
  Take these as the CV lists them. Do not merge two projects, do not invent a
  customer for a project that names none, and do not turn a job title held for
  ten years into ten projects. If the CV gives only employers and dates with no
  projects under them, list those as entries with project null.
- summary: two sentences a staffing manager could read out loud, saying what
  this person does and where they have done it.
- concerns: anything a human should check before vouching for them — a long
  unexplained gap, a certificate that appears expired, a claim the CV does not
  back up, unclear right to work. Empty when there is nothing.

If the text is not a CV at all, set role null, confidence 0, and say so in
concerns.`;

/**
 * The JSON shape for the profile half — everything except the projects.
 */
const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    role: { type: ["string", "null"] },
    seniority: { type: ["string", "null"] },
    years_experience: { type: ["integer", "null"] },
    city: { type: ["string", "null"] },
    country: { type: ["string", "null"] },
    nationality: { type: ["string", "null"] },
    work_authorisation: { type: "array", items: { type: "string" } },
    visa_notes: { type: ["string", "null"] },
    skills: { type: "array", items: { type: "string" } },
    certificates: { type: "array", items: { type: "string" } },
    languages: { type: "array", items: { type: "string" } },
    industries: { type: "array", items: { type: "string" } },
    summary: { type: ["string", "null"] },
    confidence: { type: "integer" },
    concerns: { type: "array", items: { type: "string" } },
  },
  required: ["role", "skills", "certificates", "confidence"],
} as const;

const HISTORY_SCHEMA = {
  type: "object",
  properties: {
    work_history: {
      type: "array",
      items: {
        type: "object",
        properties: {
          customer: { type: ["string", "null"] },
          project: { type: ["string", "null"] },
          position: { type: ["string", "null"] },
          period: { type: ["string", "null"] },
          scope: { type: ["string", "null"] },
        },
      },
    },
  },
  required: ["work_history"],
} as const;

export interface CvReadResult extends CvReading {
  /** Which halves failed, in plain words, for the person who uploaded it. */
  failures: string[];
}

/**
 * Read a CV and return what a staffing manager would want to know.
 *
 * Two calls, run at the same time, rather than one that does everything.
 *
 * Igor Pejkovic's CV is seven pages with twenty-four projects on it, and one
 * call reading the whole thing took NINETY SECONDS. This route is capped at
 * sixty, so on Vercel that CV could not have succeeded once — it would be
 * killed mid-read every time, and all the reader could say afterwards was
 * "read failed", with no reason and nothing saved beyond an email address.
 *
 * Almost all of that time is the model writing output, and the projects are
 * most of the output. Splitting them means each call writes about half as
 * much and they overlap, so the wall clock is roughly the slower half rather
 * than the sum.
 *
 * It also makes failure partial instead of total. A CV whose project list is
 * too long or too strange still yields a role, skills and tickets, and the
 * upload says which half did not read rather than shrugging.
 *
 * Never throws.
 */
export async function readCv(
  cvText: string,
  alreadyRead: { fullName?: string | null; country?: string | null } = {},
): Promise<CvReadResult | null> {
  const text = cvText.trim();
  if (text.length < 100) return null;

  let client: ReturnType<typeof getOpenAIClient>;
  try {
    client = getOpenAIClient();
  } catch {
    return null;
  }

  // A very long CV costs tokens for pages of references and page furniture;
  // the first 24k characters carry the working history.
  const body = [
    alreadyRead.fullName ? `Name on file: ${alreadyRead.fullName}` : null,
    alreadyRead.country ? `Country on file: ${alreadyRead.country}` : null,
    "",
    "CV TEXT:",
    text.slice(0, 24_000),
  ]
    .filter((line) => line !== null)
    .join("\n");

  async function ask(
    name: string,
    schema: unknown,
    extra: string,
  ): Promise<Record<string, unknown> | null> {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      instructions: `${SYSTEM}\n\n${extra}`,
      input: body,
      text: {
        format: { type: "json_schema", name, strict: false, schema: schema as never },
      },
    });
    const raw = response.output_text?.trim();
    if (!raw) throw new Error("the model returned nothing");
    return JSON.parse(raw) as Record<string, unknown>;
  }

  const [profile, history] = await Promise.allSettled([
    ask(
      "cv_profile",
      PROFILE_SCHEMA,
      "For THIS call, return the profile fields only. Do not return work_history.",
    ),
    ask(
      "cv_history",
      HISTORY_SCHEMA,
      "For THIS call, return work_history ONLY — nothing else. Every project the CV lists, newest first.",
    ),
  ]);

  const failures: string[] = [];
  if (profile.status === "rejected") {
    failures.push("the profile (role, skills, tickets) could not be read");
    console.error("readCv profile:", reasonOf(profile.reason));
  }
  if (history.status === "rejected") {
    failures.push("the project history could not be read");
    console.error("readCv history:", reasonOf(history.reason));
  }

  // Both halves gone means there is nothing to save beyond the regex pass.
  if (profile.status === "rejected" && history.status === "rejected") return null;

  const merged = {
    ...(profile.status === "fulfilled" ? (profile.value ?? {}) : {}),
    ...(history.status === "fulfilled" ? (history.value ?? {}) : {}),
  };

  const parsed = cvReadingSchema.safeParse(merged);
  if (!parsed.success) {
    console.error("readCv shape:", parsed.error.issues[0]?.message);
    return null;
  }
  return { ...parsed.data, failures };
}

function reasonOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
