import { NextResponse } from "next/server";
import { z } from "zod";
import {
  logContactAttempt,
  undoContactAttempt,
  UNDO_WINDOW_MINUTES,
} from "@/lib/data/contact-log";
import { recordRefusal } from "@/lib/data/refusals";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";

// ---------------------------------------------------------------------------
// "We called that person, it didn't work."
//
// One button, one row in the ledger. The point is that recording what happened
// costs a click, because a record that costs a form does not get written, and
// an outreach history with gaps in it is worse than none — it reads as "never
// tried" for people who were tried three times.
//
// Deliberately human-only. A machine key can propose and can research, but it
// cannot assert that a human picked up a phone and spoke to somebody. That
// sentence was here before anything enforced it: the check was `userId`, and
// the static MCP key supplies one. It is enforced now, along with the role —
// a viewer could log contacts because nothing looked.
//
// Two further things a click has to do, both learned on 8 September:
//
//   Fit the channel. "No answer" is a phone word. Pressed under an email that
//   had not been sent, it recorded a contact that never happened and took the
//   requisition out of the queue as handled.
//
//   Name what it recorded. The response carries the ledger id so the screen
//   can say what was written and offer to take it back. Without that the page
//   refreshed silently into the next card, and the click looked like nothing.
// ---------------------------------------------------------------------------

const bodySchema = z
  .object({
    // One or the other: a buyer contact, or the inbound requisition being
    // answered. An agency conversation has no contact record and never will.
    contactId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    // A person a mission found. They have no project and no requisition, and
    // pressing "Sent" beside them must still land in the ledger.
    personId: z.string().uuid().optional(),
    channelKind: z.enum(["phone", "email", "linkedin", "contact_form", "other"]),
    value: z.string().trim().min(1).max(400),
    outcome: z.enum(["sent", "reached", "no_answer", "dead_end"]),
    content: z.string().trim().max(8_000).optional(),
    note: z.string().trim().max(1_000).optional(),
  })
  .refine((v) => Boolean(v.contactId || v.leadId || v.personId), {
    message: "Give a contactId, a leadId or a personId.",
  });

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const refused = refuseUnlessHuman(access, "canWrite", "record contacting someone");
  if (refused) return refused;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // The word has to fit the channel, because the wrong word is a false record.
  const { outcome, channelKind } = parsed.data;
  const mismatch =
    outcome === "no_answer" && channelKind !== "phone"
      ? "“No answer” is for a phone call. For an email, press Sent once it has actually gone, and They replied when they do."
      : outcome === "sent" && channelKind === "phone"
        ? "A call is not sent. Record Got through, No answer or Dead end."
        : null;
  if (mismatch) {
    await recordRefusal({
      orgId: access.organizationId,
      surface: "Log a contact attempt",
      reason: mismatch,
      userId: access.userId,
      entityType: parsed.data.leadId
        ? "job_lead"
        : parsed.data.personId
          ? "contact"
          : "buyer_contact",
      entityId: parsed.data.contactId ?? parsed.data.leadId ?? parsed.data.personId ?? null,
      kind: "truth",
    });
    return NextResponse.json({ error: mismatch }, { status: 400 });
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
      entityType: parsed.data.leadId
        ? "job_lead"
        : parsed.data.personId
          ? "contact"
          : "buyer_contact",
      entityId: parsed.data.contactId ?? parsed.data.leadId ?? parsed.data.personId ?? null,
    });
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json(
    {
      ok: true,
      actionId: result.actionId,
      draftId: result.draftId,
      undoWithinMinutes: UNDO_WINDOW_MINUTES,
    },
    { status: 201 },
  );
}

const undoSchema = z.object({ actionId: z.string().uuid() });

/**
 * Take back a contact recorded by mistake.
 *
 * There was no way to. A mis-click filed a requisition as answered for good
 * and put an attempt in the ledger that never happened, and the only repair
 * was somebody with direct database access.
 */
export async function DELETE(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const refused = refuseUnlessHuman(access, "canWrite", "undo a recorded contact");
  if (refused) return refused;

  const parsed = undoSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Say which record to undo." }, { status: 400 });
  }

  const result = await undoContactAttempt({
    orgId: access.organizationId,
    userId: access.userId,
    actionId: parsed.data.actionId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
