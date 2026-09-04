import React from "react";
import { NextResponse } from "next/server";
import { renderToBuffer, Document } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { buildWorkerCv } from "@/lib/data/worker-cv";
import { WorkerCvDoc } from "@/lib/pdf/worker-cv-pdf";
import { requireApiAccess } from "@/lib/supabase/server";

/**
 * GET /api/workers/[id]/cv          — anonymised candidate profile
 * GET /api/workers/[id]/cv?identity=1 — named, with contact details
 *
 * The document the active organization may send a buyer. Anonymised is the default:
 * releasing a name and an email to a prospect who has committed to nothing is
 * a personal-data disclosure and an invitation to go direct. Asking for the
 * named version is a deliberate act, and it is recorded in the URL.
 */
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const includeIdentity =
    new URL(request.url).searchParams.get("identity") === "1";

  const cv = await buildWorkerCv({
    workerId: id,
    orgId: access.organizationId,
    includeIdentity,
  });
  if (!cv) {
    return NextResponse.json({ error: "Worker not found." }, { status: 404 });
  }

  const element = React.createElement(WorkerCvDoc, {
    cv,
  }) as unknown as ReactElement<DocumentProps, typeof Document>;
  const buffer = await renderToBuffer(element);

  const filename = includeIdentity
    ? `${cv.displayName.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-cv.pdf`
    : `${cv.reference.toLowerCase()}-profile.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
