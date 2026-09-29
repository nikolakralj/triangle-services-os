// P3 — employees report work done outside Triangle.
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

const policy = moduleLoader()("src/lib/data/employee-report-policy.ts");
const {
  HANNA_29_SEP_WORK,
  accessNeededLine,
  accessNeededLines,
  availabilityReading,
  badgeMayReport,
  caseReplyAttachment,
  hanna29SeptemberPlans,
  planEmployeeReport,
} = policy;

function view(partial) {
  return {
    id: partial.id,
    kind: partial.kind,
    source: partial.source ?? "employee",
    employeeName: partial.employeeName ?? "Hanna",
    personId: partial.personId ?? null,
    personName: partial.personName ?? null,
    companyId: partial.companyId ?? null,
    companyName: partial.companyName ?? null,
    missionId: partial.missionId ?? null,
    roleTitle: partial.roleTitle ?? null,
    evidenceUrl: partial.evidenceUrl ?? null,
    note: partial.note ?? null,
    unavailableUntil: partial.unavailableUntil ?? null,
    accessWhat: partial.accessWhat ?? null,
    occurredOn: partial.occurredOn,
    followUpOn: partial.followUpOn ?? null,
    createdAt: partial.createdAt ?? `${partial.occurredOn}T08:00:00.000Z`,
  };
}

test("Hanna's 29 September work files on the two people and the two firms", () => {
  const plans = hanna29SeptemberPlans();
  assert.equal(plans.length, 4);
  assert.deepEqual(
    plans.map((plan) => plan.personName ?? plan.companyName),
    ["Dario Martić", "Ratko Vukonić", "INITECH", "Suport Total"],
  );
  assert.deepEqual(
    plans.map((plan) => plan.kind),
    ["linkedin_invitation", "linkedin_invitation", "email_sent", "email_sent"],
  );
  for (const plan of plans) {
    assert.equal(plan.employeeName, "Hanna");
    assert.equal(plan.occurredOn, "2026-09-29");
    assert.equal(plan.followUpOn, "2026-10-03");
  }
  assert.match(plans[0].sentence, /LinkedIn invitation sent/);
  assert.match(plans[0].sentence, /Follow up 3 Oct 2026/);
  assert.equal(plans[0].personName, "Dario Martić");
  assert.equal(plans[2].companyName, "INITECH");
  assert.equal(HANNA_29_SEP_WORK.length, 4);
});

test("the same report files once", () => {
  const first = planEmployeeReport({
    employeeName: "Hanna",
    agentInstanceId: "hanna",
    body: { kind: "linkedin_invitation", person: "Dario Martić", occurredOn: "2026-09-29" },
  });
  const second = planEmployeeReport({
    employeeName: "Hanna",
    agentInstanceId: "hanna",
    body: { kind: "linkedin_invitation", person: "Dario Martić", occurredOn: "2026-09-29" },
  });
  assert.equal(first.ok && second.ok && first.planned.idempotencyKey === second.planned.idempotencyKey, true);
});

test("a candidate needs the evidence link and the person", () => {
  const missing = planEmployeeReport({
    employeeName: "Hanna",
    agentInstanceId: "hanna",
    body: { kind: "candidate_found", person: "Dario Martić" },
  });
  assert.equal(missing.ok, false);
  const filed = planEmployeeReport({
    employeeName: "Hanna",
    agentInstanceId: "hanna",
    body: {
      kind: "candidate_found",
      person: "Dario Martić",
      role: "Commissioning engineer",
      evidenceUrl: "https://example.com/profile",
      occurredOn: "2026-09-29",
    },
  });
  assert.equal(filed.ok, true);
  assert.equal(filed.planned.evidenceUrl, "https://example.com/profile");
  assert.match(filed.planned.sentence, /Candidate found for Commissioning engineer/);
});

test("not available needs a date, and access needed needs what", () => {
  assert.equal(
    planEmployeeReport({
      employeeName: "Hanna",
      agentInstanceId: "hanna",
      body: { kind: "not_available", person: "Dario Martić" },
    }).ok,
    false,
  );
  const unavailable = planEmployeeReport({
    employeeName: "Hanna",
    agentInstanceId: "hanna",
    body: { kind: "not_available", person: "Dario Martić", until: "2026-03-01", occurredOn: "2026-01-15" },
  });
  assert.equal(unavailable.ok, true);
  assert.equal(unavailable.planned.followUpOn, "2026-03-01");
  assert.equal(
    planEmployeeReport({
      employeeName: "Hanna",
      agentInstanceId: "hanna",
      body: { kind: "access_needed" },
    }).ok,
    false,
  );
});

