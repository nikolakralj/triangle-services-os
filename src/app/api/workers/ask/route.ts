import { NextResponse } from "next/server";
import { z } from "zod";
import { answerAboutTalent } from "@/lib/ai/talent-answer";
import { requireApiAccess } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST /api/workers/ask — a question about the pool, in a sentence.
//
// Reads only. Hanna reports; she does not change a record because somebody
// asked her a question, and an answer is not an instruction.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  question: z.string().trim().min(3).max(500),
});

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }

  const result = await answerAboutTalent(access.organizationId, parsed.data.question);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}
