import { NextResponse } from "next/server";
import { ingestWhatsAppWebhook } from "@/lib/data/whatsapp";
import { readWhatsAppEnv, webhookGetDecision, webhookPostDecision } from "@/lib/whatsapp/pilot";

// ---------------------------------------------------------------------------
// Meta WhatsApp Cloud API webhook.
//
// GET answers the verification challenge. POST checks X-Hub-Signature-256
// against the raw body, then stores text and status updates. A valid signed
// call answers 200. A missing table or a missing org answers 503 so Meta
// retries after the migration. This route never sends a message.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const env = readWhatsAppEnv(process.env);
  const url = new URL(request.url);
  const decision = webhookGetDecision(
    {
      mode: url.searchParams.get("hub.mode"),
      verifyToken: url.searchParams.get("hub.verify_token"),
      challenge: url.searchParams.get("hub.challenge"),
    },
    env.verifyToken,
  );
  return new NextResponse(decision.body, {
    status: decision.status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const env = readWhatsAppEnv(process.env);
  const raw = await request.text();
  const decision = webhookPostDecision(request.headers.get("x-hub-signature-256"), raw, env.appSecret);
  if (decision === 503) {
    console.error("whatsapp: WHATSAPP_APP_SECRET is missing. The webhook was not accepted.");
    return NextResponse.json({ error: "WhatsApp app secret is not configured." }, { status: 503 });
  }
  if (decision === 401) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  const stored = await ingestWhatsAppWebhook(raw);
  if (stored.status === 503) {
    return NextResponse.json({ error: "WhatsApp storage is not ready." }, { status: 503 });
  }
  return NextResponse.json({ ok: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