test("last reported unavailable never becomes unknown", () => {
  const reports = [{ kind: "not_available", occurredOn: "2026-01-15" }];
  const later = availabilityReading({
    status: "unknown",
    reports,
    asOf: "2026-09-29",
  });
  assert.equal(later.phrase, "Last reported unavailable, on 15 Jan 2026");
  assert.equal(later.tone, "unavailable");
  assert.doesNotMatch(later.phrase, /unknown/i);

  const muchLater = availabilityReading({
    status: "unknown",
    reports,
    asOf: "2027-06-01",
  });
  assert.equal(muchLater.phrase, later.phrase);

  const replaced = availabilityReading({
    status: "available",
    confirmedOn: "2026-02-01",
    reports,
    asOf: "2026-09-29",
  });
  assert.equal(replaced.phrase, "Available now");

  const sameDay = availabilityReading({
    status: "available",
    confirmedOn: "2026-01-15",
    reports,
  });
  assert.equal(sameDay.tone, "unavailable");

  const neverReported = availabilityReading({ status: "unknown", reports: [] });
  assert.equal(neverReported.phrase, "Availability unknown");
});

test("Hanna needs your LinkedIn login is one line", () => {
  assert.equal(accessNeededLine("Hanna", "your LinkedIn login"), "Hanna needs your LinkedIn login");
  const reports = [
    view({
      id: "a",
      kind: "access_needed",
      accessWhat: "your LinkedIn login",
      missionId: "case-1",
      occurredOn: "2026-09-29",
      createdAt: "2026-09-29T09:00:00.000Z",
    }),
    view({
      id: "b",
      kind: "access_needed",
      accessWhat: "your LinkedIn login",
      missionId: "case-1",
      occurredOn: "2026-09-29",
      createdAt: "2026-09-29T09:05:00.000Z",
    }),
  ];
  const lines = accessNeededLines(reports);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].line, "Hanna needs your LinkedIn login");
  assert.equal(lines[0].missionId, "case-1");
});

test("the same step resumes and the access line leaves", () => {
  const access = view({
    id: "a",
    kind: "access_needed",
    accessWhat: "your LinkedIn login",
    missionId: "case-1",
    occurredOn: "2026-09-29",
    createdAt: "2026-09-29T09:00:00.000Z",
  });
  const continued = view({
    id: "c",
    kind: "linkedin_invitation",
    personName: "Dario Martić",
    missionId: "case-1",
    occurredOn: "2026-09-29",
    createdAt: "2026-09-29T11:00:00.000Z",
  });
  assert.equal(accessNeededLines([access, continued]).length, 0);

  const otherEmployee = view({
    ...continued,
    id: "d",
    employeeName: "Bob",
  });
  assert.equal(accessNeededLines([access, otherEmployee]).length, 1);

  const mailbox = view({
    ...continued,
    id: "e",
    source: "mailbox",
    employeeName: "Mailbox",
    kind: "reply_received",
  });
  assert.equal(accessNeededLines([access, mailbox]).length, 1);
});

test("a mailbox reply lands on the case's thread and the opening message does not", () => {
  const opening = caseReplyAttachment({
    messageId: "open-1",
    threadId: "thread-ralph",
    caseMessageKey: "message:open-1",
    caseThreadKey: "thread:thread-ralph",
  });
  assert.equal(opening.attach, false);
  assert.equal(opening.reason, "opening message");

  const reply = caseReplyAttachment({
    messageId: "reply-9",
    threadId: "thread-ralph",
    caseMessageKey: "message:open-1",
    caseThreadKey: "thread:thread-ralph",
  });
  assert.equal(reply.attach, true);
  assert.equal(reply.reason, "thread");

  const other = caseReplyAttachment({
    messageId: "other-2",
    threadId: "somewhere-else",
    caseMessageKey: "message:open-1",
    caseThreadKey: "thread:thread-ralph",
  });
  assert.equal(other.attach, false);

  const header = caseReplyAttachment({
    messageId: "reply-9",
    threadId: null,
    inReplyTo: "<open-1>",
    caseMessageKey: "message:open-1",
    caseThreadKey: "thread:thread-ralph",
  });
  assert.equal(header.attach, true);
  assert.equal(header.reason, "in-reply-to");
});

