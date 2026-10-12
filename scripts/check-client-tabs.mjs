// Pinned client tabs (exception approved 2026-10-12).
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

const p = moduleLoader()("src/lib/data/client-tab-policy.ts");

const tab = (name, extra = {}) => ({
  id: `t-${name}`,
  companyId: null,
  companyName: name,
  pinnedAt: "2026-10-01T08:00:00Z",
  lastActivityAt: null,
  ...extra,
});

test("Ask: 'open a tab for X' names the client; other questions do not", () => {
  assert.equal(p.parseOpenTabIntent("open a tab for Fakeco Anlagenbau"), "Fakeco Anlagenbau");
  assert.equal(p.parseOpenTabIntent("Please pin a tab for 'Testwerk GmbH'."), "Testwerk GmbH");
  assert.equal(p.parseOpenTabIntent("open client tab on Demo AG"), "Demo AG");
  assert.equal(p.parseOpenTabIntent("find EPC contractors in Germany"), null);
  assert.equal(p.parseOpenTabIntent("who is available next week"), null);
});

test("at most five open tabs; pinning the same client again reopens it", () => {
  const five = ["A1 Co", "B2 Co", "C3 Co", "D4 Co", "E5 Co"].map((n) => tab(n));
  assert.equal(p.MAX_OPEN_TABS, 5);
  const refused = p.planPin(five, "Fakeco GmbH");
  assert.equal(refused.ok, false);
  assert.match(refused.error, /close one/i);
  const again = p.planPin(five, "  b2 co ");
  assert.equal(again.ok, true);
  assert.equal(again.alreadyOpen.companyName, "B2 Co");
  assert.deepEqual(p.planPin([], "Fakeco GmbH"), { ok: true, alreadyOpen: null });
});

test("a tab with nothing new for 30 days reads as gone quiet", () => {
  const now = new Date("2026-11-15T00:00:00Z");
  assert.equal(p.tabIsQuiet(tab("X", { lastActivityAt: "2026-10-01T00:00:00Z" }), now), true);
  assert.equal(p.tabIsQuiet(tab("X", { lastActivityAt: "2026-11-01T00:00:00Z" }), now), false);
});

