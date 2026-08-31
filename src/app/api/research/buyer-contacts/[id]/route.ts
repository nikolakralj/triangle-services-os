import { NextResponse } from "next/server";
import { requireApiAccess, createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// PATCH /api/research/buyer-contacts/[id] — record how to reach someone.
//
// Research can establish that Peter Östlund is the Geschäftsführer of the
// company buying the labour, and it cannot get his address: it is not
// published, and the agent is rightly forbidden from inventing one. B2B
// enrichment databases do not have him either — six lookups across name and
// company variants returned nothing for him, for Walther Hartl at ANDRITZ and
// for Simone Lining at Max Bögl. These databases index sales-visible people,
// not German industrial site management.
//
// So the address arrives by other means: a company Impressum, a phone call to
// the switchboard, a LinkedIn conversation, a colleague. All of which need
// somewhere to be written down — and until now the record had an email column
// that nothing could ever fill.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  const { id } = await params;

  let body: {
    email?: string | null;
    phone?: string | null;
    linkedinUrl?: string | null;
    jobTitle?: string | null;
    notes?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim();
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "That does not look like an email address." },
      { status: 400 },
    );
  }

  const linkedin = String(body.linkedinUrl ?? "").trim();
  if (linkedin && !/^https?:\/\//i.test(linkedin)) {
    return NextResponse.json(
      { error: "The LinkedIn link needs to start with http:// or https://" },
      { status: 400 },
    );
  }

  const svc = createServiceSupabaseClient();
  if (!svc) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  // Only the fields that were sent. A blank string clears one deliberately;
  // an absent key leaves it alone, so editing the phone cannot wipe the email.
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("email" in body) updates.email = email || null;
  if ("linkedinUrl" in body) updates.linkedin_url = linkedin || null;
  if ("jobTitle" in body) updates.job_title = String(body.jobTitle ?? "").trim() || null;
  if ("notes" in body) updates.notes = String(body.notes ?? "").trim().slice(0, 2000) || null;
  // buyer_contacts has no phone column; a number belongs in notes until one
  // exists, rather than being silently dropped.
  //
  // The existing notes must come from the row, not the request. Reading them
  // from `body` meant that saving only a phone number replaced whatever was
  // already there — which is exactly what happened while testing this, wiping
  // the sourced evidence on a real contact.
  if (body.phone) {
    const phone = String(body.phone).trim();
    const { data: current } = await svc
      .from("buyer_contacts")
      .select("notes")
      .eq("id", id)
      .eq("organization_id", access.organizationId)
      .maybeSingle();

    const existing = String(
      "notes" in body ? body.notes ?? "" : current?.notes ?? "",
    ).trim();
    // Replace a previous phone line rather than stacking them up.
    const withoutOldPhone = existing
      .split("\n")
      .filter((line) => !/^Phone:/i.test(line.trim()))
      .join("\n")
      .trim();
    updates.notes = [withoutOldPhone, `Phone: ${phone}`]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2000);
  }

  const { data, error } = await svc
    .from("buyer_contacts")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", access.organizationId)
    .select("id, full_name, email, linkedin_url, job_title, notes")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, contact: data });
}
