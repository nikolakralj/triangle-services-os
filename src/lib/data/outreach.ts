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

export interface MarkSentResult {
  ok: boolean;
  /** The commercial action this send was recorded as, if one was created. */
  actionId: string | null;
  error?: string;
}

/**
 * A human confirming they actually sent this.
 *
 * This used to flip `outreach_drafts.status` and nothing else, which produced
 * exactly the failure this product exists to prevent: seven drafts marked
 * sent — one of them already replied to — and an empty commercial action
 * ledger. Two records of the same event, one of them the one the Phase 0 gate
 * counts, and it said nothing had happened.
 *
 * The send is now written to `commercial_actions` in the same call. The
 * database's own rules apply: an external action needs a recipient, the final
 * content, an occurrence time, and a named human who confirms it. That last
 * requirement is why `userId` is not optional — an agent holding a machine key
 * must never be able to record that a human sent something.
 */
export async function markOutreachSent(
  id: string,
  orgId: string,
  userId: string | null,
  opts: { followUpAt?: string | null } = {},
): Promise<MarkSentResult> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, actionId: null, error: "No database client" };
  if (!userId) {
    return {
      ok: false,
      actionId: null,
      error:
        "Only a signed-in person can record a send. The ledger records who confirmed it.",
    };
  }

  const { data: draft, error: readError } = await svc
    .from("outreach_drafts")
    .select(
      "id, channel, subject, body, buyer_contact_id, buyer_suggestion_id, project_package_id",
    )
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (readError || !draft) {
    return { ok: false, actionId: null, error: "Draft not found" };
  }

  const recipient = await resolveRecipient(svc, draft, orgId);
  if (!recipient.name && !recipient.email && !recipient.company) {
    return {
      ok: false,
      actionId: null,
      error:
        "This draft has no recipient on record, so the send cannot be logged. Add the buyer contact first.",
    };
  }

  const now = new Date().toISOString();
  const { data: action, error: actionError } = await svc
    .from("commercial_actions")
    .insert({
      org_id: orgId,
      outreach_draft_id: draft.id,
      project_package_id: draft.project_package_id,
      action_type: ACTION_TYPE_FOR_CHANNEL[draft.channel as OutreachChannel] ?? "other",
      status: "completed",
      channel: draft.channel,
      sender_user_id: userId,
      recipient_name: recipient.name,
      recipient_email: recipient.email,
      recipient_company: recipient.company,
      subject: draft.subject,
      // The draft body IS the record of what went out. If the sender reworded
      // it in their mail client they are expected to edit the draft first —
      // the panel says so.
      ai_draft: draft.body,
      final_content: draft.body,
      occurred_at: now,
      follow_up_at: opts.followUpAt ?? null,
      human_confirmed_at: now,
      human_confirmed_by: userId,
      created_by: userId,
    })
    .select("id")
    .maybeSingle();

  if (actionError) {
    // The trigger refusing is the system working. Surface its words rather
    // than flipping the draft and pretending the send was recorded.
    console.error("markOutreachSent action:", actionError);
    return { ok: false, actionId: null, error: actionError.message };
  }

  const { error } = await svc
    .from("outreach_drafts")
    .update({ status: "sent", sent_at: now })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) {
    console.error("markOutreachSent:", error);
    return { ok: false, actionId: (action?.id as string) ?? null, error: error.message };
  }
  return { ok: true, actionId: (action?.id as string) ?? null };
}

/** Draft channels are specific ("email_followup"); the ledger's are coarse. */
const ACTION_TYPE_FOR_CHANNEL: Record<OutreachChannel, string> = {
  email_cold: "email",
  email_followup: "email",
  linkedin_connect: "linkedin",
  linkedin_message: "linkedin",
};

/**
 * Who this actually went to. A draft is written either against an accepted
 * buyer contact or against a still-pending suggestion, so both are checked.
 */
async function resolveRecipient(
  svc: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  draft: { buyer_contact_id: string | null; buyer_suggestion_id: string | null },
  orgId: string,
): Promise<{ name: string | null; email: string | null; company: string | null }> {
  if (draft.buyer_contact_id) {
    const { data } = await svc
      .from("buyer_contacts")
      .select("full_name, email, company_name")
      .eq("id", draft.buyer_contact_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (data) {
      return {
        name: (data.full_name as string) ?? null,
        email: (data.email as string) ?? null,
        company: (data.company_name as string) ?? null,
      };
    }
  }
  if (draft.buyer_suggestion_id) {
    const { data } = await svc
      .from("research_suggestions")
      .select("payload_json")
      .eq("id", draft.buyer_suggestion_id)
      .eq("org_id", orgId)
      .maybeSingle();
    const p = (data?.payload_json as Record<string, unknown>) ?? {};
    return {
      name: p.name ? String(p.name) : null,
      email: p.email ? String(p.email) : null,
      company: p.company ? String(p.company) : null,
    };
  }
  return { name: null, email: null, company: null };
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
