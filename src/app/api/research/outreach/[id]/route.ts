/**
 * PATCH /api/research/outreach/[id]
 *
 * Lifecycle endpoint for outreach drafts. Body:
 *   { action: "mark_sent", follow_up_at?: string|null }
 *       Records the send in commercial_actions as well as flipping the draft.
 *   { action: "mark_replied", reply_summary?: string }
 *   { action: "archive" }
 *   { action: "edit", subject?: string|null, body?: string }
 */

import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import {
  archiveOutreachDraft,
  markOutreachReplied,
  markOutreachSent,
  updateOutreachDraft,
} from "@/lib/data/outreach";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    reply_summary?: string;
    follow_up_at?: string | null;
    subject?: string | null;
    body?: string;
  };

  const action = body.action;
  if (!action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  try {
    if (action === "mark_sent") {
      // Recording a real send: the ledger needs the person who confirms it,
      // and the database refuses the row without one.
      const result = await markOutreachSent(
        id,
        access.organizationId,
        access.userId ?? null,
        { followUpAt: typeof body.follow_up_at === "string" ? body.follow_up_at : null },
      );
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, actionId: result.actionId });
    }
    if (action === "mark_replied") {
      const ok = await markOutreachReplied(
        id,
        access.organizationId,
        body.reply_summary,
      );
      return NextResponse.json({ ok });
    }
    if (action === "archive") {
      const ok = await archiveOutreachDraft(id, access.organizationId);
      return NextResponse.json({ ok });
    }
    if (action === "edit") {
      const updates: { subject?: string | null; body?: string } = {};
      if (body.subject !== undefined) updates.subject = body.subject;
      if (body.body !== undefined) updates.body = body.body;
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
      }
      const ok = await updateOutreachDraft(id, access.organizationId, updates);
      return NextResponse.json({ ok });
    }

    return NextResponse.json(
      {
        error:
          "action must be one of: mark_sent, mark_replied, archive, edit",
      },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
