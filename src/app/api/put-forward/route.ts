import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import { decidePutForwardPack, getPutForwardCase } from "@/lib/data/put-forward-cases";
import { packApprovalNote } from "@/lib/data/put-forward";

// ---------------------------------------------------------------------------
// PATCH /api/put-forward — a person approves what may go out about somebody,
// or rules it out.
//
// This is the human review gate. Until an approval is recorded here, nothing
// Hanna prepared can be attached to a message; the checkbox in the Send
// review is the last step of this decision, not a substitute for it.
//
// Machine keys are refused before the body is read. An employee cannot
// approve the release of a candidate's profile, and neither can a viewer.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

const patchSchema = z.object({
  assignmentId: z.string().uuid(),
  decision: z.enum(["approve", "not_used"]),
  note: z.string().trim().max(1_000).optional(),
});

export async function PATCH(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const refusedWrite = refuseUnlessHuman(
    access,
    "canWrite",
    "approve what goes out about a person",
  );
  if (refusedWrite) return refusedWrite;
  const refusedPool = refuseUnlessHuman(
    access,
    "canSeeWorkers",
    "decide about the company's people",
  );
  if (refusedPool) return refusedPool;

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Say which pack and what you decided." },
      { status: 400 },
    );
  }

  // The sentence recorded against the approval is built from the record, not
  // from the browser: what was approved has to be readable back months later
  // without trusting whatever the page happened to be showing.
  const before = await getPutForwardCase(parsed.data.assignmentId, access.organizationId);
  if (!before) {
    return NextResponse.json(
      { error: "That case is not one of this organization's packs." },
      { status: 404 },
    );
  }
  const note =
    parsed.data.decision === "approve" && before.pack
      ? packApprovalNote({
          intent: before.intent,
          who: before.pack.displayName,
          filename: before.pack.filename,
          agentName: before.agentName,
          finished: before.finished,
        })
      : (parsed.data.note ?? "");

  const decided = await decidePutForwardPack({
    assignmentId: parsed.data.assignmentId,
    orgId: access.organizationId,
    userId: access.userId,
    decision: parsed.data.decision,
    note,
  });
  if (!decided.ok) {
    return NextResponse.json({ error: decided.error }, { status: decided.status });
  }

  return NextResponse.json({ ok: true, pack: decided.pack });
}
