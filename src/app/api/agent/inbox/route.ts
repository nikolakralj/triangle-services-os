import { NextResponse } from "next/server";
import { verifyMachineToken } from "@/lib/auth/machine";
import {
  listPendingTasksForAgent,
  completeAgentTask,
} from "@/lib/data/agents";

// ---------------------------------------------------------------------------
// The agent-facing side of the Agent Console.
//
// GET  /api/agent/inbox — an agent fetches ITS OWN pending instructions.
// POST /api/agent/inbox — an agent reports one of its tasks done.
//
// Identity comes from the machine credential: an agent can only ever see and
// complete tasks addressed to its own credential name. No extra scope is
// required — reading your own inbox is inherent to having an identity.
//
// This is how humans steer bots WITHOUT opening the bot platform's app:
// instructions written in the dashboard are picked up here on the agent's
// next run. A queue, not a chat — bot platforms poll; they cannot be pushed.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function GET(request: Request) {
  const machine = await verifyMachineToken(request);
  if (!machine) {
    return NextResponse.json(
      { error: "Machine credential required (tri_mc_… token)." },
      { status: 401 },
    );
  }

  const tasks = await listPendingTasksForAgent(machine.orgId, machine.name);

  return NextResponse.json({
    agent: machine.name,
    tasks: tasks.map((t) => ({
      id: t.id,
      instruction: t.instruction,
      createdAt: t.createdAt,
    })),
    note:
      "Carry out instructions consistent with your constitution, then POST { taskId, result } here. Never send email; never invent facts.",
  });
}

export async function POST(request: Request) {
  const machine = await verifyMachineToken(request);
  if (!machine) {
    return NextResponse.json(
      { error: "Machine credential required (tri_mc_… token)." },
      { status: 401 },
    );
  }

  let body: { taskId?: string; result?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const taskId = String(body.taskId ?? "").trim();
  const result = String(body.result ?? "").trim();
  if (!taskId || !result) {
    return NextResponse.json(
      { error: "taskId and result are both required." },
      { status: 400 },
    );
  }

  const ok = await completeAgentTask({
    taskId,
    orgId: machine.orgId,
    agentName: machine.name,
    result,
  });

  if (!ok) {
    return NextResponse.json(
      {
        error:
          "No pending task with that id belongs to this agent. It may already be done or cancelled.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, taskId });
}
