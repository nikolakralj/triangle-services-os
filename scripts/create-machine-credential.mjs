#!/usr/bin/env node
// Create a scoped machine credential for an external agent (a Grok bot,
// a script). Run this YOURSELF in a terminal — the token is printed once,
// here, and never stored in plaintext anywhere.
//
//   node scripts/create-machine-credential.mjs <name> <scope>[,scope...]
//
// Examples:
//   node scripts/create-machine-credential.mjs triangle_bob_nikola job_intake.ingest
//   node scripts/create-machine-credential.mjs triangle_bob_ralph  job_intake.ingest
//   node scripts/create-machine-credential.mjs triangle_scout     research.suggestion.create
//
// Revoke one:
//   node scripts/create-machine-credential.mjs --revoke <name>

import { readFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";

// Load .env.local (UTF-8; see JOB_INTAKE.md gotchas about PowerShell encoding)
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = env.DEFAULT_ORGANIZATION_ID || env.MCP_ORGANIZATION_ID;

if (!SUPABASE_URL || !SERVICE_KEY || !ORG_ID) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DEFAULT_ORGANIZATION_ID in .env.local");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const [, , a, b] = process.argv;

if (a === "--revoke") {
  if (!b) { console.error("Usage: --revoke <name>"); process.exit(1); }
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/machine_credentials?org_id=eq.${ORG_ID}&name=eq.${encodeURIComponent(b)}`,
    { method: "PATCH", headers, body: JSON.stringify({ status: "revoked" }) },
  );
  const rows = await res.json();
  console.log(res.ok && rows.length ? `Revoked ${b}.` : `Nothing revoked (not found?).`);
  process.exit(res.ok ? 0 : 1);
}

const name = a;
const scopes = (b ?? "").split(",").map((s) => s.trim()).filter(Boolean);
// Optional presentation args — how the agent appears on the team page.
const [, , , , displayName, roleTitle, emoji] = process.argv;
if (!name || scopes.length === 0) {
  console.error("Usage: node scripts/create-machine-credential.mjs <name> <scope>[,scope...] [displayName] [roleTitle] [emoji]");
  process.exit(1);
}

const token = `tri_mc_${randomBytes(24).toString("hex")}`;
const token_hash = createHash("sha256").update(token, "utf8").digest("hex");

// ── The employee is durable; this badge must belong to one. ──
// Re-badging (rotation) reuses the existing employee found via any prior
// credential with the same name. A first-time hire creates the employee and
// its provider binding (default grok) in one go.
async function rest(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers, ...opts });
  const body = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, body };
}

let agent_instance_id = null;
let provider_binding_id = null;

const prior = await rest(
  `machine_credentials?org_id=eq.${ORG_ID}&name=eq.${encodeURIComponent(name)}&agent_instance_id=not.is.null&select=agent_instance_id,provider_binding_id&limit=1`,
);
if (prior.ok && prior.body?.length) {
  agent_instance_id = prior.body[0].agent_instance_id;
  provider_binding_id = prior.body[0].provider_binding_id;
  console.log("Re-badging existing employee (history preserved).");
} else {
  const roleKey = name.replace(/^triangle_/, "");
  const inst = await rest("agent_instances", {
    method: "POST",
    body: JSON.stringify({
      org_id: ORG_ID,
      role_key: roleKey,
      display_name: displayName ?? roleKey,
      emoji: emoji ?? null,
      description: roleTitle ?? null,
      role_version: "v1",
    }),
  });
  if (!inst.ok) {
    console.error("Could not create the employee:", JSON.stringify(inst.body).slice(0, 200));
    process.exit(1);
  }
  agent_instance_id = inst.body[0].id;
  const bind = await rest("agent_provider_bindings", {
    method: "POST",
    body: JSON.stringify({
      org_id: ORG_ID,
      agent_instance_id,
      provider: "grok",
    }),
  });
  if (bind.ok) provider_binding_id = bind.body[0].id;
  console.log(`Employee created: ${displayName ?? roleKey} (${roleKey}).`);
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/machine_credentials`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    org_id: ORG_ID, name, token_hash, scopes,
    display_name: displayName ?? null,
    role_title: roleTitle ?? null,
    emoji: emoji ?? null,
    agent_instance_id,
    provider_binding_id,
  }),
});

if (!res.ok) {
  const body = await res.text();
  console.error(`Failed (${res.status}):`, body);
  if (body.includes("23505")) {
    console.error(
      "\nAn ACTIVE credential with that name already exists. Revoke it first:",
    );
    console.error(`  node scripts/create-machine-credential.mjs --revoke ${name}`);
  }
  process.exit(1);
}

console.log("Credential created. The token below is shown ONCE — paste it into the bot now.\n");
console.log(`  name:   ${name}`);
console.log(`  scopes: ${scopes.join(", ")}`);
console.log(`  token:  ${token}\n`);
console.log("Never paste this token into a chat with any AI. Bot config only.");
