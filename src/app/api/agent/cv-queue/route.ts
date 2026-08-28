import { NextResponse } from "next/server";
import { verifyMachineToken } from "@/lib/auth/machine";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// The HR agent's half of a CV.
//
// Triangle does the plumbing for free: pull the text out of the PDF, take the
// email address and the certificate acronyms a regex reads perfectly well.
// What is left is judgement — that "PCS7, TIA Portal, Sinamics" means PLC
// commissioning, that fifteen years of shutdowns is a supervisor not a mate,
// that "Portuguese basic" is not going to help on a German site. That is
// reasoning, and it belongs to an agent on a flat subscription rather than a
// per-token API.
//
// GET   — CVs waiting to be read, with their full text.
// PATCH — add what you concluded to the proposal.
//
// The agent can enrich but never accept: the proposal stays pending until a
// human decides. A CV is a claim about a person, and the moment an agent can
// turn a claim into a placeable worker, nobody is checking.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

const SCOPE = "worker.propose";

/** Fields the agent may contribute. Anything else is ignored on purpose. */
const ALLOWED = new Set([
  "full_name",
  "role",
  "worker_type",
  "email",
  "phone",
  "country",
  "city",
  "skills",
  "certificates",
  "languages",
  "industries",
  "summary",
  "years_experience",
]);

export async function GET(request: Request) {
  const machine = await verifyMachineToken(request);
  if (!machine) {
    return NextResponse.json(
      { error: "Machine credential required (tri_mc_… token)." },
      { status: 401 },
    );
  }
  if (!machine.scopes.includes(SCOPE)) {
    return NextResponse.json(
      { error: `Credential "${machine.name}" needs the ${SCOPE} scope.` },
      { status: 403 },
    );
  }

  const svc = createServiceSupabaseClient();
  if (!svc) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });

  const { data } = await svc
    .from("agent_findings")
    .select("id, payload, confidence, created_at")
    .eq("org_id", machine.orgId)
    .eq("finding_type", "worker")
    .eq("status", "pending")
    .order("created_at")
    .limit(10);

  const cvs = (data ?? []).map((f) => {
    const p = (f.payload as Record<string, unknown>) ?? {};
    return {
      findingId: f.id as string,
      fileName: p.cv_file_name ?? null,
      pages: p.cv_pages ?? null,
      // What the free pass already read — do not re-derive these, correct
      // them only if the text plainly disagrees.
      alreadyRead: {
        full_name: p.full_name ?? null,
        email: p.email ?? null,
        phone: p.phone ?? null,
        country: p.country ?? null,
        certificates: p.certificates ?? [],
        languages: p.languages ?? [],
      },
      enrichedBy: p.enriched_by ?? null,
      cvText: p.cv_text ?? "",
    };
  });

  return NextResponse.json({
    agent: machine.name,
    cvs,
    note:
      "Read cvText and PATCH this endpoint with { findingId, payload } — role, skills, " +
      "certificates, languages, city, years_experience, summary. Add to what is in " +
      "alreadyRead; do not delete it. State only what the CV supports: an invented " +
      "certificate puts an uncertified person on a live site. You cannot accept a " +
      "proposal — a human does that in Approvals.",
  });
}

export async function PATCH(request: Request) {
  const machine = await verifyMachineToken(request);
  if (!machine) {
    return NextResponse.json(
      { error: "Machine credential required (tri_mc_… token)." },
      { status: 401 },
    );
  }
  if (!machine.scopes.includes(SCOPE)) {
    return NextResponse.json(
      { error: `Credential "${machine.name}" needs the ${SCOPE} scope.` },
      { status: 403 },
    );
  }

  let body: { findingId?: string; payload?: Record<string, unknown>; confidence?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const findingId = String(body.findingId ?? "").trim();
  if (!findingId || !body.payload || typeof body.payload !== "object") {
    return NextResponse.json(
      { error: "findingId and payload are required." },
      { status: 400 },
    );
  }

  const svc = createServiceSupabaseClient();
  if (!svc) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });

  const { data: finding } = await svc
    .from("agent_findings")
    .select("id, payload, status")
    .eq("id", findingId)
    .eq("org_id", machine.orgId)
    .eq("finding_type", "worker")
    .maybeSingle();

  if (!finding) {
    return NextResponse.json({ error: "No such CV proposal." }, { status: 404 });
  }
  if (finding.status !== "pending") {
    return NextResponse.json(
      { error: "That proposal has already been decided." },
      { status: 409 },
    );
  }

  const current = (finding.payload as Record<string, unknown>) ?? {};
  const merged: Record<string, unknown> = { ...current };

  for (const [key, value] of Object.entries(body.payload)) {
    if (!ALLOWED.has(key)) continue;
    if (value == null || value === "") continue;

    // Lists add rather than replace: the regex pass already found the
    // acronyms, the agent finds the rest, and neither should erase the other.
    if (Array.isArray(value)) {
      const have = Array.isArray(current[key]) ? (current[key] as unknown[]).map(String) : [];
      const lower = new Set(have.map((v) => v.toLowerCase()));
      const added = value.map(String).filter((v) => v && !lower.has(v.toLowerCase()));
      merged[key] = [...have, ...added];
    } else {
      merged[key] = value;
    }
  }

  merged.enriched_by = machine.name;
  merged.enriched_at = new Date().toISOString();

  const confidence =
    typeof body.confidence === "number"
      ? Math.max(0, Math.min(100, Math.round(body.confidence)))
      : undefined;

  const { error } = await svc
    .from("agent_findings")
    .update({
      payload: merged,
      ...(confidence !== undefined ? { confidence } : {}),
    })
    .eq("id", findingId)
    .eq("org_id", machine.orgId)
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, findingId, stillPending: true });
}
