import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import { dismissTodayCard } from "@/lib/data/today-dismiss";
import { getJobLead } from "@/lib/data/job-intake";

// ---------------------------------------------------------------------------
// POST /api/today/dismiss — scoped judgment on a Today mail card.
//
// Not a forever blacklist. Maps onto Later / not-for-us / ledger records.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

const uuid = z.string().uuid();

const bodySchema = z
  .object({
    reason: z.enum([
      "not_now",
      "not_this_opportunity",
      "wrong_person",
      "dont_contact",
      "recorded_outside",
    ]),
    channelKind: z.string().trim().min(1).max(40).default("email"),
    value: z.string().trim().max(400).optional(),
    actionId: uuid.optional(),
    contactId: uuid.optional(),
    leadId: uuid.optional(),
    personId: uuid.optional(),
    missionId: uuid.optional(),
    companyId: uuid.optional(),
    content: z.string().trim().max(8_000).optional(),
    draft: z.string().trim().max(8_000).optional(),
    subject: z.string().trim().max(300).optional(),
  })
  .refine((v) => Boolean(v.contactId || v.leadId || v.personId || v.actionId), {
    message: "Say which card to dismiss.",
  });

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const refused = refuseUnlessHuman(access, "canWrite", "dismiss a Today card");
  if (refused) return refused;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Say which card to dismiss, and why." }, { status: 400 });
  }

  if (parsed.data.leadId) {
    const lead = await getJobLead(parsed.data.leadId, access.organizationId, access.userId);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }
  }

  const result = await dismissTodayCard({
    orgId: access.organizationId,
    userId: access.userId,
    target: parsed.data,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    actionId: result.actionId,
    sentence: result.sentence,
  });
}
