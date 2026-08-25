// Required-documents logic for packages. Pure functions + constants only —
// NO server imports, safe to use in both client and server components.
//
// A package may declare which documents its crew must have on file. When the
// package has no explicit list, we derive a sensible default from the project's
// country and the package roles (the "template").

import { CERT_TYPES } from "@/lib/data/worker-documents-types";

export const CERT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CERT_TYPES.map((c) => [c.value, c.label]),
);

export function certLabel(certType: string): string {
  return CERT_TYPE_LABEL[certType] ?? certType;
}

// EU / EEA country codes (ISO-3166 alpha-2) where posted workers typically
// need an A1 portable document + work permit checks.
const EU_EEA = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE", "IS", "LI", "NO",
]);

const WORK_AT_HEIGHT_RE =
  /scaffold|rigger|height|roof|steel\s*erect|mewp|cherry\s*picker|tower|abseil|rope\s*access/i;

/**
 * Derive a default set of required document types from project country + roles.
 * Returns cert-type values (matching CERT_TYPES).
 */
export function defaultRequiredDocuments(params: {
  countryCode: string | null;
  roles: string[];
}): string[] {
  const docs = new Set<string>();
  docs.add("id_passport");

  const cc = (params.countryCode ?? "").trim().toUpperCase();
  if (EU_EEA.has(cc)) {
    docs.add("a1");
    docs.add("work_permit");
  }
  if (cc === "GB" || cc === "UK") {
    docs.add("cscs");
  }

  if (params.roles.some((r) => WORK_AT_HEIGHT_RE.test(r))) {
    docs.add("ipaf");
    docs.add("pasma");
  }

  return Array.from(docs);
}

export type RequiredDocsSource = "explicit" | "template";

/**
 * Resolve the effective required documents for a package: use the explicit
 * list if it's non-empty, otherwise fall back to the country/role template.
 */
export function resolveRequiredDocuments(params: {
  explicit: string[] | null | undefined;
  countryCode: string | null;
  roles: string[];
}): { docs: string[]; source: RequiredDocsSource } {
  const explicit = (params.explicit ?? []).filter(
    (d) => typeof d === "string" && d.trim().length > 0,
  );
  if (explicit.length > 0) {
    return { docs: explicit, source: "explicit" };
  }
  return {
    docs: defaultRequiredDocuments({
      countryCode: params.countryCode,
      roles: params.roles,
    }),
    source: "template",
  };
}

export type ReadinessStatus = "complete" | "partial" | "missing";

export interface DocumentReadinessItem {
  certType: string;
  label: string;
  /** Number of submitted workers. */
  total: number;
  /** Workers who have this document on file (not expired). */
  onFile: number;
  /** Names of workers missing this document. */
  missingWorkers: string[];
  status: ReadinessStatus;
}

/**
 * For each required document type, count how many of the submitted workers
 * have it on file. A worker "satisfies" a doc if they have one of that type
 * that is not expired.
 */
export function computeDocumentReadiness(
  requiredDocs: string[],
  workers: Array<{ name: string; satisfiedCertTypes: Set<string> }>,
): DocumentReadinessItem[] {
  const total = workers.length;
  return requiredDocs.map((certType) => {
    const missingWorkers = workers
      .filter((w) => !w.satisfiedCertTypes.has(certType))
      .map((w) => w.name);
    const onFile = total - missingWorkers.length;
    const status: ReadinessStatus =
      total === 0 || onFile === 0
        ? "missing"
        : onFile === total
          ? "complete"
          : "partial";
    return {
      certType,
      label: certLabel(certType),
      total,
      onFile,
      missingWorkers,
      status,
    };
  });
}
