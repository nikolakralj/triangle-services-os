import { NextResponse } from "next/server";
import { verifyMachineToken } from "@/lib/auth/machine";
import { lookupRecords, machineMayLookupWorkers, machineMayReadMissions } from "@/lib/data/mission-bot";

// ---------------------------------------------------------------------------
// GET /api/agent/lookup?q=…&type=company|contact|worker — what Triangle already has.
//
// A bot looks before it files, so the same company is not researched twice
// under a second spelling. Worker lookup needs worker.propose and returns
// initials and matching facts, never emails, phones or CV text.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function GET(request: Request) {
  const machine = await verifyMachineToken(request);
  if (!machine) {
    return NextResponse.json({ error: "Machine credential required (tri_mc_… token)." }, { status: 401 });
  }
  if (!machineMayReadMissions(machine)) {
    return NextResponse.json({ error: `Credential "${machine.name}" may not read records.` }, { status: 403 });
  }
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const typeParam = url.searchParams.get("type");
  const type =
    typeParam === "contact" ? "contact" : typeParam === "worker" ? "worker" : "company";
  if (type === "worker" && !machineMayLookupWorkers(machine.scopes)) {
    return NextResponse.json(
      { error: `Credential "${machine.name}" may not look up people in the pool.` },
      { status: 403 },
    );
  }
  if (q.trim().length < 2) {
    return NextResponse.json({ error: "Send q with at least two characters." }, { status: 400 });
  }
  const results = await lookupRecords(machine.orgId, q, type);
  return NextResponse.json({ type, results }, { headers: { "Cache-Control": "no-store" } });
}
