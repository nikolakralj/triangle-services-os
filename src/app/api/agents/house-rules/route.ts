import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import { loadHouseRules, saveHouseRules } from "@/lib/data/house-rules";

// ---------------------------------------------------------------------------
// How an employee works — the CEO's standing instructions for one employee.
//
//   GET /api/agents/house-rules?employee=<id>   what is in force
//   PUT /api/agents/house-rules                 { employee, body }
//
// A bot never reads them here: they arrive with its work, in the inbox and in
// every mission payload, so there is nothing to fetch and nothing to remember.
// Writing them is a person's job, like the org's scoring rules.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const employee = new URL(request.url).searchParams.get("employee") ?? "";
  if (!z.string().uuid().safeParse(employee).success) {
    return NextResponse.json({ error: "Say which employee." }, { status: 400 });
  }
  const rules = await loadHouseRules(access.organizationId, employee);
  return NextResponse.json({ rules }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const refused = refuseUnlessHuman(access, "canWrite", "change how an employee works");
  if (refused) return refused;
  if (access.demo) {
    return NextResponse.json(
      { error: "How an employee works is read-only in demo mode." },
      { status: 403 },
    );
  }
  if (access.role !== "admin" && access.role !== "partner") {
    return NextResponse.json(
      { error: "Only an admin or partner can change how an employee works." },
      { status: 403 },
    );
  }

  const parsed = z
    .object({ employee: z.string().uuid(), body: z.string().max(4_000) })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Send the employee and the rules." }, { status: 400 });
  }

  const saved = await saveHouseRules({
    orgId: access.organizationId,
    agentInstanceId: parsed.data.employee,
    body: parsed.data.body,
    userId: access.userId,
  });
  if ("error" in saved) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }
  return NextResponse.json({ rules: saved.body.trim() ? saved : null, version: saved.version });
}
