import { NextResponse } from "next/server";
import { verifyMachineToken } from "@/lib/auth/machine";
import { badgeMayReport } from "@/lib/data/employee-report-policy";
import { fileWhatsAppDraft } from "@/lib/data/whatsapp";
import { draftFailureHint } from "@/lib/whatsapp/pilot";

// ---------------------------------------------------------------------------
// POST /api/agent/whatsapp/drafts — Scout, Bob, or Hanna files a reply,
// or starts a message to an owner or field number.
//
// Same badge check as POST /api/agent/reports. The legacy MCP key is not a
// badge. This route does not call Graph. The data layer sends when the
// recipient is an owner or field number and the auto-send rule allows it.
// The JSON says sent: true only after Graph has accepted the message.
// The response never includes the file.
//
// Reply: { "to", "text", "replyTo" }
// Started, no replyTo, owner or field only:
//   { "to", "text" } inside 24 hours of their latest inbound
//   { "to", "text", "templateName" } outside that window, parameterless,
//   and only when templateName is WHATSAPP_TEMPLATE_NAME
// A document is either bytes or a reference, not both:
// { "filename", "mime", "contentBase64" }
// { "workerId": "<uuid>" } — that person's current CV in the documents bucket
// { "documentId": "<uuid>" } — one documents row in this organisation
// A reference goes to an owner or field number inside 24 hours. With a
// replyTo it has to be that sender's inbound. With no replyTo, their latest
// inbound inside 24 hours is enough. Anyone else is refused.
// A 400 about a file or a caption includes hint: file a text-only reply
// with the same replyTo.
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
    const hadDocument = Boolean(
      body && typeof body === "object" && "document" in body && (body as { document?: unknown }).document,
    );
    const hint = hadDocument ? draftFailureHint(result.status, result.error) : null;
    return NextResponse.json(
      hint ? { error: result.error, hint } : { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(
    {
      ok: true,
      draftId: result.draftId,
      duplicate: result.duplicate,
      sends: result.sends,
      sent: result.sent,
      autoSent: result.autoSent,
      status: result.status,
      wamid: result.wamid,
      held: result.held,
    },
    { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } },
  );
}
