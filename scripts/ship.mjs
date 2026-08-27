#!/usr/bin/env node
/**
 * npm run ship — build, push, and prove production is serving the new commit.
 *
 * The GitHub default branch is now wip-jules-…, so Vercel deploys this branch
 * straight to production: a push IS a release. That removed the preview gate
 * that used to catch a broken build before users saw it, which is exactly why
 * this script builds FIRST and pushes nothing until the build passes.
 *
 * Then it waits for /api/version to report the pushed commit and smoke-tests
 * the live site. "Deployed" and "working" are different claims; this makes the
 * second one.
 *
 * Usage:
 *   npm run ship                 build → push → wait → smoke
 *   npm run ship -- --dry-run    build and smoke the CURRENT production only
 *   npm run ship -- --allow-dirty  push with uncommitted source files
 */

import { execSync } from "node:child_process";

const PROD = "https://triangle-services-os.vercel.app";
const BRANCH = "wip-jules-2026-05-03T18-13-13-596Z";
const DEPLOY_TIMEOUT_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 10_000;

// Uncommitted changes in these are a reason to stop: they change what runs.
// Everything else (scratch notes, the orchestrator's task queue) only earns a
// warning — being strict about those makes people bypass the script entirely.
const BLOCKING_PATHS = [/^src\//, /^supabase\//, /^package(-lock)?\.json$/, /^next\.config\./];

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const allowDirty = args.has("--allow-dirty");

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

let stepNo = 0;
const step = (msg) => console.log(`\n${c.bold(`[${++stepNo}] ${msg}`)}`);
const ok = (msg) => console.log(`    ${c.green("✓")} ${msg}`);
const warn = (msg) => console.log(`    ${c.yellow("!")} ${msg}`);

function die(msg, hint) {
  console.error(`\n${c.red("✗ " + msg)}`);
  if (hint) console.error(c.dim(`  ${hint}`));
  process.exit(1);
}

const capture = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. Are we allowed to ship from here? ────────────────────────────────────

step("Checking the working tree");

const branch = capture("git rev-parse --abbrev-ref HEAD");
if (branch !== BRANCH) {
  die(
    `On branch "${branch}", but production deploys from "${BRANCH}".`,
    `Switch branches, or update BRANCH in scripts/ship.mjs if the deploy branch moved.`,
  );
}
ok(`on ${branch}`);

const dirty = capture("git status --porcelain")
  .split("\n")
  .filter(Boolean)
  .map((line) => line.slice(3).replace(/^"|"$/g, ""));

const blocking = dirty.filter((f) => BLOCKING_PATHS.some((re) => re.test(f)));

if (blocking.length && !allowDirty && !dryRun) {
  console.error(`\n${c.red("✗ Uncommitted changes that would not be deployed:")}`);
  for (const f of blocking) console.error(`    ${f}`);
  die(
    "These files differ from what would go live.",
    "Commit them, or re-run with --allow-dirty if you really mean to ship without them.",
  );
}
if (dirty.length > blocking.length) {
  warn(`${dirty.length - blocking.length} other uncommitted file(s), not deployed`);
}
if (!dirty.length) ok("clean");

const localSha = capture("git rev-parse HEAD");
ok(`HEAD is ${localSha.slice(0, 7)} — ${capture("git log -1 --format=%s")}`);

// ── 2. The build is the gate ────────────────────────────────────────────────

step("Building (this is what Vercel will run)");
try {
  run("npm run build");
} catch {
  die("Build failed. Nothing was pushed.", "Fix the errors above and run again.");
}
ok("build passed");

// ── 3. Push — which is the deploy ───────────────────────────────────────────

if (dryRun) {
  warn("--dry-run: skipping push, smoke-testing whatever production has now");
} else {
  step("Pushing to origin (this triggers the production deploy)");
  const ahead = capture(`git rev-list --count origin/${BRANCH}..HEAD`);
  if (ahead === "0") {
    ok("already pushed — nothing new to send");
  } else {
    run(`git push origin ${BRANCH}`);
    ok(`pushed ${ahead} commit(s)`);
  }
}

// ── 4. Wait for the live site to actually serve it ──────────────────────────

async function fetchVersion() {
  try {
    const res = await fetch(`${PROD}/api/version`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

let version = await fetchVersion();

if (!dryRun) {
  step("Waiting for production to serve the new commit");

  if (version && version.commit === "local") {
    warn("/api/version reports no commit SHA — is this deployment built by Vercel?");
  }

  const deadline = Date.now() + DEPLOY_TIMEOUT_MS;
  let live = false;

  while (Date.now() < deadline) {
    version = await fetchVersion();
    if (version?.commit === localSha) {
      live = true;
      break;
    }
    const serving = version?.commit ? version.commit.slice(0, 7) : "unreachable";
    const waited = Math.round((DEPLOY_TIMEOUT_MS - (deadline - Date.now())) / 1000);
    process.stdout.write(`    ${c.dim(`${waited}s — production still on ${serving}`)}\r`);
    await sleep(POLL_INTERVAL_MS);
  }
  process.stdout.write(" ".repeat(60) + "\r");

  if (!live) {
    die(
      `Production never reported ${localSha.slice(0, 7)} within ${DEPLOY_TIMEOUT_MS / 60_000} minutes.`,
      "The push succeeded — the deploy may still be building, or it failed. Check the Vercel dashboard.",
    );
  }
  ok(`production is serving ${localSha.slice(0, 7)}`);
}

// ── 5. Deployed is not the same as working ──────────────────────────────────

step("Smoke-testing the live site");

const failures = [];

function check(name, passed, detail) {
  if (passed) ok(`${name}${detail ? ` ${c.dim(`(${detail})`)}` : ""}`);
  else {
    console.log(`    ${c.red("✗")} ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}

if (!version) version = await fetchVersion();

if (!version) {
  check("/api/version responds", false, "no response");
} else {
  check("environment is production", version.env === "production", `env=${version.env}`);
  check("branch is the deploy branch", version.branch === BRANCH, `branch=${version.branch}`);
  // The one that matters most: without real Supabase credentials the app
  // falls back to demo mode and serves everything to anyone.
  check("Supabase credentials present", version.supabase === true, "demo-mode fallback risk");
}

async function probe(path, init) {
  try {
    const res = await fetch(`${PROD}${path}`, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      ...init,
    });
    return { status: res.status, location: res.headers.get("location") ?? "" };
  } catch (err) {
    return { status: 0, location: "", error: String(err) };
  }
}

const login = await probe("/login");
check("/login renders", login.status === 200, `status ${login.status}`);

const guarded = await probe("/approvals");
check(
  "/approvals requires login",
  guarded.status === 307 && guarded.location.includes("/login"),
  `status ${guarded.status}`,
);

const api = await probe("/api/approvals", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
check("/api/approvals rejects anonymous writes", api.status === 401, `status ${api.status}`);

// ── Result ──────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(
    `\n${c.red(`✗ Live, but ${failures.length} smoke check(s) failed:`)} ${failures.join(", ")}`,
  );
  console.error(c.dim(`  ${PROD}`));
  process.exit(1);
}

console.log(`\n${c.green("✓ Shipped.")} ${PROD}`);
