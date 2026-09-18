import "server-only";
import React from "react";
import { renderToBuffer, Document } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { anonymisedCvFilename } from "@/lib/data/anonymised-cv-filename";
import { buildWorkerCv } from "@/lib/data/worker-cv";
import { WorkerCvDoc } from "@/lib/pdf/worker-cv-pdf";

// ---------------------------------------------------------------------------
// The file a person may attach to Send from Triangle: initials, no contact,
// filename is the Triangle reference — never the worker's name.
//
// Building it is not sending it. Only /api/mail/send (human, review, Send now)
// puts this on the wire.
// ---------------------------------------------------------------------------

export async function buildAnonymisedCvAttachment(params: {
  orgId: string;
  workerId: string;
}): Promise<{
  filename: string;
  contentType: string;
  bytes: Buffer;
} | null> {
  const cv = await buildWorkerCv({
    workerId: params.workerId,
    orgId: params.orgId,
    includeIdentity: false,
  });
  if (!cv) return null;

  const element = React.createElement(WorkerCvDoc, {
    cv,
  }) as unknown as ReactElement<DocumentProps, typeof Document>;
  const buffer = await renderToBuffer(element);
  return {
    filename: anonymisedCvFilename(cv.reference),
    contentType: "application/pdf",
    bytes: buffer,
  };
}
