// Fields Hanna may put on a person. Shared by the mission pool, the CV queue,
// the candidate import, and the moment a person accepts the finding.
//
// Availability stays off the mission-pool candidate path: that is still its
// own proposal. The batch import may carry it, and accepting writes it.

import { canonicalLinkedinUrl, parseDriveFileId } from "@/lib/data/person-links";

export const AVAILABILITY_STATUSES = [
  "available",
  "available_soon",
  "busy",
  "unknown",
  "do_not_use",
] as const;

export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

/** The same keys the CV queue accepts. Availability is not one of them. */
export const CANDIDATE_FIELDS = [
  "full_name",
  "initials",
  "role",
  "worker_type",
  "email",
  "phone",
  "country",
  "city",
  "skills",
  "certificates",
  "languages",
  "industries",
  "summary",
  "years_experience",
  "linkedin_url",
  "original_cv_drive_file_id",
  "triangle_cv_drive_file_id",
  "nationality",
  "work_authorisation",
  "visa_notes",
] as const;

const FIELD_SET = new Set<string>(CANDIDATE_FIELDS);

/** CV text and protected characteristics. Never stored from an agent payload. */
export const PROTECTED_PERSON_FIELDS = [
  "cv_text",
  "cvText",
  "cv_file_name",
  "cv_pages",
  "date_of_birth",
  "dob",
  "birthdate",
  "age",
  "photo",
  "photograph",
  "religion",
  "health",
  "marital_status",
  "family_status",
] as const;

const PROTECTED = new Set<string>(PROTECTED_PERSON_FIELDS);

const ALIASES: Record<string, string> = {
  cv_drive_file: "original_cv_drive_file_id",
  visa: "visa_notes",
};

const LIST_FIELDS = new Set([
  "skills",
  "certificates",
  "languages",
  "industries",
  "work_authorisation",
]);

const AVAILABILITY_FIELDS = new Set(["availability_status", "available_from"]);

/** Columns added in 058. Writes retry without them when that migration is not applied yet. */
export const WORKER_CV_COLUMNS = [
  "initials",
  "years_experience",
  "linkedin_url",
  "original_cv_drive_file_id",
  "triangle_cv_drive_file_id",
] as const;

export function missingWorkerCvColumn(message: string | undefined): boolean {
  if (!message) return false;
  return WORKER_CV_COLUMNS.some((column) => message.includes(column));
}

export function omitWorkerCvColumns<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row };
  for (const column of WORKER_CV_COLUMNS) delete next[column];
  return next;
}

export function normalisePersonName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normaliseCountry(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normaliseEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 200 || !email.includes("@")) return null;
  return email;
}

export interface PersonIdentity {
  linkedin: string | null;
  email: string | null;
  name: string | null;
  country: string | null;
}

export function identityOf(fields: Record<string, unknown>): PersonIdentity {
  const linkedinRaw = stringOf(fields.linkedin_url);
  const emailRaw = stringOf(fields.email);
  const nameRaw = stringOf(fields.full_name) ?? stringOf(fields.name);
  const countryRaw = stringOf(fields.country);
  return {
    linkedin: linkedinRaw ? canonicalLinkedinUrl(linkedinRaw) : null,
    email: emailRaw ? normaliseEmail(emailRaw) : null,
    name: nameRaw ? normalisePersonName(nameRaw) : null,
    country: countryRaw ? normaliseCountry(countryRaw) : null,
  };
}

export interface DuplicateRef {
  kind: "worker" | "finding";
  id: string;
}

export type DuplicateHit =
  | {
      status: "duplicate";
      via: "linkedin_url" | "email" | "name_country";
      ref: DuplicateRef;
    }
  | { status: "name_only"; ref: DuplicateRef }
  | { status: "none" };

/**
 * LinkedIn, then email, then name plus country. A name on its own is reported
 * and is not treated as the same person.
 */
