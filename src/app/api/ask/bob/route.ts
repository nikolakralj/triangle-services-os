import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import { askBob } from "@/lib/data/ask-bob";
import { dismissTodayCard } from "@/lib/data/today-dismiss";

// ---------------------------------------------------------------------------
// POST /api/ask/bob — hand a Today mail card to Commercial Ops.
//
// A short instruction plus the card's entity ids. If Bob cannot take mission
// work (DEV-004), this fails honestly. Triangle still sends nothing.
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
  missionId: uuid.optional(),
  channelKind: z.string().trim().max(40).optional(),
  value: z.string().trim().max(400).optional(),
  // After a successful hand-off, take the card off the human rail.
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

  let dismissed: { actionId: string | null; sentence: string } | null = null;
  const targetId = parsed.data.leadId || parsed.data.contactId || parsed.data.personId;
  if (targetId || parsed.data.dismissActionId) {
    const takenOff = await dismissTodayCard({
      orgId: access.organizationId,
      userId: access.userId,
      target: {
        reason: "not_now",
        channelKind: parsed.data.channelKind || "email",
        value: parsed.data.value || "the address on record",
        actionId: parsed.data.dismissActionId,
        leadId: parsed.data.leadId,
        contactId: parsed.data.contactId,
        personId: parsed.data.personId,
      },
    });
    if (takenOff.ok) {
      dismissed = { actionId: takenOff.actionId, sentence: takenOff.sentence };
    }
  }

  return NextResponse.json(
    {
      ok: true,
      assignmentId: asked.assignmentId,
      alreadyOut: asked.alreadyOut,
      bobName: asked.bobName,
      notice: asked.notice,
      dismissed,
    },
    { status: asked.alreadyOut ? 200 : 201 },
  );
}
