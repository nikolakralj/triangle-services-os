import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { canWorkIn } from "@/lib/data/work-authorisation";

// ---------------------------------------------------------------------------
// The warm demand nobody was looking at.
//
// Triangle has thirty-four inbound requisitions from the last sixty days.
// Every one of them carries a named recruiter and a working email address —
// Oliver Hall, Lewis Pettitt, Nicolas Preckler and five more colleagues at g2
// Recruitment, plus Talos. They are asking for PLC commissioning engineers,
// automation engineers and Siemens TIA programmers in Germany, Belgium,
// Slovakia and the USA.
//
// Triangle has an erection and commissioning engineer with twenty-five steel
// projects and PCS7, and an automation engineer with Step7, TIA Portal and
// PCS7. That is the same job, asked for by somebody who wrote to us first.
//
// Thirty-one of those requisitions have never been opened, because nothing on
// any screen looked at them. The banner that names the day's move read pending
// findings, buyer contacts and unsent drafts, and told the CEO to cold-call a
// steel plant switchboard instead.
//
// Warm beats cold, and it is not close: the recruiter already has the client,
// already has the requirement, and already knows Triangle exists.
// ---------------------------------------------------------------------------

export interface LeadMatch {
  leadId: string;
  agency: string | null;
  contactName: string | null;
  contactEmail: string | null;
  clientCompany: string | null;
  roleTitle: string | null;
  country: string | null;
  startText: string | null;
  rateText: string | null;
  headcountText: string | null;
  receivedAt: string;
  /** Who we could put forward, best first. */
  candidates: Array<{
    id: string;
    name: string;
    role: string | null;
    status: string;
    /** Why this person, in the words the requisition used. */
    why: string;
    /** What is in the way — right to work, unvouched, and so on. */
    caveats: string[];
    score: number;
  }>;
}

/** Words that match everything and therefore mean nothing. */
const NOISE = new Set([
  "engineer", "senior", "junior", "lead", "and", "the", "for", "with",
  "contract", "freelance", "remote", "onsite", "months", "month", "role",
]);

function terms(...parts: (string | null | undefined)[]): Set<string> {
  return new Set(
    parts
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((w) => w.length > 2 && !NOISE.has(w)),
  );
}

/**
 * Open requisitions, each with the people who could answer them.
 *
 * Deterministic word overlap rather than a model call. This runs on a page
 * load, it has to be instant, and "PLC" matching "PCS7 commissioning" is the
 * kind of judgement a list of shared words already makes well enough to rank
 * by. Hanna is there for the harder question of who is actually best.
 */
