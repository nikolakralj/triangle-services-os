import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { EmailClassification, ExtractedLead } from "@/lib/job-intake/extract";

// ---------------------------------------------------------------------------
// Data layer for Job Intake: inbound agency mail and the leads extracted
// from it. Mirrors the org-scoped service-client pattern used elsewhere.
// ---------------------------------------------------------------------------

export interface JobLead {
  id: string;
  inboundEmailId: string | null;
  agencyName: string | null;
  contactName: string | null;
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
  teamPotential: number | null;
  teamRationale: string | null;
  requestedDocuments: string[];
  missingFields: string[];
  status: "new" | "reviewing" | "replied" | "qualified" | "rejected" | "archived";
  duplicateOfId: string | null;
  discoveredProjectId: string | null;
  notes: string | null;
  createdAt: string;
  /** Joined from inbound_emails when available. */
  subject: string | null;
  receivedAt: string | null;
}

export interface IntakeCounts {
  leads: number;
  newLeads: number;
  highPotential: number;
  duplicates: number;
  emailsProcessed: number;
  noiseRejected: number;
}

type LeadRow = Record<string, unknown>;

function rowToLead(row: LeadRow, email?: Record<string, unknown> | null): JobLead {
  return {
    id: String(row.id),
    inboundEmailId: (row.inbound_email_id as string) ?? null,
    agencyName: (row.agency_name as string) ?? null,
    contactName: (row.contact_name as string) ?? null,
    contactEmail: (row.contact_email as string) ?? null,
    clientCompany: (row.client_company as string) ?? null,
    roleTitle: String(row.role_title ?? ""),
    country: (row.country as string) ?? null,
    city: (row.city as string) ?? null,
    sector: (row.sector as string) ?? null,
    technologies: Array.isArray(row.technologies) ? (row.technologies as string[]) : [],
    durationMonths: (row.duration_months as number) ?? null,
    startDateText: (row.start_date_text as string) ?? null,
    rateText: (row.rate_text as string) ?? null,
    headcountText: (row.headcount_text as string) ?? null,
    workMode: (row.work_mode as string) ?? null,
    teamPotential: (row.team_potential as number) ?? null,
    teamRationale: (row.team_rationale as string) ?? null,
    requestedDocuments: Array.isArray(row.requested_documents)
      ? (row.requested_documents as string[]) : [],
    missingFields: Array.isArray(row.missing_fields)
      ? (row.missing_fields as string[]) : [],
    status: (row.status as JobLead["status"]) ?? "new",
    duplicateOfId: (row.duplicate_of_id as string) ?? null,
    discoveredProjectId: (row.discovered_project_id as string) ?? null,
    notes: (row.notes as string) ?? null,
    createdAt: String(row.created_at ?? ""),
    subject: (email?.subject as string) ?? null,
    receivedAt: (email?.sent_at as string) ?? null,
  };
}

/**
 * List leads for the org, best crew opportunities first. Duplicates are
 * hidden by default — they're linked to the original instead.
 */
export type LeadSort = "score" | "newest" | "oldest";

export async function listJobLeads(
  orgId: string,
  opts: {
    status?: string;
    includeDuplicates?: boolean;
    limit?: number;
    sort?: LeadSort;
  } = {},
): Promise<JobLead[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  let query = svc
    .from("job_leads")
    .select("*")
    .eq("org_id", orgId)
    .order("team_potential", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.status) query = query.eq("status", opts.status);
  if (!opts.includeDuplicates) query = query.is("duplicate_of_id", null);

  const { data, error } = await query;
  if (error || !data) return [];

  // Enrich with the originating email's subject + received date.
  const emailIds = data
    .map((r) => r.inbound_email_id as string | null)
    .filter((id): id is string => Boolean(id));

  const emailMap = new Map<string, Record<string, unknown>>();
  if (emailIds.length > 0) {
    const { data: emails } = await svc
      .from("inbound_emails")
      .select("id, subject, sent_at")
      .in("id", emailIds);
    for (const e of emails ?? []) emailMap.set(e.id as string, e);
  }

  const leads = data.map((row) =>
    rowToLead(row, emailMap.get(String(row.inbound_email_id))),
  );

  // Date ordering happens here rather than in SQL: the date that matters is
  // when the recruiter sent the mail, which lives on inbound_emails, not on
  // the lead row. Falls back to createdAt when a lead has no linked email.
  const sort = opts.sort ?? "score";
  if (sort === "score") return leads;

  const timeOf = (l: JobLead) =>
    new Date(l.receivedAt ?? l.createdAt).getTime() || 0;

  return leads.sort((a, b) =>
    sort === "newest" ? timeOf(b) - timeOf(a) : timeOf(a) - timeOf(b),
  );
}

