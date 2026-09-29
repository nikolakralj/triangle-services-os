// P4 — the case page. One multi-role case, drawn from the workspace blocks.
// Isolated fixture. No env, no database, no message sent, no SQL applied.
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
        jsx: ts.JsxEmit.ReactJSX,
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
const { assignProposals, buildCasePage, matchProposalRole } = load("src/lib/data/case-page.ts");
const { renderToStaticMarkup } = require("react-dom/server");
const { createElement } = require("react");
const { CasePageScreen } = load("src/components/modules/case-page.tsx");
const { CaseDrafts } = load("src/components/modules/case-drafts.tsx");

const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

function cologneRoles() {
  return [
    {
      title: "Commissioning engineer",
      headcount: 3,
      level: "Basic",
      skills: ["Desigo CC", "PXC", "ABT"],
      startText: "November 2026",
      durationText: null,
      location: "near Cologne",
      languages: ["English", "German desirable"],
      rateText: null,
    },
    {
      title: "Commissioning engineer",
      headcount: 2,
      level: "Advanced",
      skills: ["Desigo CC", "PXC"],
      startText: "November 2026",
      durationText: null,
      location: "near Cologne",
      languages: ["English"],
      rateText: null,
    },
    {
      title: "Commissioning engineer",
      headcount: 1,
      level: "Expert",
      skills: ["Desigo CC"],
      startText: "December 2026",
      durationText: null,
      location: "near Cologne",
      languages: ["English"],
      rateText: null,
    },
  ];
}

const REPLY = [
  "Hello,",
  "",
  "Thank you for the request for six commissioning engineers near Cologne.",
  "We are confirming who we can put forward. What rate should we work to?",
].join("\n");

test("a level names one row, and a bare title does not fill every row", () => {
  const roles = cologneRoles();
  assert.equal(matchProposalRole(roles, "Commissioning engineer, Basic"), 0);
  assert.equal(matchProposalRole(roles, "Basic"), 0);
  assert.equal(matchProposalRole(roles, "Expert"), 2);
  assert.equal(matchProposalRole(roles, "Commissioning engineer"), null);
  const names = assignProposals(roles, [
    { name: "M. P.", roleTitle: "Commissioning engineer, Basic" },
    { name: "I. K.", roleTitle: "Basic" },
    { name: "A. N.", roleTitle: "Expert" },
    { name: "Unplaced", roleTitle: "Commissioning engineer" },
  ]);
  assert.deepEqual(names[0], ["M. P.", "I. K."]);
  assert.deepEqual(names[1], []);
  assert.deepEqual(names[2], ["A. N."]);
});

test("Cologne renders as one case: three roles, a draft, the email, activity folded", () => {
  const roles = cologneRoles();
  const names = assignProposals(roles, [
    { name: "M. P.", roleTitle: "Basic" },
    { name: "I. K.", roleTitle: "Commissioning engineer, Basic" },
    { name: "A. N.", roleTitle: "Expert" },
  ]);
  const built = buildCasePage({
    clientName: "Ralph",
    city: "Cologne",
    sector: "data centre",
    email: {
      subject: "Fwd: Commissioning engineers — data centre near Cologne",
      body: "Need 6 commissioning engineers for a data centre near Cologne.\n3 Basic, 2 Advanced, 1 Expert.",
      when: "29 Sep 2026",
    },
    roles: roles.map((role, index) => ({ ...role, proposed: names[index] })),
    openQuestions: ["rate"],
    drafts: [
      {
        subject: "Re: Commissioning engineers near Cologne",
        body: REPLY,
        original: REPLY,
      },
    ],
    activity: [
      {
        when: "29 Sep 2026",
        who: "Hanna",
        sentence: "LinkedIn invitation sent. Follow up 3 Oct 2026.",
      },
    ],
  });
  assert.equal(built.ok, true, built.ok ? "" : built.errors.join("\n"));
  const model = built.model;
  assert.equal(model.workspace.blocks.length <= 5, true);
  const table = model.workspace.blocks.find((block) => block.kind === "table");
  assert.ok(table);
  assert.deepEqual(
    table.columns.map((column) => column.label),
    ["Role", "Needed", "Proposed", "Missing"],
  );
  assert.equal(table.rows.length, 3);
  assert.equal(table.rows[0].cells.needed.number, 3);
  assert.equal(table.rows[0].cells.missing.number, 1);
  assert.equal(table.rows[1].cells.needed.number, 2);
  assert.equal(table.rows[1].cells.proposed.basis, "unknown");
  assert.equal(table.rows[1].cells.missing.number, 2);
  assert.equal(table.rows[2].cells.needed.number, 1);
  assert.equal(table.rows[2].cells.missing.number, 0);
  assert.match(table.rows[0].cells.role.text, /Basic/);
  assert.match(table.rows[0].cells.role.text, /Desigo CC/);

  const html = renderToStaticMarkup(createElement(CasePageScreen, { model }));
  const plain = text(html);
  assert.match(plain, /Asked by Ralph/);
  assert.match(plain, /Cologne data centre/);
  assert.match(plain, /6 people/);
  assert.match(plain, /3 Basic, 2 Advanced, 1 Expert/);
  assert.match(plain, /Source email/);
  assert.match(plain, /Needed/);
  assert.match(plain, /Proposed/);
  assert.match(plain, /Missing/);
  assert.match(plain, /not established/);
  assert.match(plain, /The rate/);
  assert.match(plain, /The reply is drafted/);
  assert.match(plain, /Thank you for the request for six commissioning engineers/);
  assert.match(html, /id="source-email"/);
  assert.match(html, /<details[^>]*>\s*<summary[^>]*>\s*Activity/);
  assert.match(plain, /LinkedIn invitation sent/);
  assert.doesNotMatch(plain, /Autonomy/);
  assert.doesNotMatch(plain, /People named/);
  assert.doesNotMatch(plain, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.equal(table.columns.length <= 6, true);

  const send = renderToStaticMarkup(
    createElement(CaseDrafts, {
      letters: model.drafts,
      to: "client@example.com",
      who: "Ralph",
      sender: { id: "mailbox", emailAddress: "ops@example.com" },
      senders: [{ id: "mailbox", emailAddress: "ops@example.com" }],
      replyFrom: "mailbox",
    }),
  );
  assert.match(text(send), /\bSend\b/);
  assert.match(text(send), /or open in your mail/);
  assert.match(text(send), /Thank you for the request for six commissioning engineers/);
  assert.doesNotMatch(text(send), /Ask Bob|Ask Hanna/);
});

test("Today's line opens the case, and the mission page draws it", () => {
  const today = read("src/components/modules/today-screen.tsx");
  const page = read("src/app/(app)/missions/[id]/page.tsx");
  const mission = read("src/components/missions/mission-view.tsx");
  const drafts = read("src/components/modules/case-drafts.tsx");
  assert.match(today, /href=\{`\/missions\/\$\{item\.missionId\}`\}/);
  assert.doesNotMatch(today, /RequirementRoleTable/);
  assert.doesNotMatch(today, /Open the case/);
  assert.match(page, /CasePageScreen/);
  assert.match(page, /requirementRoles\.length > 0/);
  assert.match(drafts, /SendFromTriangleButton/);
  assert.match(drafts, /EmailCardActions/);
  assert.doesNotMatch(drafts, /Ask Bob|Ask Hanna/);
  assert.doesNotMatch(mission, /AutonomyMenu|Autonomy:/);
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
