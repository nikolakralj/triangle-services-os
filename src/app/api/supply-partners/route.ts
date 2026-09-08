import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import {
  createSupplyPartner,
  confirmPartnerCapacity,
  setPartnerStatus,
  type PartnerAvailability,
} from "@/lib/data/supply-partners";

// ---------------------------------------------------------------------------
// Partner firms — the half of the talent pool that is not individual people.
//
// POST  — add a firm.
// PATCH — confirm its capacity (a human just heard the number), or park it.
//
// There is no endpoint that sets confirmed_at from a form field. Confirmation
// is an action a person takes after speaking to the partner, not a date they
// type, because the whole value of the column is that it records a
// conversation having happened.
// ---------------------------------------------------------------------------

const AVAILABILITY: PartnerAvailability[] = [
  "available",
  "available_soon",
  "busy",
  "unknown",
  "do_not_use",
];

function splitList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,;\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json(
      { error: "Partner firms are not available in demo mode." },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "The firm needs a name." }, { status: 400 });
  }

  const crewSizeRaw = body.crewSize;
  const crewSize =
    crewSizeRaw === "" || crewSizeRaw === null || crewSizeRaw === undefined
      ? null
      : Number(crewSizeRaw);

  const availability = AVAILABILITY.includes(body.availabilityStatus as PartnerAvailability)
    ? (body.availabilityStatus as PartnerAvailability)
    : "unknown";

  const partner = await createSupplyPartner(access.organizationId, access.userId, {
    name,
    country: body.country ? String(body.country) : null,
    city: body.city ? String(body.city) : null,
    contactName: body.contactName ? String(body.contactName) : null,
    contactEmail: body.contactEmail ? String(body.contactEmail) : null,
    contactPhone: body.contactPhone ? String(body.contactPhone) : null,
    trades: splitList(body.trades),
    canPostTo: splitList(body.canPostTo),
    crewSize: crewSize !== null && Number.isFinite(crewSize) ? crewSize : null,
    postingNotes: body.postingNotes ? String(body.postingNotes) : null,
    availabilityStatus: availability,
    rateNotes: body.rateNotes ? String(body.rateNotes) : null,
    notes: body.notes ? String(body.notes) : null,
  });

  if (!partner) {
    return NextResponse.json({ error: "Could not add the firm." }, { status: 500 });
  }
  return NextResponse.json({ partner });
}

export async function PATCH(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const partnerId = String(body.partnerId ?? "").trim();
  if (!partnerId) {
    return NextResponse.json({ error: "partnerId is required." }, { status: 400 });
  }

  const action = String(body.action ?? "confirm");

  if (action === "status") {
    const status = String(body.status ?? "");
    if (!["candidate", "active", "inactive", "do_not_use"].includes(status)) {
      return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    }
    const ok = await setPartnerStatus(
      partnerId,
      access.organizationId,
      status as "candidate" | "active" | "inactive" | "do_not_use",
    );
    if (!ok) {
      return NextResponse.json({ error: "Could not update the firm." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action !== "confirm") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const crewSizeRaw = body.crewSize;
  const crewSize =
    crewSizeRaw === "" || crewSizeRaw === null || crewSizeRaw === undefined
      ? null
      : Number(crewSizeRaw);

  const partner = await confirmPartnerCapacity({
    partnerId,
    orgId: access.organizationId,
    userId: access.userId,
    crewSize: crewSize !== null && Number.isFinite(crewSize) ? crewSize : null,
    availabilityStatus: AVAILABILITY.includes(body.availabilityStatus as PartnerAvailability)
      ? (body.availabilityStatus as PartnerAvailability)
      : undefined,
    availableFrom: body.availableFrom ? String(body.availableFrom) : undefined,
    note: body.note ? String(body.note) : null,
  });

  if (!partner) {
    return NextResponse.json(
      { error: "Could not record the confirmation." },
      { status: 400 },
    );
  }
  return NextResponse.json({ partner });
}
