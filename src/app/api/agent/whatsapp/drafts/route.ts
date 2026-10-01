import { NextResponse } from "next/server";
import { verifyMachineToken } from "@/lib/auth/machine";
import { badgeMayReport } from "@/lib/data/employee-report-policy";
import { fileWhatsAppDraft } from "@/lib/data/whatsapp";

// ---------------------------------------------------------------------------
// POST /api/agent/whatsapp/drafts — Hanna files a reply. It is a draft.
//
// Same badge check as POST /api/agent/reports. The legacy MCP key is not a
// badge. This route does not call Graph and does not send.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const machine = await verifyMachineToken(request);
  if (!machine) {
    return NextResponse.json(
      { error: "Machine credential required (tri_mc_… token)." },
      { status: 401 },
    );
  }
  if (!machine.agentInstanceId) {
    return NextResponse.json({ error: "This badge is not linked to an employee." }, { status: 403 });
  }
  if (!badgeMayReport(machine.scopes)) {
    return NextResponse.json(
      { error: `Credential "${machine.name}" may not draft a WhatsApp reply.` },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const result = await fileWhatsAppDraft({
    orgId: machine.orgId,
    agentInstanceId: machine.agentInstanceId,
    body,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(
    { ok: true, draftId: result.draftId, duplicate: result.duplicate, sends: false },
    { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } },
  );
}
