import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { rejectFinding } from "@/lib/data/findings";
import { createAssignment, listWorkforce } from "@/lib/data/workforce";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// The three buttons under an item that came back.
//
// The old drawer's only control was "Done", wired to
// `onClick={() => setDrawerItem(null)}` — it closed the drawer, next to a
// "Press Esc to close" label and an X. Three ways to close a finding and no
// way to act on one. Nothing was recorded, so the same card was there the next
// morning.
//
// Every action here writes something:
//   discard      — a rejection with a reason, so the lead never comes back
//   send_back    — a real assignment for the one missing fact
//   file_refusal — records that a dead finding was seen and accepted as dead
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  let body: {
    action?: string;
    kind?: string;
    id?: string;
    reason?: string;
    fact?: string;
    title?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = String(body.action ?? "").trim();
  const kind = String(body.kind ?? "").trim();
  const id = String(body.id ?? "").trim();
  if (!id || !["finding", "assignment"].includes(kind)) {
    return NextResponse.json({ error: "kind and id are required." }, { status: 400 });
  }

  const svc = createServiceSupabaseClient();
  if (!svc) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 500 });
  }

  // ── discard ───────────────────────────────────────────────────────────────
  //
  // A reason is mandatory. "Discard" with no reason is how the same weak lead
  // returns next week having learned nothing — which is the exact failure the
  // `dead` state exists to prevent, so the button must not reintroduce it.
  if (action === "discard") {
    const reason = String(body.reason ?? "").trim();
    if (reason.length < 3) {
      return NextResponse.json(
        {
          error:
            "Say why in a few words — wrong trade, no buyer, wrong country. Without a reason this lead comes back next week.",
        },
        { status: 400 },
      );
    }

    if (kind === "finding") {
      const ok = await rejectFinding({
        findingId: id,
        orgId: access.organizationId,
        userId: access.userId,
      });
      if (!ok) {
        return NextResponse.json(
          { error: "Could not discard it — it may already be decided." },
          { status: 400 },
        );
      }
      // The reason, on the row, in the CEO's own words.
      await svc
        .from("agent_findings")
        .update({
          payload: await mergePayload(svc, access.organizationId, id, {
            dead_reason: reason,
            discarded_by_human: true,
          }),
        })
        .eq("id", id)
        .eq("org_id", access.organizationId);
      return NextResponse.json({ ok: true, discarded: true });
    }

    const { error } = await svc
      .from("agent_assignments")
      .update({ finding_state: "dead" })
      .eq("id", id)
      .eq("org_id", access.organizationId);
    if (error) {
      return NextResponse.json({ error: "Could not discard it." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, discarded: true });
  }

  // ── send an employee back for the one missing fact ────────────────────────
  if (action === "send_back") {
    const fact = String(body.fact ?? "").trim();
    if (!fact) {
      return NextResponse.json(
        { error: "Nothing was named as missing, so there is nothing to send anyone for." },
        { status: 400 },
      );
    }

    // Scout does research. Resolved by role rather than by name so hiring a
    // second researcher does not need a code change.
    const roster = await listWorkforce(access.organizationId);
    const scout = roster.find(
      (e) => e.roleKey === "project_researcher" && e.status === "active",
    );
    if (!scout) {
      return NextResponse.json(
        { error: "No active researcher to send. Check the workforce." },
        { status: 400 },
      );
    }

    const created = await createAssignment({
      orgId: access.organizationId,
      agentInstanceId: scout.id,
      title: `Find: ${fact}`.slice(0, 120),
      objective: [
        `One fact is missing and it is the only thing standing between this and a reachable finding: ${fact}`,
        "",
        `Context: ${String(body.title ?? "").trim() || "a finding filed as one_thing_missing"}.`,
        "",
        "Bring back that one fact with a source URL and the line on the page that says so. If it is not published anywhere, say so plainly with what you checked — a sourced absence is a complete answer. Do not contact anyone.",
      ].join("\n"),
      priority: "high",
      constraints: { execution_mode: "in_app", case_type: "open_research" },
      userId: access.userId,
    });

    if (!created) {
      return NextResponse.json(
        { error: "Could not hand that out." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, assignmentId: created.id });
  }

  // ── acknowledge a dead finding ────────────────────────────────────────────
  //
  // The agent already wrote the reason; this records that a human read it and
  // agreed, which is what takes it off the screen for good.
  if (action === "file_refusal") {
    if (kind === "finding") {
      const ok = await rejectFinding({
        findingId: id,
        orgId: access.organizationId,
        userId: access.userId,
      });
      if (!ok) {
        return NextResponse.json(
          { error: "Could not file it — it may already be decided." },
          { status: 400 },
        );
      }
    }
    return NextResponse.json({ ok: true, filed: true });
  }

  return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
}

/** Keep whatever the agent recorded; add the human's words beside it. */
async function mergePayload(
  svc: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  orgId: string,
  findingId: string,
  extra: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data } = await svc
    .from("agent_findings")
    .select("payload")
    .eq("id", findingId)
    .eq("org_id", orgId)
    .maybeSingle();
  return { ...((data?.payload as Record<string, unknown>) ?? {}), ...extra };
}
