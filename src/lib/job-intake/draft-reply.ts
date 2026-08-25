import "server-only";
import type { JobLead } from "@/lib/data/job-intake";

// ---------------------------------------------------------------------------
// Drafting the reply to an agency email.
//
// This is where the product earns its keep. A recruiter's email is an advert
// aimed at one engineer. The reply's job is to turn it into a supplier
// conversation — and to extract the commercial facts the email left out.
//
// Across every real agency email sampled, rate was "competitive" or absent
// and headcount was NEVER stated once. Those are the questions.
//
// NOTHING HERE SENDS MAIL. It produces text a human reads, edits and sends.
// ---------------------------------------------------------------------------

/**
 * Triangle's positioning, in the words Nikola actually used to a recruiter:
 * "an automation and industrial services company operating from Bulgaria and
 * Croatia, supporting projects..." Kept as a constant so it is easy to edit
 * in one place.
 */
const COMPANY_PROFILE = `Triangle Services is an automation and industrial services company operating from Bulgaria and Croatia. We supply teams of specialist contractors — PLC/PCS7/TIA Portal programmers, commissioning and electrical engineers, supervisors — to industrial projects across Europe and the USA. We can contract through our EU company and handle posting, A1 certificates and compliance for our people.`;

const ASK_TEXT: Record<string, string> = {
  headcount: "how many people the client needs for this scope",
  rate: "the rate band or budget per person",
  location: "the site location",
  start_date: "the intended start date",
  duration: "the expected duration",
};

/** Rough language hint from the project country. Default English. */
function languageForCountry(country: string | null): { code: string; name: string } {
  const c = (country ?? "").trim().toLowerCase();
  if (["germany", "deutschland", "de", "austria", "at"].includes(c)) {
    return { code: "de", name: "German" };
  }
  if (["france", "fr"].includes(c)) return { code: "fr", name: "French" };
  return { code: "en", name: "English" };
}

export interface DraftedReply {
  subject: string;
  body: string;
  asks: string[];
  language: string;
}

const SYSTEM_PROMPT = `You draft replies to recruitment agencies on behalf of Triangle Services.

The recruiter thinks they are talking to one freelance engineer. Your job is to reply in a way that (a) keeps the conversation warm, (b) repositions Triangle as a company that can supply a TEAM, and (c) extracts the commercial facts the recruiter left out.

Write like an experienced operator, not a salesperson.

Hard rules:
- Short. 120-180 words of body text. Recruiters skim.
- Open by referencing the SPECIFIC role and project they wrote about. No "I hope this email finds you well".
- State plainly what Triangle is and that it can provide multiple people. Do NOT invent worker counts, names, CVs, rates or availability — you do not know the roster.
- Ask ONLY for the missing facts listed in MISSING. Put them as a short bulleted list, not a paragraph of questions.
- Always include the key question, phrased naturally: whether the client would consider a supplier team / subcontracted crew rather than individual freelancers.
- If the recruiter asked for a CV or phone number, acknowledge it and say it will follow — do NOT claim it is attached.
- No pricing. No commitments on dates. No legal or contractual terms.
- Sign off as Nikola Kralj, Triangle Services. No fake phone numbers, addresses or links.
- Plain text only. No markdown, no bold, no headers.

Reply with JSON only:
{"subject":"Re: ...","body":"the full email text including greeting and sign-off"}`;

export async function draftLeadReply(params: {
  lead: JobLead;
  originalSubject: string | null;
  model?: string;
}): Promise<DraftedReply> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const { lead } = params;
  const lang = languageForCountry(lead.country);

  const asks = lead.missingFields.length > 0
    ? lead.missingFields
    // If extraction found nothing missing, headcount is still always worth asking.
    : ["headcount"];

  const known = [
    lead.roleTitle && `Role: ${lead.roleTitle}`,
    lead.agencyName && `Agency: ${lead.agencyName}`,
    lead.contactName && `Recruiter: ${lead.contactName}`,
    lead.country && `Country: ${lead.country}`,
    lead.city && `City: ${lead.city}`,
    lead.sector && `Sector: ${lead.sector}`,
    lead.technologies.length > 0 && `Technology: ${lead.technologies.join(", ")}`,
    lead.durationMonths && `Duration: ${lead.durationMonths} months`,
    lead.startDateText && `Start: ${lead.startDateText}`,
    lead.rateText && `Rate as stated: ${lead.rateText}`,
    lead.headcountText && `Headcount as stated: ${lead.headcountText}`,
  ].filter(Boolean).join("\n");

  const userContent = [
    `COMPANY:\n${COMPANY_PROFILE}`,
    "",
    `THEIR EMAIL SUBJECT: ${params.originalSubject ?? lead.roleTitle}`,
    "",
    `WHAT WE KNOW FROM THEIR EMAIL:\n${known || "(very little)"}`,
    "",
    `MISSING — ask for exactly these:\n${asks.map((a) => `- ${ASK_TEXT[a] ?? a}`).join("\n")}`,
    "",
    lead.requestedDocuments.length > 0
      ? `THEY ASKED US FOR: ${lead.requestedDocuments.join(", ")}`
      : "THEY ASKED US FOR: nothing specific",
    "",
    `WRITE IN: ${lang.name}`,
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: params.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
      max_tokens: 700,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI request failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  let parsed: { subject?: unknown; body?: unknown };
  try {
    parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
  } catch {
    throw new Error("Model returned invalid JSON.");
  }

  const body = String(parsed.body ?? "").trim();
  if (!body) throw new Error("Model returned an empty draft.");

  const rawSubject = String(parsed.subject ?? "").trim();
  const fallbackSubject = params.originalSubject
    ? params.originalSubject.startsWith("Re:")
      ? params.originalSubject
      : `Re: ${params.originalSubject}`
    : `Re: ${lead.roleTitle}`;

  return {
    subject: rawSubject || fallbackSubject,
    body,
    asks,
    language: lang.code,
  };
}
