import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import { askHanna } from "@/lib/data/ask-hanna";
import {
  DEFAULT_PACK_INTENT,
  isPackIntent,
  packIntentLabel,
  parsePackIntent,
} from "@/lib/data/put-forward";

// ---------------------------------------------------------------------------
// POST /api/ask/hanna — hand the resourcing half of an open case to Hanna.
//
// Same law as Ask Bob: the handoff changes the owner, not the place. The case
// stays on Today, the answer returns on it, and Triangle sends nothing — a
// person still presses Send with the packet attached.
//
// `intent` may be sent explicitly by the UI. When it is not, the human's own
// wording decides, and the default is the anonymised packet.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

const uuid = z.string().uuid();

const bodySchema = z.object({
  instruction: z.string().trim().min(2).max(4_000),
  intent: z.enum(["bio_anonymised", "full_cv"]).optional(),
  who: z.string().trim().max(200).optional(),
  about: z.string().trim().max(300).optional(),
  workerId: uuid.optional(),
  workerName: z.string().trim().max(200).optional(),
  leadId: uuid.optional(),
  contactId: uuid.optional(),
  personId: uuid.optional(),
  companyId: uuid.optional(),
  missionId: uuid.optional(),
  /** The Bob thread this was asked from, so the two halves stay joined. */
  fromAssignmentId: uuid.optional(),
});

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const refused = refuseUnlessHuman(
    access,
    "canWrite",
    "ask Hanna who we put forward",
  );
  if (refused) return refused;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Write what Hanna should prepare." },
      { status: 400 },
    );
  }

  // An explicit choice from the UI wins. Otherwise the words decide, and a bio
  // marker anywhere in them beats "full CV" — see `parsePackIntent`.
  const intent = isPackIntent(parsed.data.intent)
    ? parsed.data.intent
    : parsePackIntent(parsed.data.instruction) || DEFAULT_PACK_INTENT;

  const asked = await askHanna({
    orgId: access.organizationId,
    userId: access.userId,
    context: { ...parsed.data, intent },
  });
  if (!asked.ok) {
    return NextResponse.json({ error: asked.error }, { status: asked.status });
  }

  return NextResponse.json(
    {
      ok: true,
      assignmentId: asked.assignmentId,
      alreadyOut: asked.alreadyOut,
      hannaName: asked.hannaName,
      intent: asked.intent,
      intentLabel: packIntentLabel(asked.intent),
      worker: asked.worker,
      ambiguous: asked.ambiguous,
      notice: asked.notice,
    },
    { status: asked.alreadyOut ? 200 : 201 },
  );
}
