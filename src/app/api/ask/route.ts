import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { answerAboutTalent } from "@/lib/ai/talent-answer";
import { createAssignment, listWorkforce } from "@/lib/data/workforce";
import { runNextScoutAssignment } from "@/lib/ai/scout-executor";
import {
  parseScoutCaseReport,
  type FindingState,
} from "@/lib/ai/scout-case-report";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST /api/ask — one box, either employee, an answer back.
//
// The routing lives here rather than in the browser because it depends on what
// each employee can actually do, and because the first version of it was
// wrong in a way no amount of client-side care would have caught: it created
// an assignment for Hanna, and `run-now` only ever runs Scout, so a question
// about Triangle's own people was filed and never executed. The box said
// "handed out" and nothing happened, silently, for ever.
//
// The two halves are genuinely different work and it is honest to treat them
// differently:
//
//   Hanna  reads the pool Triangle already has. Synchronous, a few seconds,
//          no assignment — there is nothing to delegate, the answer is in the
//          database.
//   Scout  goes and looks at the world. A real assignment, ~40s, subject to
//          the finding contract, and it leaves an auditable row behind.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Whose question is this?
 *
 * Our own people, or the market. Deliberately a small readable rule rather
 * than a model call: spending a second model call to decide which model to
 * call is latency the CEO pays for nothing, and when this guesses wrong the
 * answer still says who answered it.
 */
function routeTo(text: string): "hanna" | "scout" {
  const ours =
    /\b(our|ours|we have|bench|roster|pool|worker|workers|crew|cv|cvs|available|availability|visa|passport|nationality|certificate|ticket|a1|who can|anybody|anyone|somebody)\b/i.test(
      text,
    );
  const market =
    /\b(find|search|look for|contractor|contractors|epc|gc|tender|tenders|project|projects|buyer|buyers|company|companies|market|subcontract|subcontractor|who buys|reach)\b/i.test(
      text,
    );
  if (ours && !market) return "hanna";
  if (market) return "scout";
  return "scout";
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo || access.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { question?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const question = String(body.question ?? "").trim();
  if (question.length < 8) {
    return NextResponse.json({ error: "Ask a fuller question." }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "AI is not configured on this deployment." },
      { status: 503 },
    );
  }

  const who = routeTo(question);

  // ── Hanna: read the pool, answer now ─────────────────────────────────────
  if (who === "hanna") {
    const result = await answerAboutTalent(access.organizationId, question);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      by: "Hanna",
      emoji: "👤",
      kind: "talent",
      answer: result.answer,
      people: result.people,
      partners: result.partners,
      blockers: result.blockers,
      missing: result.missing,
    });
  }

  // ── Scout: a real assignment, run while you wait ─────────────────────────
  const roster = await listWorkforce(access.organizationId);
  const scout = roster.find(
    (e) => e.roleKey === "project_researcher" && e.status === "active",
  );
  if (!scout) {
    return NextResponse.json(
      { error: "No active researcher on the workforce to ask." },
      { status: 400 },
    );
  }

  const created = await createAssignment({
    orgId: access.organizationId,
    agentInstanceId: scout.id,
    title: question.split("\n")[0].slice(0, 120),
    objective: question,
    priority: "high",
    // `open_research` must match the executor's dispatcher exactly. It did not,
    // once: the dispatcher knew this kind of work only as the ABSENCE of a
    // case type and refused the name itself.
    constraints: { execution_mode: "in_app", case_type: "open_research" },
    userId: access.userId,
  });
  if (!created) {
    return NextResponse.json({ error: "Could not hand that out." }, { status: 500 });
  }

  const run = await runNextScoutAssignment(access.organizationId);

  if (run.status === "refused") {
    return NextResponse.json({
      by: "Scout",
      emoji: "🔍",
      kind: "refused",
      answer: run.reason,
      assignmentId: created.id,
    });
  }
  if (run.status === "failed") {
    return NextResponse.json({
      by: "Scout",
      emoji: "🔍",
      kind: "failed",
      answer: run.error,
      assignmentId: created.id,
    });
  }
  if (run.status === "idle") {
    return NextResponse.json({
      by: "Scout",
      emoji: "🔍",
      kind: "queued",
      answer:
        "Filed, but something else was already running. It will appear below when it finishes.",
      assignmentId: created.id,
    });
  }

  // `run-now` takes the oldest claimable job, which is not necessarily this
  // one. Read back the row that was actually completed rather than assuming.
  const svc = createServiceSupabaseClient();
  const { data } = svc
    ? await svc
        .from("agent_assignments")
        .select("id, title, finding_state, result_summary")
        .eq("id", run.assignmentId)
        .eq("org_id", access.organizationId)
        .maybeSingle()
    : { data: null };

  const report = parseScoutCaseReport((data?.result_summary as string) ?? null);
  const state = (data?.finding_state as FindingState | null) ?? null;

  return NextResponse.json({
    by: "Scout",
    emoji: "🔍",
    kind: "research",
    /** True when the finished job was a different queued one, said plainly. */
    wasAnotherJob: run.assignmentId !== created.id,
    otherTitle: run.assignmentId !== created.id ? (data?.title ?? null) : null,
    assignmentId: run.assignmentId,
    state,
    answer: report?.executiveSummary?.trim() || run.headline,
    headline: run.headline,
    person: report?.buyerPath?.decisionMaker ?? null,
    door: report?.buyerPath?.publicDoor ?? report?.nextCommercialAction?.channel ?? null,
    words: report?.nextCommercialAction?.action ?? null,
    missingFact: report?.unknowns[0] ?? null,
    missingOwner: report?.missingOwner ?? null,
    deadReason: report?.deadReason ?? null,
  });
}
