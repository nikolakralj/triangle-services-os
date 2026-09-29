// Client-safe: the filename a recruiter sees on a Triangle profile.
//
// On an anonymised profile it is the Triangle reference, never the person's
// name — a recruiter must not learn who it is from the attachment title.
//
// One function, used by the card and by the wire. A person approves a named
// file on the case and that same name has to be what arrives, or the approval
// was of something else.

import type { PackIntent } from "@/lib/data/put-forward";

export function anonymisedCvFilename(reference: string): string {
  const safe = reference
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${safe || "triangle"}-profile.pdf`;
}

export function namedCvFilename(workerName: string): string {
  const safe = workerName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${safe || "candidate"}-cv.pdf`;
}

export function packFilename(params: {
  intent: PackIntent;
  reference: string;
  workerName: string;
}): string {
  if (params.intent === "full_cv") return namedCvFilename(params.workerName);
  if (params.intent === "short_bio") {
    return anonymisedCvFilename(params.reference).replace(
      /-profile\.pdf$/,
      "-short-profile.pdf",
    );
  }
  return anonymisedCvFilename(params.reference);
}
