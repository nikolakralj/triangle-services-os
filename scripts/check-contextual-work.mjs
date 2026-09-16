import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = process.cwd();

function load(file, mocks = {}) {
  const full = path.resolve(root, file);
  const code = ts.transpileModule(fs.readFileSync(full, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = { exports: {} };
  const localRequire = (name) => {
    if (name === "server-only") return {};
    if (name in mocks) return mocks[name];
    if (name.startsWith("@/")) {
      const base = "src/" + name.slice(2);
      for (const ext of [".ts", ".tsx"]) {
        if (fs.existsSync(path.resolve(root, base + ext))) return load(base + ext, mocks);
      }
    }
    return require(name);
  };
  new Function("require", "module", "exports", code)(localRequire, mod, mod.exports);
  return mod.exports;
}

const tests = [];
function test(name, fn) {
  tests.push([name, fn]);
}

test("named and inferred routing does not start from a Mission", () => {
  const { parseNamedRole, inferNamedRole } = load("src/lib/data/contextual-work.ts", {
    "@/lib/supabase/server": { createServiceSupabaseClient: () => null },
    "@/lib/data/workforce": { createAssignment: async () => null, listWorkforce: async () => [] },
    "@/lib/data/bot-runtime": { loadEmployeeRuntime: async () => ({ runtime: "bot" }), wakeEmployee: async () => null },
    "@/lib/data/job-intake": { getJobLead: async () => null },
  });
  assert.equal(parseNamedRole("Scout, investigate the end client"), "scout");
  assert.equal(parseNamedRole("Hanna check workers"), "hanna");
  assert.equal(parseNamedRole("Bob, reply asking for the rate"), "bob");
  assert.equal(inferNamedRole("Investigate what project this is for"), "scout");
  assert.equal(inferNamedRole("Check if we have three engineers"), "hanna");
  assert.equal(inferNamedRole("Reply that we can support it"), "bob");
});

test("human brief and mission suggestion parse from a result", () => {
  const { parseHumanBrief, parseSuggestMission } = load("src/lib/data/contextual-work.ts", {
    "@/lib/supabase/server": { createServiceSupabaseClient: () => null },
    "@/lib/data/workforce": { createAssignment: async () => null, listWorkforce: async () => [] },
    "@/lib/data/bot-runtime": { loadEmployeeRuntime: async () => ({ runtime: "bot" }), wakeEmployee: async () => null },
    "@/lib/data/job-intake": { getJobLead: async () => null },
  });
  const brief = parseHumanBrief(
    "WHAT CHANGED: Found ENGIE as likely end client.\nWHY IT MATTERS: Broader DACH automation demand.\nRECOMMEND: Ask for the site.\nNEED FROM YOU: Approve outreach.\nEVIDENCE: https://example.com\nSUGGEST MISSION: Develop Computer Futures DACH Automation Account.",
  );
  assert.equal(brief.whatChanged.includes("ENGIE"), true);
  assert.equal(
    parseSuggestMission("SUGGEST MISSION: Develop Computer Futures DACH Automation Account."),
    "Develop Computer Futures DACH Automation Account.",
  );
  assert.equal(parseSuggestMission("SUGGEST MISSION: none"), null);
});

test("SMTP host is provider-aware", () => {
  const { defaultSmtpHost } = load("src/lib/mail/smtp-send.ts", {
    "@/lib/job-intake/credentials": { resolveMailboxPassword: () => "x" },
    "@/lib/job-intake/ingest": {},
  });
  assert.equal(defaultSmtpHost("nikola@gmail.com"), "smtp.gmail.com");
  assert.equal(defaultSmtpHost("n@outlook.com"), "smtp.office365.com");
});

test("Ask API accepts context and Today points at /now/lead", () => {
  const ask = fs.readFileSync(path.resolve(root, "src/app/api/ask/route.ts"), "utf8");
  assert(ask.includes("createContextualAssignment"));
  assert(ask.includes("kind: \"contextual\""));
  const next = fs.readFileSync(path.resolve(root, "src/lib/data/next-move.ts"), "utf8");
  assert(next.includes("/now/lead/${best.leadId}"));
  assert(next.includes("Review reply"));
  const today = fs.readFileSync(path.resolve(root, "src/components/modules/today-screen.tsx"), "utf8");
  assert(today.includes("{cta}"));
  assert(today.includes("Not this request"));
  assert(!today.includes('label: "They replied"'));
  const follow = fs.readFileSync(path.resolve(root, "src/components/modules/today-missions.tsx"), "utf8");
  assert(follow.includes("Snooze"));
  assert(follow.includes("Tomorrow"));
  assert(follow.includes("Next week"));
  assert(!follow.includes(">Later<") && !follow.includes("\n              Later"));
});

test("Job Intake stays off the sidebar", () => {
  const sidebar = fs.readFileSync(path.resolve(root, "src/components/layout/sidebar.tsx"), "utf8");
  assert(!sidebar.includes('href: "/job-intake"'));
});

test("IMAP ingest matches In-Reply-To and sync totals count replies", () => {
  const source = fs.readFileSync(path.resolve(root, "src/lib/job-intake/mail-source.ts"), "utf8");
  assert(source.includes("inReplyTo"));
  const ingest = fs.readFileSync(path.resolve(root, "src/lib/job-intake/ingest.ts"), "utf8");
  assert(ingest.includes("inReplyTo: msg.inReplyTo"));
  assert(ingest.includes("replyReceivedAt"));
  const sync = fs.readFileSync(path.resolve(root, "src/app/api/job-intake/sync/route.ts"), "utf8");
  assert(sync.includes("repliesMatched"));
  const send = fs.readFileSync(path.resolve(root, "src/lib/data/lead-send.ts"), "utf8");
  assert(send.includes("sendViaMailbox"));
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log("✓ " + name);
  } catch (err) {
    failed += 1;
    console.error("✗ " + name);
    console.error(err);
  }
}
if (failed) process.exit(1);
console.log("\nAll contextual work checks passed.");
