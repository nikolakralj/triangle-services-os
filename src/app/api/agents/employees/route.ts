import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { requireApiRole, createServiceSupabaseClient } from "@/lib/supabase/server";
import { SCOPE_BY_VALUE } from "@/lib/data/agent-scopes";

// ---------------------------------------------------------------------------
// POST /api/agents/employees — hire an AI employee.
//
// Until now this was scripts/create-machine-credential.mjs, run in a terminal.
// That is fine for me and useless for Ralph, and an operating system whose
// staffing model requires a shell is not one anyone else can run.
//
// Creates three things that are deliberately separate:
//   the employee  (agent_instances)        — durable, outlives any provider
//   the brain     (agent_provider_bindings)— Grok today, something else later
//   the badge     (machine_credentials)    — scoped, revocable, replaceable
//
// The plaintext token is returned EXACTLY ONCE and never stored: only its
// SHA-256 hash is written. Losing it means issuing a new badge, which is the
// correct trade — a token you can look up again is a token that leaks.
//
// Admin only. Handing out credentials is not a partner-level action.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

const NAME_RE = /^[a-z][a-z0-9_]{2,40}$/;

export async function POST(request: Request) {
  const access = await requireApiRole(request, ["admin"]);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  let body: {
    name?: string;
    displayName?: string;
    roleTitle?: string;
    description?: string;
    emoji?: string;
    scopes?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().toLowerCase();
  const displayName = String(body.displayName ?? "").trim();
  const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : [];

  if (!displayName) {
    return NextResponse.json({ error: "Give them a name." }, { status: 400 });
  }
  if (!NAME_RE.test(name)) {
    return NextResponse.json(
      {
        error:
          "The badge name must be lowercase letters, numbers and underscores — e.g. triangle_hr.",
      },
      { status: 400 },
    );
  }
  if (scopes.length === 0) {
    return NextResponse.json(
      { error: "Choose at least one thing they are allowed to do." },
      { status: 400 },
    );
  }
  // Never mint a badge for a permission the API does not enforce — an unknown
  // scope is a silent grant of nothing, or worse, a typo of something real.
  const unknown = scopes.filter((s) => !SCOPE_BY_VALUE.has(s));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Not a real permission: ${unknown.join(", ")}` },
      { status: 400 },
    );
  }

  const svc = createServiceSupabaseClient();
  if (!svc) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  // A live badge with this name already exists — refuse rather than quietly
  // creating a second one, because two active badges is how you end up unable
  // to tell which bot did what.
  const { data: clash } = await svc
    .from("machine_credentials")
    .select("id")
    .eq("org_id", access.organizationId)
    .eq("name", name)
    .eq("status", "active")
    .limit(1);
  if (clash && clash.length > 0) {
    return NextResponse.json(
      { error: `"${name}" already has an active badge. Revoke it before issuing another.` },
      { status: 409 },
    );
  }

  // Re-badging an employee who already exists keeps their history — the
  // assignments, findings and work log belong to the person, not the token.
  const { data: prior } = await svc
    .from("machine_credentials")
    .select("agent_instance_id, provider_binding_id")
    .eq("org_id", access.organizationId)
    .eq("name", name)
    .not("agent_instance_id", "is", null)
    .limit(1);

  let agentInstanceId: string | null = prior?.[0]?.agent_instance_id ?? null;
  let providerBindingId: string | null = prior?.[0]?.provider_binding_id ?? null;
  const rehired = Boolean(agentInstanceId);

  if (!agentInstanceId) {
    const { data: instance, error: instErr } = await svc
      .from("agent_instances")
      .select("id")
      .eq("org_id", access.organizationId)
      .eq("role_key", name.replace(/^triangle_/, ""))
      .maybeSingle();

    if (instance) {
      agentInstanceId = instance.id as string;
    } else {
      const { data: created, error } = await svc
        .from("agent_instances")
        .insert({
          org_id: access.organizationId,
          role_key: name.replace(/^triangle_/, ""),
          display_name: displayName,
          emoji: String(body.emoji ?? "").trim() || null,
          description: String(body.description ?? body.roleTitle ?? "").trim() || null,
          role_version: "v1",
          status: "active",
          created_by: access.userId,
        })
        .select("id")
        .maybeSingle();
      if (error || !created) {
        return NextResponse.json(
          { error: `Could not create the employee: ${error?.message ?? instErr?.message}` },
          { status: 500 },
        );
      }
      agentInstanceId = created.id as string;
    }

    const { data: binding } = await svc
      .from("agent_provider_bindings")
      .insert({
        org_id: access.organizationId,
        agent_instance_id: agentInstanceId,
        provider: "grok",
      })
      .select("id")
      .maybeSingle();
    providerBindingId = (binding?.id as string) ?? null;
  }

  const token = `tri_mc_${randomBytes(24).toString("hex")}`;
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

  const { error: credErr } = await svc.from("machine_credentials").insert({
    org_id: access.organizationId,
    name,
    token_hash: tokenHash,
    scopes,
    status: "active",
    display_name: displayName,
    role_title: String(body.roleTitle ?? "").trim() || null,
    emoji: String(body.emoji ?? "").trim() || null,
    description: String(body.description ?? "").trim() || null,
    agent_instance_id: agentInstanceId,
    provider_binding_id: providerBindingId,
    created_by: access.userId,
  });

  if (credErr) {
    return NextResponse.json(
      { error: `Could not issue the badge: ${credErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    rehired,
    name,
    displayName,
    scopes,
    agentInstanceId,
    // Shown once, in the browser, and never retrievable again.
    token,
  });
}
