// ---------------------------------------------------------------------------
// Who acts on a WhatsApp message, and what may leave with the reply.
//
// Decisions only. No database, no fetch, no send.
//
// Scout takes a contractor, company, or subcontractor list, or a research
// request. Bob takes a commercial or client follow-up. Hanna takes resourcing:
// people, CVs, availability, roles. When the words match more than one, or
// none, the message is unsure and goes to Hanna.
// A model may decide first. An unsure or missing model answer uses the
// keyword rule.
//
// Who a role may reach lives in WHATSAPP_SENDERS. The numbers are not here:
// the repository is public. WHATSAPP_OWNER_NUMBERS and WHATSAPP_FIELD_NUMBERS
// supply the E.164 lists. Add a bot by appending one object to
// WHATSAPP_EMPLOYEES and listing its key on a role. A number on neither list
// is stored and does not wake anyone. A field number cannot ask for a
// software change and cannot ask for an email to be sent. Those are refused
// as drafts. Nothing here sends.
//
// Data rule. An owner or field number may receive a CV, a worker profile, a
// financial document, or a mission document. Everyone else is blocked from
// CVs, worker profiles, and financial documents. A draft may still carry one
// contractor, company, or subcontractor list. The words may say what an
// anonymised bio may say — initials, role, tickets, languages, right-to-work,
// dated availability — and may not carry an email, a phone number, a rate,
// or an IBAN. Asking to be sent a document is not a request to email someone
// else.
// ---------------------------------------------------------------------------

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
  "No CV or worker profile leaves Triangle by WhatsApp except to an owner or field number, and a financial document is the same. A draft may carry one contractor, company, or subcontractor list. The words may say what an anonymised bio may say — initials, role, tickets, languages, availability — and may not carry an email, a phone number, a rate, or an IBAN.";

export const ROUTE_MODEL_INSTRUCTIONS = [
  "You route one inbound WhatsApp message.",
  'Reply with JSON only: {"employee":"<employee key or unsure>","reason":"short"}',
  "scout: a contractor, company, or subcontractor list, a research request, or a project or market question.",
  "bob: a commercial or client follow-up, or finance — an invoice, a bank statement, a payment, accounting, or payment status (unpaid, paid, invoice status).",
  "hanna: resourcing — people, CVs, talent, availability, or roles.",
  "unsure: more than one, none, or you are not sure.",
  "Use only an employee key you were given, or unsure.",
  "The reason is one short sentence and does not quote the message.",
].join(" ");

/** Exact sentence Bob's handoff carries when this sender may not cause an email to go out. */
export const NO_OUTBOUND_EMAIL_HANDOFF = "requester may not trigger outbound email";

export const SOFTWARE_REFUSAL_DRAFT =
  "I can't take a change to the software on WhatsApp. I've left it with the owner. Nothing has been changed.";

export const EMAIL_REFUSAL_DRAFT =
  "I can't send an email from this chat. I've left it with the owner. Nothing was sent.";

export const DEFAULT_WHATSAPP_EMPLOYEE = "hanna";

export interface WhatsAppEmployeeDef {
  key: string;
  roleKeys: readonly string[];
  displayNames: readonly string[];
  /** Sole match routes here. Several matches, or none, go to Hanna. */
  patterns: readonly RegExp[];
  reason: string;
}

/**
 * One object per bot. A later bot is another object — web design, accounting —
 * plus its key on the senders who may reach it. Routing and permissions
 * already walk this list.
 */
