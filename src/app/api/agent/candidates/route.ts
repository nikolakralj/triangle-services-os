import { NextResponse } from "next/server";
import { verifyMachineToken } from "@/lib/auth/machine";
import { fileCandidateBatch } from "@/lib/data/candidate-import";

// ---------------------------------------------------------------------------
// POST /api/agent/candidates
//
// Hanna's badge (worker.propose) files a batch of people. Each valid item
// becomes a pending worker finding. A person accepts or rejects it in
// Approvals — the batch together, or one at a time. Accepting creates a
// candidate. It does not make anyone placeable.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

const SCOPE = "worker.propose";

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await fileCandidateBatch({
    orgId: machine.orgId,
    agentInstanceId: machine.agentInstanceId,
    badgeName: machine.name,
    candidates: (body as { candidates?: unknown }).candidates,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    { batchId: result.batchId, results: result.results },
    { headers: { "Cache-Control": "no-store" } },
  );
}
