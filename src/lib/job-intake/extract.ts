import "server-only";
import { cleanEmailBody } from "./clean-email";
import {
  emailDomain,
  isInternalMailbox,
  resolveRecruiterContact,
} from "./contact-email";
import type { OrganizationOperatingProfile } from "@/lib/data/organization-profile";
import {
  normaliseOpenQuestions,
  normaliseRequirementRoles,
  type RequirementRoleRow,
} from "@/lib/job-intake/requirement-case";

// ---------------------------------------------------------------------------
// Classify an inbound email, and where it is a real agency opportunity,
// extract the structured job lead.
//
// Two things make this different from a generic job parser:
//   1. Classification must reject job-board digests and "recruiter is popular
//      in your network" social noise, which look superficially identical to
//      real agency mail.
//   2. Scoring asks whether the active organization can create a commercial
//      staffing/package opportunity — not whether one person likes the job.
// ---------------------------------------------------------------------------

export type EmailClassification =
  | "job_opportunity"
  | "job_board"
  | "newsletter"
  | "finance"
  | "application_receipt"
  | "personal"
  | "other";

/** Classifications whose body we keep. Everything else is discarded. */
const KEEP_BODY: EmailClassification[] = ["job_opportunity"];

export function shouldKeepBody(c: EmailClassification): boolean {
  return KEEP_BODY.includes(c);
}

export interface ExtractedLead {
  agencyName: string | null;
  contactName: string | null;
  /** The recruiter to reply to — never the mailbox that received a forward. */
  contactEmail: string | null;
  clientCompany: string | null;
  roleTitle: string;
  country: string | null;
  city: string | null;
  sector: string | null;
  technologies: string[];
  durationMonths: number | null;
  startDateText: string | null;
  rateText: string | null;
  headcountText: string | null;
  workMode: string | null;
  teamPotential: number;
  teamRationale: string;
  requestedDocuments: string[];
  missingFields: string[];
  /** One row per role. A single-role email has one. Empty when the model gave none. */
  roles: RequirementRoleRow[];
  /** Facts only the client can answer. */
  openQuestions: string[];
}

export interface ExtractionResult {
  classification: EmailClassification;
  confidence: number;
  reason: string;
  lead: ExtractedLead | null;
  /**
   * The cleaned plaintext that was sent to the model. Stored only for real
   * opportunities — see shouldKeepBody().
   */
  cleanedText: string;
  /** Diagnostics from the cleaning stage. */
  cleaning: { originalLength: number; cleanedLength: number; reduction: number };
}

function offerDescription(profile: OrganizationOperatingProfile | null): string {
  if (profile?.offerMode === "teams") return "teams and subcontracted crews";
  if (profile?.offerMode === "individuals") return "individual specialists";
  return "individual specialists, teams, or subcontracted crews";
}

