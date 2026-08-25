import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type OutreachChannel =
  | "linkedin_connect"
  | "linkedin_message"
  | "email_cold"
  | "email_followup";

export type OutreachStatus =
  | "draft"
  | "sent"
  | "replied"
  | "no_reply"
  | "archived";

export interface OutreachDraftRow {
  id: string;
  org_id: string;
  project_id: string;
  buyer_contact_id: string | null;
  buyer_suggestion_id: string | null;
  project_package_id: string | null;
  channel: OutreachChannel;
  subject: string | null;
  body: string;
  variant_group_id: string | null;
  variant_label: string | null;
  status: OutreachStatus;
  sent_at: string | null;
  replied_at: string | null;
  reply_summary: string | null;
  created_by_agent: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── List ─────────────────────────────────────────────────────────────────────

export async function listOutreachDrafts(
  projectId: string,
  orgId: string,
  options?: { status?: OutreachStatus; buyerContactId?: string },
): Promise<OutreachDraftRow[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  let query = svc
    .from("outreach_drafts")
    .select("*")
    .eq("project_id", projectId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (options?.status) query = query.eq("status", options.status);
  if (options?.buyerContactId) query = query.eq("buyer_contact_id", options.buyerContactId);

  const { data, error } = await query;
  if (error) {
    console.error("listOutreachDrafts:", error);
    return [];
  }
  return (data ?? []) as OutreachDraftRow[];
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createOutreachDraft(params: {
  orgId: string;
  projectId: string;
  buyerContactId?: string | null;
  buyerSuggestionId?: string | null;
  projectPackageId?: string | null;
  channel: OutreachChannel;
  subject?: string | null;
  body: string;
  variantGroupId?: string | null;
  variantLabel?: string | null;
  createdByAgent?: string | null;
  createdByUserId?: string | null;
}): Promise<{ id: string } | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data, error } = await svc
    .from("outreach_drafts")
    .insert({
      org_id: params.orgId,
      project_id: params.projectId,
      buyer_contact_id: params.buyerContactId ?? null,
      buyer_suggestion_id: params.buyerSuggestionId ?? null,
      project_package_id: params.projectPackageId ?? null,
      channel: params.channel,
      subject: params.subject ?? null,
      body: params.body,
      variant_group_id: params.variantGroupId ?? null,
      variant_label: params.variantLabel ?? null,
      created_by_agent: params.createdByAgent ?? null,
      created_by_user_id: params.createdByUserId ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("createOutreachDraft:", error);
    return null;
  }
  return data;
}

// ── Update body / subject (user edits before copy) ──────────────────────────

export async function updateOutreachDraft(
  id: string,
  orgId: string,
  updates: { subject?: string | null; body?: string },
): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;
  const { error } = await svc
    .from("outreach_drafts")
    .update(updates)
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) {
    console.error("updateOutreachDraft:", error);
    return false;
  }
  return true;
}

// ── Status transitions ───────────────────────────────────────────────────────

export async function markOutreachSent(
  id: string,
  orgId: string,
): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;
  const { error } = await svc
    .from("outreach_drafts")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) {
    console.error("markOutreachSent:", error);
    return false;
  }
  return true;
}

export async function markOutreachReplied(
  id: string,
  orgId: string,
  replySummary?: string,
): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;
  const { error } = await svc
    .from("outreach_drafts")
    .update({
      status: "replied",
      replied_at: new Date().toISOString(),
      reply_summary: replySummary ?? null,
    })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) {
    console.error("markOutreachReplied:", error);
    return false;
  }
  return true;
}

export async function archiveOutreachDraft(
  id: string,
  orgId: string,
): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;
  const { error } = await svc
    .from("outreach_drafts")
    .update({ status: "archived" })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) {
    console.error("archiveOutreachDraft:", error);
    return false;
  }
  return true;
}