export const WHATSAPP_EMPLOYEES: readonly WhatsAppEmployeeDef[] = [
  {
    key: "scout",
    roleKeys: ["project_researcher", "triangle_scout"],
    displayNames: ["scout"],
    reason: "Contractor, company, subcontractor, project, market, or research request, so Scout.",
    patterns: [
      /\bsub[\s-]?contractors?\b/i,
      /\bcontractors?\b/i,
      /\bcompan(?:y|ies)\b/i,
      /\bsuppliers?\b/i,
      /\bresearch\b/i,
      /\b(?:epc|general contractor)\b/i,
      /\bwho\s+(?:is|are)\s+(?:the\s+)?(?:owner|developer|buyer)\b/i,
      /\bprojects?\b/i,
      /\bmarkets?\b/i,
      /\b(?:unternehmen|recherche|firmen|markt|projekte?)\b/i,
      /istra[zž]iv/i,
      /tr[zž]i[sš]t/i,
      /poduze[cć]/i,
      /\btvrtk/i,
    ],
  },
  {
    key: "bob",
    roleKeys: ["inbox_coordinator", "inbox_courier", "commercial_ops", "triangle_bob_nikola"],
    displayNames: ["bob"],
    reason: "Commercial, client, or finance, so Bob.",
    patterns: [
      /\bfollow[\s-]?ups?\b/i,
      /\bclients?\b/i,
      /\bcommercial\b/i,
      /\b(?:quotes?|quotations?|proposals?|invoices?)\b/i,
      /\bchas(?:e|ing)\b/i,
      /\bcontracts?\b/i,
      /\bbank\s+statements?\b/i,
      /\bizvod(?:i|a)?\b/i,
      /ra[cč]un(?:i|a|e)?(?![a-zčćđšž])/i,
      /\bpayments?\b/i,
      /\b(?:payroll|accounting|bookkeeping)\b/i,
      /\bkontoausz(?:ug|üge)\b/i,
      /\brechnungen?\b/i,
      /\bzahlungen?\b/i,
      /\buplat[aei]\b/i,
      /pla[cć]anj/i,
      /nepla[cć]en/i,
      /\bunpaid\b/i,
      /\bpaid\b/i,
      /\bpayment\s+status\b/i,
      /\binvoice\s+status\b/i,
      /\boffene\s+rechnungen\b/i,
      /\bwhat(?:'s|s| has)\s+been\s+paid\b/i,
    ],
  },
  {
    key: "hanna",
    roleKeys: ["hr", "triangle_hr", "resourcing"],
    displayNames: ["hanna"],
    reason: "Resourcing — people, CVs, talent, availability, or roles — so Hanna.",
    patterns: [
      /\b(?:cvs?|resumes?|curriculum(?:\s+vitae)?)\b/i,
      /\bavailab(?:le|ility)\b/i,
      /\broles?\b/i,
      /\b(?:people|person|persons)\b/i,
      /\b(?:engineers?|technicians?|commissioning)\b/i,
      /\b(?:candidates?|workers?|crew)\b/i,
      /\bput\s+forward\b/i,
      /\bbios?\b/i,
      /\bheadcount\b/i,
      /\btalents?\b/i,
      /\blebenslauf\b/i,
      /lebensl[aä]uf/i,
      /[zž]ivotopis/i,
      /\bradni(?:k|ci|ka|ke)\b/i,
    ],
  },
];

export interface SenderRole {
  /** Stable id. Not a person's name, and not a phone number. */
  id: string;
  /** "all", or the employee keys this role may wake. */
  employees: "all" | readonly string[];
  mayRequestSoftwareChange: boolean;
  mayTriggerOutboundEmail: boolean;
}

/**
 * Roles only. No E.164 values belong in this file.
 * owner — may talk to every bot, including ones added later.
 * field — Hanna, Bob, and Scout only. No software change. No outbound email.
 */
export const WHATSAPP_SENDERS: readonly SenderRole[] = [
  {
    id: "owner",
    employees: "all",
    mayRequestSoftwareChange: true,
    mayTriggerOutboundEmail: true,
  },
  {
    id: "field",
    employees: ["hanna", "bob", "scout"],
    mayRequestSoftwareChange: false,
    mayTriggerOutboundEmail: false,
  },
];

export interface SenderPermission extends SenderRole {
  /** E.164 taken from the environment at startup. */
  e164: string;
}

/** A number on neither list. Stored, and never woken. */
export const UNLISTED_SENDER: SenderPermission = {
  id: "unlisted",
  e164: "",
  employees: [],
  mayRequestSoftwareChange: false,
  mayTriggerOutboundEmail: false,
};

export interface SenderDirectory {
  /** True when at least one owner or field number was parsed. */
  active: boolean;
  allowlist: string[];
  senders: SenderPermission[];
}

export interface RouteDecision {
  employee: string;
  reason: string;
  /** True when the choice is the default because the words were not clear. */
  unsure: boolean;
}

export interface ModelRoute {
  employee: string;
  reason: string;
}

export interface InboundPlan {
  action: "route" | "refuse";
  employee: string | null;
  reason: string;
  unsure: boolean;
  /** Set on Bob's handoff when this sender must not cause an email. */
  handoffNote: string | null;
  /** Polite draft. Null when the message is routed. */
  draftText: string | null;
  flagOwner: boolean;
}

const SOFTWARE_PATTERNS: RegExp[] = [
  /\b(?:change|modify|fix|update|deploy|rewrite|patch)\b[\s\S]{0,48}\b(?:software|app|codebase|code|product)\b/i,
  /\btriangle\s+engineer\b/i,
  /\bservices\s+os\b/i,
  /\badd (?:a |an )?(?:button|page|feature|screen)\b/i,
  /\bbugs?\b[\s\S]{0,24}\b(?:app|software|code|codebase)\b/i,
];

const EMAIL_SEND_PATTERNS: RegExp[] = [
  /\b(?:send|shoot|dispatch)\b[\s\S]{0,40}\be-?mails?\b/i,
  /\b(?:ask|tell|have)\s+bob\s+to\s+(?:e-?mail|mail|send)\b/i,
  /\be-?mail\s+(?:the\s+)?(?:client|buyer|customer|them|him|her)\b/i,
];

export function asksForSoftwareChange(text: string): boolean {
  return SOFTWARE_PATTERNS.some((pattern) => pattern.test(text));
}

/** The sender wants the document back on this chat, not emailed to someone else. */
function asksForDocumentBack(text: string): boolean {
  return /\bsend\s+me\b/i.test(text) || /\bpo[sš]alji\s+mi\b/i.test(text);
}

/** An email that would leave to a third party, including through Bob. */
function asksToEmailSomeoneElse(text: string): boolean {
  return (
    /\b(?:ask|tell|have)\s+bob\s+to\s+(?:e-?mail|mail|send)\b/i.test(text) ||
    /\be-?mail\s+(?:the\s+)?(?:client|buyer|customer|them|him|her)\b/i.test(text) ||
    /\b(?:send|shoot|dispatch)\b[\s\S]{0,48}\be-?mails?\b[\s\S]{0,40}\bto\s+(?!me\b)\w+/i.test(text)
  );
}

export function asksToSendEmail(text: string): boolean {
  if (asksForDocumentBack(text) && !asksToEmailSomeoneElse(text)) return false;
  return EMAIL_SEND_PATTERNS.some((pattern) => pattern.test(text));
}

function asE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.trim().replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function parseE164List(raw: string | null | undefined): string[] {
  if (raw == null || raw.trim() === "") return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const number = asE164(part);
    if (number) seen.add(number);
  }
  return [...seen];
}

