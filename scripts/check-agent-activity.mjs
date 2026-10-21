// GET /api/agent/activity — previous-day read for a morning summary.
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

function moduleLoader(mocks = {}) {
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
      if (name in mocks) return mocks[name];
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

function database(tables, failure = null) {
  const queries = [];
  const writes = [];
  const svc = {
    from(table) {
      const state = { table, filters: [], ops: [], limit: null, op: "select" };
      const q = {
        select() {
          state.ops.push(["select", []]);
          return q;
        },
        eq(column, value) {
          state.ops.push(["eq", [column, value]]);
          state.filters.push((row) => row[column] === value);
          return q;
        },
        in(column, values) {
          state.ops.push(["in", [column, values]]);
          state.filters.push((row) => values.includes(row[column]));
          return q;
        },
        gte(column, value) {
          state.ops.push(["gte", [column, value]]);
          state.filters.push((row) => row[column] != null && String(row[column]) >= value);
          return q;
        },
        lt(column, value) {
          state.ops.push(["lt", [column, value]]);
          state.filters.push((row) => row[column] != null && String(row[column]) < value);
          return q;
        },
        is(column, value) {
          state.ops.push(["is", [column, value]]);
          state.filters.push((row) => (value === null ? row[column] == null : row[column] === value));
          return q;
        },
        order() {
          return q;
        },
        limit(count) {
          state.limit = count;
          return q;
        },
        insert() {
          state.op = "insert";
          writes.push(table);
          return q;
        },
        update() {
          state.op = "update";
          writes.push(table);
          return q;
        },
        delete() {
          state.op = "delete";
          writes.push(table);
          return q;
        },
        upsert() {
          state.op = "upsert";
          writes.push(table);
          return q;
        },
        then(resolve, reject) {
          queries.push({ table, op: state.op, ops: state.ops.map((entry) => [entry[0], entry[1]]) });
          if (state.op !== "select") {
            return Promise.resolve({ data: null, error: { message: "refused write" } }).then(resolve, reject);
          }
          if (failure) return Promise.resolve({ data: null, error: { message: failure } }).then(resolve, reject);
          let rows = (tables[table] ?? []).filter((row) => state.filters.every((filter) => filter(row)));
          if (state.limit != null) rows = rows.slice(0, state.limit);
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return { svc, queries, writes };
}

const tests = [];
function test(name, fn) {
  tests.push([name, fn]);
}

const activity = moduleLoader()("src/lib/data/agent-activity.ts");
const SINCE = "2026-10-19T22:00:00.000Z";
const UNTIL = "2026-10-20T22:00:00.000Z";
const window = { since: SINCE, until: UNTIL, timeZone: "Europe/Zagreb" };

test("previous Zagreb day follows local midnight, including winter, year, and clock changes", () => {
  assert.deepEqual(activity.previousZagrebDay(new Date("2026-10-21T06:55:00.000Z")), {
    since: SINCE,
    until: UNTIL,
  });
  assert.deepEqual(activity.previousZagrebDay(new Date("2026-10-20T22:00:00.000Z")), {
    since: SINCE,
    until: UNTIL,
  });
  assert.deepEqual(activity.previousZagrebDay(new Date("2026-10-20T21:59:59.000Z")), {
    since: "2026-10-18T22:00:00.000Z",
    until: "2026-10-19T22:00:00.000Z",
  });
  assert.deepEqual(activity.previousZagrebDay(new Date("2026-01-15T23:30:00.000Z")), {
    since: "2026-01-14T23:00:00.000Z",
    until: "2026-01-15T23:00:00.000Z",
  });
  assert.deepEqual(activity.previousZagrebDay(new Date("2026-01-01T00:30:00.000Z")), {
    since: "2025-12-30T23:00:00.000Z",
    until: "2025-12-31T23:00:00.000Z",
  });
  assert.deepEqual(activity.previousZagrebDay(new Date("2026-10-01T00:30:00.000Z")), {
    since: "2026-09-29T22:00:00.000Z",
    until: "2026-09-30T22:00:00.000Z",
  });
  assert.deepEqual(activity.previousZagrebDay(new Date("2026-03-30T08:00:00.000Z")), {
    since: "2026-03-28T23:00:00.000Z",
    until: "2026-03-29T22:00:00.000Z",
  });
  assert.deepEqual(activity.previousZagrebDay(new Date("2026-10-26T08:00:00.000Z")), {
    since: "2026-10-24T22:00:00.000Z",
    until: "2026-10-25T23:00:00.000Z",
  });
  assert.equal(activity.zagrebCalendarDate(activity.zagrebMidnightUtc("2026-10-20")), "2026-10-20");
  assert.equal(activity.inWindow(SINCE, SINCE, UNTIL), true);
  assert.equal(activity.inWindow(UNTIL, SINCE, UNTIL), false);
  assert.equal(activity.inWindow("2026-10-20T21:59:59.999Z", SINCE, UNTIL), true);
});

test("the window defaults to the previous Zagreb day and rejects a partial or oversized range", () => {
  const now = new Date("2026-10-21T06:55:00.000Z");
  assert.deepEqual(activity.parseActivityWindow(null, null, now), { ok: true, window });
  assert.deepEqual(activity.parseActivityWindow("  ", "", now), { ok: true, window });
  assert.equal(activity.parseActivityWindow(SINCE, null, now).ok, false);
  assert.equal(activity.parseActivityWindow("2026-10-20", UNTIL, now).ok, false);
  assert.equal(activity.parseActivityWindow("yesterday", UNTIL, now).ok, false);
  assert.equal(activity.parseActivityWindow(UNTIL, SINCE, now).ok, false);
  assert.equal(activity.parseActivityWindow(SINCE, SINCE, now).ok, false);
  assert.equal(activity.parseActivityWindow("2026-09-01T00:00:00.000Z", "2026-10-20T00:00:00.000Z", now).ok, false);
  const explicit = activity.parseActivityWindow("2026-10-20T00:00:00+02:00", "2026-10-21T00:00:00+02:00", now);
  assert.deepEqual(explicit, { ok: true, window });
});

test("phone masking keeps only the last four digits, and text is capped", () => {
  assert.equal(activity.maskPhone("+385 91 555 4821"), "••••4821");
  assert.equal(activity.maskPhone("0915554821"), "••••4821");
  assert.equal(activity.maskPhone("12"), "••••");
  assert.equal(activity.maskPhone(""), "••••");
  assert.equal(activity.maskPhone(null), "••••");
  const clipped = activity.clipText(`  ${"a".repeat(250)} \n next `);
  assert.equal(clipped.length, activity.ACTIVITY_TEXT_MAX);
  assert.ok(clipped.endsWith("…"));
  assert.equal(activity.clipText("  two   lines \n here "), "two lines here");
  assert.equal(activity.clipText("   "), null);
  assert.equal(activity.badgeLabel([
    { name: "triangle_hanna_old", status: "revoked" },
    { name: "triangle_hanna_backup", status: "active" },
    { name: "triangle_hanna", status: "active" },
  ]), "triangle_hanna, triangle_hanna_backup");
  assert.equal(activity.badgeLabel([{ name: "triangle_hanna_old", status: "revoked" }]), null);
});

test("shaping groups by employee, caps lists, and hides numbers and CV text", () => {
  const long = "Commissioning engineer. ".repeat(20);
  const body = activity.shapeActivity({
    window,
    truncated: false,
    bots: [
      { id: "hanna", name: "Hanna", role: "hr", badge: "triangle_hanna" },
      { id: "scout", name: "Scout", role: "scout", badge: "triangle_scout" },
    ],
    assignments: [
      {
        id: "asg-done",
        agentInstanceId: "hanna",
        title: "Read the new CVs",
        status: "completed",
        resultSummary: "Three electricians match the Cologne ask.",
        missionId: "mission-old",
        missionTitle: "Cologne commissioning",
        createdAt: "2026-10-20T08:00:00.000Z",
        completedAt: "2026-10-20T14:00:00.000Z",
      },
      {
        id: "asg-open",
        agentInstanceId: "hanna",
        title: "Still open",
        status: "active",
        resultSummary: "This summary was written the next day.",
        missionId: null,
        missionTitle: null,
        createdAt: "2026-10-20T09:00:00.000Z",
        completedAt: "2026-10-21T09:00:00.000Z",
      },
      {
        id: "asg-failed",
        agentInstanceId: "scout",
        title: "Call the buyer",
        status: "failed",
        resultSummary: "No published number.",
        missionId: null,
        missionTitle: null,
        createdAt: "2026-10-18T09:00:00.000Z",
        completedAt: "2026-10-20T10:00:00.000Z",
      },
      {
        id: "asg-edge",
        agentInstanceId: "scout",
        title: "At the next midnight",
        status: "completed",
        resultSummary: "Too late.",
        missionId: null,
        missionTitle: null,
        createdAt: UNTIL,
        completedAt: UNTIL,
      },
    ],
    missions: [
      {
        id: "mission-new",
        leadAgentInstanceId: "hanna",
        title: "Six for Cologne",
        kind: "recruiting",
        objective: "Six commissioning engineers near Cologne.",
        createdAt: "2026-10-20T07:00:00.000Z",
      },
      {
        id: "mission-human",
        leadAgentInstanceId: null,
        title: "Opened without a lead",
        kind: "research",
        objective: "Find the buyer.",
        createdAt: "2026-10-20T12:00:00.000Z",
      },
    ],
    whatsapp: [
      {
        id: "wa-sent",
        agentInstanceId: "hanna",
        toNumber: "+385 91 555 4821",
        status: "delivered",
        body: "Two anonymised bios are ready.",
        direction: "outbound",
        sentAt: "2026-10-20T16:12:00.000Z",
        waTimestamp: "2026-10-20T16:12:00.000Z",
        updatedAt: "2026-10-20T16:13:00.000Z",
      },
      {
        id: "wa-later",
        agentInstanceId: "scout",
        toNumber: "+49 170 1234567",
        status: "read",
        body: "Delivered overnight.",
        direction: "outbound",
        sentAt: "2026-10-19T18:00:00.000Z",
        waTimestamp: "2026-10-19T18:00:00.000Z",
        updatedAt: "2026-10-20T06:00:00.000Z",
      },
      {
        id: "wa-draft",
        agentInstanceId: "hanna",
        toNumber: "+385 91 555 4821",
        status: "draft",
        body: "Not sent.",
        direction: "outbound",
        sentAt: null,
        waTimestamp: "2026-10-20T15:00:00.000Z",
        updatedAt: "2026-10-20T15:00:00.000Z",
      },
      {
        id: "wa-in",
        agentInstanceId: "hanna",
        toNumber: "+385 91 000 1111",
        status: "received",
        body: "Inbound.",
        direction: "inbound",
        sentAt: null,
        waTimestamp: "2026-10-20T15:00:00.000Z",
        updatedAt: "2026-10-20T15:00:00.000Z",
      },
    ],
    reports: [
      {
        id: "report-1",
        agentInstanceId: "hanna",
        employeeName: "Hanna",
        kind: "candidate_found",
        personName: "A. K.",
        companyName: null,
        note: "Commissioning, Desigo CC.",
        createdAt: "2026-10-20T11:00:00.000Z",
      },
    ],
    findings: [
      {
        id: "finding-1",
        agentInstanceId: "hanna",
        findingType: "worker",
        status: "pending",
        evidenceText: "CV names Desigo and PXC.",
        createdAt: "2026-10-20T11:05:00.000Z",
        payload: {
          full_name: "Ana K",
          summary: "Commissioning engineer, Desigo CC",
          email: "ana@example.com",
          phone: "+385911112222",
          cv_text: "SECRET CV TEXT THAT MUST NOT LEAK",
        },
      },
      {
        id: "finding-long",
        agentInstanceId: "scout",
        findingType: "company",
        status: "applied",
        evidenceText: long,
        createdAt: "2026-10-20T18:00:00.000Z",
        payload: { name: "Helios Montage" },
      },
      ...Array.from({ length: 21 }, (_, index) => ({
        id: `finding-extra-${String(index).padStart(2, "0")}`,
        agentInstanceId: "scout",
        findingType: "company",
        status: "pending",
        evidenceText: `Extra ${index}`,
        createdAt: `2026-10-20T12:${String(index).padStart(2, "0")}:00.000Z`,
        payload: { name: `Extra ${index}` },
      })),
    ],
  });

  assert.deepEqual(body.bots.map((bot) => bot.name), ["Hanna", "Scout", "Unattributed"]);
  const hanna = body.bots[0];
  assert.equal(hanna.role, "hr");
  assert.equal(hanna.badge, "triangle_hanna");
  assert.equal(hanna.assignments.length, 2);
  assert.deepEqual(hanna.assignments[0], {
    id: "asg-done",
    title: "Read the new CVs",
    missionTitle: "Cologne commissioning",
    status: "completed",
    events: ["created", "completed"],
    resultSummary: "Three electricians match the Cologne ask.",
    at: "2026-10-20T14:00:00.000Z",
  });
  assert.deepEqual(hanna.assignments[1].events, ["created"]);
  assert.equal(hanna.assignments[1].resultSummary, null);
  assert.equal(hanna.missions[0].title, "Six for Cologne");
  assert.deepEqual(hanna.whatsapp, [
    {
      id: "wa-sent",
      to: "••••4821",
      status: "delivered",
      text: "Two anonymised bios are ready.",
      at: "2026-10-20T16:12:00.000Z",
    },
  ]);
  assert.equal(hanna.reports[0].kind, "candidate_found");
  assert.equal(hanna.findings[0].summary, "Commissioning engineer, Desigo CC — CV names Desigo and PXC.");
  assert.equal(body.bots[1].assignments[0].events[0], "failed");
  assert.equal(body.bots[1].whatsapp[0].to, "••••4567");
  assert.equal(body.bots[1].whatsapp[0].at, "2026-10-20T06:00:00.000Z");
  assert.equal(body.bots[1].findings.length, activity.ACTIVITY_ITEMS_PER_LIST);
  assert.equal(body.bots[1].omitted.findings, 2);
  assert.equal(body.bots[1].findings[0].summary.length, activity.ACTIVITY_TEXT_MAX);
  assert.equal(body.bots[2].missions[0].title, "Opened without a lead");
  const serialised = JSON.stringify(body);
  assert.equal(serialised.includes("+385"), false);
  assert.equal(serialised.includes("555 4821"), false);
  assert.equal(serialised.includes("ana@example.com"), false);
  assert.equal(serialised.includes("SECRET CV"), false);
  assert.equal(serialised.includes("1112222"), false);
  assert.equal(serialised.includes("Not sent"), false);
  assert.equal(serialised.includes("Too late"), false);
});

const ORG = "org-a";
const HANNA = "11111111-1111-4111-8111-111111111111";
const SCOUT = "22222222-2222-4222-8222-222222222222";

function fixtureTables() {
  return {
    agent_assignments: [
      {
        id: "asg-done",
        org_id: ORG,
        agent_instance_id: HANNA,
        title: "Read the new CVs",
        status: "completed",
        result_summary: "Three electricians match the Cologne ask.",
        mission_id: "mission-old",
        created_at: "2026-10-20T08:00:00.000Z",
        completed_at: "2026-10-20T14:00:00.000Z",
      },
      {
        id: "asg-other",
        org_id: "org-b",
        agent_instance_id: HANNA,
        title: "Other org secret",
        status: "completed",
        result_summary: "Do not leak.",
        mission_id: null,
        created_at: "2026-10-20T08:00:00.000Z",
        completed_at: "2026-10-20T14:00:00.000Z",
      },
    ],
    missions: [
      {
        id: "mission-old",
        org_id: ORG,
        title: "Cologne commissioning",
        objective: "Older case.",
        kind: "recruiting",
        lead_agent_instance_id: HANNA,
        created_at: "2026-10-01T08:00:00.000Z",
      },
      {
        id: "mission-new",
        org_id: ORG,
        title: "Six for Cologne",
        objective: "Six commissioning engineers near Cologne.",
        kind: "recruiting",
        lead_agent_instance_id: HANNA,
        created_at: "2026-10-20T07:00:00.000Z",
      },
      {
        id: "mission-other",
        org_id: "org-b",
        title: "Other org mission",
        objective: "Secret.",
        kind: "research",
        lead_agent_instance_id: SCOUT,
        created_at: "2026-10-20T07:00:00.000Z",
      },
    ],
    whatsapp_messages: [
      {
        id: "wa-sent",
        org_id: ORG,
        agent_instance_id: HANNA,
        direction: "outbound",
        to_number: "+385 91 555 4821",
        from_number: "+385910000000",
        body: "Two anonymised bios are ready.",
        status: "delivered",
        sent_at: "2026-10-20T16:12:00.000Z",
        wa_timestamp: "2026-10-20T16:12:00.000Z",
        updated_at: "2026-10-20T16:13:00.000Z",
      },
      {
        id: "wa-draft",
        org_id: ORG,
        agent_instance_id: HANNA,
        direction: "outbound",
        to_number: "+385 91 555 9999",
        body: "Draft only.",
        status: "draft",
        sent_at: null,
        wa_timestamp: "2026-10-20T15:00:00.000Z",
        updated_at: "2026-10-20T15:00:00.000Z",
      },
      {
        id: "wa-failed",
        org_id: ORG,
        agent_instance_id: HANNA,
        direction: "outbound",
        to_number: "+385 91 555 0000",
        body: "Send failed.",
        status: "failed",
        sent_at: "2026-10-20T15:30:00.000Z",
        wa_timestamp: "2026-10-20T15:30:00.000Z",
        updated_at: "2026-10-20T15:30:00.000Z",
      },
    ],
    employee_reports: [
      {
        id: "report-1",
        org_id: ORG,
        agent_instance_id: HANNA,
        employee_name: "Hanna",
        kind: "candidate_found",
        person_name: "A. K.",
        company_name: null,
        note: "Commissioning, Desigo CC.",
        created_at: "2026-10-20T11:00:00.000Z",
      },
    ],
    agent_findings: [
      {
        id: "finding-1",
        org_id: ORG,
        agent_instance_id: HANNA,
        finding_type: "worker",
        status: "pending",
        evidence_text: "CV names Desigo and PXC.",
        payload: {
          full_name: "Ana K",
          summary: "Commissioning engineer, Desigo CC",
          email: "ana@example.com",
          phone: "+385911112222",
          cv_text: "SECRET CV TEXT THAT MUST NOT LEAK",
        },
        created_at: "2026-10-20T11:05:00.000Z",
      },
      {
        id: "finding-scout",
        org_id: ORG,
        agent_instance_id: SCOUT,
        finding_type: "company",
        status: "applied",
        evidence_text: "Published project page.",
        payload: { company_name: "Helios Montage" },
        created_at: "2026-10-20T11:06:00.000Z",
      },
    ],
    agent_instances: [
      { id: HANNA, org_id: ORG, role_key: "hr", display_name: "Hanna" },
      { id: SCOUT, org_id: ORG, role_key: "scout", display_name: "Scout" },
    ],
    machine_credentials: [
      { org_id: ORG, name: "triangle_hanna_old", status: "revoked", agent_instance_id: HANNA },
      { org_id: ORG, name: "triangle_hanna", status: "active", agent_instance_id: HANNA },
      { org_id: ORG, name: "triangle_scout", status: "active", agent_instance_id: SCOUT },
      { org_id: "org-b", name: "other_org_badge", status: "active", agent_instance_id: HANNA },
    ],
  };
}

test("the read is org-scoped, selects only, and returns Hanna's group", async () => {
  const db = database(fixtureTables());
  const { loadAgentActivity } = moduleLoader({
    "@/lib/supabase/server": { createServiceSupabaseClient: () => db.svc },
  })("src/lib/data/agent-activity-read.ts");
  const result = await loadAgentActivity(ORG, window);
  assert.equal(result.ok, true);
  assert.equal(db.writes.length, 0);
  assert.ok(db.queries.length > 0);
  for (const query of db.queries) {
    assert.equal(query.op, "select", query.table);
    assert.ok(
      query.ops.some(([op, args]) => op === "eq" && args[0] === "org_id" && args[1] === ORG),
      query.table,
    );
  }
  assert.deepEqual(result.body.bots.map((bot) => bot.name), ["Hanna", "Scout"]);
  const hanna = result.body.bots[0];
  assert.equal(hanna.role, "hr");
  assert.equal(hanna.badge, "triangle_hanna");
  assert.equal(hanna.assignments[0].missionTitle, "Cologne commissioning");
  assert.deepEqual(hanna.assignments[0].events, ["created", "completed"]);
  assert.equal(hanna.whatsapp[0].to, "••••4821");
  assert.equal(hanna.findings[0].summary.includes("Desigo"), true);
  const serialised = JSON.stringify(result.body);
  assert.equal(serialised.includes("Other org"), false);
  assert.equal(serialised.includes("other_org_badge"), false);
  assert.equal(serialised.includes("triangle_hanna_old"), false);
  assert.equal(serialised.includes("555 4821"), false);
  assert.equal(serialised.includes("+385910000000"), false);
  assert.equal(serialised.includes("Draft only"), false);
  assert.equal(serialised.includes("Send failed"), false);
  assert.equal(serialised.includes("ana@example.com"), false);
  assert.equal(serialised.includes("SECRET CV"), false);
  assert.equal(result.body.truncated, false);
});

test("a full fetch cap is reported, and a database failure does not write", async () => {
  const tables = fixtureTables();
  tables.agent_findings = Array.from({ length: 201 }, (_, index) => ({
    id: `finding-${index}`,
    org_id: ORG,
    agent_instance_id: SCOUT,
    finding_type: "company",
    status: "pending",
    evidence_text: `Row ${index}`,
    payload: { name: `Row ${index}` },
    created_at: "2026-10-20T11:00:00.000Z",
  }));
  const db = database(tables);
  const { loadAgentActivity } = moduleLoader({
    "@/lib/supabase/server": { createServiceSupabaseClient: () => db.svc },
  })("src/lib/data/agent-activity-read.ts");
  const capped = await loadAgentActivity(ORG, window);
  assert.equal(capped.ok, true);
  assert.equal(capped.body.truncated, true);
  const scout = capped.body.bots.find((bot) => bot.name === "Scout");
  assert.equal(scout.findings.length, activity.ACTIVITY_ITEMS_PER_LIST);

  const broken = database(fixtureTables(), "relation does not exist");
  const failing = moduleLoader({
    "@/lib/supabase/server": { createServiceSupabaseClient: () => broken.svc },
  })("src/lib/data/agent-activity-read.ts");
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(" "));
  try {
    const refused = await failing.loadAgentActivity(ORG, window);
    assert.equal(refused.ok, false);
    assert.equal(refused.status, 500);
    assert.equal(refused.error, "Could not read activity.");
    assert.equal(broken.writes.length, 0);
    assert.ok(logged.some((line) => line.includes("relation does not exist")));
  } finally {
    console.error = original;
  }

  const offline = moduleLoader({
    "@/lib/supabase/server": { createServiceSupabaseClient: () => null },
  })("src/lib/data/agent-activity-read.ts");
  const down = await offline.loadAgentActivity(ORG, window);
  assert.deepEqual(down, { ok: false, status: 503, error: "Database unavailable." });
});

test("the route accepts any active badge, defaults the window, and never writes", async () => {
  const routeSrc = read("src/app/api/agent/activity/route.ts");
  const readSrc = read("src/lib/data/agent-activity-read.ts");
  assert.doesNotMatch(routeSrc, /export async function POST/);
  assert.doesNotMatch(routeSrc, /\.(insert|update|delete|upsert)\s*\(/);
  assert.doesNotMatch(readSrc, /\.(insert|update|delete|upsert)\s*\(/);
  assert.match(routeSrc, /verifyMachineToken/);
  assert.doesNotMatch(routeSrc, /hasScope|badgeMayReport|status:\s*403/);

  let calls = [];
  function apiFor(machine, loadAgentActivity) {
    calls = [];
    return moduleLoader({
      "@/lib/auth/machine": { verifyMachineToken: async () => machine },
      "@/lib/data/agent-activity-read": {
        loadAgentActivity: async (orgId, requested) => {
          calls.push({ orgId, requested });
          return loadAgentActivity(orgId, requested);
        },
      },
    })("src/app/api/agent/activity/route.ts");
  }

  const missing = apiFor(null, async () => {
    throw new Error("must not read");
  });
  const denied = await missing.GET(new Request("http://localhost/api/agent/activity"));
  assert.equal(denied.status, 401);
  assert.match((await denied.json()).error, /tri_mc_/);
  assert.equal(calls.length, 0);
  assert.equal(missing.POST, undefined);

  const hanna = {
    orgId: ORG,
    credentialId: "cred-1",
    name: "triangle_hanna",
    scopes: ["worker.propose"],
    agentInstanceId: HANNA,
  };
  const bad = apiFor(hanna, async () => {
    throw new Error("must not read");
  });
  const rejected = await bad.GET(new Request("http://localhost/api/agent/activity?since=yesterday"));
  assert.equal(rejected.status, 400);
  assert.equal(calls.length, 0);

  const body = {
    window,
    caps: { itemsPerList: 20, text: 180 },
    truncated: false,
    bots: [],
    note: "Activity for this organisation.",
  };
  const ok = apiFor(hanna, async () => ({ ok: true, body }));
  const response = await ok.GET(
    new Request(`http://localhost/api/agent/activity?orgId=org-b&since=${SINCE}&until=${UNTIL}`, {
      headers: { authorization: "Bearer tri_mc_example" },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const json = await response.json();
  assert.deepEqual(json.reader, { badge: "triangle_hanna", agentInstanceId: HANNA });
  assert.deepEqual(calls, [{ orgId: ORG, requested: window }]);
  assert.equal(JSON.stringify(json).includes("org-b"), false);

  const unlinked = apiFor(
    { ...hanna, name: "triangle_bob", scopes: [], agentInstanceId: null },
    async () => ({ ok: true, body }),
  );
  const open = await unlinked.GET(new Request("http://localhost/api/agent/activity"));
  assert.equal(open.status, 200);
  assert.equal(calls[0].orgId, ORG);
  assert.equal(calls[0].requested.timeZone, "Europe/Zagreb");
  assert.ok(calls[0].requested.since < calls[0].requested.until);

  const down = apiFor(hanna, async () => ({ ok: false, status: 503, error: "Database unavailable." }));
  assert.equal((await down.GET(new Request("http://localhost/api/agent/activity"))).status, 503);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL ${name}\n  ${err.stack ?? err.message}`);
  }
}
console.log(`${tests.length - failed}/${tests.length} ok`);
if (failed) process.exit(1);
