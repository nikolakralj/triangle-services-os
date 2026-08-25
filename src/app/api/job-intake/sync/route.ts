import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { ingestAllAccounts } from "@/lib/job-intake/ingest";
import { safeEqual } from "@/lib/job-intake/credentials";

// IMAP + Buffer need the Node runtime, not Edge.
export const runtime = "nodejs";
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// POST /api/job-intake/sync
// Read every active mailbox, classify, store opportunities.
//
// Two ways in:
//   • a signed-in org member (the "Sync now" button)
//   • a scheduled call carrying `Authorization: Bearer $CRON_SECRET`
//
// Read-only against the mailbox. Never sends, replies, or deletes anything.
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : null;
  // Constant-time compare so the token can't be recovered by timing.
  const isCron = Boolean(cronSecret && token && safeEqual(token, cronSecret));

  let orgId: string;

  if (isCron) {
    // A scheduled run has no user session, so it needs an explicit org.
    orgId = process.env.CRON_ORGANIZATION_ID ?? "";
    if (!orgId) {
      return NextResponse.json(
        { error: "CRON_ORGANIZATION_ID must be set for scheduled syncs." },
        { status: 500 },
      );
    }
  } else {
    const access = await requireApiAccess(request);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (access.demo) {
      return NextResponse.json(
        { error: "Mail sync is not available in demo mode." },
        { status: 403 },
      );
    }
    orgId = access.organizationId;
  }

  let limit = 60;
  let sinceDays: number | undefined;
  try {
    const body = (await request.json()) as { limit?: number; sinceDays?: number };
    if (typeof body.limit === "number" && body.limit > 0) {
      limit = Math.min(300, Math.floor(body.limit));
    }
    if (typeof body.sinceDays === "number" && body.sinceDays > 0) {
      sinceDays = Math.min(365, Math.floor(body.sinceDays));
      // A backfill covers more ground, so it needs room for more messages.
      if (!body.limit) limit = 200;
    }
  } catch {
    // No body is fine — use the defaults.
  }

  const summaries = await ingestAllAccounts(orgId, { limit, sinceDays });

  if (summaries.length === 0) {
    return NextResponse.json({
      summaries,
      message:
        "No mailboxes are connected yet. Add one in Settings before syncing.",
    });
  }

  const totals = summaries.reduce(
    (acc, s) => ({
      fetched: acc.fetched + s.fetched,
      leadsCreated: acc.leadsCreated + s.leadsCreated,
      noiseDiscarded: acc.noiseDiscarded + s.noiseDiscarded,
      alreadySeen: acc.alreadySeen + s.alreadySeen,
      errors: acc.errors + s.errors.length,
    }),
    { fetched: 0, leadsCreated: 0, noiseDiscarded: 0, alreadySeen: 0, errors: 0 },
  );

  return NextResponse.json({ totals, summaries });
}
