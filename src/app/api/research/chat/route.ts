/**
 * GET/POST /api/research/chat
 *
 * Retired operating path (CEO, 15 September 2026). Project Research Agent
 * chat is not how Triangle researches a signal. Start a Scout mission or
 * Ask from the case instead. Research suggestions, Approvals accept, and
 * contractor-chain writes are unchanged.
 *
 * Conversation tables and `src/lib/data/research-chat.ts` remain; this
 * route no longer runs the OpenAI loop. No migration.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";

export const RESEARCH_CHAT_RETIRED_MESSAGE =
  "Project Research Agent chat is retired. Start a Scout mission from Missions or hand the work to Scout with Ask from the case. Research suggestions still go to Approvals.";

function retiredResponse() {
  return NextResponse.json(
    {
      error: RESEARCH_CHAT_RETIRED_MESSAGE,
      retired: true,
      use: {
        missions: "/missions",
        team: "/settings#team",
        approvals: "/approvals",
      },
    },
    { status: 410 },
  );
}

export async function POST(request: NextRequest) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  return retiredResponse();
}

export async function GET(request: NextRequest) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  return retiredResponse();
}
