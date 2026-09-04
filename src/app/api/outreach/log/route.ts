import { NextResponse } from "next/server";
import { z } from "zod";
import { logContactAttempt } from "@/lib/data/contact-log";
import { recordRefusal } from "@/lib/data/refusals";
import { requireApiAccess } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// "We called that person, it didn't work."
//
// One button, one row in the ledger. The point is that recording what happened
// costs a click, because a record that costs a form does not get written, and
// an outreach history with gaps in it is worse than none — it reads as "never
// tried" for people who were tried three times.
//
// Deliberately human-only. A machine key can propose and can research, but it
// cannot assert that a human picked up a phone and spoke to somebody.
// ---------------------------------------------------------------------------

const bodySchema = z.object({
  contactId: z.string().uuid(),
  channelKind: z.enum(["phone", "email", "linkedin", "contact_form", "other"]),
  value: z.string().trim().min(1).max(400),
  outcome: z.enum(["reached", "no_answer", "dead_end"]),
  content: z.string().trim().max(8_000).optional(),
  note: z.string().trim().max(1_000).optional(),
});

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo || access.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!access.userId) {
    return NextResponse.json(
      { error: "Only a signed-in person can record contacting someone." },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await logContactAttempt({
    orgId: access.organizationId,
    userId: access.userId,
    ...parsed.data,
  });

  if (!result.ok) {
    await recordRefusal({
      orgId: access.organizationId,
      surface: "Log a contact attempt",
      reason: result.error,
      userId: access.userId,
      entityType: "buyer_contact",
      entityId: parsed.data.contactId,
    });
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
