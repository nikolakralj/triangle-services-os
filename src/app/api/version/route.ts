import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public on purpose, and deliberately thin.
//
// `npm run ship` polls this to know when a push has actually reached
// production. Without it the only options are guessing with a sleep or
// trusting a build log, and neither tells you what the live site is serving.
//
// `supabase` is here because of a bug that already cost us a day: the env
// vars were scoped to Preview only, so production silently fell back to demo
// mode and let anyone open the app without logging in. A boolean that says
// "this deployment has real credentials" turns that into a caught failure.
export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    env: process.env.VERCEL_ENV ?? "development",
    supabase: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  });
}
