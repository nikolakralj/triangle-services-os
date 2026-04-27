import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const secret =
    request.headers.get("x-email-webhook-secret") ||
    new URL(request.url).searchParams.get("secret");

  if (
    !process.env.EMAIL_WEBHOOK_SECRET ||
    secret !== process.env.EMAIL_WEBHOOK_SECRET
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const payload = await request.json();

    // We expect a format similar to Postmark or SendGrid inbound parse.
    // Let's extract the recipient emails (To/Cc) to find who we are communicating with.
    const fromAddress = payload.From || payload.from || "";
    const toAddress = payload.To || payload.to || "";
    const subject = payload.Subject || payload.subject || "No Subject";
    const body = payload.TextBody || payload.text || payload.HtmlBody || "";

    // Extract actual email addresses from strings like "John Doe <john@example.com>"
    const extractEmails = (str: string) => {
      const matches = str.match(
        /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi,
      );
      return matches || [];
    };

    const targetEmails = [
      ...extractEmails(toAddress),
      ...extractEmails(fromAddress),
    ];

    if (targetEmails.length === 0) {
      return NextResponse.json(
        { error: "No valid email addresses found in To/From fields" },
        { status: 400 },
      );
    }

    const serviceClient = createServiceSupabaseClient();
    if (!serviceClient) {
      return NextResponse.json(
        { error: "Supabase service client not configured" },
        { status: 500 },
      );
    }

    const organizationId =
      process.env.DEFAULT_ORGANIZATION_ID ||
      "00000000-0000-0000-0000-000000000001";

    // Find if any of the target emails match a contact in the database
    let matchedContact = null;
    for (const email of targetEmails) {
      const { data } = await serviceClient
        .from("contacts")
        .select("id, company_id")
        .eq("email", email)
        .limit(1)
        .maybeSingle();

      if (data) {
        matchedContact = data;
        break; // We found the primary recipient/sender in our CRM!
      }
    }

    // Even if we don't find a contact, we could still save it if it matches a company domain.
    // For now, let's just log it if we found a contact, or log it as an unlinked activity if not.

    const { error: insertError } = await serviceClient
      .from("activities")
      .insert({
        organization_id: organizationId,
        activity_type: "email",
        title: subject,
        body: body,
        contact_id: matchedContact ? matchedContact.id : null,
        company_id: matchedContact ? matchedContact.company_id : null,
        metadata: {
          from: fromAddress,
          to: toAddress,
          source: "webhook",
        },
      });

    if (insertError) {
      console.error("Failed to insert email activity:", insertError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, matched: !!matchedContact });
  } catch (error: unknown) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}
