import { NextResponse } from "next/server";
import { runNextScoutAssignment } from "@/lib/ai/scout-executor";
import { requireApiAccess } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ status: "idle" });
  }
  if (access.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 503 },
    );
  }

  const result = await runNextScoutAssignment(access.organizationId);
  return NextResponse.json(result);
}
