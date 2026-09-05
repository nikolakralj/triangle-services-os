import { NextResponse } from "next/server";
import { requireApiAccess, createServiceSupabaseClient } from "@/lib/supabase/server";
import { extractCv } from "@/lib/data/cv-extract";
import { readCv } from "@/lib/ai/cv-reader";

// ---------------------------------------------------------------------------
// POST /api/workers/cv — a CV goes in, a read profile comes out.
//
// A CV is a claim about a person: "10 years experience", "fluent German",
// "A1 certified". The claim is recorded, read by a model, and attached to a
// candidate — somebody on the books who cannot yet be put on a site, because
// every matching and submission query in this codebase requires status
// 'active'.
//
// So the human approval that matters still exists; it has moved to where it
// carries weight. Vouching for a person is a decision. Confirming that a
// parser found an email address is not, and asking for it fifty times over is
// how a CEO ends up doing data entry for his own software.
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

  // Read it properly, here, now.
  //
  // This used to file a proposal carrying an email address and a couple of
  // language lines, and ask a human to approve it. The card said "Nikola Kralj
  // · Croatia" — no role, no skills, no seniority, no link to the CV. That is
  // not a decision, it is data entry with a confirmation step, and the half
  // that would have made it worth reading was parked behind an HR agent that
  // had never once authenticated.
  //
  // A model is better, cheaper and faster at reading a CV than either of the
  // two people who run this company, so neither of them does it.
  const reading = await readCv(extracted.text, {
    fullName: extracted.guess.fullName,
    country: extracted.guess.country,
  });

  const payload = {
    full_name: extracted.guess.fullName,
    email: extracted.guess.email,
    phone: extracted.guess.phone,
    // The regex pass and the reading can disagree about country; the reading
    // has seen the whole document, the regex has seen a keyword.
    country: reading?.country ?? extracted.guess.country,
    city: reading?.city ?? null,
    role: reading?.role ?? null,
    seniority: reading?.seniority ?? null,
    years_experience: reading?.years_experience ?? null,
    summary: reading?.summary ?? null,
    // Union, not replacement: a ticket either pass found is a ticket found.
    certificates: mergeLists(extracted.guess.certificates, reading?.certificates),
    languages: mergeLists(extracted.guess.languages, reading?.languages, languageName),
    skills: reading?.skills ?? [],
    industries: reading?.industries ?? [],
    concerns: reading?.concerns ?? [],
    read_by: reading ? "gpt-4.1-mini" : null,
    cv_document_id: doc?.id ?? null,
    cv_file_name: file.name,
    cv_pages: extracted.pages,
    cv_text: extracted.text.slice(0, 60000),
  };

  // The person goes on the books immediately, as a candidate.
  //
  // `candidate` is not a placeable worker: every matching, availability and
  // submission query in this codebase requires status 'active'. So nothing an
  // agent read can put somebody on a live site — a human still vouches, at the
  // point where vouching means something, rather than rubber-stamping a parse.
  const { data: worker, error: workerError } = await svc
    .from("workers")
    .insert({
      organization_id: access.organizationId,
      full_name: extracted.guess.fullName ?? file.name.replace(/\.pdf$/i, ""),
      role: payload.role,
      email: payload.email,
      phone: payload.phone,
      country: payload.country,
      city: payload.city,
      skills: payload.skills,
      certificates: payload.certificates,
      languages: payload.languages,
      industries: payload.industries,
      notes: payload.summary,
      status: "candidate",
      availability_status: "unknown",
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .single();

  if (workerError) {
    return NextResponse.json(
      { error: `Could not create the profile: ${workerError.message}` },
      { status: 500 },
    );
  }

  // The finding is the evidence trail, not a queue item. Filed already
  // resolved so fifty CVs do not become fifty approvals — the provenance
  // (which CV, read by what, how sure) stays attached to the person.
  const { data: finding } = await svc
    .from("agent_findings")
    .insert({
      org_id: access.organizationId,
      finding_type: "worker",
      payload,
      evidence_text: `Read from ${file.name} (${extracted.pages} pages).`,
      confidence: reading?.confidence ?? 40,
      status: "accepted",
      promoted_entity_type: "worker",
      promoted_entity_id: worker.id,
      reviewed_by: access.userId,
      reviewed_at: new Date().toISOString(),
      idempotency_key: `cv:${storagePath}`,
    })
    .select("id")
    .maybeSingle();

  // Attach the original PDF to the person it describes.
  if (doc?.id) {
    await svc
      .from("documents")
      .update({ linked_entity_type: "worker", linked_entity_id: worker.id })
      .eq("id", doc.id);
  }

  return NextResponse.json({
    ok: true,
    workerId: worker.id,
    findingId: finding?.id ?? null,
    pages: extracted.pages,
    characters: extracted.text.length,
    read: Boolean(reading),
    name: payload.full_name,
    role: payload.role,
    concerns: payload.concerns,
  });
}

/**
 * Both passes contribute; neither overwrites the other.
 *
 * The regex knows a vocabulary of ticket names and the reading knows what the
 * document said, so they arrive at the same fact by different routes: "SCC"
 * and "SCC Dokument 018 (valid until 2028)", "A1" and "A1 certificate",
 * "German native" and "German Muttersprache". Listing both makes a person look
 * as though they hold two tickets where they hold one. Where one entry
 * contains another, the longer one wins — it is the same fact with more of the
 * detail kept.
 */
function mergeLists(
  a: string[] = [],
  b: string[] = [],
  /**
   * What counts as "the same entry". Languages need it: "German native" and
   * "German Muttersprache" are one language described twice, and neither
   * string contains the other, so the language name itself is the identity.
   */
  identity?: (value: string) => string,
): string[] {
  const cleaned = [...a, ...b].map((v) => v.trim()).filter(Boolean);
  // Longest first, so a specific entry is seated before its own abbreviation
  // arrives to be swallowed.
  cleaned.sort((x, y) => y.length - x.length);

  const kept: string[] = [];
  const keys = new Set<string>();
  for (const value of cleaned) {
    if (identity) {
      const key = identity(value);
      if (keys.has(key)) continue;
      keys.add(key);
      kept.push(value);
      continue;
    }
    const lower = value.toLowerCase();
    if (!kept.some((k) => k.toLowerCase().includes(lower))) kept.push(value);
  }
  return kept;
}

/** "German native" and "German Muttersprache" are both German. */
const languageName = (value: string) =>
  value.trim().split(/[\s(,\-–—:]/)[0].toLowerCase();
