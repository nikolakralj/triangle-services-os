import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import { sendFromTriangle } from "@/lib/data/mail-send";

// ---------------------------------------------------------------------------
// POST /api/mail/send — a person presses Send in Triangle (DEV-013).
//
// Human only, by construction: the static MCP key and every employee badge
// are refused before the body is read. An agent that wants something sent
// drafts it and waits for a person to press this. That is the 16 September
// sending policy — review / edit / Send in Triangle is allowed; autonomous
// outbound is not.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z
  .object({
    to: z.string().trim().min(3).max(320),
    subject: z.string().trim().min(1).max(300),
    body: z.string().trim().min(2).max(20_000),
    draft: z.string().trim().max(20_000).optional().nullable(),
    contactId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    personId: z.string().uuid().optional(),
    mailAccountId: z.string().uuid().optional().nullable(),
    inReplyTo: z.string().trim().max(998).optional().nullable(),
    // Attaching a person's profile takes both: the tick, and the case whose
    // approval the server reads. Neither is believed on its own.
    attachPack: z.boolean().optional(),
    putForwardAssignmentId: z.string().uuid().optional().nullable(),
  })
  .refine((v) => Boolean(v.contactId || v.leadId || v.personId), {
    message: "Say who this is about: a contactId, a leadId or a personId.",
  });

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const refused = refuseUnlessHuman(access, "canWrite", "send a message from Triangle");
  if (refused) return refused;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the message.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await sendFromTriangle({
    orgId: access.organizationId,
    userId: access.userId,
    ...parsed.data,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(
    {
      ok: true,
      actionId: result.actionId,
      draftId: result.draftId,
      followUpAt: result.followUpAt,
      from: result.from,
      attachedFilename: result.attachedFilename ?? null,
    },
    { status: 201 },
  );
}
