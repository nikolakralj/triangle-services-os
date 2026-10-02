// ---------------------------------------------------------------------------
// Who acts on a WhatsApp message, and what may leave with the reply.
//
// Decisions only. No database, no fetch, no send.
//
// Scout takes a contractor, company, or subcontractor list, or a research
// request. Hanna takes resourcing: people, CVs, availability, roles. When the
// words match both, or neither, the message is unsure and goes to Hanna.
// A model may decide first. An unsure or missing model answer uses the
// keyword rule. The keyword rule never sends the message anywhere but Hanna
// when it is not sure.
//
// Data rule. No CV or worker profile leaves Triangle by WhatsApp. A draft may
// carry one contractor, company, or subcontractor list. The words may say
// what an anonymised bio may say — initials, role, tickets, languages,
// right-to-work, dated availability — and may not carry a name, an email, a
// phone number, a rate, or a full CV. The anonymised packet itself stays in
// Triangle; WhatsApp does not become a second way to send it.
// ---------------------------------------------------------------------------

import { isHannaEmployee } from "@/lib/data/ask-hanna-policy";
import { explicitPackIntent } from "@/lib/data/put-forward";

export const WHATSAPP_DRAFT_ENDPOINT = "/api/agent/whatsapp/drafts";

/** Must stay the same string as SCOUT_ROLE_KEY in bot-runtime.ts. */
export const SCOUT_WHATSAPP_ROLE_KEY = "project_researcher";

export const WHATSAPP_DRAFT_BUCKET = "whatsapp-drafts";

/** Buckets a draft may point at. Anything else is refused. */
export const WHATSAPP_ATTACHMENT_BUCKETS = ["whatsapp-drafts", "documents"] as const;

/** Decoded file cap. Vercel's request body is 4.5 MB; this stays under it. */
export const WHATSAPP_DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;

export const WHATSAPP_DATA_RULE =
  "No CV or worker profile leaves Triangle by WhatsApp. A draft may carry one contractor, company, or subcontractor list. The words may say what an anonymised bio may say — initials, role, tickets, languages, availability — and may not carry a name, an email, a phone number, or a rate.";

export const ROUTE_MODEL_INSTRUCTIONS = [
  "You route one inbound WhatsApp message.",
  'Reply with JSON only: {"employee":"scout"|"hanna"|"unsure","reason":"short"}',
  "scout: a contractor, company, or subcontractor list, or a research request.",
  "hanna: resourcing — people, CVs, availability, or roles.",
  "unsure: both, neither, or you are not sure.",
  "The reason is one short sentence and does not quote the message.",
].join(" ");

export type RouteEmployee = "scout" | "hanna";

export interface RouteDecision {
  employee: RouteEmployee;
  reason: string;
  /** True when the choice is the default because the words were not clear. */
  unsure: boolean;
}

export interface ModelRoute {
  employee: "scout" | "hanna" | "unsure";
  reason: string;
}

const SCOUT_PATTERNS: RegExp[] = [
  /\bsub[\s-]?contractors?\b/i,
  /\bcontractors?\b/i,
  /\bcompan(?:y|ies)\b/i,
  /\bsuppliers?\b/i,
  /\bresearch\b/i,
  /\b(?:epc|general contractor)\b/i,
  /\bwho\s+(?:is|are)\s+(?:the\s+)?(?:owner|developer|buyer)\b/i,
];

const HANNA_PATTERNS: RegExp[] = [
  /\b(?:cvs?|resumes?|curriculum(?:\s+vitae)?)\b/i,
  /\bavailab(?:le|ility)\b/i,
  /\broles?\b/i,
  /\b(?:people|person|persons)\b/i,
  /\b(?:engineers?|technicians?|commissioning)\b/i,
  /\b(?:candidates?|workers?|crew)\b/i,
  /\bput\s+forward\b/i,
  /\bbios?\b/i,
  /\bheadcount\b/i,
];

export function keywordRoute(text: string): RouteDecision {
  const scout = SCOUT_PATTERNS.some((pattern) => pattern.test(text));
  const hanna = HANNA_PATTERNS.some((pattern) => pattern.test(text));
  if (scout && !hanna) {
    return {
      employee: "scout",
      reason: "Contractor, company, subcontractor, or research request, so Scout.",
      unsure: false,
    };
  }
  if (hanna && !scout) {
    return {
      employee: "hanna",
      reason: "Resourcing — people, CVs, availability, or roles — so Hanna.",
      unsure: false,
    };
  }
  if (scout && hanna) {
    return {
      employee: "hanna",
      reason: "Unsure — it asks for both a list or research and resourcing — so Hanna.",
      unsure: true,
    };
  }
  return { employee: "hanna", reason: "Unsure, so Hanna.", unsure: true };
}

export function parseModelRoute(raw: string | null | undefined): ModelRoute | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last <= first) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(first, last + 1)) as { employee?: unknown; reason?: unknown };
    const employee = parsed.employee;
    if (employee !== "scout" && employee !== "hanna" && employee !== "unsure") return null;
    const reason = typeof parsed.reason === "string" ? parsed.reason : "";
    return { employee, reason };
  } catch {
    return null;
  }
}

