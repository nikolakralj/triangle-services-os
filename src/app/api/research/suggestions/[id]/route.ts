import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import {
  acceptResearchSuggestion,
  rejectResearchSuggestion,
} from "@/lib/data/research";

/**
 * PATCH /api/research/suggestions/[id]
 * Human approval endpoint — called from the Review panel UI.
 *
 * Body:
 *   { action: "accept" }
 *   { action: "reject", reason: string }
 *   { action: "edit_accept", edited_payload: Record<string, unknown> }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => ({})) as {
    action?: string;
    reason?: string;
    edited_payload?: Record<string, unknown>;
  };

  const { action, reason, edited_payload } = body;

  if (!action || !["accept", "reject", "edit_accept"].includes(action)) {
    return NextResponse.json(
      { error: "action must be one of: accept, reject, edit_accept" },
      { status: 400 },
    );
  }

  try {
    if (action === "reject") {
      if (!reason?.trim()) {
        return NextResponse.json(
          { error: "reason is required for rejection" },
          { status: 400 },
        );
      }
      const result = await rejectResearchSuggestion({
        suggestionId: id,
        orgId: access.organizationId,
        userId: access.userId,
        reason,
      });
      return NextResponse.json(result);
    }

    const result = await acceptResearchSuggestion({
      suggestionId: id,
      orgId: access.organizationId,
      userId: access.userId,
      editedPayload: action === "edit_accept" ? edited_payload : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
