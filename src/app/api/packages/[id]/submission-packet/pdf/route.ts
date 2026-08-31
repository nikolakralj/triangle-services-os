import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { buildPdfPacketData } from "@/lib/data/submission-packet";
import { renderToBuffer, Document } from "@react-pdf/renderer";
import SubmissionPacketPdf from "@/lib/pdf/submission-packet-pdf";
import React from "react";
import type { ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import {
  getOrganizationOperatingProfile,
  isOrganizationProfileComplete,
} from "@/lib/data/organization-profile";

// ---------------------------------------------------------------------------
// GET /api/packages/[id]/submission-packet/pdf
// Generates a PDF crew submission packet from submitted workers.
// Returns: PDF binary (application/pdf)
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
    return NextResponse.json(
      { error: "PDF generation not available in demo mode." },
      { status: 403 },
    );
  }

  const profile = await getOrganizationOperatingProfile(access.organizationId);
  if (!isOrganizationProfileComplete(profile)) {
    return NextResponse.json(
      { error: "Complete the organization profile before creating buyer documents." },
      { status: 409 },
    );
  }

  const data = await buildPdfPacketData(
    packageId,
    access.organizationId,
    profile.name,
  );
  if (!data) {
    return NextResponse.json({ error: "Package not found or access denied." }, { status: 404 });
  }

  if (data.workers.length === 0) {
    return NextResponse.json(
      { error: "No submitted workers. Move workers to Submitted tab first." },
      { status: 422 },
    );
  }

  const element = React.createElement(
    SubmissionPacketPdf,
    { data },
  ) as unknown as ReactElement<DocumentProps, typeof Document>;

  const buffer = await renderToBuffer(element);
  const uint8 = new Uint8Array(buffer);

  const filename = `crew-submission-${packageId.slice(0, 8)}.pdf`;

  return new Response(uint8, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(uint8.byteLength),
    },
  });
}