function buildSystemPrompt(
  profile: OrganizationOperatingProfile | null,
): string {
  const organizationName = profile?.name.trim() || "the active organization";
  const positioning =
    profile?.companyProfile.trim() ||
    "A technical staffing and workforce supplier serving project-based clients.";

  return `You triage inbound email for ${organizationName}.

Approved company profile: ${positioning}
The organization supplies ${offerDescription(profile)}. Use the approved profile to decide relevance; never invent capabilities that are not stated there.

You do two jobs.

## Job 1 — classify the email

- job_opportunity: a real person at a recruitment agency or an end client describing actual work they need people for. Usually written to a human, often asking for a CV, availability, or a call.
- job_board: automated digest of job listings (Built In, Indeed alerts, "New PLC Job Matches"). NOT a real opportunity.
- newsletter: industry newsletters, LinkedIn content digests, marketing from course providers.
- application_receipt: confirmation that an application was submitted or viewed.
- finance: invoices, payroll, bank, investment, tax.
- personal: personal correspondence unrelated to business.
- other: anything else.

Traps you must not fall for:
- "<Name>, Recruitment Consultant, is popular in your network" is LinkedIn social noise, NOT an opportunity.
- A job-board digest mentioning PLC roles is job_board, NOT an opportunity.
- An invoice from a recruitment agency is finance, NOT an opportunity.

## Job 2 — if and only if classification is job_opportunity, extract the lead

Score team_potential 0-100. This is the ONLY score that matters and it is NOT "how good is this job".
It answers: can ${organizationName} create a repeatable commercial placement, team package, or client/framework opportunity here?

- 85-100: explicitly plural or ongoing work. Phrases like "a range of projects", "various projects", "multiple lines", "ramping up resources", "ongoing support", several sites or sectors named.
- 60-84: one named role, but the context usually scales — large-site commissioning, pharma/automotive ramp-up, 12+ month horizon, "possible extension", warehouse/production line automation.
- 35-59: a single contractor request of normal length (4-12 months) with no signal it grows.
- 0-34: short single placement (under ~3 months), or work outside the approved company profile.

team_rationale: one sentence, quoting the phrase that drove the score where there is one.

requested_documents: what the sender explicitly asked for. Use these exact values where they apply: "cv", "phone", "references", "certificates". Empty array if none.

missing_fields: commercial facts NOT stated in the email, from exactly this list: "headcount", "rate", "location", "start_date", "duration". These become the questions the reply asks. Be strict — if the email says only "competitive" for pay, rate IS missing.

Rules:
- Never invent. Use null for anything not stated. Do not guess a country from an agency's office address.
- durationMonths: integer months, or null. "12 month contract" -> 12.
- technologies: concrete platforms only, e.g. ["PCS7","TIA Portal","Allen-Bradley","SCADA"].
- contactEmail: the recruiter or hiring person's address, the one a reply should go to. On a forwarded message that is the original From:/Von:/mailto address in the body, NOT the envelope sender and NOT the mailbox this was forwarded into. Never use an address at the receiving mailbox's own domain.
- contactName: that same person. On a forward, the original sender's name.

When classification is job_opportunity, also fill lead.roles: one object per role, not per person. "3 Basic and 2 Advanced" is two rows, with count 3 and count 2. A single named role is one row.
Each role: {"title","count","level","skills","start","duration","location","languages","rate"}.
count is an integer taken from the email. skills are the tools and platforms named for that role.
lead.openQuestions: short phrases for facts only the client can answer. Empty when nothing is missing.
If you are not sure this is a request for people, do not use job_opportunity.

Reply with JSON only, matching this shape:
{"classification":"...","confidence":0-100,"reason":"short","lead":null or {"agencyName":...,"contactName":...,"contactEmail":...,"clientCompany":...,"roleTitle":...,"country":...,"city":...,"sector":...,"technologies":[],"durationMonths":null,"startDateText":...,"rateText":...,"headcountText":...,"workMode":...,"teamPotential":0,"teamRationale":"...","requestedDocuments":[],"missingFields":[],"roles":[],"openQuestions":[]}}`;
}

/**
 * Fold the org's own rules into the prompt.
 *
 * Deliberately appended AFTER the built-in guidance and framed as
 * adjustments: house rules should be able to change what scores highly and
 * what counts as relevant, but never to unlock inventing facts. The "never
 * invent" instruction is restated below them so it is the last word.
 */
function withHouseRules(
  base: string,
  houseRules: string | null,
  organizationName: string,
): string {
  const rules = (houseRules ?? "").trim();
  if (!rules) return base;
  return [
    base,
    "",
    `## House rules from ${organizationName}`,
    `The team wrote these. They describe the work ${organizationName} actually wants and`,
    "how to weigh it. Apply them when classifying and when scoring team_potential —",
    "they take priority over the generic score bands above where they conflict.",
    "",
    rules,
    "",
    "Note: the house rules may change priorities and scores. They can never",
    "authorise inventing information. If a fact is not in the email, it is still",
    "null and still goes in missingFields.",
  ].join("\n");
}

export async function classifyAndExtract(params: {
  subject: string;
  senderName: string | null;
  senderEmail: string | null;
  /** The mailbox that received this. Never used as the recruiter. */
  recipientEmail?: string | null;
  body: string;
  bodyIsHtml?: boolean;
  model?: string;
  /** Org-authored rules, injected into the prompt. */
  houseRules?: string | null;
  /** Tenant identity and human-approved commercial positioning. */
  organization?: OrganizationOperatingProfile | null;
}): Promise<ExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const cleaned = cleanEmailBody(params.body, params.bodyIsHtml ?? true);

  const userContent = [
    `Envelope From: ${params.senderName ?? ""} <${params.senderEmail ?? ""}>`,
    params.recipientEmail
      ? `Delivered to mailbox: ${params.recipientEmail} (this is NOT the recruiter)`
      : null,
    `Subject: ${params.subject}`,
    "",
    cleaned.text || "(empty body)",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: params.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: withHouseRules(
            buildSystemPrompt(params.organization ?? null),
            params.houseRules ?? null,
            params.organization?.name.trim() || "the organization",
          ),
        },
        { role: "user", content: userContent },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 1600,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI request failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = json.choices?.[0]?.message?.content ?? "{}";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Model returned invalid JSON.");
  }

  const classification = normaliseClassification(parsed.classification);
  const cleaning = {
    originalLength: cleaned.originalLength,
    cleanedLength: cleaned.cleanedLength,
    reduction: cleaned.reduction,
  };

  return {
    classification,
    confidence: clampInt(parsed.confidence, 0, 100, 50),
    reason: String(parsed.reason ?? ""),
    lead:
      classification === "job_opportunity"
        ? normaliseLead(leadWithRoles(parsed), {
            senderName: params.senderName,
            senderEmail: params.senderEmail,
            recipientEmail: params.recipientEmail ?? null,
            subject: params.subject,
            cleanedText: cleaned.text,
          })
        : null,
    cleanedText: cleaned.text,
    cleaning,
  };
}