export async function getIntakeCounts(orgId: string): Promise<IntakeCounts> {
  const svc = createServiceSupabaseClient();
  const empty: IntakeCounts = {
    leads: 0, newLeads: 0, highPotential: 0,
    duplicates: 0, emailsProcessed: 0, noiseRejected: 0,
  };
  if (!svc) return empty;

  const head = { count: "exact" as const, head: true };
  const leadsQ = () => svc.from("job_leads").select("id", head).eq("org_id", orgId);
  const mailQ = () => svc.from("inbound_emails").select("id", head).eq("org_id", orgId);

  const [leads, newLeads, highPotential, duplicates, emailsProcessed, noiseRejected] =
    await Promise.all([
      leadsQ().is("duplicate_of_id", null),
      leadsQ().eq("status", "new").is("duplicate_of_id", null),
      leadsQ().gte("team_potential", 70).is("duplicate_of_id", null),
      leadsQ().not("duplicate_of_id", "is", null),
      mailQ(),
      mailQ().neq("classification", "job_opportunity"),
    ]);

  return {
    leads: leads.count ?? 0,
    newLeads: newLeads.count ?? 0,
    highPotential: highPotential.count ?? 0,
    duplicates: duplicates.count ?? 0,
    emailsProcessed: emailsProcessed.count ?? 0,
    noiseRejected: noiseRejected.count ?? 0,
  };
}

/**
 * Record an ingested email. Idempotent on (org_id, provider_message_id) so
 * re-running ingestion never duplicates. Returns the row id, or null if the
 * message was already stored.
 */
export async function recordInboundEmail(params: {
  orgId: string;
  mailAccountId: string | null;
  providerMessageId: string;
  providerThreadId: string | null;
  senderEmail: string | null;
  senderName: string | null;
  recipientEmail: string | null;
  subject: string;
  sentAt: string | null;
  classification: EmailClassification;
  confidence: number;
  reason: string;
  /** Pass null for anything that isn't a real opportunity — we discard it. */
  bodyText: string | null;
}): Promise<{ id: string; alreadyExisted: boolean } | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data: existing } = await svc
    .from("inbound_emails")
    .select("id")
    .eq("org_id", params.orgId)
    .eq("provider_message_id", params.providerMessageId)
    .maybeSingle();

  if (existing) return { id: existing.id as string, alreadyExisted: true };

  const { data, error } = await svc
    .from("inbound_emails")
    .insert({
      org_id: params.orgId,
      mail_account_id: params.mailAccountId,
      provider_message_id: params.providerMessageId,
      provider_thread_id: params.providerThreadId,
      sender_email: params.senderEmail,
      sender_name: params.senderName,
      recipient_email: params.recipientEmail,
      subject: params.subject,
      sent_at: params.sentAt,
      body_text: params.bodyText,
      body_discarded: params.bodyText === null,
      classification: params.classification,
      classification_confidence: params.confidence,
      classification_reason: params.reason,
      processed_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id as string, alreadyExisted: false };
}

/**
 * Insert an extracted lead, linking it to an existing near-identical lead
 * when one is found (same agency + role within 14 days).
 */
export async function createJobLead(params: {
  orgId: string;
  inboundEmailId: string;
  contactEmail: string | null;
  lead: ExtractedLead;
}): Promise<string | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const duplicateOfId = await findDuplicateLead(params.orgId, params.lead);

  const { data, error } = await svc
    .from("job_leads")
    .insert({
      org_id: params.orgId,
      inbound_email_id: params.inboundEmailId,
      agency_name: params.lead.agencyName,
      contact_name: params.lead.contactName,
      contact_email: params.contactEmail,
      client_company: params.lead.clientCompany,
      role_title: params.lead.roleTitle,
      country: params.lead.country,
      city: params.lead.city,
      sector: params.lead.sector,
      technologies: params.lead.technologies,
      duration_months: params.lead.durationMonths,
      start_date_text: params.lead.startDateText,
      rate_text: params.lead.rateText,
      headcount_text: params.lead.headcountText,
      work_mode: params.lead.workMode,
      team_potential: params.lead.teamPotential,
      team_rationale: params.lead.teamRationale,
      requested_documents: params.lead.requestedDocuments,
      missing_fields: params.lead.missingFields,
      duplicate_of_id: duplicateOfId,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) return null;
  return data.id as string;
}

/**
 * Cheap dedup: same agency + very similar role title within 14 days.
 * Real case from live mail — the same Ireland commissioning role arrived on
 * consecutive days with subjects differing only by a double space.
 */
