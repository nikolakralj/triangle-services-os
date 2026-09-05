import { NextResponse } from "next/server";
import { readCv } from "@/lib/ai/cv-reader";
import { extractCv } from "@/lib/data/cv-extract";
import { createServiceSupabaseClient, requireApiAccess } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Read the CV that is already on file, again.
//
// Every profile created before the upload started reading CVs is a husk: a
// name, an email address, a couple of language lines, and nothing a staffing
// manager could use. The document those fields came from is still in storage,
// attached to the person. Re-uploading it to get the rest would mean the
// company keeps two copies of the same PDF because the software improved.
//
// Also the honest answer when a reading was poor, or when a better model
// arrives: point it at the same document and take the new answer.
//
// Only empty fields are filled. A role somebody typed by hand outranks
// anything a model concluded, and overwriting it silently is how a human stops
// trusting the system.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo || access.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const svc = createServiceSupabaseClient();
  if (!svc) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });

  const { data: worker } = await svc
    .from("workers")
    .select("id, full_name, role, country, city, skills, certificates, languages, industries, notes")
    .eq("id", id)
    .eq("organization_id", access.organizationId)
    .maybeSingle();
  if (!worker) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // The text, from wherever it still exists: the finding filed at upload, or
  // failing that the PDF itself.
  let cvText = "";
  const { data: finding } = await svc
    .from("agent_findings")
    .select("id, payload")
    .eq("org_id", access.organizationId)
    .eq("finding_type", "worker")
    .eq("promoted_entity_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = (finding?.payload as Record<string, unknown>) ?? {};
  if (typeof payload.cv_text === "string") cvText = payload.cv_text;

  if (cvText.trim().length < 100) {
    const { data: doc } = await svc
      .from("documents")
      .select("storage_bucket, storage_path")
      .eq("organization_id", access.organizationId)
      .eq("linked_entity_id", id)
      .eq("document_category", "cv")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!doc) {
      return NextResponse.json(
        { error: "There is no CV on file for this person to read." },
        { status: 404 },
      );
    }
    const { data: file, error: dlError } = await svc.storage
      .from(doc.storage_bucket as string)
      .download(doc.storage_path as string);
    if (dlError || !file) {
      return NextResponse.json(
        { error: `Could not open the stored CV: ${dlError?.message ?? "unknown error"}` },
        { status: 500 },
      );
    }
    try {
      cvText = (await extractCv(await file.arrayBuffer())).text;
    } catch (err) {
      return NextResponse.json(
        { error: `Could not read the stored CV: ${err instanceof Error ? err.message : "unknown"}` },
        { status: 500 },
      );
    }
  }

  const reading = await readCv(cvText, {
    fullName: worker.full_name as string,
    country: worker.country as string | null,
  });
  if (!reading) {
    return NextResponse.json(
      { error: "The CV could not be read. Nothing was changed." },
      { status: 502 },
    );
  }

  const empty = (v: unknown) =>
    v == null || v === "" || (Array.isArray(v) && v.length === 0);

  const updates: Record<string, unknown> = {};
  if (empty(worker.role) && reading.role) updates.role = reading.role;
  if (empty(worker.city) && reading.city) updates.city = reading.city;
  if (empty(worker.country) && reading.country) updates.country = reading.country;
  if (empty(worker.skills) && reading.skills.length) updates.skills = reading.skills;
  if (empty(worker.certificates) && reading.certificates.length) {
    updates.certificates = reading.certificates;
  }
  if (empty(worker.languages) && reading.languages.length) {
    updates.languages = reading.languages;
  }
  if (empty(worker.industries) && reading.industries.length) {
    updates.industries = reading.industries;
  }
  if (empty(worker.notes) && reading.summary) updates.notes = reading.summary;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({
      ok: true,
      filled: [],
      note: "The CV was read and everything it says was already on the profile.",
    });
  }

  updates.updated_by = access.userId;
  const { error } = await svc
    .from("workers")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", access.organizationId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Keep the provenance honest: the record now says more than it did, and the
  // reading that put it there is what should be on file.
  if (finding?.id) {
    await svc
      .from("agent_findings")
      .update({
        payload: {
          ...payload,
          ...reading,
          read_by: "gpt-4.1-mini",
          reread_at: new Date().toISOString(),
        },
        confidence: reading.confidence,
      })
      .eq("id", finding.id);
  }

  return NextResponse.json({
    ok: true,
    filled: Object.keys(updates).filter((k) => k !== "updated_by"),
    concerns: reading.concerns,
  });
}
