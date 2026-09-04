import { NextResponse } from "next/server";
import { listPlays, parsePlay } from "@/lib/data/plays";
import { createAgentTask } from "@/lib/data/agents";
import { createAssignment } from "@/lib/data/workforce";
import { createServiceSupabaseClient, requireApiAccess } from "@/lib/supabase/server";

/**
 * POST /api/plays  { findingId, optionId }
 *
 * Choose one of an employee's proposed routes.
 *
 * An agent option becomes that agent's next assignment. A human option becomes
 * a task on the board with the agent's reasoning attached, because the thing a
 * human has to do is usually the thing an agent is forbidden from doing —
 * calling a switchboard, asking an EPC for an introduction, signing a trial.
 *
 * Choosing one route closes the play. The others are not deleted quietly; the
 * chosen action records which idea it came from.
 */
export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Demo mode is read-only" }, { status: 403 });
  }
  if (access.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    findingId?: string;
    optionId?: string;
  };
  if (!body.findingId || !body.optionId) {
    return NextResponse.json(
      { error: "findingId and optionId are required." },
      { status: 400 },
    );
  }

  const svc = createServiceSupabaseClient();
  if (!svc) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { data: row } = await svc
    .from("agent_findings")
    .select("id, payload, status, created_at, source_url, agent_instance_id")
    .eq("org_id", access.organizationId)
    .eq("id", body.findingId)
    .maybeSingle();
  if (!row || row.status !== "pending") {
    return NextResponse.json(
      { error: "That idea is no longer open." },
      { status: 409 },
    );
  }

  const play = parsePlay(
    row.id as string,
    (row.payload as Record<string, unknown>) ?? {},
    {
      agentName: null,
      agentEmoji: null,
      createdAt: row.created_at as string,
      sourceUrl: (row.source_url as string) ?? null,
    },
  );
  const option = play?.options.find((o) => o.id === body.optionId);
  if (!option) {
    return NextResponse.json({ error: "No such option." }, { status: 400 });
  }

  let outcome: { kind: "assignment" | "task"; id: string } | null = null;

  if (option.actor === "agent" && row.agent_instance_id) {
    const assignment = await createAssignment({
      orgId: access.organizationId,
      agentInstanceId: row.agent_instance_id as string,
      title: option.action.slice(0, 120),
      objective: [
        option.action,
        option.why ? `Why this route: ${option.why}` : null,
        play?.situation ? `Background: ${play.situation}` : null,
        "This is your own proposal, chosen by a human. Do not contact anyone.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      priority: "high",
      expectedOutput: null,
      constraints: {
        execution_mode: "bot",
        no_outreach: true,
        from_play: row.id,
      },
      idempotencyKey: `play:${row.id}:${option.id}`,
      userId: access.userId ?? null,
    });
    if (assignment) outcome = { kind: "assignment", id: assignment.id };
  } else {
    // A human route. The agent's reasoning travels with it, so whoever picks
    // it up is not left with an instruction and no argument behind it.
    const task = await createAgentTask({
      orgId: access.organizationId,
      agentName: "human",
      instruction: [
        option.action,
        option.why ? `Why: ${option.why}` : null,
        play?.headline ? `From: ${play.headline}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      userId: access.userId ?? null,
    });
    if (task) outcome = { kind: "task", id: task.id };
  }

  if (!outcome) {
    return NextResponse.json(
      { error: "Could not turn that option into work." },
      { status: 500 },
    );
  }

  await svc
    .from("agent_findings")
    .update({
      status: "accepted",
      reviewed_at: new Date().toISOString(),
      reviewed_by: access.userId ?? null,
      promoted_entity_type: outcome.kind,
      promoted_entity_id: outcome.id,
    })
    .eq("id", row.id as string)
    .eq("org_id", access.organizationId);

  return NextResponse.json({ ok: true, ...outcome });
}

/** GET — the open ideas, for the panel that renders them. */
export async function GET(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ plays: await listPlays(access.organizationId) });
}
