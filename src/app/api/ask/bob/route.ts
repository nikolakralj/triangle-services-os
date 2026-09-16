import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import { askBob } from "@/lib/data/ask-bob";

// ---------------------------------------------------------------------------
// POST /api/ask/bob — hand a Today mail card to Commercial Ops.
//
// Handoff changes the owner. It does not dismiss the card or send the CEO to
// Workforce. If Bob cannot take mission work (DEV-004), this fails honestly.
// Triangle still sends nothing.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

const uuid = z.string().uuid();

const bodySchema = z.object({
  instruction: z.string().trim().min(2).max(4_000),
  who: z.string().trim().max(200).optional(),
  about: z.string().trim().max(300).optional(),
  leadId: uuid.optional(),
  contactId: uuid.optional(),
  personId: uuid.optional(),
  companyId: uuid.optional(),
  missionId: uuid.optional(),
  channelKind: z.string().trim().max(40).optional(),
  value: z.string().trim().max(400).optional(),
  // Accepted and ignored: Hand to Bob used to dismiss the card. It must not.
  dismissActionId: uuid.optional(),
});

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const refused = refuseUnlessHuman(access, "canWrite", "ask Bob for follow-through");
  if (refused) return refused;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Write what Bob should do." }, { status: 400 });
  }

  const asked = await askBob({
    orgId: access.organizationId,
    userId: access.userId,
    context: parsed.data,
  });
  if (!asked.ok) {
    return NextResponse.json({ error: asked.error }, { status: asked.status });
  }

  return NextResponse.json(
    {
      ok: true,
      assignmentId: asked.assignmentId,
      alreadyOut: asked.alreadyOut,
      bobName: asked.bobName,
      notice: asked.notice,
    },
    { status: asked.alreadyOut ? 200 : 201 },
  );
}
