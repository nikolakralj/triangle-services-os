import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { ingestAllAccounts } from "@/lib/job-intake/ingest";
import { safeEqual } from "@/lib/job-intake/credentials";
import { logAgentRun } from "@/lib/data/agents";

// IMAP + Buffer need the Node runtime, not Edge.
export const runtime = "nodejs";
export const maxDuration = 300;
// Vercel Cron calls this with GET. A cached GET would freeze the read.
export const dynamic = "force-dynamic";

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

  const summaries = await ingestAllAccounts(orgId, {
    limit,
    sinceDays,
    // The schedule reads a small batch every few minutes. Sync now may
    // take a wider bite, still bounded so one click cannot classify a
    // whole mailbox in one function.
    scheduled: isCron,
  });

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
      casesOpened: acc.casesOpened + s.casesOpened,
      noiseDiscarded: acc.noiseDiscarded + s.noiseDiscarded,
      alreadySeen: acc.alreadySeen + s.alreadySeen,
      errors: acc.errors + s.errors.length,
      catchingUp: acc.catchingUp || s.catchingUp,
    }),
    {
      fetched: 0,
      leadsCreated: 0,
      casesOpened: 0,
      noiseDiscarded: 0,
      alreadySeen: 0,
      errors: 0,
      catchingUp: false,
    },
  );

  // A quiet ten-minute read still updates the mailbox row (that is the
  // diagnostics line). It does not fill the work log, or the log would
  // become nothing but empty checks.
  const worthLogging =
    totals.fetched > 0 || totals.errors > 0 || totals.catchingUp || totals.leadsCreated > 0;
  if (worthLogging) {
    await logAgentRun({
      orgId,
      agentName: isCron ? "imap-cron" : "imap-sync",
      source: "imap",
      summary: totals,
    });
  }

  return NextResponse.json({ totals, summaries });
}

// Vercel Cron and the repository schedule issue GET. Same read, cron
// secret only — a signed-in Sync now stays on POST, so opening this URL
// in a browser does not start a read.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : null;
  if (!cronSecret || !token || !safeEqual(token, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return POST(request);
}
