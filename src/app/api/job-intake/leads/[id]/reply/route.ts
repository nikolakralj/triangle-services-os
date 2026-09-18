import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import { logContactAttempt, undoContactAttempt } from "@/lib/data/contact-log";
import { recordRefusal } from "@/lib/data/refusals";
import { draftLeadReply } from "@/lib/job-intake/draft-reply";
import {
  getOrganizationOperatingProfile,
  isOrganizationProfileComplete,
} from "@/lib/data/organization-profile";
import {
  getJobLead,
  getReplyStyleMemory,
  listReplyDrafts,
  createReplyDraft,
  updateReplyDraft,
  updateLeadStatus,
} from "@/lib/data/job-intake";

// ---------------------------------------------------------------------------
// GET   /api/job-intake/leads/[id]/reply   — existing drafts for this lead
// POST  /api/job-intake/leads/[id]/reply   — generate a new draft
// PATCH /api/job-intake/leads/[id]/reply   — edit a draft, or mark it sent
//
// This endpoint NEVER sends email. "Sent" only records that the user sent it
// themselves from their own mail client.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  if (access.demo) return NextResponse.json({ drafts: [] });

  const lead = await getJobLead(id, access.organizationId, access.userId);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  return NextResponse.json({
    drafts: await listReplyDrafts(id, access.organizationId),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  if (access.demo) {
    return NextResponse.json(
      { error: "Drafting is not available in demo mode." },
      { status: 403 },
    );
  }

  const lead = await getJobLead(id, access.organizationId, access.userId);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  let drafted;
  try {
    const [replyStyle, organization] = await Promise.all([
      getReplyStyleMemory(access.organizationId),
      getOrganizationOperatingProfile(access.organizationId),
    ]);
    if (!isOrganizationProfileComplete(organization)) {
      return NextResponse.json(
        {
          error:
            "Complete the organization profile and reply sign-off in Settings before drafting commercial communication.",
        },
        { status: 409 },
      );
    }
    drafted = await draftLeadReply({
      lead,
      originalSubject: lead.subject,
      organization,
      replyStyle: replyStyle?.body ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not draft a reply.",
      },
      { status: 502 },
    );
  }

  const saved = await createReplyDraft({
    orgId: access.organizationId,
    jobLeadId: id,
    subject: drafted.subject,
    body: drafted.body,
    asks: drafted.asks,
    language: drafted.language,
    userId: access.userId,
  });

  if (!saved) {
    return NextResponse.json({ error: "Could not save the draft." }, { status: 500 });
  }

  // Drafting means we're working this lead.
  if (lead.status === "new") {
    await updateLeadStatus(id, access.organizationId, "reviewing");
  }

  return NextResponse.json({ draft: saved });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  let body: {
    draftId?: string;
    subject?: string;
    body?: string;
    status?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.draftId) {
    return NextResponse.json({ error: "draftId is required." }, { status: 400 });
  }

  const validStatuses = ["draft", "sent", "archived"];
  if (body.status && !validStatuses.includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of: ${validStatuses.join(", ")}.` },
      { status: 400 },
    );
  }

  if (body.status === "sent") {
    return markReplySent(access, id, body.draftId, body);
  }

  const updated = await updateReplyDraft({
    draftId: body.draftId,
    orgId: access.organizationId,
    subject: body.subject,
    body: body.body,
    status: body.status as "draft" | "sent" | "archived" | undefined,
  });

  if (!updated) {
    return NextResponse.json({ error: "Could not update the draft." }, { status: 500 });
  }

  return NextResponse.json({ draft: updated });
}

/**
 * "I sent this" — the reply went out from the person's own mailbox.
 *
 * This flipped the draft to sent and nothing else, so the one kind of message
 * Triangle's people send most — an answer to a recruiter who wrote first —
 * never reached the ledger the Phase 0 gate counts, carried no follow-up
 * date, and could be answered a second time from Today. It is recorded the
 * way every other send is: final text, the words as Triangle wrote them,
 * recipient, time, and a follow-up date.
 */
async function markReplySent(
  access: Extract<Awaited<ReturnType<typeof requireApiAccess>>, { ok: true }>,
  leadId: string,
  draftId: string,
  body: { subject?: string; body?: string },
) {
  const refused = refuseUnlessHuman(access, "canWrite", "record a sent reply");
  if (refused) return refused;

  const [lead, drafts] = await Promise.all([
    getJobLead(leadId, access.organizationId, access.userId),
    listReplyDrafts(leadId, access.organizationId),
  ]);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }
  const current = drafts.find((d) => d.id === draftId);
  if (!current) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }
  // Pressed twice, it is still one send.
  if (current.status === "sent") {
    return NextResponse.json({ draft: current });
  }

  const subject = body.subject ?? current.subject;
  const text = body.body ?? current.body;

  const logged = await logContactAttempt({
    orgId: access.organizationId,
    userId: access.userId,
    leadId,
    channelKind: "email",
    value: lead.contactEmail ?? lead.agencyName ?? "their address",
    outcome: "sent",
    content: text,
    draft: current.aiBody,
    subject,
  });
  if (!logged.ok) {
    await recordRefusal({
      orgId: access.organizationId,
      surface: "Record a sent reply",
      reason: logged.error,
      userId: access.userId,
      entityType: "job_lead",
      entityId: leadId,
    });
    return NextResponse.json({ error: logged.error }, { status: 409 });
  }

  const updated = await updateReplyDraft({
    draftId,
    orgId: access.organizationId,
    subject: body.subject,
    body: body.body,
    status: "sent",
  });
  if (!updated) {
    // A ledger send with the draft still unsent would be answered again.
    await undoContactAttempt({
      orgId: access.organizationId,
      userId: access.userId,
      actionId: logged.actionId,
    });
    return NextResponse.json({ error: "Could not update the draft." }, { status: 500 });
  }

  // Marking the reply sent moves the lead along with it.
  await updateLeadStatus(leadId, access.organizationId, "replied");

  return NextResponse.json({
    draft: updated,
    actionId: logged.actionId,
    followUpAt: logged.followUpAt,
  });
}
