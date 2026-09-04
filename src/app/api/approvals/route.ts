import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import {
  acceptResearchSuggestion,
  rejectResearchSuggestion,
} from "@/lib/data/research";
import { acceptFinding, rejectFinding } from "@/lib/data/findings";
import { recordRefusal } from "@/lib/data/refusals";

// ---------------------------------------------------------------------------
// PATCH /api/approvals — decide on one item from the unified queue.
//
// Research suggestions and net-new findings live in different tables with
// different promotion rules, but a manager should not have to care. One
// endpoint, one decision, routed by `kind`.
//
// Session-only: no machine credential reaches this, so an agent can never
// approve its own work.
// ---------------------------------------------------------------------------

export async function PATCH(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  let body: { id?: string; kind?: string; action?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  const kind = String(body.kind ?? "").trim();
  const action = String(body.action ?? "").trim();

  if (!id || !["research_suggestion", "finding"].includes(kind)) {
    return NextResponse.json(
      { error: "id and kind (research_suggestion|finding) are required." },
      { status: 400 },
    );
  }
  if (!["accept", "reject"].includes(action)) {
    return NextResponse.json(
      { error: "action must be accept or reject." },
      { status: 400 },
    );
  }

  // The research data layer signals every refusal by throwing — a bad id, a
  // row from another org, a suggestion someone else already rejected. Those
  // are all the caller's problem, not a server fault, so turn them into a 400
  // the queue can show instead of letting them surface as a bare 500.
  try {
    if (kind === "finding") {
      if (action === "accept") {
        const result = await acceptFinding({
          findingId: id,
          orgId: access.organizationId,
          userId: access.userId,
        });
        return result
          ? NextResponse.json({ ok: true, ...result })
          : NextResponse.json(
              { error: "That discovery is no longer waiting for a decision. Refresh the page." },
              { status: 409 },
            );
      }
      const ok = await rejectFinding({
        findingId: id,
        orgId: access.organizationId,
        userId: access.userId,
      });
      return ok
        ? NextResponse.json({ ok: true })
        : NextResponse.json(
            { error: "That discovery is no longer waiting for a decision. Refresh the page." },
            { status: 409 },
          );
    }

    // research_suggestion
    if (action === "accept") {
      const result = await acceptResearchSuggestion({
        suggestionId: id,
        orgId: access.organizationId,
        userId: access.userId,
      });
      return result.ok
        ? NextResponse.json({ ok: true, finalRecordId: result.finalRecordId })
        : NextResponse.json({ error: "Could not accept." }, { status: 400 });
    }

    const result = await rejectResearchSuggestion({
      suggestionId: id,
      orgId: access.organizationId,
      userId: access.userId,
      // A reason is required by the data layer; the queue's fast path supplies
      // a neutral one so rejecting stays a single click.
      reason: String(body.reason ?? "").trim() || "Not relevant",
    });
    return result.ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Could not reject." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save that decision.";
    // An acceptance the database refused is the same class of event as a
    // refused commercial action: someone tried to turn a claim into a record
    // and the evidence did not support it.
    await recordRefusal({
      orgId: access.organizationId,
      surface: "Accept a proposal",
      reason: message,
      userId: access.userId ?? null,
      entityType: kind,
      entityId: id,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
