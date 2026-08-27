#!/usr/bin/env node
// Push the env vars Triangle needs from .env.local into the linked Vercel
// project. Run this YOURSELF — values go straight from your file to your
// Vercel account and are never printed, logged, or shown to an AI.
//
//   node scripts/push-env-to-vercel.mjs          (all environments)
//   node scripts/push-env-to-vercel.mjs production
//
// Safe to re-run: it removes an existing value before adding the new one.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

// Default to ALL environments. Setting only `preview` is a classic trap: the
// production URL then runs with no config and silently falls back to demo
// mode, which bypasses login and shows seeded data.
const arg = process.argv[2] ?? "all";
const targets = arg === "all" ? ["production", "preview", "development"] : [arg];
if (!targets.every((t) => ["preview", "production", "development"].includes(t))) {
  console.error("Usage: node scripts/push-env-to-vercel.mjs [all|preview|production|development]");
  process.exit(1);
}

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

// VERCEL_OIDC_TOKEN is a local artifact Vercel regenerates — never upload it.
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "ENCRYPTION_KEY",
  "DEFAULT_ORGANIZATION_ID",
];
const OPTIONAL = [
  "ANTHROPIC_API_KEY", "MCP_API_KEY", "MCP_ORGANIZATION_ID",
  "MCP_USER_ID", "IMPORT_API_SECRET", "EMAIL_WEBHOOK_SECRET",
];

const missing = REQUIRED.filter((k) => !env[k]);
if (missing.length) {
  console.error("Missing from .env.local:", missing.join(", "));
  process.exit(1);
}

// The cron in vercel.json needs these; generate CRON_SECRET if absent.
if (!env.CRON_SECRET) env.CRON_SECRET = randomBytes(32).toString("base64url");
if (!env.CRON_ORGANIZATION_ID) env.CRON_ORGANIZATION_ID = env.DEFAULT_ORGANIZATION_ID;

const toPush = [...REQUIRED, ...OPTIONAL, "CRON_SECRET", "CRON_ORGANIZATION_ID"]
  .filter((k) => env[k]);

let failures = 0;
for (const target of targets) {
  console.log("\n--- " + target + " ---");
  for (const key of toPush) {
    // Remove first so re-runs update rather than fail on duplicate.
    spawnSync("npx", ["vercel", "env", "rm", key, target, "--yes"],
      { stdio: "ignore", shell: true });
    const res = spawnSync("npx", ["vercel", "env", "add", key, target],
      { input: env[key], stdio: ["pipe", "ignore", "pipe"], shell: true });
    const ok = res.status === 0;
    if (!ok) failures++;
    console.log((ok ? "  ok   " : " FAIL  ") + key);
    if (!ok) console.error(String(res.stderr).trim().split("\n").slice(-2).join("\n"));
  }
}

console.log("\nDone (" + targets.join(", ") + "). Values were never printed.");
if (failures) console.log(failures + " failed — see messages above.");
console.log("ENCRYPTION_KEY was copied from .env.local; it must match or connected mailboxes cannot be decrypted.");
console.log("\nNow redeploy so the new config is picked up:");
console.log("  npx vercel --prod");
