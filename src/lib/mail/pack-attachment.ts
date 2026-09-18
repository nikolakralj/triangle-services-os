import "server-only";
import React from "react";
import { renderToBuffer, Document } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { packFilename } from "@/lib/data/anonymised-cv-filename";
import type { PackIntent } from "@/lib/data/put-forward";
import { buildWorkerCv } from "@/lib/data/worker-cv";
import { WorkerCvDoc } from "@/lib/pdf/worker-cv-pdf";

// ---------------------------------------------------------------------------
// The file a person may attach to Send from Triangle, in the version they
// approved.
//
// It used to be anonymised whatever the case said, so a case whose whole
// point was a released identity still attached initials, under a checkbox
// that promised "the anonymised Triangle profile" either way. The document
// and the decision now have to be the same thing: `intent` comes from the
// approved record, never from the browser.
//
// On an anonymised profile the filename is the Triangle reference, never the
// worker's name. Building it is not sending it — only /api/mail/send, behind
// the approval gate, puts this on the wire.
// ---------------------------------------------------------------------------

export async function buildPackAttachment(params: {
  orgId: string;
  workerId: string;
  intent: PackIntent;
}): Promise<{
  filename: string;
  contentType: string;
  bytes: Buffer;
} | null> {
  const named = params.intent === "full_cv";
  const cv = await buildWorkerCv({
    workerId: params.workerId,
    orgId: params.orgId,
    includeIdentity: named,
  });
  if (!cv) return null;

  const element = React.createElement(WorkerCvDoc, {
    cv,
  }) as unknown as ReactElement<DocumentProps, typeof Document>;
  const buffer = await renderToBuffer(element);
  return {
    filename: packFilename({
      intent: params.intent,
      reference: cv.reference,
      workerName: cv.displayName,
    }),
    contentType: "application/pdf",
    bytes: buffer,
  };
}