export async function matchOpenLeads(
  orgId: string,
  limit = 5,
): Promise<LeadMatch[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const [leadsResult, workersResult] = await Promise.all([
    svc
      .from("job_leads")
      .select(
        "id, agency_name, contact_name, contact_email, client_company, role_title, country, city, technologies, headcount_text, rate_text, start_date_text, status, created_at",
      )
      .eq("org_id", orgId)
      .in("status", ["new", "reviewing"])
      .not("contact_email", "is", null)
      .order("created_at", { ascending: false })
      .limit(40),
    svc
      .from("workers")
      .select(
        "id, full_name, role, status, skills, industries, certificates, nationality, work_authorisation, visa_notes, availability_status",
      )
      .eq("organization_id", orgId)
      .neq("status", "blacklisted"),
  ]);

  const leads = leadsResult.data ?? [];
  const workers = workersResult.data ?? [];
  if (leads.length === 0 || workers.length === 0) return [];

  // Which requisitions have already been answered. A reply is an outreach
  // draft filed against the lead — asking twice is worse than not asking.
  const { data: answered } = await svc
    .from("outreach_drafts")
    .select("job_lead_id")
    .eq("org_id", orgId)
    .not("job_lead_id", "is", null);
  const alreadyAnswered = new Set(
    (answered ?? []).map((r) => r.job_lead_id as string),
  );

  const matches: LeadMatch[] = [];

  for (const lead of leads) {
    if (alreadyAnswered.has(lead.id as string)) continue;

    const wanted = terms(
      lead.role_title as string,
      Array.isArray(lead.technologies) ? (lead.technologies as string[]).join(" ") : null,
    );
    if (wanted.size === 0) continue;

    const candidates: LeadMatch["candidates"] = [];

    for (const w of workers) {
      const has = terms(
        w.role as string,
        (w.skills as string[])?.join(" "),
        (w.industries as string[])?.join(" "),
      );
      const shared = [...wanted].filter((t) => has.has(t));
      if (shared.length === 0) continue;

      const caveats: string[] = [];
      if (w.status === "candidate") {
        caveats.push("came off a CV, nobody has vouched for them yet");
      }
      if (lead.country) {
        const right = canWorkIn(
          {
            nationality: w.nationality as string | null,
            work_authorisation: (w.work_authorisation as string[]) ?? [],
            visa_notes: w.visa_notes as string | null,
          },
          String(lead.country),
        );
        if (!right.allowed) caveats.push(right.reason);
      }
      if (w.availability_status === "unknown") {
        caveats.push("availability never confirmed");
      }

      // Say it in the person's own words, not in tokens. Splitting on spaces
      // to compare is fine; showing the result of that split is not — "TIA
      // Portal" and "Allen Bradley Studio 5000" came back to the CEO as
      // "matches on tia, portal, allen", which reads like a machine talking to
      // itself. Find the skills those words came from and name those instead.
      const evidence = [
        ...((w.skills as string[]) ?? []),
        ...((w.industries as string[]) ?? []),
        w.role as string,
      ]
        .filter(Boolean)
        .filter((phrase) => {
          const words = terms(phrase);
          return shared.some((t) => words.has(t));
        });

      candidates.push({
        id: w.id as string,
        name: (w.full_name as string) ?? "Unnamed",
        role: (w.role as string | null) ?? null,
        status: (w.status as string) ?? "candidate",
        why:
          evidence.length > 0
            ? evidence.slice(0, 3).join(", ")
            : shared.slice(0, 4).join(", "),
        caveats,
        // A person who can legally work there outranks a better word match who
        // cannot: the second is not a candidate, they are a visa application.
        score: shared.length * 10 - caveats.length,
      });
    }

    if (candidates.length === 0) continue;
    candidates.sort((a, b) => b.score - a.score);

    matches.push({
      leadId: lead.id as string,
      agency: (lead.agency_name as string | null) ?? null,
      contactName: (lead.contact_name as string | null) ?? null,
      contactEmail: (lead.contact_email as string | null) ?? null,
      clientCompany: (lead.client_company as string | null) ?? null,
      roleTitle: (lead.role_title as string | null) ?? null,
      country: (lead.country as string | null) ?? null,
      startText: (lead.start_date_text as string | null) ?? null,
      rateText: (lead.rate_text as string | null) ?? null,
      headcountText: (lead.headcount_text as string | null) ?? null,
      receivedAt: lead.created_at as string,
      candidates: candidates.slice(0, 3),
    });
  }

  // Best match first, then most recent — a requisition goes cold in days.
  matches.sort((a, b) => {
    const byScore = (b.candidates[0]?.score ?? 0) - (a.candidates[0]?.score ?? 0);
    if (byScore !== 0) return byScore;
    return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
  });

  return matches.slice(0, limit);
}

/**
 * The reply, written out.
 *
 * Deliberately short and specific. A recruiter with a live requisition reads
 * the first two lines; naming the person's actual sites does more than any
 * paragraph about Triangle's capabilities. No rate — that is a conversation,
 * not an opening line — and no name, because releasing a candidate's identity
 * before there is an engagement is how a recruiter goes direct.
 */
export function draftLeadReply(match: LeadMatch, senderName: string): string {
  const c = match.candidates[0];
  const who = c?.role ?? "an engineer";
  const first = match.contactName?.split(/\s+/)[0] ?? "there";
  const role = match.roleTitle ?? "the role";

  return [
    `Hi ${first},`,
    "",
    `On the ${role}${match.country ? ` in ${match.country}` : ""} — we have ${
      /^[aeiou]/i.test(who) ? "an" : "a"
    } ${who} available who fits it.`,
    "",
    c?.why ? `Relevant background: ${c.why}.` : "",
    "",
    "Happy to send an anonymised profile today if useful, and we can talk rates once you have seen it.",
    "",
    "Best regards,",
    senderName,
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
}
