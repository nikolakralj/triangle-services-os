import "server-only";
import { NextResponse } from "next/server";
import { ROLE_CAPABILITIES } from "@/lib/auth/session";

// ---------------------------------------------------------------------------
// Who may press a button that asserts something happened.
//
// requireApiAccess returned a userId for three different kinds of caller: a
// signed-in person, the static MCP key (which borrows MCP_USER_ID), and demo
// mode. Routes checked `access.userId` and took it as proof that a human had
// acted — so a machine key could record "Sent to Oliver Hall" on the CEO's
// behalf. CLAUDE.md warns about exactly this, and nothing enforced it.
//
// Nor did anything check the role. The endpoints behind the Today screen
// refused demo mode and nothing else, so a viewer could reject findings,
// create work for Scout and log contacts.
//
// One function, so the rule cannot drift between routes the way the finding
// contract once drifted between two Scouts.
// ---------------------------------------------------------------------------

type Capability = "canWrite" | "canSeeWorkers";

export function refuseUnlessHuman(
  access: { demo: boolean; actor: "human" | "machine" | "demo"; role: string },
  need: Capability,
  doing: string,
): NextResponse | null {
  if (access.demo || access.actor === "demo") {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }
  if (access.actor !== "human") {
    return NextResponse.json(
      {
        error: `Only a signed-in person can ${doing}. A machine key cannot assert it.`,
      },
      { status: 403 },
    );
  }
  const caps = ROLE_CAPABILITIES[access.role as keyof typeof ROLE_CAPABILITIES];
  if (!caps || !caps[need]) {
    return NextResponse.json(
      { error: `Your role (${access.role}) cannot ${doing}.` },
      { status: 403 },
    );
  }
  return null;
}