test("a bot line: who said it, when, and where — or it is refused", () => {
  const ok = p.planClientTabLine({
    company: "Fakeco GmbH",
    kind: "need",
    topic: "headcount",
    text: "6 electricians",
    saidBy: "their project lead",
    saidOn: "2026-10-12",
    sourceKind: "voice_note",
    sourceRef: "wamid.FAKE1",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.planned.topic, "headcount");
  assert.equal(p.planClientTabLine({ company: "Fakeco", kind: "need", text: "x", saidOn: "2026-10-12", sourceKind: "email" }).ok, false);
  assert.equal(p.planClientTabLine({ company: "Fakeco", kind: "agreed", text: "rate 48", sourceKind: "email" }).ok, false);
  assert.equal(p.planClientTabLine({ company: "Fakeco", kind: "next_step", text: "call back" }).ok, false);
  assert.equal(p.planClientTabLine({ kind: "open", text: "x" }).ok, false);
  const again = p.planClientTabLine({
    company: "Fakeco GmbH", kind: "need", topic: "headcount", text: "6 electricians",
    saidBy: "their project lead", saidOn: "2026-10-12", sourceKind: "voice_note", sourceRef: "wamid.FAKE1",
  });
  assert.equal(again.planned.idempotencyKey, ok.planned.idempotencyKey);
});

test("no scores, no status ladder: such fields are refused", () => {
  const base = { company: "Fakeco", kind: "firm", firmName: "Probna d.o.o.", text: "posts crews", sourceRef: "https://example.test" };
  assert.equal(p.planClientTabLine({ ...base, score: 0.8 }).ok, false);
  assert.equal(p.planClientTabLine({ ...base, status: "checked" }).ok, false);
  const firm = p.planClientTabLine(base);
  assert.equal(firm.ok, true);
  assert.equal(firm.planned.postingOk, "unknown");
  assert.equal(p.planClientTabLine({ ...base, sourceRef: undefined }).ok, false);
  assert.equal(p.planClientTabLine({ ...base, postingOk: "maybe" }).ok, false);
});

function line(partial) {
  return {
    topic: null, saidBy: null, saidOn: null, dueOn: null, sourceKind: null, sourceRef: null,
    firmName: null, postingOk: null, firmAnswered: null, replacesId: null, employeeName: "Hanna",
    ...partial,
  };
}

test("the page: next step, needs with 'not known yet', agreed, timeline newest first, firms", () => {
  const lines = [
    line({ id: "1", kind: "need", topic: "trade", text: "LV electricians", saidBy: "client", saidOn: "2026-10-05", sourceKind: "email", sourceRef: "https://mail.example.test/1", createdAt: "2026-10-05T10:00:00Z" }),
    line({ id: "2", kind: "need", topic: "headcount", text: "4 people", saidOn: "2026-10-05", sourceKind: "email", createdAt: "2026-10-05T10:01:00Z" }),
    line({ id: "3", kind: "need", topic: "headcount", text: "6 people", saidOn: "2026-10-12", sourceKind: "voice_note", replacesId: "2", createdAt: "2026-10-12T09:00:00Z" }),
    line({ id: "4", kind: "next_step", text: "Send two CVs", dueOn: "2026-10-15", createdAt: "2026-10-12T09:01:00Z" }),
    line({ id: "5", kind: "agreed", text: "Start 2 Nov", saidOn: "2026-10-12", sourceKind: "voice_note", createdAt: "2026-10-12T09:02:00Z" }),
    line({ id: "6", kind: "timeline", text: "Call: wants 6, not 4", saidOn: "2026-10-12", sourceKind: "voice_note", createdAt: "2026-10-12T09:03:00Z" }),
    line({ id: "7", kind: "timeline", text: "Enquiry email", saidOn: "2026-10-05", sourceKind: "email", createdAt: "2026-10-05T10:02:00Z" }),
    line({ id: "8", kind: "open", text: "Accommodation unclear", createdAt: "2026-10-12T09:04:00Z" }),
    line({ id: "9", kind: "firm", firmName: "Probna Elektro d.o.o.", text: "older note", postingOk: "unknown", sourceKind: "web", sourceRef: "https://example.test/a", createdAt: "2026-10-06T00:00:00Z" }),
    line({ id: "10", kind: "firm", firmName: "Probna Elektro d.o.o.", text: "answered, has A1", postingOk: "yes", firmAnswered: true, sourceKind: "web", sourceRef: "https://example.test/a", createdAt: "2026-10-11T00:00:00Z" }),
  ];
  const view = p.composeClientTab({
    lines,
    reports: [{ id: "r1", occurredOn: "2026-10-08", employeeName: "Scout", sentence: "Email sent.", evidenceUrl: null }],
  });
  assert.equal(view.nextStep.dueOn, "2026-10-15");
  assert.deepEqual(view.open.map((l) => l.text), ["Accommodation unclear"]);
  const needs = Object.fromEntries(view.needs.map((n) => [n.topic, n]));
  assert.deepEqual(needs.headcount.lines.map((l) => l.text), ["6 people"]);
  assert.equal(needs.site.notKnownYet, true);
  assert.equal(needs.trade.lines[0].sourceHref, "https://mail.example.test/1");
  assert.equal(needs.trade.lines[0].who, "client");
  assert.deepEqual(view.agreed.map((l) => l.text), ["Start 2 Nov"]);
  assert.deepEqual(view.timeline.map((l) => l.when), ["2026-10-12", "2026-10-08", "2026-10-05"]);
  assert.equal(view.firms.length, 1);
  assert.equal(view.firms[0].posting, "yes");
  assert.equal(view.firms[0].answered, true);
});

test("no company name is hard-coded in app code; shell nav is unchanged", () => {
  for (const file of [
    "src/lib/data/client-tab-policy.ts",
    "src/lib/data/client-tabs.ts",
    "src/app/api/agent/client-tabs/route.ts",
    "src/app/(app)/client-tabs/[companyId]/page.tsx",
    "src/components/layout/client-tab-strip.tsx",
  ]) {
    assert.doesNotMatch(read(file), /\bEPG\b|Linz/i, file);
  }
  const sidebar = read("src/components/layout/sidebar.tsx");
  assert.doesNotMatch(sidebar, /client-tabs|Companies"/);
  assert.match(read("src/app/(app)/layout.tsx"), /<ClientTabStrip/);
});

test("migration 056 is additive, idempotent and unapplied; docs carry the shapes", () => {
  const sql = read("supabase/migrations/056_client_tabs.sql");
  assert.match(sql, /DO NOT APPLY THIS FROM A CODING AGENT/);
  assert.match(sql, /create table if not exists public\.client_tabs/);
  assert.match(sql, /create table if not exists public\.client_tab_lines/);
  assert.doesNotMatch(sql, /\bdrop table\b|\balter table public\.(companies|employee_reports|whatsapp_messages)\b/i);
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ""), /score|status|stage/i, "no score or status column");
  for (const doc of ["agents/hanna.md", "agents/scout.md"]) {
    const text = read(doc);
    assert.match(text, /POST \/api\/agent\/client-tabs/, doc);
    assert.match(text, /"kind": "need \| agreed \| open \| next_step \| timeline \| firm"/, doc);
  }
  assert.match(read("agents/scout.md"), /A1 \+ Austrian ZKO\/registration/);
  const decision = read("DECISIONS.md").split("### 2026-10-12")[1]?.split("\n### ")[0] ?? "";
  assert.match(decision, /no new pages until the case page holds/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL ${name}\n  ${err.message}`);
  }
}
console.log(`${tests.length - failed}/${tests.length} ok`);
if (failed) process.exit(1);
