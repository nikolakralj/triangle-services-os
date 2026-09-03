import { NextResponse } from "next/server";
import { suggestJobs } from "@/lib/data/job-suggestions";
import { createAssignment, nextAttemptKey } from "@/lib/data/workforce";
import { createServiceSupabaseClient, requireApiAccess } from "@/lib/supabase/server";

/**
 * POST /api/workforce/suggested-jobs  { jobId: "reachability:<uuid>" }
 *
 * Hand one proposed job to an employee. The brief is written by Triangle from
 * its own data, so the board decides WHAT the company works on next, not how
 * to phrase it.
 *
 * The job is re-derived server-side from `jobId` rather than trusted from the
 * request: a title and an objective posted by a client would let anyone put
 * arbitrary instructions in front of an employee.
 */
export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Demo mode is read-only" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { jobId?: string };
  if (!body.jobId) {
    return NextResponse.json({ error: "Which job?" }, { status: 400 });
  }

  const jobs = await suggestJobs(access.organizationId);
  const job = jobs.find((j) => j.id === body.jobId);
  if (!job) {
    return NextResponse.json(
      { error: "That job is no longer on the list — it may already be running." },
      { status: 409 },
    );
  }

  const svc = createServiceSupabaseClient();
  if (!svc) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  const { data: employees } = await svc
    .from("agent_instances")
    .select("id")
    .eq("org_id", access.organizationId)
    .eq("role_key", job.roleKey)
    .eq("status", "active")
    .order("created_at")
    .limit(1);
  const agentInstanceId = employees?.[0]?.id as string | undefined;
  if (!agentInstanceId) {
    return NextResponse.json(
      { error: `No active ${job.roleKey.replace(/_/g, " ")} to give this to. Hire one first.` },
      { status: 400 },
    );
  }

  // A finished job can be handed out again; an open one cannot.
  const attempt = await nextAttemptKey(access.organizationId, job.id);
  if ("openAssignmentId" in attempt) {
    return NextResponse.json(
      { error: "Someone is already working on that one." },
      { status: 409 },
    );
  }

  const assignment = await createAssignment({
    orgId: access.organizationId,
    agentInstanceId,
    title: job.title,
    objective: job.objective,
    priority: job.priority,
    expectedOutput: null,
    constraints: { ...job.constraints, suggestion_id: job.id },
    idempotencyKey: attempt.key,
    entityRefs: job.entityRefs.map((e) => ({
      type: e.type as "company" | "worker" | "project" | "contact" | "other",
      id: e.id,
      relation: (e.relation ?? "context") as "input" | "target" | "context",
    })),
    userId: access.userId ?? null,
  });

  if (!assignment) {
    return NextResponse.json({ error: "Could not queue that." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, assignmentId: assignment.id });
}
