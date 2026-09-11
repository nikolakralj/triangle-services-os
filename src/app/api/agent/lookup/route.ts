import { NextResponse } from "next/server";
import { verifyMachineToken } from "@/lib/auth/machine";
import { lookupRecords, machineMayReadMissions } from "@/lib/data/mission-bot";

// ---------------------------------------------------------------------------
// GET /api/agent/lookup?q=…&type=company|contact — what Triangle already has.
//
// A bot looks before it files, so the same company is not researched twice
// under a second spelling. Names, sites and where a record came from; no
// email addresses or phone numbers of people.
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
  const type = url.searchParams.get("type") === "contact" ? "contact" : "company";
  if (q.trim().length < 2) {
    return NextResponse.json({ error: "Send q with at least two characters." }, { status: 400 });
  }
  const results = await lookupRecords(machine.orgId, q, type);
  return NextResponse.json({ type, results }, { headers: { "Cache-Control": "no-store" } });
}
