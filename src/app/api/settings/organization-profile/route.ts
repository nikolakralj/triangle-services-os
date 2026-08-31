import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@/lib/supabase/server";
import {
  DEMO_ORGANIZATION_PROFILE,
  OFFER_MODES,
  OPERATING_MODELS,
  getOrganizationOperatingProfile,
  updateOrganizationOperatingProfile,
} from "@/lib/data/organization-profile";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(160),
  operatingModel: z.enum(OPERATING_MODELS),
  offerMode: z.enum(OFFER_MODES),
  companyProfile: z.string().trim().min(30).max(4_000),
  replySignoff: z.string().trim().min(2).max(500),
  defaultCurrency: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/)),
  timezone: z.string().trim().min(3).max(100),
});

export async function GET(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({
      profile: DEMO_ORGANIZATION_PROFILE,
      readOnly: true,
    });
  }

  const profile = await getOrganizationOperatingProfile(access.organizationId);
  if (!profile) {
    return NextResponse.json(
      { error: "Could not load the organization profile." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    profile,
    readOnly: access.role !== "admin" && access.role !== "partner",
  });
}

export async function PUT(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json(
      { error: "Organization settings are read-only in demo mode." },
      { status: 403 },
    );
  }
  if (access.role !== "admin" && access.role !== "partner") {
    return NextResponse.json(
      { error: "Only an admin or partner can change organization settings." },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = profileSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "The organization profile is incomplete or invalid.",
      },
      { status: 400 },
    );
  }

  const profile = await updateOrganizationOperatingProfile({
    orgId: access.organizationId,
    userId: access.userId,
    ...parsed.data,
  });

  if (!profile) {
    return NextResponse.json(
      { error: "Could not save the organization profile." },
      { status: 500 },
    );
  }

  return NextResponse.json({ profile });
}
