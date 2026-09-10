import { NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  requireApiAccess,
} from "@/lib/supabase/server";
import { refuseUnlessHuman } from "@/lib/auth/api-guards";
import { rejectFinding } from "@/lib/data/findings";
import {
  createAssignment,
  listWorkforce,
  nextAttemptKey,
} from "@/lib/data/workforce";
import { parseScoutCaseReport } from "@/lib/ai/scout-case-report";

// ---------------------------------------------------------------------------
// The buttons under an item that came back.
//
// The old drawer's only control was "Done", wired to
// `onClick={() => setDrawerItem(null)}` — it closed the drawer, next to a
// "Press Esc to close" label and an X. Three ways to close a finding and no
// way to act on one. Nothing was recorded, so the same card was there the next
// morning.
//
// The first version of this endpoint repeated that failure more quietly, and
// a source review on 10 September found it. For a REPORT, as opposed to a
// finding: "File the refusal" returned {ok:true, filed:true} and wrote
// nothing; "Discard" overwrote the employee's own finding_state and threw away
// the reason the CEO had been made to type; "Send Scout back" trusted the
// missing fact and title sent from the browser, and a second press created a
// second job. Any signed-in role, a viewer included, could press all of them.
//
// Every branch now writes what it claims, or says plainly that it did not:
//
//   discard       the rejection and the human's reason, in one write
//   file_refusal  the human's agreement, persisted with who and when
//   send_back     one job, linked to its parent, for the fact the RECORD names
// ---------------------------------------------------------------------------

type Svc = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;
type Kind = "finding" | "assignment";

function refuse(error: string, status = 409) {
  return NextResponse.json({ error }, { status });
}

const ALREADY_DECIDED = "Already decided — reload to see where it went.";

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const refused = refuseUnlessHuman(
    access,
    "canWrite",
    "decide on what the team brought back",
  );
  if (refused) return refused;

  let body: { action?: string; kind?: string; id?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return refuse("Invalid JSON body.", 400);
  }

  const action = String(body.action ?? "").trim();
  const rawKind = String(body.kind ?? "").trim();
  const id = String(body.id ?? "").trim();
  if (!id || (rawKind !== "finding" && rawKind !== "assignment")) {
    return refuse("kind and id are required.", 400);
  }
  const kind = rawKind as Kind;

  const svc = createServiceSupabaseClient();
  if (!svc) return refuse("Database unavailable.", 500);

  const ctx = {
    svc,
    kind,
    id,
    org: access.organizationId,
    userId: access.userId,
    now: new Date().toISOString(),
  };

  if (action === "discard") return discard(ctx, String(body.reason ?? "").trim());
  if (action === "file_refusal") return fileRefusal(ctx);
  if (action === "send_back") return sendBack(ctx);
  return refuse(`Unknown action "${action}".`, 400);
}

interface Ctx {
  svc: Svc;
  kind: Kind;
  id: string;
  org: string;
  userId: string;
  now: string;
}

// ── discard ─────────────────────────────────────────────────────────────────
//
// A reason is mandatory. "Discard" with no reason is how the same weak lead
// returns next week having learned nothing — the exact failure the `dead`
// state exists to prevent, so the button must not reintroduce it.
async function discard({ svc, kind, id, org, userId, now }: Ctx, reason: string) {
  if (reason.length < 3) {
    return refuse(
      "Say why in a few words — wrong trade, no buyer, wrong country. Without a reason this lead comes back next week.",
      400,
    );
  }

  if (kind === "finding") {
    const { data: row } = await svc
      .from("agent_findings")
      .select("payload")
      .eq("id", id)
      .eq("org_id", org)
      .eq("status", "pending")
      .maybeSingle();
    if (!row) return refuse(ALREADY_DECIDED);

    // One write. The rejection and the reason used to be two, and the second
    // write's error was ignored, so a discard could land without its reason.
    const { data, error } = await svc
      .from("agent_findings")
      .update({
        status: "rejected",
        reviewed_by: userId,
        reviewed_at: now,
        payload: {
          ...((row.payload as Record<string, unknown>) ?? {}),
          dead_reason: reason,
          discarded_by_human: true,
        },
      })
      .eq("id", id)
      .eq("org_id", org)
      .eq("status", "pending")
      .select("id");
    if (error || !data?.length) return refuse(error?.message ?? ALREADY_DECIDED);
    return NextResponse.json({ ok: true, discarded: true });
  }

  // A report. The human's decision goes BESIDE the employee's claim, never
  // over it: finding_state stays what Scout said; review_* is what a person
  // decided about that.
  const { data, error } = await svc
    .from("agent_assignments")
    .update({
      review_outcome: "discarded",
      review_note: reason,
      reviewed_by: userId,
      reviewed_at: now,
    })
    .eq("id", id)
    .eq("org_id", org)
    .eq("status", "completed")
    .is("review_outcome", null)
    .select("id");
  if (error || !data?.length) return refuse(error?.message ?? ALREADY_DECIDED);
  return NextResponse.json({ ok: true, discarded: true });
}

