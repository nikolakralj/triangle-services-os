// P2 — one email asking for people becomes one case.
// Isolated fixtures. No env, no live database, no messages sent, no SQL applied.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.resolve(root, file), "utf8");
}

function moduleLoader() {
  const cache = new Map();
  return function load(file) {
    const full = path.resolve(root, file);
    if (cache.has(full)) return cache.get(full);
    const code = ts.transpileModule(fs.readFileSync(full, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const mod = { exports: {} };
    cache.set(full, mod.exports);
    const localRequire = (name) => {
      if (name === "server-only") return {};
      if (name.startsWith("@/")) {
        const base = "src/" + name.slice(2);
        if (fs.existsSync(path.resolve(root, base + ".ts"))) return load(base + ".ts");
        if (fs.existsSync(path.resolve(root, base + ".tsx"))) return load(base + ".tsx");
      }
      return require(name);
    };
    new Function("require", "module", "exports", code)(localRequire, mod, mod.exports);
    return mod.exports;
  };
}

const tests = [];
function test(name, fn) {
  tests.push([name, fn]);
}

const load = moduleLoader();
const requirement = load("src/lib/job-intake/requirement-case.ts");
const shared = load("src/lib/data/mission-shared.ts");

const {
  decideRequirementCase,
  fileRequirementCase,
  headcountSum,
  requirementCaseTitle,
  requirementIdentity,
  requirementPlace,
  requirementStatusLine,
  requirementZone,
} = requirement;

// The named requester lives in this check, not in product source. The tenant
// identity scan treats that name as an operator hardcoded into the app.
const COLOGNE_AGENCY_REQUEST = {
  classification: "job_opportunity",
  confidence: 92,
  messageId: "<ralph-cologne-commissioning@agency.example>",
  threadId: "thread-ralph-cologne",
  subject: "Fwd: Commissioning engineers — data centre near Cologne",
  requesterEmail: "ralph@agency.example",
  contactName: "Ralph",
  city: "Cologne",
  sector: "data centre",
  headcountText: "6",
  text: [
    "Fwd: Commissioning engineers — data centre near Cologne",
    "Need 6 commissioning engineers for a data centre near Cologne.",
    "3 Basic, 2 Advanced, 1 Expert.",
    "Desigo CC, PXC, ABT. Start November–December 2026.",
    "English required, German desirable.",
  ].join("\n"),
  roles: [
    {
      title: "Commissioning engineer",
      count: 3,
      level: "Basic",
      skills: ["Desigo CC", "PXC", "ABT"],
      start: "November 2026",
      duration: null,
      location: "near Cologne",
      languages: ["English", "German desirable"],
      rate: null,
    },
    {
      title: "Commissioning engineer",
      count: 2,
      level: "Advanced",
      skills: ["Desigo CC", "PXC"],
      start: "November 2026",
      duration: null,
      location: "near Cologne",
      languages: ["English"],
      rate: null,
    },
    {
      title: "Commissioning engineer",
      count: 1,
      level: "Expert",
      skills: ["Desigo CC"],
      start: "December 2026",
      duration: null,
      location: "near Cologne",
      languages: ["English"],
      rate: null,
    },
  ],
  openQuestions: ["rate"],
};

const SINGLE_ROLE_REQUEST = {
  classification: "job_opportunity",
  confidence: 88,
  headcountText: "1",
  text: "One Siemens automation engineer, Ireland, 12 months.",
  roles: [
    {
      title: "Siemens automation engineer",
      count: 1,
      level: null,
      skills: ["PCS7"],
      start: null,
      location: "Ireland",
    },
  ],
  openQuestions: ["rate"],
};
const { earliestOpenRun } = shared;

function cologneDecision() {
  return decideRequirementCase({
    classification: COLOGNE_AGENCY_REQUEST.classification,
    confidence: COLOGNE_AGENCY_REQUEST.confidence,
    roles: COLOGNE_AGENCY_REQUEST.roles,
    openQuestions: COLOGNE_AGENCY_REQUEST.openQuestions,
    headcountText: COLOGNE_AGENCY_REQUEST.headcountText,
    text: COLOGNE_AGENCY_REQUEST.text,
  });
}

test("an agency request like Cologne is three role rows that add up to six", () => {
  const decision = cologneDecision();
  assert.equal(decision.action, "open");
  assert.equal(decision.roles.length, 3);
  assert.deepEqual(
    decision.roles.map((role) => role.headcount),
    [3, 2, 1],
  );
  assert.deepEqual(
    decision.roles.map((role) => role.level),
    ["Basic", "Advanced", "Expert"],
  );
  assert.equal(headcountSum(decision.roles), 6);
  assert.equal(
    requirementCaseTitle({
      who: COLOGNE_AGENCY_REQUEST.contactName,
      place: requirementPlace({
        city: COLOGNE_AGENCY_REQUEST.city,
        sector: COLOGNE_AGENCY_REQUEST.sector,
      }),
      roles: decision.roles,
    }),
    "Ralph · Cologne data centre · 6 roles",
  );
  assert.equal(requirementStatusLine("active", "completed"), "Hanna sourcing, reply drafted");
  assert.equal(
    requirementZone({
      hannaStatus: "active",
      bobStatus: "completed",
      missionClosed: false,
      missionState: "working",
    }),
    "needs_you",
  );
});

test("the same email twice opens one case and wakes Hanna and Bob once", () => {
  const decision = cologneDecision();
  const identity = requirementIdentity({
    messageId: COLOGNE_AGENCY_REQUEST.messageId,
    threadId: COLOGNE_AGENCY_REQUEST.threadId,
    subject: COLOGNE_AGENCY_REQUEST.subject,
    requesterEmail: COLOGNE_AGENCY_REQUEST.requesterEmail,
  });
  const memory = [];
  const first = fileRequirementCase(memory, { identity, decision, missionId: "case-1" });
  const second = fileRequirementCase(memory, { identity, decision, missionId: "case-2" });
  assert.deepEqual(first.wake, ["hanna", "bob"]);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.deepEqual(second.wake, []);
  assert.equal(second.missionId, "case-1");
  assert.equal(memory.length, 1);
  assert.deepEqual(memory[0].steps, ["hanna", "bob"]);
  assert.equal(memory[0].roles.length, 3);
});

test("the same thread, or the same forward, does not open a second case", () => {
  const decision = cologneDecision();
  const memory = [];
  const firstId = requirementIdentity({
    messageId: "<first@agency.example>",
    threadId: "thread-ralph-cologne",
    subject: COLOGNE_AGENCY_REQUEST.subject,
    requesterEmail: COLOGNE_AGENCY_REQUEST.requesterEmail,
  });
  fileRequirementCase(memory, { identity: firstId, decision, missionId: "case-1" });

  const laterInThread = requirementIdentity({
    messageId: "<second@agency.example>",
    threadId: "thread-ralph-cologne",
    subject: "Re: Commissioning engineers — data centre near Cologne",
    requesterEmail: COLOGNE_AGENCY_REQUEST.requesterEmail,
  });
  const threadAgain = fileRequirementCase(memory, {
    identity: laterInThread,
    decision,
    missionId: "case-2",
  });
  assert.equal(threadAgain.created, false);
  assert.deepEqual(threadAgain.wake, []);

  const forwarded = requirementIdentity({
    messageId: "<forward-copy@gmail.example>",
    threadId: null,
    subject: "FW: Commissioning engineers — data centre near Cologne",
    requesterEmail: COLOGNE_AGENCY_REQUEST.requesterEmail,
  });
  const forwardAgain = fileRequirementCase(memory, {
    identity: forwarded,
    decision,
    missionId: "case-3",
  });
  assert.equal(forwardAgain.created, false);
  assert.equal(memory.length, 1);
});

test("a single role stays on the reply card", () => {
  const decision = decideRequirementCase({
    classification: SINGLE_ROLE_REQUEST.classification,
    confidence: SINGLE_ROLE_REQUEST.confidence,
    roles: SINGLE_ROLE_REQUEST.roles,
    openQuestions: SINGLE_ROLE_REQUEST.openQuestions,
    headcountText: SINGLE_ROLE_REQUEST.headcountText,
    text: SINGLE_ROLE_REQUEST.text,
  });
  assert.equal(decision.action, "hold");
  const memory = [];
  const filed = fileRequirementCase(memory, {
    identity: requirementIdentity({
      messageId: "<henry@agency.example>",
      subject: "Siemens automation engineer",
      requesterEmail: "henry@agency.example",
    }),
    decision,
    missionId: "should-not-exist",
  });
  assert.equal(filed.created, false);
  assert.deepEqual(filed.wake, []);
  assert.equal(memory.length, 0);
});

test("an unsure read wakes nobody", () => {
  const low = decideRequirementCase({
    classification: "job_opportunity",
    confidence: 40,
    roles: COLOGNE_AGENCY_REQUEST.roles,
    headcountText: "6",
    text: COLOGNE_AGENCY_REQUEST.text,
  });
  assert.equal(low.action, "needs_you");

  const collapsed = decideRequirementCase({
    classification: "job_opportunity",
    confidence: 90,
    roles: [{ title: "Commissioning engineer", count: 6, level: "Basic" }],
    headcountText: "6",
    text: COLOGNE_AGENCY_REQUEST.text,
  });
  assert.equal(collapsed.action, "needs_you");

  const noise = decideRequirementCase({
    classification: "newsletter",
    confidence: 95,
    roles: COLOGNE_AGENCY_REQUEST.roles,
  });
  assert.equal(noise.action, "skip");

  const memory = [];
  for (const decision of [low, collapsed, noise]) {
    const filed = fileRequirementCase(memory, {
      identity: requirementIdentity({
        messageId: `<unsure-${decision.action}@example>`,
        subject: "maybe",
        requesterEmail: "ralph@agency.example",
      }),
      decision,
      missionId: "nope",
    });
    assert.deepEqual(filed.wake, []);
  }
  assert.equal(memory.length, 0);
});

test("two pickups of one step keep the earlier run", () => {
  const owner = earliestOpenRun([
    { id: "run-later", startedAt: "2026-09-29T10:00:02.000Z" },
    { id: "run-earlier", startedAt: "2026-09-29T10:00:01.000Z" },
  ]);
  assert.equal(owner.id, "run-earlier");
  const tie = earliestOpenRun([
    { id: "b", startedAt: "2026-09-29T10:00:01.000Z" },
    { id: "a", startedAt: "2026-09-29T10:00:01.000Z" },
  ]);
  assert.equal(tie.id, "a");
});

test("both mail paths settle a stored message, and the migration is unapplied", () => {
  const ingest = read("src/lib/job-intake/ingest.ts");
  const route = read("src/app/api/job-intake/ingest/route.ts");
  const opener = read("src/lib/data/requirement-case.ts");
  const migration = read("supabase/migrations/052_requirement_roles.sql");
  const pickup = read("src/lib/data/mission-bot.ts");
  const today = read("src/components/modules/today-screen.tsx");

  assert.match(ingest, /settlePeopleRequest/);
  assert.match(route, /settlePeopleRequest/);
  assert.doesNotMatch(ingest, /recordClientReplyEvent/);
  assert.doesNotMatch(route, /recordClientReplyEvent/);
  assert.match(opener, /clientReply: false/);
  assert.match(opener, /event: "mission_step"/);
  assert.match(migration, /create table if not exists public\.requirement_roles/);
  assert.match(migration, /add column if not exists source_key/);
  assert.match(migration, /create unique index if not exists requirement_roles_source_position_key/);
  assert.match(migration, /DO NOT APPLY THIS FROM A CODING AGENT/);
  assert.doesNotMatch(migration, /alter table public\.inbound_emails/i);
  assert.doesNotMatch(migration, /alter table public\.outreach_drafts/i);
  assert.doesNotMatch(migration, /alter table public\.job_leads/i);
  assert.doesNotMatch(
    migration,
    /add column if not exists (in_reply_to|references_header|outbound_thread_id|shared_at|shared_by)/i,
  );
  assert.match(pickup, /earliestOpenRun/);
  assert.doesNotMatch(today, /Ask Hanna|Ask Bob/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`fail  ${name}`);
    console.error(err);
  }
}
if (failed > 0) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log(`${tests.length} passed`);
