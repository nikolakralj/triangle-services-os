import { NextResponse } from "next/server";
import { runNextScoutAssignment } from "@/lib/ai/scout-executor";
import { safeEqual } from "@/lib/job-intake/credentials";
import { runEventOutboxSweep } from "@/lib/data/event-outbox";

// ---------------------------------------------------------------------------
// Scheduled agent work.
//
// Sweeps the minimal event outbox for:
//   - follow_up_due: outreach / commercial actions whose follow-up date has arrived
//   - availability_stale: workers & supply partners with expired shelf life (>14d)
//
// Wakes the owning employees (Bob for commercial follow-ups, Hanna for pool
// availability) with webhook calls carrying ids only.
//
// Scout work is bot-owned; this cron does not run the retired in-app OpenAI executor.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : null;
  // Constant-time compare so the token cannot be recovered by timing.
  if (!secret || !token || !safeEqual(token, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = process.env.CRON_ORGANIZATION_ID ?? "";
  if (!orgId) {
    return NextResponse.json(
      { error: "CRON_ORGANIZATION_ID must be set for scheduled agent work." },
      { status: 500 },
    );
  }

  const [result, outboxSummary] = await Promise.all([
    runNextScoutAssignment(orgId),
    runEventOutboxSweep(orgId),
  ]);

  return NextResponse.json({
    ok: true,
    ran: 0,
    results: [],
    status: result.status,
    outbox: outboxSummary,
    message:
      "Scout work is owned by the Scout bot. Event outbox swept due follow-ups and stale availability.",
  });
}

// Vercel Cron issues GET. Same work, same guard.
export async function GET(request: Request) {
  return POST(request);
}
