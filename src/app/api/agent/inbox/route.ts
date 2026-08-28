import { NextResponse } from "next/server";
import { verifyMachineToken } from "@/lib/auth/machine";
import {
  listPendingTasksForAgent,
  completeAgentTask,
} from "@/lib/data/agents";
import {
  listOpenAssignmentsForInstance,
  completeAssignment,
} from "@/lib/data/workforce";
import { addAgentMessage } from "@/lib/data/assignment-threads";

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
  // Durable assignments, with business context hydrated (e.g. the worker
  // records for "find work for these people"). Fetching starts the shift.
  const assignments = machine.agentInstanceId
    ? await listOpenAssignmentsForInstance(machine.orgId, machine.agentInstanceId)
    : [];

  return NextResponse.json({
    agent: machine.name,
    assignments,
    tasks: tasks.map((t) => ({
      id: t.id,
      instruction: t.instruction,
      createdAt: t.createdAt,
    })),
    note:
      "Work assignments first. Each one carries `thread` (everything said so far) and `newQuestions` (what a human has asked since your last check and you have not answered yet). " +
      "Answer a question without finishing the job: POST { assignmentId, message }. " +
      "Report the job finished: POST { assignmentId, result }, adding failed: true if you could not do it. " +
      "Quick notes: POST { taskId, result }. Never send email; never invent facts.",
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

  let body: {
    taskId?: string;
    assignmentId?: string;
    result?: string;
    message?: string;
    failed?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const taskId = String(body.taskId ?? "").trim();
  const assignmentId = String(body.assignmentId ?? "").trim();
  const result = String(body.result ?? "").trim();
  const message = String(body.message ?? "").trim();

  if (assignmentId) {
    if (!result && !message) {
      return NextResponse.json(
        { error: "Send `message` to answer and keep working, or `result` to finish." },
        { status: 400 },
      );
    }
    if (!machine.agentInstanceId) {
      return NextResponse.json(
        { error: "This badge is not linked to an employee." },
        { status: 400 },
      );
    }

    // A reply is not a hand-in. Answering a follow-up should leave the job
    // open, otherwise every clarification would close the assignment and the
    // conversation would end where it started.
    if (message) {
      const posted = await addAgentMessage({
        assignmentId,
        orgId: machine.orgId,
        agentInstanceId: machine.agentInstanceId,
        body: message,
      });
      if (!posted) {
        return NextResponse.json(
          { error: "No assignment with that id belongs to this employee." },
          { status: 404 },
        );
      }
      if (!result) {
        return NextResponse.json({ ok: true, assignmentId, replied: true });
      }
    }
    const done = await completeAssignment({
      assignmentId,
      orgId: machine.orgId,
      agentInstanceId: machine.agentInstanceId,
      resultSummary: result,
      failed: body.failed === true,
    });
    if (!done) {
      return NextResponse.json(
        { error: "No open assignment with that id belongs to this employee." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, assignmentId });
  }

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
