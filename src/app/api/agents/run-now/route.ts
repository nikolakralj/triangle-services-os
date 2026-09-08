import { NextResponse } from "next/server";
import { runNextScoutAssignment } from "@/lib/ai/scout-executor";
import { requireApiAccess } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST /api/agents/run-now — do the queued work now, while somebody watches.
//
// "He didn't start to work automatically and immediately." Correct: a job
// handed out in the app waited for a schedule that runs once a day on this
// plan, and there was no way to say "do it now". A person who clicks a button
// and then walks away has not delegated anything; they have filed a request.
//
// So the click runs it. The request stays open for as long as the model takes
// — usually under a minute — and returns what came back, which is also the
// answer to "where do I see the result": here, on the screen you pressed it
// from.
//
// One assignment per call. A loop is what the budget exists to stop, and a
// person waiting wants one answer rather than a batch.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo || access.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "AI is not configured on this deployment." },
      { status: 503 },
    );
  }

  const result = await runNextScoutAssignment(access.organizationId);

  // Every outcome reported as itself. "Nothing to do" and "stopped because the
  // budget is spent" are different answers, and somebody waiting deserves to
  // know which one they got.
  if (result.status === "idle") {
    return NextResponse.json({
      status: "idle",
      message: "Nothing is queued that this runtime can run.",
    });
  }
  if (result.status === "refused") {
    return NextResponse.json({ status: "refused", message: result.reason });
  }
  if (result.status === "failed") {
    return NextResponse.json({ status: "failed", message: result.error });
  }
  return NextResponse.json({
    status: "completed",
    assignmentId: result.assignmentId,
    message: result.headline,
  });
}