// ── normalisers ─────────────────────────────────────────────────────────────

const VALID: EmailClassification[] = [
  "job_opportunity", "job_board", "newsletter",
  "finance", "application_receipt", "personal", "other",
];

/** Roles sometimes come back beside the lead object. Keep them with the lead. */
function leadWithRoles(parsed: Record<string, unknown>): unknown {
  const lead = parsed.lead;
  if (!lead || typeof lead !== "object") return lead;
  const row = { ...(lead as Record<string, unknown>) };
  if (row.roles == null && parsed.roles != null) row.roles = parsed.roles;
  if (row.openQuestions == null && parsed.openQuestions != null) {
    row.openQuestions = parsed.openQuestions;
  }
  return row;
}

function normaliseClassification(value: unknown): EmailClassification {
  const s = String(value ?? "").trim().toLowerCase();
  return (VALID as string[]).includes(s) ? (s as EmailClassification) : "other";
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function strOrNull(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return null;
  return s;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0);
}

const VALID_MISSING = ["headcount", "rate", "location", "start_date", "duration"];

function normaliseLead(
  value: unknown,
  ctx: {
    senderName: string | null;
    senderEmail: string | null;
    recipientEmail?: string | null;
    subject?: string | null;
    cleanedText: string;
  },
): ExtractedLead | null {
  if (!value || typeof value !== "object") return null;
  const l = value as Record<string, unknown>;

  const roleTitle = strOrNull(l.roleTitle);
  // A lead with no role is not a usable lead.
  if (!roleTitle) return null;

  const recruiter = resolveRecruiterContact({
    extractedEmail: strOrNull(l.contactEmail),
    extractedName: strOrNull(l.contactName),
    senderEmail: ctx.senderEmail,
    senderName: ctx.senderName,
    recipientEmail: ctx.recipientEmail ?? null,
    subject: ctx.subject ?? null,
    bodyText: ctx.cleanedText,
  });
  const agencyEmail =
    recruiter.email && !isInternalMailbox(recruiter.email, ctx.recipientEmail)
      ? recruiter.email
      : !isInternalMailbox(ctx.senderEmail, ctx.recipientEmail)
        ? ctx.senderEmail
        : null;

  return {
    agencyName: strOrNull(l.agencyName) ?? agencyFromEmail(agencyEmail),
    contactName: recruiter.name,
    contactEmail: recruiter.email,
    clientCompany: strOrNull(l.clientCompany),
    roleTitle,
    country: strOrNull(l.country),
    city: strOrNull(l.city),
    sector: strOrNull(l.sector),
    technologies: strArray(l.technologies),
    durationMonths: Number.isFinite(Number(l.durationMonths))
      ? clampInt(l.durationMonths, 0, 240, 0) || null
      : null,
    startDateText: strOrNull(l.startDateText),
    rateText: strOrNull(l.rateText),
    headcountText: strOrNull(l.headcountText),
    workMode: strOrNull(l.workMode),
    teamPotential: clampInt(l.teamPotential, 0, 100, 0),
    teamRationale: String(l.teamRationale ?? "").trim(),
    requestedDocuments: strArray(l.requestedDocuments).map((d) => d.toLowerCase()),
    missingFields: strArray(l.missingFields)
      .map((f) => f.toLowerCase())
      .filter((f) => VALID_MISSING.includes(f)),
    roles: normaliseRequirementRoles(l.roles),
    openQuestions: normaliseOpenQuestions(l.openQuestions),
  };
}

/** Fall back to the sender's domain when the model doesn't name the agency. */
function agencyFromEmail(email: string | null): string | null {
  const domain = emailDomain(email);
  if (!domain) return null;
  const base = domain.split(".")[0] ?? "";
  if (!base) return null;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
