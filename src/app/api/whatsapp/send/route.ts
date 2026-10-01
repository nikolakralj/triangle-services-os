import { NextResponse } from "next/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import { sendApprovedWhatsAppDraft } from "@/lib/data/whatsapp";
import { requireApiAccess } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST /api/whatsapp/send — a person approves and sends one draft.
//
// Human only. A badge and the MCP key are refused before the draft is read.
// Nothing here runs because a webhook arrived.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const refused = refuseUnlessHuman(access, "canWrite", "send a WhatsApp message");
  if (refused) return refused;

  const body = (await request.json().catch(() => null)) as {
    draftId?: unknown;
    text?: unknown;
    approve?: unknown;
  } | null;
  const draftId = typeof body?.draftId === "string" ? body.draftId : "";
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) {
    return NextResponse.json({ error: "Say which draft to send." }, { status: 400 });
  }

  const result = await sendApprovedWhatsAppDraft({
    orgId: access.organizationId,
    userId: access.userId,
    actor: "human",
    draftId,
    text: typeof body?.text === "string" ? body.text : "",
    approve: body?.approve === true,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, wamid: result.wamid }, { status: 200 });
}
