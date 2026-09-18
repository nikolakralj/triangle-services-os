// Client-safe: the filename a recruiter sees on an anonymised Triangle profile.
// The Triangle reference, never the person's name — a recruiter must not learn
// who it is from the attachment title.

export function anonymisedCvFilename(reference: string): string {
  const safe = reference
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${safe || "triangle"}-profile.pdf`;
}
