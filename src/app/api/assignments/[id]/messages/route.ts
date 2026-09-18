import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import {
  addHumanMessage,
  listAssignmentMessages,
} from "@/lib/data/assignment-threads";
import { getAssignmentWork } from "@/lib/data/assignment-work";
import { routeThreadWords } from "@/lib/data/case-ask";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";

// ---------------------------------------------------------------------------
// The human side of an assignment thread.
//
// GET  — read the conversation, and where the work stands: who owns it and
//        whose move it is. The drawer draws its status from this rather than
//        leaving a person to infer it from the length of the scroll.
// POST — ask a follow-up. Words typed in Bob's thread on a case that are
//        about who we put forward also reach Hanna on that case, so nobody
//        has to know whose half it is ("Employees, not buttons").
//
// Session-only: machine credentials go through /api/agent/inbox instead, so a
// bot can never post here pretending to be a person.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  const [messages, work] = await Promise.all([
    listAssignmentMessages(id, access.organizationId),
    getAssignmentWork(id, access.organizationId),
  ]);
  return NextResponse.json({ messages, work });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  const { id } = await params;

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = String(body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "Write something first." }, { status: 400 });
  }

  const result = await addHumanMessage({
    assignmentId: id,
    orgId: access.organizationId,
    userId: access.userId,
    body: message,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Only a signed-in person's words open work for another employee; the
  // legacy machine key still posts, but never hands anything on.
  const human = !refuseUnlessHuman(access, "canWrite", "hand work to the team");
  const alsoTo = human && access.userId
    ? await routeThreadWords({
        orgId: access.organizationId,
        userId: access.userId,
        assignmentId: id,
        text: message,
      })
    : null;
  const alsoNotice = !alsoTo
    ? ""
    : "error" in alsoTo
      ? ` ${alsoTo.employee} could not take the who-we-put-forward part: ${alsoTo.error}`
      : ` ${alsoTo.employee} has the who-we-put-forward part on this case${
          alsoTo.changed.length ? ` (${alsoTo.changed.join(", ")})` : ""
        }.`;

  const [messages, work] = await Promise.all([
    listAssignmentMessages(id, access.organizationId),
    getAssignmentWork(id, access.organizationId),
  ]);
  return NextResponse.json({
    ok: true,
    reopened: result.reopened,
    notice: `${result.notice}${alsoNotice}`.trim(),
    wake: result.wake,
    alsoTo,
    messages,
    work,
  });
}
