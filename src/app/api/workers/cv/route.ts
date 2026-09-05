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

  // Belt as well as braces. extractCv no longer detaches what it is given, but
  // an empty object in storage is silent — nobody finds out until they click
  // the link months later — so refuse to write one rather than discover it.
  if (bytes.byteLength === 0) {
    return NextResponse.json(
      { error: "The uploaded file arrived empty. Nothing was saved." },
      { status: 400 },
    );
  }

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

  // Is this somebody we already know?
  //
  // A second CV for the same person is the normal case, not the exception —
  // an updated one arrives, or the same file gets dragged in twice out of a
  // folder of fifty. Creating a second profile splits one person's tickets and
  // history across two records, and the first anyone notices is when a buyer
  // is sent the wrong half.
  //
  // Decided here rather than in a review queue. Which of two records is the
  // same human is not a decision worth interrupting anybody for, and a
  // duplicate-review screen is the beginning of the CRM nobody wants.
  const fullName = extracted.guess.fullName ?? file.name.replace(/\.pdf$/i, "");
  const existing = await findSamePerson(svc, access.organizationId, {
    email: payload.email,
    fullName,
    country: payload.country,
  });

  const fields = {
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
  };

  let worker: { id: string };
  let updatedExisting = false;
  let disagreements: string[] = [];

  if (existing) {
    updatedExisting = true;
    // Lists are always a union: a ticket earned three years ago is not revoked
    // by a CV that forgot to mention it.
    //
    // Single values depend on whether anyone has vouched for this person yet.
    // A candidate has only ever been described by a machine, so a newer CV
    // replaces what an older one said. An active worker has been through a
    // human — somebody set that role, corrected that city, and did it knowing
    // what the CV claimed — and a parser silently overwriting them is how a
    // person stops trusting the record. There, a CV fills blanks only.
    const vouchedFor = existing.status === "active";
    const update: Record<string, unknown> = { updated_by: access.userId };
    const kept: string[] = [];

    for (const [key, value] of Object.entries(fields)) {
      if (value == null || (Array.isArray(value) && value.length === 0)) continue;
      if (Array.isArray(value)) {
        update[key] = mergeLists(
          (existing[key as keyof typeof existing] as string[]) ?? [],
          value,
          key === "languages" ? languageName : undefined,
        );
        continue;
      }
      const current = existing[key as keyof typeof existing];
      if (vouchedFor && current != null && current !== "") {
        // Not silent: the CV disagreeing with a vouched record is worth
        // knowing about, even though it does not get to win.
        if (String(current) !== String(value)) kept.push(`${key} stayed "${current}"`);
        continue;
      }
      update[key] = value;
    }
    disagreements = kept;
    const { error: updateError } = await svc
      .from("workers")
      .update(update)
      .eq("id", existing.id)
      .eq("organization_id", access.organizationId);
    if (updateError) {
      return NextResponse.json(
        { error: `Could not update the profile: ${updateError.message}` },
        { status: 500 },
      );
    }
    worker = { id: existing.id };
  } else {
    // The person goes on the books immediately, as a candidate.
    //
    // `candidate` is not a placeable worker: every matching, availability and
    // submission query in this codebase requires status 'active'. So nothing a
    // model read can put somebody on a live site — a human still vouches, at
    // the point where vouching means something, rather than rubber-stamping a
    // parse.
    const { data: created, error: workerError } = await svc
      .from("workers")
      .insert({
        organization_id: access.organizationId,
        full_name: fullName,
        ...fields,
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
    worker = created;
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
    // Said out loud rather than left for someone to discover: a folder of
    // fifty CVs will contain people already on the books, and "updated" and
    // "added" are different outcomes.
    updatedExisting,
    disagreements,
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
    // Containment on the words, not the characters. Read twice, the same
    // ticket comes back punctuated differently — "SCC Dokument 018 (valid
    // until 2028)" and "SCC 018 valid until 2028" are one certificate, and a
    // plain substring test keeps both.
    const words = tokens(value);
    if (!kept.some((k) => isSubset(words, tokens(k)))) kept.push(value);
  }
  return kept;
}

const STOPWORDS = new Set(["the", "a", "an", "of", "to", "up", "and", "bis", "und", "der", "die", "das"]);

/** Comparable words: lowercase, unpunctuated, no filler. */
function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((w) => w && !STOPWORDS.has(w)),
  );
}

function isSubset(small: Set<string>, large: Set<string>): boolean {
  if (small.size === 0) return true;
  for (const w of small) if (!large.has(w)) return false;
  return true;
}

/** "German native" and "German Muttersprache" are both German. */
const languageName = (value: string) =>
  value.trim().split(/[\s(,\-–—:]/)[0].toLowerCase();

/** Ignore case, punctuation and doubled spaces when comparing two names. */
const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type WorkerLike = {
  status: string;
  role: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  id: string;
  skills: string[];
  certificates: string[];
  languages: string[];
  industries: string[];
};

/**
 * The person this CV is about, if they are already on the books.
 *
 * Two signals, both deliberately strict. An email address is as good as an
 * identifier gets — nobody shares one. Failing that, the same name in the same
 * country: common enough to be reliable inside one company's roster, and
 * narrow enough that two different Michael Schmidts in Germany and Austria
 * stay two people. Anything weaker would silently merge two humans into one
 * record, which is far worse than holding two records for one human.
 */
async function findSamePerson(
  svc: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  orgId: string,
  cv: { email: string | null; fullName: string; country: string | null },
): Promise<WorkerLike | null> {
  const columns =
    "id, full_name, email, role, city, country, status, skills, certificates, languages, industries, notes";

  if (cv.email) {
    const { data } = await svc
      .from("workers")
      .select(columns)
      .eq("organization_id", orgId)
      .ilike("email", cv.email)
      .limit(1)
      .maybeSingle();
    if (data) return data as unknown as WorkerLike;
  }

  const target = normalizeName(cv.fullName);
  if (!target) return null;

  // Compared in JS rather than SQL: the normalisation strips accents and
  // punctuation, and "Müller" has to match "Mueller" written by a parser that
  // lost the umlaut.
  const { data: candidates } = await svc
    .from("workers")
    .select(columns)
    .eq("organization_id", orgId);

  for (const row of candidates ?? []) {
    if (normalizeName(String(row.full_name ?? "")) !== target) continue;
    const sameCountry =
      !cv.country ||
      !row.country ||
      String(row.country).toLowerCase() === cv.country.toLowerCase();
    if (sameCountry) return row as unknown as WorkerLike;
  }
  return null;
}