export class DuplicateIndex {
  private readonly linkedin = new Map<string, DuplicateRef>();
  private readonly email = new Map<string, DuplicateRef>();
  private readonly nameCountry = new Map<string, DuplicateRef>();
  private readonly name = new Map<string, DuplicateRef>();

  add(identity: PersonIdentity, ref: DuplicateRef): void {
    if (identity.linkedin && !this.linkedin.has(identity.linkedin)) {
      this.linkedin.set(identity.linkedin, ref);
    }
    if (identity.email && !this.email.has(identity.email)) {
      this.email.set(identity.email, ref);
    }
    if (identity.name && identity.country) {
      const key = `${identity.name}\n${identity.country}`;
      if (!this.nameCountry.has(key)) this.nameCountry.set(key, ref);
    }
    if (identity.name && !this.name.has(identity.name)) {
      this.name.set(identity.name, ref);
    }
  }

  match(identity: PersonIdentity): DuplicateHit {
    if (identity.linkedin) {
      const ref = this.linkedin.get(identity.linkedin);
      if (ref) return { status: "duplicate", via: "linkedin_url", ref };
    }
    if (identity.email) {
      const ref = this.email.get(identity.email);
      if (ref) return { status: "duplicate", via: "email", ref };
    }
    if (identity.name && identity.country) {
      const ref = this.nameCountry.get(`${identity.name}\n${identity.country}`);
      if (ref) return { status: "duplicate", via: "name_country", ref };
    }
    if (identity.name) {
      const ref = this.name.get(identity.name);
      if (ref) return { status: "name_only", ref };
    }
    return { status: "none" };
  }
}

export interface ParseCandidateOptions {
  /** The batch import may propose availability. A mission candidate may not. */
  allowAvailability?: boolean;
  /** A bad year or a missing name fails the import. The mission picker skips a bad year. */
  strict?: boolean;
  /** The CV queue may enrich a finding that already has a name. */
  requireName?: boolean;
  /** Existing CV findings already carry cv_text. Accepting them must ignore it. */
  ignoreProtected?: boolean;
  /** Cap for summary and visa notes. Accepting must not shorten a value the import already stored. */
  longTextMax?: number;
}

export function parseCandidateRecord(
  raw: unknown,
  opts: ParseCandidateOptions = {},
): { fields: Record<string, unknown>; error: string | null } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      fields: {},
      error: opts.strict ? "Each candidate must be an object." : null,
    };
  }

  const record = raw as Record<string, unknown>;
  if (!opts.ignoreProtected) {
    for (const key of Object.keys(record)) {
      if (PROTECTED.has(key)) {
        return {
          fields: {},
          error: `“${key}” is not accepted. CV text and protected characteristics stay out of this proposal.`,
        };
      }
    }
  }

  const fields: Record<string, unknown> = {};
  const longMax = opts.longTextMax ?? (opts.strict ? 2000 : 700);
  const seen = new Set(Object.keys(record));
  for (const key of seen) {
    if (PROTECTED.has(key)) continue;
    const canonical = ALIASES[key] ?? key;
    if (ALIASES[key] && present(record[canonical])) continue;
    if (!acceptedKey(canonical, opts.allowAvailability === true)) continue;
    const cleaned = cleanValue(canonical, record[key], opts.strict === true, longMax);
    if ("error" in cleaned) return { fields: {}, error: cleaned.error };
    if ("skip" in cleaned) continue;
    fields[cleaned.key] = cleaned.value;
  }

  if (
    opts.allowAvailability &&
    fields.availability_status == null &&
    isOpenToWork(record.open_to_work)
  ) {
    fields.availability_status = "available";
  }

  if ((opts.requireName ?? opts.strict) && typeof fields.full_name !== "string") {
    return { fields: {}, error: "full_name is required." };
  }

  return { fields, error: null };
}

/**
 * Columns to write on workers when a person accepts a worker finding.
 * Does not set status. A name-only match is not a reason to update anyone.
 */
