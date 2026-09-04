import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// The active organization's worker CV.
//
// The document you actually send a buyer. Triangle could extract a CV, build a
// profile, match a worker to a package and generate a crew packet — but there
// was no way to put ONE person in front of a buyer, which is what a buyer asks
// for first.
//
// Two rules shape it, and both are commercial as much as legal:
//
// 1. Anonymised by default. A named CV with an email address sent to a
//    prospect is a personal-data disclosure to someone who has not committed
//    to anything, and it invites them to go direct. Identity is what Triangle
//    releases when there is a real opportunity. `includeIdentity` is a
//    deliberate human choice, not a default.
//
// 2. The worker's rate expectation never appears. That is Triangle's cost, not
//    the buyer's price. There is no flag to include it.
//
// Nothing is invented. A field Triangle does not hold is shown as not
// recorded, because a silent omission reads as a confirmation.
// ---------------------------------------------------------------------------

export interface WorkerCvDocument {
  /** "Electrical Supervisor · P.Ö." or the full name when identity is released. */
  displayName: string;
  reference: string;
  anonymised: boolean;
  role: string;
  workerType: string | null;
  basedIn: string | null;
  yearsNote: string | null;
  skills: string[];
  certificates: string[];
  languages: string[];
  industries: string[];
  availability: string;
  mobility: string[];
  practical: string[];
  /** Only present when identity is released. */
  contact: { email: string | null; phone: string | null } | null;
  notRecorded: string[];
  generatedAt: string;
  orgName: string;
}

export async function buildWorkerCv(params: {
  workerId: string;
  orgId: string;
  includeIdentity?: boolean;
}): Promise<WorkerCvDocument | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data: w } = await svc
    .from("workers")
    .select(
      "id, full_name, role, worker_type, email, phone, country, city, languages, skills, certificates, industries, availability_status, available_from, preferred_countries, has_passport, has_a1_possible, has_own_tools, has_car, notes",
    )
    .eq("organization_id", params.orgId)
    .eq("id", params.workerId)
    .maybeSingle();
  if (!w) return null;

  const { data: org } = await svc
    .from("organizations")
    .select("name")
    .eq("id", params.orgId)
    .maybeSingle();

  const orgName = String(org?.name ?? "").trim();
  if (!orgName) return null;

  const list = (v: unknown) =>
    Array.isArray(v) ? (v as unknown[]).map(String).filter(Boolean) : [];

  const fullName = String(w.full_name ?? "").trim();
  const role = String(w.role ?? "").trim();
  const anonymised = !params.includeIdentity;

  const skills = list(w.skills);
  const certificates = list(w.certificates);
  const languages = list(w.languages);
  const industries = list(w.industries);

  // What Triangle does not hold. Stated, because a CV that simply omits
  // availability reads as though availability were fine.
  const notRecorded: string[] = [];
  if (skills.length === 0) notRecorded.push("Skills");
  if (certificates.length === 0) notRecorded.push("Certificates");
  if (languages.length === 0) notRecorded.push("Languages");
  if (!w.country && !w.city) notRecorded.push("Location");
  // On a released CV, missing contact details are the buyer's problem to know
  // about — they were told identity would be released and it was, partially.
  if (params.includeIdentity && !w.email && !w.phone) {
    notRecorded.push("Contact details");
  }

  return {
    displayName: anonymised ? anonymiseName(fullName, role) : fullName || "Unnamed",
    reference: `${organizationReferencePrefix(orgName)}-${String(w.id).slice(0, 8).toUpperCase()}`,
    anonymised,
    role: role || "Role not recorded",
    workerType: w.worker_type ? String(w.worker_type) : null,
    basedIn: [w.city, w.country].filter(Boolean).join(", ") || null,
    yearsNote: null,
    skills,
    certificates,
    languages,
    industries,
    availability: describeAvailability(
      w.availability_status ? String(w.availability_status) : null,
      w.available_from ? String(w.available_from) : null,
    ),
    mobility: list(w.preferred_countries),
    practical: [
      w.has_passport ? "Passport held" : null,
      w.has_a1_possible ? "A1 posting possible" : null,
      w.has_own_tools ? "Own tools" : null,
      w.has_car ? "Own vehicle" : null,
    ].filter(Boolean) as string[],
    contact: anonymised
      ? null
      : {
          email: w.email ? String(w.email) : null,
          phone: w.phone ? String(w.phone) : null,
        },
    notRecorded,
    generatedAt: new Date().toISOString(),
    orgName,
  };
}

function organizationReferencePrefix(name: string): string {
  const words =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .match(/[a-zA-Z0-9]+/g) ?? [];

  if (words.length >= 2) {
    return `${words[0]?.charAt(0) ?? ""}${words[1]?.charAt(0) ?? ""}`.toUpperCase();
  }

  return (words[0]?.slice(0, 2).toUpperCase() || "CV").padEnd(2, "X");
}

/**
 * "Peter Östlund" -> "P. Ö." — enough for a buyer to refer to one candidate
 * across a conversation without being able to identify or approach them.
 */
function anonymiseName(fullName: string, role: string): string {
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(" ");
  if (!initials) return role || "Candidate";
  return initials;
}

/**
 * Availability is a human-confirmed fact. "unknown" says so rather than
 * implying the person is free — the difference between a truthful package and
 * a claim Triangle cannot support.
 */
function describeAvailability(status: string | null, from: string | null): string {
  const when = from ? new Date(from).toLocaleDateString("en-GB") : null;
  switch (status) {
    case "available":
      return when ? `Available from ${when}` : "Available — start date to confirm";
    case "engaged":
      return when ? `Currently engaged, free from ${when}` : "Currently engaged";
    case "unavailable":
      return "Not available";
    default:
      return "Availability not confirmed";
  }
}
