import { NextResponse } from "next/server";
import { runNextScoutAssignment } from "@/lib/ai/scout-executor";
import { safeEqual } from "@/lib/job-intake/credentials";

// ---------------------------------------------------------------------------
// Scheduled agent work.
//
// This used to claim stalled Scout jobs and run them on OpenAI — a second
// brain, and the thing the CEO retired on 15 September 2026. Scout is
// bot-owned: Triangle stores the work and wakes the bot; the bot's own
// scheduled inbox check is the backup for a missed wake-up.
//
// The route stays so Vercel Cron does not 404. It does not claim Scout work
// and does not call OpenAI.
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

  const result = await runNextScoutAssignment(orgId);
  return NextResponse.json({
    ok: true,
    ran: 0,
    results: [],
    status: result.status,
    message:
      "Scout work is owned by the Scout bot. This cron no longer runs the in-app OpenAI executor.",
  });
}

// Vercel Cron issues GET. Same work, same guard.
export async function GET(request: Request) {
  return POST(request);
}
