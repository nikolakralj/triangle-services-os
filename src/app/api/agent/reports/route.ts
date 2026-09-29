import { NextResponse } from "next/server";
import { verifyMachineToken } from "@/lib/auth/machine";
import { badgeMayReport } from "@/lib/data/employee-report-policy";
import { fileEmployeeReport } from "@/lib/data/employee-reports";

// ---------------------------------------------------------------------------
// POST /api/agent/reports — work done outside Triangle.
//
// Hanna, Bob and Scout call this with their own badge after a LinkedIn
// invitation, an email drafted or sent by a person, a candidate (with the
// evidence link), a reply, "not available until", or access they need.
// Triangle files it on the person, the company and the case, and sets the
// follow-up. Reporting does not finish the step, and it never sends mail.
//
// The legacy MCP key is not a badge and cannot file. A badge that is not
// linked to an employee cannot file.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function POST(request: Request) {
  const machine = await verifyMachineToken(request);
  if (!machine) {
    return NextResponse.json(
      { error: "Machine credential required (tri_mc_… token)." },
      { status: 401 },
    );
  }
  if (!machine.agentInstanceId) {
    return NextResponse.json({ error: "This badge is not linked to an employee." }, { status: 403 });
  }
  if (!badgeMayReport(machine.scopes)) {
    return NextResponse.json(
      { error: `Credential "${machine.name}" may not report work.` },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const result = await fileEmployeeReport({
    orgId: machine.orgId,
    agentInstanceId: machine.agentInstanceId,
    body,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      ok: true,
      duplicate: result.duplicate,
      reportId: result.report.id,
      sentence: result.sentence,
      followUpOn: result.followUpOn,
      filedOn: {
        person: result.report.personName,
        personId: result.report.personId,
        company: result.report.companyName,
        companyId: result.report.companyId,
        caseId: result.report.missionId,
      },
      warnings: result.warnings,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