test("Hanna, Bob and Scout can report; a mail-only badge cannot", () => {
  assert.equal(badgeMayReport(["worker.propose"]), true);
  assert.equal(badgeMayReport(["mission.work"]), true);
  assert.equal(badgeMayReport(["research.suggestion.create"]), true);
  assert.equal(badgeMayReport(["job_intake.ingest"]), false);
  assert.equal(badgeMayReport([]), false);
});

test("the endpoint is badge-only and does not finish the step", () => {
  const route = read("src/app/api/agent/reports/route.ts");
  assert.match(route, /verifyMachineToken/);
  assert.match(route, /badgeMayReport/);
  assert.doesNotMatch(route, /requireApiAccess/);
  assert.doesNotMatch(route, /\/complete/);
  assert.match(read("src/proxy.ts"), /pathname\.startsWith\("\/api\/"\)/);
});

test("Today shows one access line and the record shows the report", () => {
  const today = read("src/components/modules/today-screen.tsx");
  const line = read("src/components/modules/reported-work.tsx");
  assert.match(today, /accessNeeded\.length/);
  assert.match(today, /AccessNeededLines/);
  assert.match(line, /break-words/);
  assert.match(line, /\{item\.line\}/);
  assert.doesNotMatch(line, /Ask Hanna|Ask Bob|Send/);
  assert.match(read("src/components/modules/worker-profile.tsx"), /availabilityReading/);
  assert.match(read("src/components/modules/worker-profile.tsx"), /ReportedWork/);
  assert.match(read("src/app/(app)/workers/[id]/page.tsx"), /listReportsForPerson/);
  assert.match(read("src/app/(app)/companies/[id]/page.tsx"), /listReportsForCompany/);
  assert.match(read("src/app/(app)/missions/[id]/page.tsx"), /listReportsForCase/);
});

test("mail ingest attaches a reply after the case can exist", () => {
  const ingest = read("src/lib/job-intake/ingest.ts");
  const bot = read("src/app/api/job-intake/ingest/route.ts");
  assert.match(ingest, /attachMailboxReply/);
  assert.match(bot, /attachMailboxReply/);
  assert.match(read("src/lib/data/employee-reports.ts"), /client_reply/);
  assert.match(read("src/lib/data/employee-reports.ts"), /Migration 053 has not been applied/);
});

test("the protocol and the three role files tell them to report", () => {
  const protocol = read("agents/missions.md");
  assert.match(protocol, /POST \{TRIANGLE_URL\}\/api\/agent\/reports/);
  assert.match(protocol, /linkedin_invitation/);
  assert.match(protocol, /access_needed/);
  assert.match(protocol, /your LinkedIn login/);
  assert.match(protocol, /does not finish the step/);
  for (const file of ["agents/hanna.md", "agents/bob.md", "agents/scout.md", "agents/shared-constitution.md"]) {
    assert.match(read(file), /api\/agent\/reports|reported to Triangle/);
  }
  assert.match(read("agents/hanna.md"), /Dario Martić/);
  assert.match(read("agents/hanna.md"), /Suport Total/);
});

test("migration 053 is idempotent, unapplied, and reloads the schema", () => {
  const sql = read("supabase/migrations/053_employee_reports.sql");
  assert.match(sql, /create table if not exists public\.employee_reports/i);
  assert.match(sql, /add column if not exists/i);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
  assert.match(sql, /DO NOT APPLY THIS FROM A CODING AGENT/);
  assert.doesNotMatch(sql, /drop table/i);
  assert.equal(fs.existsSync(path.resolve(root, "supabase/migrations/050_mailbox_observe.sql")), false);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok ${name}`);
    console.error(err);
  }
}
if (failed > 0) {
  console.error(`${failed} failed, ${tests.length - failed} passed`);
  process.exit(1);
}
console.log(`${tests.length} passed`);
