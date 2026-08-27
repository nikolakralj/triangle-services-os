import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { createAgentTask, cancelAgentTask, listAgents } from "@/lib/data/agents";

// ---------------------------------------------------------------------------
// The human-facing side of the Agent Console.
//
// POST  /api/agents/tasks — write an instruction for an agent.
// PATCH /api/agents/tasks — cancel a pending instruction.
//
// Session-authenticated: this is Nikola/Ralph steering agents from the
// dashboard instead of the bot platform's own app.
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json(
      { error: "Agent tasks are not available in demo mode." },
      { status: 403 },
    );
  }

  let body: { agentName?: string; instruction?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const agentName = String(body.agentName ?? "").trim();
  const instruction = String(body.instruction ?? "").trim();

  if (!agentName || !instruction) {
    return NextResponse.json(
      { error: "agentName and instruction are both required." },
      { status: 400 },
    );
  }

  // Only accept instructions for agents that actually exist (active
  // credentials) — a typo here would otherwise queue a message nobody
  // ever picks up.
  const roster = await listAgents(access.organizationId);
  if (!roster.some((a) => a.name === agentName)) {
    return NextResponse.json(
      {
        error: `No active agent named "${agentName}". Active agents: ${
          roster.map((a) => a.name).join(", ") || "(none)"
        }.`,
      },
      { status: 400 },
    );
  }

  const task = await createAgentTask({
    orgId: access.organizationId,
    agentName,
    instruction,
    userId: access.userId,
  });

  if (!task) {
    return NextResponse.json(
      { error: "Could not save the instruction." },
      { status: 500 },
    );
  }

  return NextResponse.json({ task });
}

export async function PATCH(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  let body: { taskId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const taskId = String(body.taskId ?? "").trim();
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required." }, { status: 400 });
  }

  const ok = await cancelAgentTask(taskId, access.organizationId);
  if (!ok) {
    return NextResponse.json(
      { error: "Could not cancel — the task may already be done." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
