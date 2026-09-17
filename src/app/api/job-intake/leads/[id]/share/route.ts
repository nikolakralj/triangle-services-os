import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import { shareJobLead } from "@/lib/data/job-intake";

// ---------------------------------------------------------------------------
// POST /api/job-intake/leads/[id]/share
//
// A person puts mail from their own inbox into the common shared space.
// Human only. Does not send. Bob may then wake on it; until this, it stayed
// on that person's Today.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const refused = refuseUnlessHuman(
    access,
    "canWrite",
    "put mail in the shared space",
  );
  if (refused) return refused;

  const { id } = await params;
  const result = await shareJobLead({
    orgId: access.organizationId,
    leadId: id,
    userId: access.userId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (!result.already) {
    try {
      const { recordClientReplyEvent } = await import("@/lib/data/event-outbox");
      await recordClientReplyEvent({
        orgId: access.organizationId,
        sourceType: "inbound_email",
        sourceId: result.lead.id,
        recipientName: result.lead.contactName,
        recipientEmail: result.lead.contactEmail,
        recipientCompany: result.lead.clientCompany || result.lead.agencyName,
        subject: result.lead.subject,
        replySummary: "Shared into the common space.",
      });
    } catch (err) {
      console.error("share lead: outbox dispatch failed:", err);
    }
  }

  return NextResponse.json({ ok: true, already: result.already, leadId: result.lead.id });
}
