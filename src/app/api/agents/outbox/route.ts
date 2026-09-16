import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { listOutboxEvents, runEventOutboxSweep } from "@/lib/data/event-outbox";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

  const outbox = await listOutboxEvents(access.organizationId, limit);
  return NextResponse.json({
    ok: true,
    ...outbox,
  });
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (access.demo || access.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const summary = await runEventOutboxSweep(access.organizationId);
  return NextResponse.json({
    ok: true,
    summary,
  });
}