export function workerColumnsFromPayload(payload: Record<string, unknown>): {
  columns: Record<string, unknown>;
  error: string | null;
} {
  const parsed = parseCandidateRecord(payload, {
    allowAvailability: true,
    strict: false,
    ignoreProtected: true,
    longTextMax: 4000,
  });
  if (parsed.error) return { columns: {}, error: parsed.error };

  const source = parsed.fields;
  const columns: Record<string, unknown> = {};
  const copy = [
    "role",
    "worker_type",
    "email",
    "phone",
    "country",
    "city",
    "skills",
    "certificates",
    "languages",
    "industries",
    "initials",
    "years_experience",
    "linkedin_url",
    "original_cv_drive_file_id",
    "triangle_cv_drive_file_id",
    "nationality",
    "work_authorisation",
    "visa_notes",
    "availability_status",
    "available_from",
  ] as const;
  for (const key of copy) {
    if (source[key] != null && source[key] !== "") columns[key] = source[key];
  }
  if (typeof source.summary === "string" && source.summary.trim()) {
    columns.notes = source.summary.trim().slice(0, 4000);
  }
  return { columns, error: null };
}

export function formatYearsNote(years: unknown): string | null {
  const n = wholeYears(years);
  if (n == null) return null;
  return n === 1 ? "1 year" : `${n} years`;
}

function acceptedKey(key: string, allowAvailability: boolean): boolean {
  if (FIELD_SET.has(key)) return true;
  return allowAvailability && AVAILABILITY_FIELDS.has(key);
}

function present(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function cleanValue(
  key: string,
  value: unknown,
  strict: boolean,
  longMax: number,
): { key: string; value: unknown } | { error: string } | { skip: true } {
  if (!present(value)) return { skip: true };

  if (key === "years_experience") {
    const years = wholeYears(value);
    if (years == null) {
      return strict
        ? { error: "years_experience must be a whole number from 0 to 60." }
        : { skip: true };
    }
    return { key, value: years };
  }

  if (key === "linkedin_url") {
    const url = canonicalLinkedinUrl(String(value));
    if (!url) return { error: "linkedin_url must be a LinkedIn profile link." };
    return { key, value: url };
  }

  if (key === "original_cv_drive_file_id" || key === "triangle_cv_drive_file_id") {
    const parsed = parseDriveFileId(String(value));
    if ("error" in parsed) return { error: parsed.error };
    return { key, value: parsed.id };
  }

  if (key === "initials") {
    const initials = String(value).replace(/\s+/g, " ").trim();
    if (initials.length < 1 || initials.length > 40) {
      return { error: "initials must be 1–40 characters." };
    }
    return { key, value: initials };
  }

  if (key === "availability_status") {
    const status = String(value).trim();
    if (!(AVAILABILITY_STATUSES as readonly string[]).includes(status)) {
      return {
        error:
          "availability_status must be available, available_soon, busy, unknown, or do_not_use.",
      };
    }
    return { key, value: status };
  }

  if (key === "available_from") {
    const date = isoDate(value);
    if (!date) return { error: "available_from must be a YYYY-MM-DD date." };
    return { key, value: date };
  }

  if (key === "email") {
    const email = normaliseEmail(String(value));
    if (!email) {
      return strict ? { error: "email needs an @." } : { skip: true };
    }
    return { key, value: email };
  }

  if (LIST_FIELDS.has(key)) {
    const list = stringList(value);
    if (list.length === 0) return { skip: true };
    return { key, value: list };
  }

  const text = clip(String(value), key === "summary" || key === "visa_notes" ? longMax : 200);
  if (!text) return { skip: true };
  return { key, value: text };
}

function wholeYears(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 60) return null;
  return Math.round(n);
}

function isoDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function isOpenToWork(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const text = value.trim().toLowerCase();
  return text === "true" || text === "yes";
}

function stringOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function clip(value: string, max: number): string | null {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

function stringList(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const text = String(item ?? "").replace(/\s+/g, " ").trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text.slice(0, 80));
    if (out.length >= 40) break;
  }
  return out;
}