function roleById(id: string): SenderRole {
  const role = WHATSAPP_SENDERS.find((item) => item.id === id);
  if (!role) return UNLISTED_SENDER;
  return role;
}

/**
 * Bind the role map to the numbers from the environment.
 * A number on both lists is the owner. The allowlist is the union.
 */
export function bindWhatsAppSenders(
  ownerRaw: string | null | undefined,
  fieldRaw: string | null | undefined,
): SenderDirectory {
  const owners = parseE164List(ownerRaw);
  const ownerSet = new Set(owners);
  const fields = parseE164List(fieldRaw).filter((number) => !ownerSet.has(number));
  const owner = roleById("owner");
  const field = roleById("field");
  const senders: SenderPermission[] = [
    ...owners.map((e164) => ({ ...owner, e164 })),
    ...fields.map((e164) => ({ ...field, e164 })),
  ];
  return {
    active: senders.length > 0,
    allowlist: senders.map((sender) => sender.e164),
    senders,
  };
}

/** Numbers from the deprecated allowlist. They are the field role, never owner. */
export function fieldSendersFor(numbers: readonly string[]): SenderPermission[] {
  const field = roleById("field");
  return numbers.map((e164) => ({ ...field, e164 }));
}

export function permissionFor(
  from: string,
  senders: readonly SenderPermission[] = [],
  unmatched: "unlisted" | "field" = "unlisted",
): SenderPermission {
  const number = asE164(from);
  if (!number) return UNLISTED_SENDER;
  const hit = senders.find((sender) => asE164(sender.e164) === number);
  if (hit) return hit;
  if (unmatched === "field") return { ...roleById("field"), e164: number };
  return UNLISTED_SENDER;
}

export function senderMayTalkTo(sender: SenderPermission, employeeKey: string): boolean {
  if (sender.employees === "all") return true;
  return sender.employees.includes(employeeKey);
}

