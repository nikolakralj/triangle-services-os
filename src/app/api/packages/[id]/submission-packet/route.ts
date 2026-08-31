import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { buildSubmissionPacket } from "@/lib/data/submission-packet";
import {
  getOrganizationOperatingProfile,
  isOrganizationProfileComplete,
} from "@/lib/data/organization-profile";

// ---------------------------------------------------------------------------
// GET /api/packages/[id]/submission-packet
// Builds a markdown submission packet from submitted workers on a package.
// Returns: { packageId, packageTitle, projectTitle, workerCount, markdown }
// ---------------------------------------------------------------------------
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id: packageId } = await params;

  if (access.demo) {
    return NextResponse.json({
      packageId,
      packageTitle: "Demo Package",
      projectTitle: "Demo Project",
      workerCount: 0,
      markdown: "Submission packet not available in demo mode.",
      generatedAt: new Date().toISOString(),
    });
  }

  const profile = await getOrganizationOperatingProfile(access.organizationId);
  if (!isOrganizationProfileComplete(profile)) {
    return NextResponse.json(
      { error: "Complete the organization profile before creating buyer documents." },
      { status: 409 },
    );
  }

  const packet = await buildSubmissionPacket(
    packageId,
    access.organizationId,
    profile.name,
  );
  if (!packet) {
    return NextResponse.json({ error: "Package not found or access denied." }, { status: 404 });
  }
  return NextResponse.json(packet);
}
