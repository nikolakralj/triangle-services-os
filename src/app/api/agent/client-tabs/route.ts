import { NextResponse } from "next/server";
import { verifyMachineToken } from "@/lib/auth/machine";
import { badgeMayReport } from "@/lib/data/employee-report-policy";
import {
  fileClientTabLine,
  listFirmsOnFile,
  listOpenTabsForBots,
} from "@/lib/data/client-tabs";

// ---------------------------------------------------------------------------
// /api/agent/client-tabs — the bots write the owner's pinned client tabs.
//
// GET   the open tabs (which clients the owner is negotiating with now), and
//       the Croatian firms that answered once on any client, to reuse first.
// POST  one line on a client: a need, something agreed, an open point, the
//       next step with a date, a timeline line, or a firm Scout proposes.
//
// Same badge and scopes as /api/agent/reports. Nothing here sends anything,
// and nothing here takes a score or a status. Request shapes are in
// agents/hanna.md and agents/scout.md.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

async function badge(request: Request) {
  const machine = await verifyMachineToken(request);
  if (!machine) {
    return {
      error: NextResponse.json({ error: "Machine credential required (tri_mc_… token)." }, { status: 401 }),
    } as const;
  }
  if (!machine.agentInstanceId) {
    return { error: NextResponse.json({ error: "This badge is not linked to an employee." }, { status: 403 }) } as const;
  }
  if (!badgeMayReport(machine.scopes)) {
    return {
      error: NextResponse.json({ error: `Credential "${machine.name}" may not write client tabs.` }, { status: 403 }),
    } as const;
  }
  return { machine } as const;
}

export async function GET(request: Request) {
  const auth = await badge(request);
  if ("error" in auth) return auth.error;
  const [tabs, firmsOnFile] = await Promise.all([
    listOpenTabsForBots(auth.machine.orgId),
    listFirmsOnFile(auth.machine.orgId),
  ]);
  return NextResponse.json({ tabs, firmsOnFile }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await badge(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null);
  const result = await fileClientTabLine({
    orgId: auth.machine.orgId,
    agentInstanceId: auth.machine.agentInstanceId as string,
    body,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(
    {
      ok: true,
      duplicate: result.duplicate,
      lineId: result.lineId,
      company: result.companyName,
      pinned: result.pinned,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
