import "server-only";
import { z } from "zod";
import { generateText, Output } from "ai";
import {
  missionModel,
  missionProvider,
  missionProviderOptions,
  missionTimeout,
} from "@/lib/ai/mission-models";
import { describeRights } from "@/lib/data/work-authorisation";
import { listSupplyPartners } from "@/lib/data/supply-partners";
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
  /** Partner firms referred to. The pool is people AND firms. */
  partner_ids: z.preprocess(
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

/** What the model is asked for. answerSchema then trims it to what the screen shows. */
const talentOutputSchema = z.object({
  answer: z.string(),
  worker_ids: z.array(z.string()),
  partner_ids: z.array(z.string()),
  blockers: z.array(z.string()),
  missing: z.array(z.string()),
});

export interface TalentAnswer {
  answer: string;
  people: Array<{ id: string; name: string; role: string | null; status: string }>;
  /** Partner firms that can field the crew. Two people cannot staff a crew of eight. */
  partners: Array<{
    id: string;
    name: string;
    trades: string[];
    crewSize: number | null;
    country: string | null;
  }>;
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
6. Anything the roster does not record, put in "missing" — do not guess it. If
   the question depends on something nobody has recorded, that IS the answer.
   Asked WHY something is missing, say only that it is missing. Do not invent a
   reason for it. Asked why a profile had no project history, the honest answer
   was "nothing has been recorded"; the answer given was that his details were
   "not yet fully checked, which likely includes his project history" — a
   process explanation, invented, for a field that did not exist at the time.
   You cannot see why data is absent, so never speculate about it. "Not
   recorded" is complete on its own.
7. Right to work. Each person carries "works_in": what has actually been
   established, worked out from their nationality and anything recorded beyond
   it. An EU, EEA or Swiss passport carries the right to work across the whole
   EU/EEA, and that needs no visa. Anywhere else needs a recorded
   authorisation.
   An empty authorisation means NOBODY HAS CHECKED — it does not mean the
   person cannot work there. Say "no work authorisation recorded for the USA",
   never "he cannot work in the USA". Quietly dropping somebody because a field
   is blank is worse than no shortlist, because it looks like an answer.
   Which country a certificate is valid in is genuinely not in this data; if it
   matters, put it in "missing".

8. The pool is people AND partner firms. Triangle's own bench is small; a crew
   of six or eight is fielded by a partner firm that already employs those
   trades. PARTNERS lists only firms whose capacity a human confirmed within
   the last 14 days — treat their crew_size as real for the trades they list,
   in the countries under can_post_to. Put their ids in partner_ids.
   Say which half of the answer is which: "Anton and one from Elektro Novak"
   is a truthful sentence; blurring them is not. A firm is not a named person,
   so never claim a partner's crew has a certificate, a passport or a visa —
   that is per head and nobody has checked it. Put it in "missing".
   If a trade is in neither list, say the pool cannot supply it. Do not assume
   a partner exists for a trade you were not shown.

Return JSON: answer, worker_ids (ids you referred to, best first), partner_ids,
blockers, missing.`;

export async function answerAboutTalent(
  orgId: string,
  question: string,
): Promise<TalentAnswer | { error: string }> {
  const q = question.trim();
  if (q.length < 3) return { error: "Ask a question first." };

  const svc = createServiceSupabaseClient();
  if (!svc) return { error: "Database unavailable." };

  const [{ data: rows }, allPartners] = await Promise.all([
    svc
      .from("workers")
      .select(
        "id, full_name, role, worker_type, country, city, status, availability_status, available_from, skills, certificates, languages, industries, has_passport, has_a1_possible, has_own_tools, has_car, notes, nationality, work_authorisation, visa_notes, work_history",
      )
      .eq("organization_id", orgId)
      .neq("status", "blacklisted")
      .limit(MAX_POOL),
    listSupplyPartners(orgId),
  ]);

  const pool = rows ?? [];
  // Only firms whose capacity a human confirmed recently. An unconfirmed
  // partner offered as an answer is a promise against people nobody has
  // spoken to.
  const partnerPool = allPartners.filter((p) => p.sellable);

  if (pool.length === 0 && partnerPool.length === 0) {
    return {
      answer:
        "There is nobody in the pool yet. Upload CVs on Data Imports and they will be read into profiles, or add a partner firm on Workers.",
      people: [],
      partners: [],
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
    // The projects. What a buyer actually asks about — somebody who has done
    // this exact job at a plant like theirs.
    projects: (w.work_history as unknown[]) ?? [],
    nationality: w.nationality,
    // Spelled out rather than left to be inferred: an EU passport is a right
    // to work across the EU, and a model should not have to know the member
    // list to answer a question about Germany.
    works_in: describeRights({
      nationality: w.nationality as string | null,
      work_authorisation: (w.work_authorisation as string[]) ?? [],
      visa_notes: w.visa_notes as string | null,
    }),
    visa_notes: w.visa_notes,
    passport: w.has_passport,
    a1_possible: w.has_a1_possible,
    summary: typeof w.notes === "string" ? w.notes.slice(0, 400) : null,
  }));

  // A firm, described in what a staffing question turns on. Deliberately
  // carries no passport, certificate or visa field: those are facts about a
  // head, and a firm's crew is heads nobody here has met.
  const partnerRoster = partnerPool.map((p) => ({
    id: p.id,
    firm: p.name,
    based: [p.city, p.country].filter(Boolean).join(", ") || null,
    trades: p.trades,
    crew_size: p.crewSize,
    can_post_to: p.canPostTo,
    posting_notes: p.postingNotes,
    availability: p.availabilityStatus,
    available_from: p.availableFrom,
    capacity_confirmed_days_ago: p.confirmedDaysAgo,
    languages: p.languages,
    sectors: p.industries,
  }));

  if (!missionProvider()) return { error: "AI is not configured on this deployment." };

  try {
    const { output } = await generateText({
      model: missionModel("talent"),
      system: SYSTEM,
      output: Output.object({ schema: talentOutputSchema }),
      timeout: missionTimeout("talent"),
      providerOptions: missionProviderOptions("talent"),
      prompt: [
        `QUESTION: ${q}`,
        "",
        `ROSTER (${roster.length} of Triangle's own people):`,
        roster.length ? JSON.stringify(roster) : "Nobody on the bench.",
        "",
        `PARTNERS (${partnerRoster.length} firms with capacity confirmed in the last 14 days):`,
        partnerRoster.length
          ? JSON.stringify(partnerRoster)
          : "None on file. Triangle can currently field only the people above.",
      ].join("\n"),
    });
    if (!output) return { error: "No answer came back. Try asking again." };

    const parsed = answerSchema.safeParse(output);
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

    const partnerById = new Map(partnerPool.map((p) => [p.id, p]));
    const partners = parsed.data.partner_ids
      .map((id) => partnerById.get(id))
      .filter(Boolean)
      .map((p) => ({
        id: p!.id,
        name: p!.name,
        trades: p!.trades,
        crewSize: p!.crewSize,
        country: p!.country,
      }));

    return {
      // Told not to, and it did it anyway on the first question asked of it.
      // An instruction is not a guarantee, so the ids come out here too.
      answer: stripIds(parsed.data.answer),
      people,
      partners,
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
