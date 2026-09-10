import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import { recordRefusal } from "@/lib/data/refusals";
import { markNotForUs, undoNotForUs, verifyRecord } from "@/lib/data/missions";

// ---------------------------------------------------------------------------
// POST /api/missions/:id/entities — a person's decision about a record the
// mission's employee wrote.
//
//   verify           "this is right": the record stops being agent-found
//   not_for_us       ruled out, with the reason, so it never comes back
//   undo_not_for_us  pressed by mistake
//
// Human-only. An employee may record what it found; it may not confirm its
// own work or rule out a lead on the CEO's behalf.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("verify"),
    entityType: z.enum(["company", "contact"]),
    entityId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("not_for_us"),
    companyId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    action: z.literal("undo_not_for_us"),
    companyId: z.string().uuid(),
  }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const refused = refuseUnlessHuman(access, "canWrite", "decide on what a mission found");
  if (refused) return refused;

  const { id: missionId } = await params;
  if (!z.string().uuid().safeParse(missionId).success) {
    return NextResponse.json({ error: "Unknown mission." }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    const reasonMissing = parsed.error.issues.some((i) => i.path.includes("reason"));
    return NextResponse.json(
      {
        error: reasonMissing
          ? "Say why it is not for us, so the same lead does not come back."
          : "That request did not say what to decide.",
      },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const result =
    body.action === "verify"
      ? await verifyRecord({
          orgId: access.organizationId,
          userId: access.userId,
          entityType: body.entityType,
          entityId: body.entityId,
        })
      : body.action === "not_for_us"
        ? await markNotForUs({
            orgId: access.organizationId,
            userId: access.userId,
            missionId,
            companyId: body.companyId,
            reason: body.reason,
          })
        : await undoNotForUs({
            orgId: access.organizationId,
            missionId,
            companyId: body.companyId,
          });

  if ("error" in result) {
    await recordRefusal({
      orgId: access.organizationId,
      surface: "Decide on a mission record",
      reason: result.error,
      userId: access.userId,
      entityType: body.action === "verify" ? body.entityType : "company",
      entityId: body.action === "verify" ? body.entityId : body.companyId,
    });
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
