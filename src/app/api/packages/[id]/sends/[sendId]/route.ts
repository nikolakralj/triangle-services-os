import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { updatePacketSend } from "@/lib/data/packet-sends";
import type { SendStatus } from "@/lib/data/packet-sends";

const VALID_STATUSES: SendStatus[] = [
  "sent",
  "replied_interested",
  "replied_not_interested",
  "negotiating",
  "placed",
  "ghosted",
];

// ---------------------------------------------------------------------------
// PATCH /api/packages/[id]/sends/[sendId]  — update status, notes, or fee
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; sendId: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { sendId } = await params;
  if (access.demo) return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const status = typeof body.status === "string" ? body.status : undefined;
  if (status && !VALID_STATUSES.includes(status as SendStatus)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const updated = await updatePacketSend(sendId, access.organizationId, {
    status: status as SendStatus | undefined,
    notes: typeof body.notes === "string" ? body.notes : undefined,
    placementFeeEur:
      typeof body.placementFeeEur === "number" ? body.placementFeeEur : undefined,
    repliedAt: typeof body.repliedAt === "string" ? body.repliedAt : undefined,
  });

  if (!updated) return NextResponse.json({ error: "Send record not found." }, { status: 404 });
  return NextResponse.json(updated);
}