async function findDuplicateLead(
  orgId: string,
  lead: ExtractedLead,
): Promise<string | null> {
  const svc = createServiceSupabaseClient();
  if (!svc || !lead.agencyName) return null;

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await svc
    .from("job_leads")
    .select("id, role_title")
    .eq("org_id", orgId)
    .eq("agency_name", lead.agencyName)
    .is("duplicate_of_id", null)
    .gte("created_at", since);

  const target = normaliseTitle(lead.roleTitle);
  for (const row of data ?? []) {
    if (normaliseTitle(String(row.role_title)) === target) return row.id as string;
  }
  return null;
}

function normaliseTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// ── house rules ─────────────────────────────────────────────────────────────

export interface IntakeRules {
  body: string;
  updatedAt: string | null;
}

/** The org's own scoring/classification rules. Null when never written. */
export async function getIntakeRules(orgId: string): Promise<IntakeRules | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data, error } = await svc
    .from("job_intake_rules")
    .select("body, updated_at")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error || !data) return null;
  return { body: data.body ?? "", updatedAt: data.updated_at ?? null };
}

const MAX_RULES_LENGTH = 8000;

export async function upsertIntakeRules(params: {
  orgId: string;
  body: string;
  userId: string | null;
}): Promise<IntakeRules | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data, error } = await svc
    .from("job_intake_rules")
    .upsert(
      {
        org_id: params.orgId,
        body: (params.body ?? "").slice(0, MAX_RULES_LENGTH),
        updated_by: params.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    )
    .select("body, updated_at")
    .maybeSingle();
  if (error || !data) return null;
  return { body: data.body ?? "", updatedAt: data.updated_at ?? null };
}

// ── reply drafts ────────────────────────────────────────────────────────────

export interface LeadReplyDraft {
  id: string;
  jobLeadId: string;
  subject: string;
  body: string;
  asks: string[];
  language: string;
  status: "draft" | "sent" | "archived";
  sentAt: string | null;
  createdAt: string;
}

function rowToDraft(row: Record<string, unknown>): LeadReplyDraft {
  return {
    id: String(row.id),
    jobLeadId: String(row.job_lead_id),
    subject: String(row.subject ?? ""),
    body: String(row.body ?? ""),
    asks: Array.isArray(row.asks) ? (row.asks as string[]) : [],
    language: String(row.language ?? "en"),
    status: (row.status as LeadReplyDraft["status"]) ?? "draft",
    sentAt: (row.sent_at as string) ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}

/** Get a single lead (used by the draft endpoint). */
export async function getJobLead(
  leadId: string,
  orgId: string,
): Promise<JobLead | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data, error } = await svc
    .from("job_leads")
    .select("*")
    .eq("id", leadId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !data) return null;

  let email: Record<string, unknown> | null = null;
  if (data.inbound_email_id) {
    const { data: e } = await svc
      .from("inbound_emails")
      .select("id, subject, sent_at")
      .eq("id", data.inbound_email_id as string)
      .maybeSingle();
    email = e ?? null;
  }
  return rowToLead(data, email);
}

export async function listReplyDrafts(
  leadId: string,
  orgId: string,
): Promise<LeadReplyDraft[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];
  const { data } = await svc
    .from("lead_reply_drafts")
    .select("*")
    .eq("job_lead_id", leadId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToDraft);
}

export async function createReplyDraft(params: {
  orgId: string;
  jobLeadId: string;
  subject: string;
  body: string;
  asks: string[];
  language: string;
  userId: string | null;
}): Promise<LeadReplyDraft | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data, error } = await svc
    .from("lead_reply_drafts")
    .insert({
      org_id: params.orgId,
      job_lead_id: params.jobLeadId,
      subject: params.subject,
      body: params.body,
      asks: params.asks,
      language: params.language,
      created_by: params.userId,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return rowToDraft(data);
}

/**
 * Update a draft: edit its text, or mark it sent. "Sent" is recorded because
 * the user sent it from their own mail client — this app never sends.
 */
export async function updateReplyDraft(params: {
  draftId: string;
  orgId: string;
  subject?: string;
  body?: string;
  status?: LeadReplyDraft["status"];
}): Promise<LeadReplyDraft | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const patch: Record<string, unknown> = {};
  if (params.subject !== undefined) patch.subject = params.subject;
  if (params.body !== undefined) patch.body = params.body;
  if (params.status !== undefined) {
    patch.status = params.status;
    if (params.status === "sent") patch.sent_at = new Date().toISOString();
  }
  if (Object.keys(patch).length === 0) return null;

  const { data, error } = await svc
    .from("lead_reply_drafts")
    .update(patch)
    .eq("id", params.draftId)
    .eq("org_id", params.orgId)
    .select("*")
    .maybeSingle();

  if (error || !data) return null;
  return rowToDraft(data);
}

export async function updateLeadStatus(
  leadId: string,
  orgId: string,
  status: JobLead["status"],
): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;
  const { error } = await svc
    .from("job_leads")
    .update({ status })
    .eq("id", leadId)
    .eq("org_id", orgId);
  return !error;
}
