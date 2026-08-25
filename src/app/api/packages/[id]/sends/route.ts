import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { listPacketSends, createPacketSend } from "@/lib/data/packet-sends";
import type { SendChannel } from "@/lib/data/packet-sends";

const VALID_CHANNELS: SendChannel[] = ["email", "linkedin", "whatsapp", "other"];

// ---------------------------------------------------------------------------
// GET /api/packages/[id]/sends  — list all send records for a package
// POST /api/packages/[id]/sends — log a new send
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { id: packageId } = await params;
  if (access.demo) return NextResponse.json([]);

  const sends = await listPacketSends(packageId, access.organizationId);
  return NextResponse.json(sends);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { id: packageId } = await params;
  if (access.demo) return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const contactName = typeof body.contactName === "string" ? body.contactName.trim() : "";
  const channel = typeof body.channel === "string" ? body.channel : "email";

  if (!contactName) {
    return NextResponse.json({ error: "contactName is required." }, { status: 400 });
  }
  if (!VALID_CHANNELS.includes(channel as SendChannel)) {
    return NextResponse.json({ error: "Invalid channel." }, { status: 400 });
  }

  const send = await createPacketSend(packageId, access.organizationId, {
    contactName,
    contactEmail: typeof body.contactEmail === "string" ? body.contactEmail : undefined,
    contactCompany: typeof body.contactCompany === "string" ? body.contactCompany : undefined,
    channel: channel as SendChannel,
    notes: typeof body.notes === "string" ? body.notes : undefined,
  });

  if (!send) return NextResponse.json({ error: "Failed to create send record." }, { status: 500 });
  return NextResponse.json(send, { status: 201 });
}
