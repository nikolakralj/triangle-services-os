import { NextResponse } from "next/server";
import { verifyMachineToken, hasScope } from "@/lib/auth/machine";
import { createFinding } from "@/lib/data/findings";

// ---------------------------------------------------------------------------
// POST /api/agent/findings
//
// How an agent reports something Triangle has never heard of. Every research
// MCP tool needs a project_id; this one does not — which is the whole point.
// Scout hit that wall on his first run ("Triangle has no German auto plant
// record to attach a new finding to").
//
// A finding is a PROPOSAL. It lands pending, a human accepts it, and only
// then does it become a real record. Agents cannot promote their own work.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

// `contact_channel` was missing here while agents/scout.md told Scout to use
// it. Scout filed as "contact" instead and left `intended_finding_type` in the
// payload — honest, and the reason three real published channels for Peter
// Östlund could not be accepted. Keep this list and the role files in step.
const VALID_TYPES = [
  "project",
  "company",
  "contact",
  "contact_channel",
  "project_facts",
  "requirement_facts",
  "play",
  "worker",
  "other",
];
const REQUIRED_SCOPE = "research.suggestion.create";

export async function POST(request: Request) {
  const machine = await verifyMachineToken(request);
  if (!machine) {
    return NextResponse.json(
      { error: "Machine credential required (tri_mc_… token)." },
      { status: 401 },
    );
  }
  if (!hasScope(machine, REQUIRED_SCOPE)) {
    return NextResponse.json(
      { error: `Credential "${machine.name}" lacks the ${REQUIRED_SCOPE} scope.` },
      { status: 403 },
    );
  }

  let body: {
    findingType?: string;
    payload?: Record<string, unknown>;
    sourceUrl?: string;
    sourceDate?: string;
    evidenceText?: string;
    confidence?: number;
    idempotencyKey?: string;
    assignmentId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const findingType = String(body.findingType ?? "").trim();
  if (!VALID_TYPES.includes(findingType)) {
    return NextResponse.json(
      { error: `findingType must be one of: ${VALID_TYPES.join(", ")}.` },
      { status: 400 },
    );
  }

  // Two shapes, on purpose.
  //
  // Scout filed three contact_channel findings on 3 September whose payload
  // arrived as {} — the report described three published routes for Paul Boxer
  // and the rows stored nothing. The same agent had filed full payloads under
  // `contact` an hour earlier, so the difference was the request shape, not the
  // agent. Rather than lose real research to a key name, the recognised finding
  // fields are also accepted at the top level.
  const RESERVED = new Set([
    "findingType",
    "payload",
    "sourceUrl",
    "sourceDate",
    "evidenceText",
    "confidence",
    "idempotencyKey",
    "assignmentId",
  ]);
  const raw = body as unknown as Record<string, unknown>;
  const nested = body.payload ?? {};
  const flat = Object.fromEntries(
    Object.entries(raw).filter(([k, v]) => !RESERVED.has(k) && v !== undefined),
  );
  const payload = Object.keys(nested).length > 0 ? nested : flat;

  // A finding with nothing in it is not a discovery, and storing one puts a row
  // in the approvals queue that a human cannot act on and cannot understand.
  if (Object.keys(payload).length === 0) {
    return NextResponse.json(
      {
        error:
          "payload is empty. Send the finding's fields under `payload` (or at the top level) — a finding with no content cannot be reviewed or accepted.",
      },
      { status: 400 },
    );
  }

  if (findingType === "project" && !payload.project_name && !payload.name) {
    return NextResponse.json(
      { error: "A project finding needs payload.project_name." },
      { status: 400 },
    );
  }

  // Same standard as the research tools: a claim without a source is not a
  // finding, it is a guess.
  const sourceUrl = String(body.sourceUrl ?? "").trim();
  const evidenceText = String(body.evidenceText ?? "").trim();
  if (!sourceUrl || evidenceText.length < 10) {
    return NextResponse.json(
      {
        error:
          "sourceUrl and evidenceText (10+ chars) are required — every finding must be traceable to a source.",
      },
      { status: 400 },
    );
  }

  const created = await createFinding({
    orgId: machine.orgId,
    agentInstanceId: machine.agentInstanceId,
    assignmentId: body.assignmentId ?? null,
    findingType,
    payload,
    sourceUrl,
    sourceDate: body.sourceDate ?? null,
    evidenceText,
    confidence:
      typeof body.confidence === "number"
        ? Math.max(0, Math.min(100, Math.round(body.confidence)))
        : null,
    idempotencyKey: body.idempotencyKey ?? null,
  });

  if (!created) {
    return NextResponse.json({ error: "Could not save the finding." }, { status: 500 });
  }

  return NextResponse.json({
    findingId: created.id,
    duplicate: created.duplicate,
    status: "pending",
    note: created.duplicate
      ? "Already submitted — nothing changed."
      : "Filed for human review. It becomes a real record only once approved.",
  });
}
