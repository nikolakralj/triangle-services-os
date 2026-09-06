import "server-only";
import { z } from "zod";
import { getOpenAIClient } from "@/lib/ai/openai-client";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Ask about your own people, in a sentence.
//
// "Give me 2 best electrical supervisors for a steel project in USA" is a
// better interface than any set of filters, and it is the opposite of a CRM:
// no dropdowns, no saved views, no query builder. The future is not a thousand
// checkboxes.
//
// The valuable half is not the search. It is the second clause — "then she
// checks if they have a visa". A list of names is nearly worthless; the useful
// answer is "these two, and here is what stops them". So the answer is
// required to name the blockers, and to say plainly when the pool simply
// cannot supply what was asked for.
//
// Grounded, never invented. The model sees the roster and nothing else, and is
// told that a person it cannot point at does not exist. What the database does
// not record — work authorisation, visas, which country a ticket is valid in —
// is reported as missing rather than guessed, because guessing it is how
// somebody gets sent to a site they cannot legally work on.
// ---------------------------------------------------------------------------

/** More than a couple of hundred people is a different problem than this one. */
const MAX_POOL = 300;

const answerSchema = z.object({
  answer: z.string().trim().max(2_000),
  worker_ids: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []),
    z.array(z.string()).max(20),
  ),
  blockers: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []),
    z.array(z.string().max(300)).max(10),
  ),
  /** Facts nobody has recorded that this question actually needed. */
  missing: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []),
    z.array(z.string().max(200)).max(10),
  ),
});

export interface TalentAnswer {
  answer: string;
  people: Array<{ id: string; name: string; role: string | null; status: string }>;
  blockers: string[];
  missing: string[];
}

const SYSTEM = `You answer questions about a staffing company's own pool of
workers. Triangle supplies electrical, mechanical, instrumentation and
commissioning crews to industrial and data-centre projects, mostly in Europe.

You are given the entire roster as JSON. That is everything the company knows.

Rules:

1. Only ever refer to people who are in the roster. A person you cannot point
   at does not exist. Never invent a name, a certificate or a skill.
2. Answer in two or three sentences, plainly, the way a staffing manager would
   say it out loud. No headings, no bullet lists, no preamble.
   Use people's NAMES in the answer. Never write an id into the prose — ids go
   in worker_ids and nowhere else. A CEO reading "Thomas Schmidt
   (9891d6fe-2f1d-481a-bf17-94c0e1953050)" is being shown the plumbing.
3. Say what stands in the way. A shortlist that ignores the obstacle is worse
   than no shortlist: wrong grade, wrong country, a ticket that does not
   transfer, availability not confirmed, nobody vouched for them yet.
4. A worker with status "candidate" came off a CV and nobody has checked them.
   Say so when you put one forward.
5. If the pool cannot answer the question, say that first and plainly. "Nobody
   in the pool is a supervisor" is a useful answer. A weak match dressed up as
   a good one is not.
6. Anything the roster does not record, put in "missing" — do not guess it.
   Work authorisation, visas, and which country a certificate is valid in are
   NOT in this data. If the question depends on them, that is the real answer:
   the blocker is that nobody recorded it.

Return JSON: answer, worker_ids (ids you referred to, best first), blockers,
missing.`;

export async function answerAboutTalent(
  orgId: string,
  question: string,
): Promise<TalentAnswer | { error: string }> {
  const q = question.trim();
  if (q.length < 3) return { error: "Ask a question first." };

  const svc = createServiceSupabaseClient();
  if (!svc) return { error: "Database unavailable." };

  const { data: rows } = await svc
    .from("workers")
    .select(
      "id, full_name, role, worker_type, country, city, status, availability_status, available_from, skills, certificates, languages, industries, has_passport, has_a1_possible, has_own_tools, has_car, notes",
    )
    .eq("organization_id", orgId)
    .neq("status", "blacklisted")
    .limit(MAX_POOL);

  const pool = rows ?? [];
  if (pool.length === 0) {
    return {
      answer:
        "There is nobody in the pool yet. Upload CVs on Data Imports and they will be read into profiles.",
      people: [],
      blockers: [],
      missing: [],
    };
  }

  // Trimmed to what a staffing question turns on. Sending the whole row would
  // spend tokens on scores nobody asked about.
  const roster = pool.map((w) => ({
    id: w.id,
    name: w.full_name,
    role: w.role,
    engagement: w.worker_type,
    based: [w.city, w.country].filter(Boolean).join(", ") || null,
    status: w.status,
    availability: w.availability_status,
    available_from: w.available_from,
    skills: w.skills ?? [],
    certificates: w.certificates ?? [],
    languages: w.languages ?? [],
    sectors: w.industries ?? [],
    passport: w.has_passport,
    a1_possible: w.has_a1_possible,
    summary: typeof w.notes === "string" ? w.notes.slice(0, 400) : null,
  }));

  let client: ReturnType<typeof getOpenAIClient>;
  try {
    client = getOpenAIClient();
  } catch {
    return { error: "AI is not configured on this deployment." };
  }

  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      instructions: SYSTEM,
      input: `QUESTION: ${q}\n\nROSTER (${roster.length} people):\n${JSON.stringify(roster)}`,
      text: {
        format: {
          type: "json_schema",
          name: "talent_answer",
          strict: false,
          schema: {
            type: "object",
            properties: {
              answer: { type: "string" },
              worker_ids: { type: "array", items: { type: "string" } },
              blockers: { type: "array", items: { type: "string" } },
              missing: { type: "array", items: { type: "string" } },
            },
            required: ["answer", "worker_ids"],
          },
        },
      },
    });

    const raw = response.output_text?.trim();
    if (!raw) return { error: "No answer came back. Try asking again." };

    const parsed = answerSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { error: "The answer came back malformed." };

    // Resolve the ids against the roster rather than trusting the names in the
    // prose — an id that matches nobody is dropped, not shown.
    const byId = new Map(pool.map((w) => [w.id as string, w]));
    const people = parsed.data.worker_ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((w) => ({
        id: w!.id as string,
        name: (w!.full_name as string) ?? "Unnamed",
        role: (w!.role as string | null) ?? null,
        status: (w!.status as string) ?? "active",
      }));

    return {
      // Told not to, and it did it anyway on the first question asked of it.
      // An instruction is not a guarantee, so the ids come out here too.
      answer: stripIds(parsed.data.answer),
      people,
      blockers: parsed.data.blockers.map(stripIds),
      missing: parsed.data.missing,
    };
  } catch (err) {
    console.error("answerAboutTalent:", err instanceof Error ? err.message : err);
    return { error: "Could not reach the model. Try again." };
  }
}

/**
 * Take database ids out of a sentence meant for a person.
 *
 * Handles the bracketed form the model reaches for — "Thomas Schmidt
 * (9891d6fe-…)" — as well as a bare id, and tidies the spacing left behind.
 */
function stripIds(text: string): string {
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  return text
    .replace(new RegExp(`\s*\(\s*${UUID.source}\s*\)`, "gi"), "")
    .replace(UUID, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}
