import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import { askTheTeam } from "@/lib/data/case-ask";

// ---------------------------------------------------------------------------
// POST /api/ask/case — one Ask on a Today case.
//
// The person writes what they want; Triangle decides whether it is Bob's
// half (the conversation), Hanna's half (who we put forward, in which form),
// or both, and hands it over on this same case. The person never picks the
// employee ("Employees, not buttons", 18 September). Triangle sends nothing:
// a person still presses Send.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

const uuid = z.string().uuid();

const alsoRef = z.object({
  leadId: uuid.optional(),
  contactId: uuid.optional(),
  personId: uuid.optional(),
});

const bodySchema = z.object({
  instruction: z.string().trim().min(2).max(4_000),
  who: z.string().trim().max(200).optional(),
  about: z.string().trim().max(800).optional(),
  leadId: uuid.optional(),
  contactId: uuid.optional(),
  personId: uuid.optional(),
  companyId: uuid.optional(),
  missionId: uuid.optional(),
  channelKind: z.string().trim().max(40).optional(),
  value: z.string().trim().max(400).optional(),
  also: z.array(alsoRef).max(12).optional(),
  /** The thread the words were typed in, when they were typed in one. */
  fromAssignmentId: uuid.optional(),
});

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const refused = refuseUnlessHuman(access, "canWrite", "ask the team on a case");
  if (refused) return refused;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Write what the team should do." }, { status: 400 });
  }

  const { instruction, ...context } = parsed.data;
  const asked = await askTheTeam({
    orgId: access.organizationId,
    userId: access.userId,
    text: instruction,
    context,
  });
  if (!asked.ok) {
    return NextResponse.json({ error: asked.error }, { status: asked.status });
  }

  const opened = asked.handed.some((h) => h.how === "new");
  return NextResponse.json(asked, { status: opened ? 201 : 200 });
}
