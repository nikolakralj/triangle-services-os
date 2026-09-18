import React from "react";
import { NextResponse } from "next/server";
import { renderToBuffer, Document } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { buildWorkerCv } from "@/lib/data/worker-cv";
import { packFilename } from "@/lib/data/anonymised-cv-filename";
import {
  DEFAULT_PACK_INTENT,
  isPackIntent,
  type PackIntent,
} from "@/lib/data/put-forward";
import { WorkerCvDoc } from "@/lib/pdf/worker-cv-pdf";
import { requireApiAccess } from "@/lib/supabase/server";

/**
 * GET /api/workers/[id]/cv                    — the bio: initials, no contact
 * GET /api/workers/[id]/cv?variant=short_bio  — the bio cut to one screen
 * GET /api/workers/[id]/cv?variant=full_cv    — named, with contact details
 * GET /api/workers/[id]/cv?identity=1         — the same named version
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
  const query = new URL(request.url).searchParams;
  const asked = query.get("variant");
  const intent: PackIntent = isPackIntent(asked)
    ? asked
    : query.get("identity") === "1"
      ? "full_cv"
      : DEFAULT_PACK_INTENT;

  const cv = await buildWorkerCv({
    workerId: id,
    orgId: access.organizationId,
    intent,
  });
  if (!cv) {
    return NextResponse.json({ error: "Worker not found." }, { status: 404 });
  }

  const element = React.createElement(WorkerCvDoc, {
    cv,
  }) as unknown as ReactElement<DocumentProps, typeof Document>;
  const buffer = await renderToBuffer(element);

  const filename = packFilename({
    intent: cv.intent,
    reference: cv.reference,
    workerName: cv.displayName,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
