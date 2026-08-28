import { NextResponse } from "next/server";
import { requireApiAccess, createServiceSupabaseClient } from "@/lib/supabase/server";
import { extractCv } from "@/lib/data/cv-extract";

// ---------------------------------------------------------------------------
// POST /api/workers/cv — a CV goes in, a proposal comes out.
//
// It does NOT create a worker. A CV is a claim about a person: "10 years
// experience", "fluent German", "A1 certified". Those become a pending
// proposal in Approvals, and a human turns them into a record. Same rule that
// governs everything Scout files.
//
// The file is stored either way, so accepting the proposal later attaches the
// original document to the person rather than leaving only a summary of it.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
// A nine-page CV takes a few seconds to parse; the default is too tight.
export const maxDuration = 60;

const BUCKET = "documents";
const MAX_FILE_SIZE = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Choose a CV file first." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "That file is over 15 MB." }, { status: 400 });
  }
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
    return NextResponse.json(
      { error: "PDF only for now. Export the CV as PDF and try again." },
      { status: 400 },
    );
  }

  const svc = createServiceSupabaseClient();
  if (!svc) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  const bytes = await file.arrayBuffer();

  let extracted;
  try {
    extracted = await extractCv(bytes);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Could not read that PDF. If it is a scan rather than a text document, " +
          "the text has to be recognised first — " +
          (err instanceof Error ? err.message : "unknown error"),
      },
      { status: 400 },
    );
  }

  if (extracted.text.trim().length < 100) {
    return NextResponse.json(
      {
        error:
          "That PDF has almost no readable text — it is probably a scan or a photo. " +
          "Nothing was saved.",
      },
      { status: 400 },
    );
  }

  // Store the original. Filed under the org rather than a worker, because the
  // worker does not exist yet; accepting the proposal re-links it.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${access.organizationId}/cv-inbox/${Date.now()}-${safeName}`;
  const { error: storageError } = await svc.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type || "application/pdf",
      upsert: false,
    });
  if (storageError) {
    return NextResponse.json(
      { error: `Could not store the file: ${storageError.message}` },
      { status: 500 },
    );
  }

  const { data: doc } = await svc
    .from("documents")
    .insert({
      organization_id: access.organizationId,
      title: `CV — ${extracted.guess.fullName ?? file.name}`,
      document_category: "cv",
      linked_entity_type: "cv_inbox",
      storage_bucket: BUCKET,
      storage_path: storagePath,
      file_name: file.name,
      file_extension: "pdf",
      mime_type: file.type || "application/pdf",
      file_size: file.size,
      visibility: "internal",
      sensitivity: "normal",
      uploaded_by: access.userId,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .maybeSingle();

  // The proposal. `cv_text` rides along so the HR agent can read the CV
  // through the API and enrich this before a human decides — the free pass
  // did the plumbing, the agent does the judgement.
  const { data: finding, error: findingError } = await svc
    .from("agent_findings")
    .insert({
      org_id: access.organizationId,
      finding_type: "worker",
      payload: {
        full_name: extracted.guess.fullName,
        email: extracted.guess.email,
        phone: extracted.guess.phone,
        country: extracted.guess.country,
        certificates: extracted.guess.certificates,
        languages: extracted.guess.languages,
        cv_document_id: doc?.id ?? null,
        cv_file_name: file.name,
        cv_pages: extracted.pages,
        cv_text: extracted.text.slice(0, 60000),
      },
      evidence_text: `Read from ${file.name} (${extracted.pages} pages).`,
      // Low on purpose: a first pass off a PDF is a starting point, not a
      // judgement. The agent raises it once it has actually read the text.
      confidence: 40,
      status: "pending",
      idempotency_key: `cv:${storagePath}`,
    })
    .select("id")
    .maybeSingle();

  if (findingError) {
    return NextResponse.json(
      { error: `Could not file the proposal: ${findingError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    findingId: finding?.id ?? null,
    pages: extracted.pages,
    characters: extracted.text.length,
    guess: extracted.guess,
  });
}
