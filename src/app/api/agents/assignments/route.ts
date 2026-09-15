import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import {
  createAssignment,
  cancelAssignment,
  listWorkforce,
} from "@/lib/data/workforce";
import { isScoutRole, loadEmployeeRuntime } from "@/lib/data/bot-runtime";

// ---------------------------------------------------------------------------
// The manager's side of assignments.
//
// POST  — give an employee a durable assignment, optionally attaching
//         workers as context ("find work for THESE people").
// PATCH — take an open assignment back.
//
// Session-authenticated: authorized organization members manage the workforce from
// the dashboard.
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json(
      { error: "Assignments are not available in demo mode." },
      { status: 403 },
    );
  }

  let body: {
    agentInstanceId?: string;
    title?: string;
    objective?: string;
    priority?: string;
    dueAt?: string;
    workerIds?: string[];
    projectId?: string;
    constraints?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const agentInstanceId = String(body.agentInstanceId ?? "").trim();
  const title = String(body.title ?? "").trim();
  const objective = String(body.objective ?? "").trim();
  const priority = ["low", "normal", "high", "urgent"].includes(String(body.priority))
    ? (body.priority as "low" | "normal" | "high" | "urgent")
    : "normal";

  if (!agentInstanceId || !title || !objective) {
    return NextResponse.json(
      { error: "agentInstanceId, title and objective are required." },
      { status: 400 },
    );
  }

  // The employee must exist and belong to this org — a typo would otherwise
  // queue work nobody ever picks up.
  const roster = await listWorkforce(access.organizationId);
  if (!roster.some((e) => e.id === agentInstanceId)) {
    return NextResponse.json(
      { error: "No such employee in this organization." },
      { status: 400 },
    );
  }

  // Constraints used to be dropped here. Scout is bot-owned: even a client
  // that still sends in_app cannot put Scout on the retired OpenAI executor.
  // Everyone else keeps the previous default (in_app, explicit value wins).
  const { roleKey } = await loadEmployeeRuntime(
    access.organizationId,
    agentInstanceId,
  );
  const incoming =
    body.constraints && typeof body.constraints === "object" ? body.constraints : {};
  const constraints = isScoutRole(roleKey)
    ? { ...incoming, execution_mode: "bot" }
    : { execution_mode: "in_app", ...incoming };

  const dueAt = body.dueAt ? new Date(body.dueAt) : null;
  const created = await createAssignment({
    orgId: access.organizationId,
    agentInstanceId,
    title,
    objective,
    priority,
    constraints,
    dueAt: dueAt && !isNaN(dueAt.getTime()) ? dueAt.toISOString() : null,
    projectId: body.projectId ? String(body.projectId) : null,
    workerIds: Array.isArray(body.workerIds)
      ? body.workerIds.map((w) => String(w)).slice(0, 50)
      : [],
    userId: access.userId,
  });

  if (!created) {
    return NextResponse.json(
      { error: "Could not create the assignment." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    assignment: { id: created.id },
    runtime: created.runtime,
    wake: created.wake,
    notice: created.notice,
  });
}

export async function PATCH(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  let body: { assignmentId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const assignmentId = String(body.assignmentId ?? "").trim();
  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId is required." }, { status: 400 });
  }

  const ok = await cancelAssignment(assignmentId, access.organizationId);
  if (!ok) {
    return NextResponse.json(
      { error: "Could not take it back — it may already be finished." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