function sanitizeRouteReason(reason: string, text: string): string {
  const trimmed = reason.replace(/\s+/g, " ").trim().slice(0, 180);
  if (!trimmed) return "";
  if (/@/.test(trimmed) || /(?:\+|00)\d[\d\s().-]{6,}/.test(trimmed)) return "";
  const sample = text.trim().slice(0, 40).toLowerCase();
  if (sample.length >= 12 && trimmed.toLowerCase().includes(sample)) return "";
  return trimmed;
}

/**
 * A confident model answer wins. Unsure, missing, or unreadable falls through
 * to the keyword rule, which itself sends an unclear message to Hanna.
 */
export function resolveRoute(text: string, model: ModelRoute | null): RouteDecision {
  if (model?.employee === "scout" || model?.employee === "hanna") {
    const fallback = model.employee === "scout" ? "Scout." : "Hanna.";
    return {
      employee: model.employee,
      reason: sanitizeRouteReason(model.reason, text) || fallback,
      unsure: false,
    };
  }
  return keywordRoute(text);
}

export function isScoutEmployee(employee: { roleKey: string; displayName: string }): boolean {
  return (
    employee.roleKey === SCOUT_WHATSAPP_ROLE_KEY ||
    employee.displayName.trim().toLowerCase() === "scout"
  );
}

export function employeeMayDraftWhatsApp(employee: {
  roleKey: string;
  displayName: string;
}): boolean {
  return isHannaEmployee(employee) || isScoutEmployee(employee);
}

const BLOCKED_SOURCE_TABLES = new Set([
  "workers",
  "worker",
  "worker_documents",
  "worker_profiles",
  "worker_profile",
  "worker_cv",
  "cvs",
  "cv",
]);

const BLOCKED_KINDS = new Set([
  "cv",
  "full_cv",
  "resume",
  "bio",
  "bio_pack",
  "bio_anonymised",
  "short_bio",
  "worker_profile",
  "profile",
  "anonymised_profile",
  "anonymised_cv",
  "passport",
  "id_passport",
  "work_permit",
]);

const ALLOWED_EXTENSIONS = new Set(["csv", "pdf", "txt", "xls", "xlsx", "doc", "docx"]);

const MIME_BY_EXT: Record<string, string> = {
  csv: "text/csv",
  pdf: "application/pdf",
  txt: "text/plain",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export interface AttachmentInput {
  filename?: string | null;
  mime?: string | null;
  kind?: string | null;
  sourceTable?: string | null;
  linkedEntityType?: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  /** True when the draft carries bytes to store. */
  hasContent?: boolean;
  title?: string | null;
}

export interface NormalizedAttachment {
  filename: string;
  mime: string;
  kind: string | null;
  sourceTable: string | null;
  bucket: string;
  path: string | null;
}

export function workerProfileAttachment(
  input: AttachmentInput,
): { blocked: true; reason: string } | { blocked: false } {
  const filename = (input.filename ?? "").trim();
  const kind = (input.kind ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const source = (input.sourceTable ?? "").trim().toLowerCase();
  const linked = (input.linkedEntityType ?? "").trim().toLowerCase();
  const title = (input.title ?? "").trim();
  const path = (input.storagePath ?? "").trim();

  if (source && BLOCKED_SOURCE_TABLES.has(source)) {
    return { blocked: true, reason: "That file is a worker record. It does not leave by WhatsApp." };
  }
  if (linked === "worker") {
    return { blocked: true, reason: "That file is tied to a worker. It does not leave by WhatsApp." };
  }
  if (kind && BLOCKED_KINDS.has(kind)) {
    return { blocked: true, reason: "A CV, bio pack, or worker profile does not leave by WhatsApp." };
  }
  if (filenameLooksLikeWorkerProfile(filename) || filenameLooksLikeWorkerProfile(title)) {
    return { blocked: true, reason: "That filename is a CV, bio, or worker profile. It does not leave by WhatsApp." };
  }
  if (/\/(?:workers?|cvs?|profiles?|bios?)\//i.test(path)) {
    return { blocked: true, reason: "That file lives with worker records. It does not leave by WhatsApp." };
  }
  return { blocked: false };
}

export function filenameLooksLikeWorkerProfile(name: string): boolean {
  const file = name.trim();
  if (!file) return false;
  return (
    /\b(?:cvs?|c\.v\.?|resumes?|résumés?|curriculum)\b/i.test(file) ||
    /\b(?:bio[\s_-]?packs?|biopacks?|worker[\s_-]?profiles?)\b/i.test(file) ||
    /\b(?:anonymi[sz]ed[\s_-]?(?:cv|profile|bio)s?)\b/i.test(file) ||
    /(?:^|[\s_-])profile\.pdf$/i.test(file) ||
    /\b(?:passports?|id[\s_-]?cards?)\b/i.test(file) ||
    /(?:^|[\s_-])(?:cv|bio)\.pdf$/i.test(file)
  );
}

export function safeDocumentFilename(name: string): string | null {
  const base = name.trim().split(/[/\\]/).pop()?.trim() ?? "";
  if (!base || base.length > 180) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._ ()-]*\.[A-Za-z0-9]{2,5}$/.test(base)) return null;
  const ext = base.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) return null;
  return base;
}

