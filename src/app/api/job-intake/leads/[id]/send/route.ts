import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import { sendLeadReplyFromTriangle } from "@/lib/data/lead-send";

// ---------------------------------------------------------------------------
// POST /api/job-intake/leads/[id]/send
//
// Triangle sends the draft from the connected mailbox. There is no "I sent
// this" button on this path — if SMTP fails, the draft stays unsent.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const refused = refuseUnlessHuman(access, "canWrite", "send a commercial reply");
  if (refused) return refused;
  if (access.demo) {
    return NextResponse.json(
      { error: "Sending is not available in demo mode." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const parsed = z
    .object({
      draftId: z.string().uuid(),
      subject: z.string().min(1).max(300),
      body: z.string().min(1).max(20_000),
    })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Send the draft, subject and body." }, { status: 400 });
  }

  const result = await sendLeadReplyFromTriangle({
    orgId: access.organizationId,
    userId: access.userId,
    leadId: id,
    draftId: parsed.data.draftId,
    subject: parsed.data.subject,
    body: parsed.data.body,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, rfc822Id: result.rfc822Id });
}