const PAYMENT_STATUS_PATTERNS: readonly RegExp[] = [
  /\bunpaid\b/i,
  /\bpaid\b/i,
  /\bpayment\s+status\b/i,
  /\binvoice\s+status\b/i,
  /nepla[cć]en[a-zčćđšž]*\s+ra[cč]un/i,
  /\boffene\s+rechnungen\b/i,
  /\bwhat(?:'s|s| has)\s+been\s+paid\b/i,
];

/** Unpaid, paid, or invoice status. These go to Bob even when other words also match. */
export function asksPaymentStatus(text: string): boolean {
  return PAYMENT_STATUS_PATTERNS.some((pattern) => pattern.test(text));
}

export function keywordRoute(
  text: string,
  employees: readonly WhatsAppEmployeeDef[] = WHATSAPP_EMPLOYEES,
): RouteDecision {
  if (asksPaymentStatus(text)) {
    const bob = employees.find((employee) => employee.key === "bob");
    if (bob) return { employee: "bob", reason: bob.reason, unsure: false };
  }
  const hits = employees.filter((employee) => employee.patterns.some((pattern) => pattern.test(text)));
  if (hits.length === 1) {
    return { employee: hits[0].key, reason: hits[0].reason, unsure: false };
  }
  if (hits.length > 1) {
    return {
      employee: DEFAULT_WHATSAPP_EMPLOYEE,
      reason: "Unsure — it matches more than one employee — so Hanna.",
      unsure: true,
    };
  }
  return { employee: DEFAULT_WHATSAPP_EMPLOYEE, reason: "Unsure, so Hanna.", unsure: true };
}

export function parseModelRoute(
  raw: string | null | undefined,
  employees: readonly WhatsAppEmployeeDef[] = WHATSAPP_EMPLOYEES,
): ModelRoute | null {
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
    const employee = typeof parsed.employee === "string" ? parsed.employee.trim().toLowerCase() : "";
    const known = employees.some((item) => item.key === employee);
    if (employee !== "unsure" && !known && !/^[a-z][a-z0-9_]{0,63}$/.test(employee)) return null;
    if (!employee) return null;
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
export function resolveRoute(
  text: string,
  model: ModelRoute | null,
  employees: readonly WhatsAppEmployeeDef[] = WHATSAPP_EMPLOYEES,
): RouteDecision {
  const known = employees.some((item) => item.key === model?.employee);
  if (model && known && model.employee !== "unsure") {
    const label = employees.find((item) => item.key === model.employee)?.reason ?? model.employee;
    return {
      employee: model.employee,
      reason: sanitizeRouteReason(model.reason, text) || label,
      unsure: false,
    };
  }
  return keywordRoute(text, employees);
}

/** Display name for the acknowledgment. Unknown keys have no label. */
export function whatsAppEmployeeLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  const known = WHATSAPP_EMPLOYEES.find((item) => item.key === key);
  const raw = known?.displayNames[0];
  if (!raw) return null;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function employeeKeyOf(
  employee: { roleKey: string; displayName: string },
  employees: readonly WhatsAppEmployeeDef[] = WHATSAPP_EMPLOYEES,
): string | null {
  const role = employee.roleKey;
  const name = employee.displayName.trim().toLowerCase();
  const hit = employees.find(
    (item) => item.roleKeys.includes(role) || item.displayNames.includes(name),
  );
  return hit?.key ?? null;
}

export function isScoutEmployee(employee: { roleKey: string; displayName: string }): boolean {
  return employeeKeyOf(employee) === "scout";
}

export function employeeMayDraftWhatsApp(employee: {
  roleKey: string;
  displayName: string;
}): boolean {
  return employeeKeyOf(employee) !== null;
}

function refuse(reason: string, draftText: string): InboundPlan {
  return {
    action: "refuse",
    employee: null,
    reason,
    unsure: false,
    handoffNote: null,
    draftText,
    flagOwner: true,
  };
}

/**
 * Permissions first, then the route. A software change or an email-send ask
 * from a sender who may not make it never wakes a bot. A routed employee the
 * sender cannot reach falls back to Hanna when Hanna is allowed.
 */
export function decideInbound(input: {
  text: string;
  from: string;
  model?: ModelRoute | null;
  senders?: readonly SenderPermission[];
  unmatched?: "unlisted" | "field";
  employees?: readonly WhatsAppEmployeeDef[];
}): InboundPlan {
  const employees = input.employees ?? WHATSAPP_EMPLOYEES;
  const sender = permissionFor(input.from, input.senders ?? [], input.unmatched ?? "unlisted");
  if (sender.id === "unlisted") {
    return {
      action: "route",
      employee: null,
      reason: "Not on the sender list. Stored. Nobody was woken.",
      unsure: false,
      handoffNote: null,
      draftText: null,
      flagOwner: false,
    };
  }
  if (asksForSoftwareChange(input.text) && !sender.mayRequestSoftwareChange) {
    return refuse(
      "Refused: this sender may not ask for a software change. Flagged for the owner.",
      SOFTWARE_REFUSAL_DRAFT,
    );
  }
  if (asksToSendEmail(input.text) && !sender.mayTriggerOutboundEmail) {
    return refuse(
      "Refused: this sender may not ask for an email to be sent. Flagged for the owner.",
      EMAIL_REFUSAL_DRAFT,
    );
  }

  let route = resolveRoute(input.text, input.model ?? null, employees);
  if (!employees.some((item) => item.key === route.employee)) {
    route = { employee: DEFAULT_WHATSAPP_EMPLOYEE, reason: "Unsure, so Hanna.", unsure: true };
  }
  if (!senderMayTalkTo(sender, route.employee)) {
    if (senderMayTalkTo(sender, DEFAULT_WHATSAPP_EMPLOYEE)) {
      route = {
        employee: DEFAULT_WHATSAPP_EMPLOYEE,
        reason: "This sender cannot reach that employee, so Hanna.",
        unsure: true,
      };
    } else {
      return refuse(
        "Refused: this sender cannot reach that employee. Flagged for the owner.",
        "I can't pass that on from this chat. I've left it with the owner.",
      );
    }
  }

  const handoffNote =
    route.employee === "bob" && !sender.mayTriggerOutboundEmail ? NO_OUTBOUND_EMAIL_HANDOFF : null;
  return {
    action: "route",
    employee: route.employee,
    reason: route.reason,
    unsure: route.unsure,
    handoffNote,
    draftText: null,
    flagOwner: false,
  };
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

export type DocumentRecipient = "owner" | "field" | "other";

export function whatsAppRecipientRole(
  to: string,
  senders: readonly SenderPermission[],
): DocumentRecipient {
  const number = asE164(to);
  if (!number) return "other";
  const listed = senders.find((sender) => asE164(sender.e164) === number);
  if (listed?.id === "owner") return "owner";
  if (listed?.id === "field") return "field";
  return "other";
}

const FINANCIAL_KINDS = new Set([
  "invoice",
  "unpaid_invoice",
  "bank",
  "bank_statement",
  "bank_pdf",
  "izvod",
  "payroll",
  "payslip",
  "tax",
  "tax_return",
  "financial",
  "finance",
]);

const FINANCIAL_SOURCES = new Set([
  "invoices",
  "invoice",
  "bank_statements",
  "bank_statement",
  "payroll",
  "payslips",
  "tax",
  "finance",
  "financial",
]);

/** Invoices, bank statements, izvod, payroll, and tax. Not a contractor list. */
export function financialDocument(
  input: AttachmentInput,
): { blocked: true; reason: string } | { blocked: false } {
  const kind = (input.kind ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const source = (input.sourceTable ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const file = (input.filename ?? "").trim();
  const label = `${file} ${input.title ?? ""}`;
  if ((kind && FINANCIAL_KINDS.has(kind)) || (source && FINANCIAL_SOURCES.has(source))) {
    return { blocked: true, reason: "A financial document does not leave by WhatsApp." };
  }
  if (
    /\b(?:invoices?|izvod(?:i|a)?|payrolls?|payslips?)\b/i.test(label) ||
    /\bbank[\s_-]+(?:statements?|pdfs?|exports?)\b/i.test(label) ||
    /(?:^|[\s_-])bank\.pdf$/i.test(file) ||
    /\b(?:tax[\s_-]*(?:returns?|pdfs?|statements?)|account[\s_-]*statements?)\b/i.test(label)
  ) {
    return { blocked: true, reason: "A financial document does not leave by WhatsApp." };
  }
  return { blocked: false };
}

/**
 * Owner and field may receive a CV, a worker profile, a financial document,
 * or a mission document. Everyone else is blocked from the first three.
 * A missing role is everyone else.
 */
export function documentBlockedForRecipient(
  input: AttachmentInput,
  recipient: DocumentRecipient | null | undefined,
): { blocked: true; reason: string } | { blocked: false } {
  if (recipient === "owner" || recipient === "field") return { blocked: false };
  const profile = workerProfileAttachment(input);
  if (profile.blocked) return profile;
  return financialDocument(input);
}

/**
 * A path in the documents bucket is usable only when this organisation has
 * the row. A draft uploaded into whatsapp-drafts has no such row.
 */
export function storedDocumentRowRequired(
  bucket: string | null | undefined,
  rowFound: boolean,
): { ok: true } | { ok: false; error: string } {
  if ((bucket ?? "").trim() === "documents" && !rowFound) {
    return { ok: false, error: "That file is not stored for this organisation." };
  }
  return { ok: true };
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
  recipient: DocumentRecipient | null = "other",
): { ok: true; attachment: NormalizedAttachment } | { ok: false; error: string } {
  const blocked = documentBlockedForRecipient(input, recipient);
  if (blocked.blocked) return { ok: false, error: blocked.reason };

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