function mimeFor(filename: string, given: string | null | undefined): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const expected = MIME_BY_EXT[ext];
  if (!expected) return null;
  const mime = (given ?? "").trim().toLowerCase();
  if (!mime) return expected;
  if (mime === expected) return expected;
  if (ext === "csv" && (mime === "text/plain" || mime === "application/csv" || mime === "application/vnd.ms-excel")) {
    return "text/csv";
  }
  if (ext === "txt" && mime === "text/csv") return "text/plain";
  return null;
}

/**
 * One document on a draft, or a refusal. A worker profile is refused here,
 * before any bytes are stored.
 */
export function planAttachment(
  input: AttachmentInput,
): { ok: true; attachment: NormalizedAttachment } | { ok: false; error: string } {
  const profile = workerProfileAttachment(input);
  if (profile.blocked) return { ok: false, error: profile.reason };

  const filename = safeDocumentFilename(input.filename ?? "");
  if (!filename) {
    return { ok: false, error: "Attach a CSV, PDF, or spreadsheet, with an ordinary filename." };
  }
  const mime = mimeFor(filename, input.mime);
  if (!mime) return { ok: false, error: "That file type cannot be attached on WhatsApp." };

  const hasContent = input.hasContent === true;
  const bucketRaw = (input.storageBucket ?? "").trim();
  const path = (input.storagePath ?? "").trim();
  if (hasContent && (bucketRaw || path)) {
    return { ok: false, error: "Attach the file, or name a file already stored, not both." };
  }
  if (!hasContent && !path) {
    return { ok: false, error: "Attach the file, or give the path of a file already stored." };
  }
  if (path && (path.includes("..") || path.startsWith("/") || path.includes("\\"))) {
    return { ok: false, error: "That storage path is not usable." };
  }

  const bucket = hasContent ? WHATSAPP_DRAFT_BUCKET : bucketRaw || "documents";
  if (!WHATSAPP_ATTACHMENT_BUCKETS.includes(bucket as (typeof WHATSAPP_ATTACHMENT_BUCKETS)[number])) {
    return { ok: false, error: "That file is not in a bucket WhatsApp drafts may use." };
  }

  const kind = (input.kind ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_") || null;
  const sourceTable = (input.sourceTable ?? "").trim().toLowerCase() || null;
  return {
    ok: true,
    attachment: {
      filename,
      mime,
      kind,
      sourceTable,
      bucket,
      path: hasContent ? null : path,
    },
  };
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+|00)\d[\d\s().-]{6,}\d/;
const RATE =
  /\b(?:hourly[\s_-]*rates?|daily[\s_-]*rates?|salar(?:y|ies)|€\s?\d|\d+\s?(?:€|eur)\s*\/\s*(?:h|hr|hour|day))\b/i;
const IDENTITY_LABEL =
  /\b(?:full[\s_-]*names?|date\s+of\s+birth|d\.?\s?o\.?\s?b\.?|passport\s*(?:number|no\.?|#)|national[\s_-]*ids?|ibans?)\b/i;

/**
 * The words on the draft. Anonymised bio facts may stay. Contact details, a
 * rate, an identity field, or a request to send the full CV may not.
 */
export function draftTextAllowed(text: string): { ok: true } | { ok: false; error: string } {
  const body = text ?? "";
  if (!body.trim()) return { ok: true };
  if (EMAIL.test(body)) {
    return {
      ok: false,
      error: "That reply includes an email address. An anonymised bio has no contact details, and a CV does not leave by WhatsApp.",
    };
  }
  if (PHONE.test(body)) {
    return {
      ok: false,
      error: "That reply includes a phone number. An anonymised bio has no contact details, and a CV does not leave by WhatsApp.",
    };
  }
  if (RATE.test(body)) {
    return { ok: false, error: "That reply includes a rate. Rates stay in Triangle." };
  }
  if (IDENTITY_LABEL.test(body)) {
    return {
      ok: false,
      error: "That reply includes a worker's identity. An anonymised bio uses initials, role, tickets, and availability.",
    };
  }
  if (explicitPackIntent(body) === "full_cv") {
    return {
      ok: false,
      error: "That reply would send a full CV. A CV does not leave by WhatsApp. Initials, role, tickets, and availability may.",
    };
  }
  return { ok: true };
}

export function decodeDraftDocument(
  raw: string,
): { ok: true; bytes: Buffer } | { ok: false; error: string } {
  const compact = raw.replace(/\s/g, "");
  if (!compact || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length % 4 !== 0) {
    return { ok: false, error: "That document was not readable." };
  }
  const bytes = Buffer.from(compact, "base64");
  if (bytes.length < 1) return { ok: false, error: "That document was empty." };
  if (bytes.length > WHATSAPP_DOCUMENT_MAX_BYTES) {
    return { ok: false, error: "That document is larger than 4 MB. WhatsApp drafts stay under that." };
  }
  return { ok: true, bytes };
}