// ── file the refusal ────────────────────────────────────────────────────────
//
// The employee already wrote why it is dead; this records that a person read
// it and agrees, which is what takes it off the screen for good.
async function fileRefusal({ svc, kind, id, org, userId, now }: Ctx) {
  if (kind === "finding") {
    const { data: row } = await svc
      .from("agent_findings")
      .select("finding_state")
      .eq("id", id)
      .eq("org_id", org)
      .eq("status", "pending")
      .maybeSingle();
    if (!row) return refuse(ALREADY_DECIDED);
    if (row.finding_state !== "dead") {
      return refuse("Only something its employee filed as dead can be filed as a refusal.");
    }
    const ok = await rejectFinding({ findingId: id, orgId: org, userId });
    if (!ok) return refuse(ALREADY_DECIDED);
    return NextResponse.json({ ok: true, filed: true });
  }

  const { data, error } = await svc
    .from("agent_assignments")
    .update({
      review_outcome: "acknowledged",
      reviewed_by: userId,
      reviewed_at: now,
    })
    .eq("id", id)
    .eq("org_id", org)
    .eq("status", "completed")
    .eq("finding_state", "dead")
    .is("review_outcome", null)
    .select("id");
  if (error || !data?.length) {
    return refuse(
      error?.message ??
        "Only a report filed as dead, and not already decided, can be filed as a refusal.",
    );
  }
  return NextResponse.json({ ok: true, filed: true });
}

// ── send an employee back for the one missing fact ──────────────────────────
async function sendBack({ svc, kind, id, org, userId, now }: Ctx) {
  // The missing fact and its context come from the record, never from the
  // browser. They used to be sent up with the click and trusted.
  let fact: string | null = null;
  let context: string | null = null;

  if (kind === "finding") {
    const { data: row } = await svc
      .from("agent_findings")
      .select("finding_state, payload")
      .eq("id", id)
      .eq("org_id", org)
      .eq("status", "pending")
      .maybeSingle();
    if (!row || row.finding_state !== "one_thing_missing") {
      return refuse("Only an open finding with one thing missing can be sent back.");
    }
    const p = (row.payload as Record<string, unknown>) ?? {};
    fact = typeof p.missing === "string" ? p.missing.trim() : null;
    context =
      [p.full_name, p.company, p.company_name, p.project_name].find(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      ) ?? null;
  } else {
    const { data: row } = await svc
      .from("agent_assignments")
      .select("title, finding_state, result_summary, review_outcome")
      .eq("id", id)
      .eq("org_id", org)
      .eq("status", "completed")
      .maybeSingle();
    if (!row || row.finding_state !== "one_thing_missing" || row.review_outcome) {
      return refuse("Only an undecided report with one thing missing can be sent back.");
    }
    fact =
      parseScoutCaseReport((row.result_summary as string) ?? null)?.unknowns[0]?.trim() ??
      null;
    context = (row.title as string | null) ?? null;
  }
  if (!fact) {
    return refuse("The record names nothing as missing, so there is nothing to send anyone for.");
  }

  // Scout does research. Resolved by role rather than by name so hiring a
  // second researcher does not need a code change.
  const roster = await listWorkforce(org);
  const scout = roster.find(
    (e) => e.roleKey === "project_researcher" && e.status === "active",
  );
  if (!scout) return refuse("No active researcher to send. Check the workforce.", 400);

  // A second press returns the job already out instead of doubling it. A job
  // that has finished can be asked again, numbered as a new attempt.
  const attempt = await nextAttemptKey(org, `send-back:${kind}:${id}`);
  if ("openAssignmentId" in attempt) {
    return NextResponse.json({
      ok: true,
      assignmentId: attempt.openAssignmentId,
      alreadyOut: true,
    });
  }

  const created = await createAssignment({
    orgId: org,
    agentInstanceId: scout.id,
    title: `Find: ${fact}`.slice(0, 120),
    objective: [
      `One fact is missing and it is the only thing standing between this and a reachable finding: ${fact}`,
      "",
      context ? `Context: ${context}.` : "",
      "",
      "Bring back that one fact with a source URL and the line on the page that says so. If it is not published anywhere, say so plainly with what you checked — a sourced absence is a complete answer. Do not contact anyone.",
    ].join("\n"),
    priority: "high",
    // The parent is recorded on the child, so the item can say Scout is on it
    // and the answer can be traced back to the question it answers.
    constraints: {
      execution_mode: "in_app",
      case_type: "open_research",
      parent_kind: kind,
      parent_id: id,
    },
    idempotencyKey: attempt.key,
    userId,
  });
  if (!created) return refuse("Could not hand that out.", 500);

  if (kind === "assignment") {
    const { error } = await svc
      .from("agent_assignments")
      .update({
        review_outcome: "sent_back",
        review_note: `Sent back for: ${fact}`.slice(0, 1000),
        reviewed_by: userId,
        reviewed_at: now,
      })
      .eq("id", id)
      .eq("org_id", org)
      .is("review_outcome", null);
    if (error) {
      // The job is out and points back at this report, so the screen still
      // shows Scout is on it. Say what did not save rather than claim it did.
      return NextResponse.json({
        ok: true,
        assignmentId: created.id,
        warning: `Handed out, but the report could not be marked as sent back: ${error.message}`,
      });
    }
  }

  return NextResponse.json({ ok: true, assignmentId: created.id });
}
