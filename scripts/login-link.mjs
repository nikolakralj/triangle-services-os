#!/usr/bin/env node
// Generate a one-time sign-in link for someone on the team.
//
// Run this YOURSELF in a terminal — the link is a credential and is printed
// once, here, never stored. Send it to the person over whatever channel you
// already trust; it lets whoever holds it into that account.
//
//   node scripts/login-link.mjs <email> [magiclink|recovery]
//
//   magiclink  signs them straight in            (default)
//   recovery   signs them in on the password page so they can set a new one
//
// Why a script rather than "click forgot password": Supabase's built-in
// mailer is rate limited and this project has no SMTP configured yet, so the
// email route silently stops working after a few attempts. See SMTP_SETUP.md.

import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = process.env.SITE_URL || "https://triangle-services-os.vercel.app";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const email = process.argv[2];
const type = process.argv[3] ?? "magiclink";

if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/login-link.mjs <email> [magiclink|recovery]");
  process.exit(1);
}
if (!["magiclink", "recovery"].includes(type)) {
  console.error(`Unknown type "${type}". Use magiclink or recovery.`);
  process.exit(1);
}

// Refuse unless the account already exists.
//
// Supabase's generate_link with type=magiclink CREATES the user when there is
// no match — so a mistyped address does not fail, it silently opens a new
// account and hands you a working link into it. Found the hard way: a test
// run against nobody-zz@example.invalid produced a real user.
const lookup = await fetch(
  `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
  { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
);
const found = await lookup.json().catch(() => null);
const exists = (found?.users ?? []).some(
  (u) => String(u.email ?? "").toLowerCase() === email.toLowerCase(),
);
if (!exists) {
  console.error(`No account for ${email}.`);
  console.error("Check the spelling. This script will not create one —");
  console.error("a typo here would silently open an account someone could sign into.");
  await new Promise((r) => setTimeout(r, 50));
  process.exit(1);
}

const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    type,
    email,
    options: { redirect_to: `${SITE}/auth/callback` },
  }),
});

const body = await res.json().catch(() => null);

if (!res.ok) {
  console.error(`Failed (${res.status}):`, body?.msg ?? body?.message ?? JSON.stringify(body));
  if (res.status === 422) {
    console.error("No account with that address. Create the user first.");
  }
  process.exit(1);
}

const link = body?.properties?.action_link ?? body?.action_link;
if (!link) {
  console.error("No link came back:", JSON.stringify(body).slice(0, 300));
  process.exit(1);
}

console.log();
console.log(`One-time ${type} link for ${email}:`);
console.log();
console.log(link);
console.log();
console.log("Single use. Send it directly to them — anyone holding it can sign in as");
console.log("that person. It expires; generate a new one if it goes stale.");
console.log();

// Windows: flush before exit so libuv does not print an assertion after a
// successful run (same reason as create-machine-credential.mjs).
await new Promise((r) => setTimeout(r, 50));
process.exit(0);
