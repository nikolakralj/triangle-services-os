// WhatsApp Cloud API pilot.
// Isolated fixtures. No env, no live database, no message sent, no SQL applied.
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
      if (name === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
      if (name.startsWith("@/")) {
        const base = "src/" + name.slice(2);
        if (fs.existsSync(path.resolve(root, base + ".ts"))) return load(base + ".ts");
        if (fs.existsSync(path.resolve(root, base + ".tsx"))) return load(base + ".tsx");
      }
      if (name.startsWith(".")) {
        const base = path.resolve(path.dirname(full), name);
        if (fs.existsSync(base + ".ts")) return load(path.relative(root, base + ".ts"));
        if (fs.existsSync(base + ".tsx")) return load(path.relative(root, base + ".tsx"));
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

const pilot = moduleLoader()("src/lib/whatsapp/pilot.ts");
const {
  acceptCloudPayload,
  decideSend,
  planDraft,
  readAllowlist,
  signatureHex,
  wakeEnvForRole,
  webhookGetDecision,
  webhookPostDecision,
} = pilot;

const SECRET = "pilot-app-secret";
const RAW = JSON.stringify({ hello: "triangle" });
const GOOD = `sha256=${signatureHex(RAW, SECRET)}`;

function cloudText(wamid, from, text) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "phone-1", display_phone_number: "15550001111" },
              messages: [
                {
                  from: from.replace(/^\+/, ""),
                  id: wamid,
                  timestamp: "1760000000",
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

test("verification challenge", () => {
  const ok = webhookGetDecision(
    { mode: "subscribe", verifyToken: "pilot-verify", challenge: "123456" },
    "pilot-verify",
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.body, "123456");
  const bad = webhookGetDecision(
    { mode: "subscribe", verifyToken: "nope", challenge: "123456" },
    "pilot-verify",
  );
  assert.equal(bad.status, 403);
  const missing = webhookGetDecision(
    { mode: "subscribe", verifyToken: "pilot-verify", challenge: "123456" },
    null,
  );
  assert.equal(missing.status, 503);
});

test("bad signature rejected", () => {
  assert.equal(webhookPostDecision("sha256=deadbeef", RAW, SECRET), 401);
  assert.equal(webhookPostDecision(GOOD.slice(0, -1), RAW, SECRET), 401);
  assert.equal(webhookPostDecision(null, RAW, SECRET), 401);
  assert.equal(webhookPostDecision(GOOD, RAW, null), 503);
});

test("good signature accepted", () => {
  assert.equal(webhookPostDecision(GOOD, RAW, SECRET), 200);
  assert.equal(webhookPostDecision(GOOD.toUpperCase().replace("SHA256=", "sha256="), RAW, SECRET), 200);
});

test("duplicate wamid stored once and wakes once", () => {
  const allowlist = readAllowlist("+15551212000");
  const opts = {
    allowlist,
    businessNumber: "+15550001111",
    matchFor: () => ({ personId: "person-1", missionId: "case-1" }),
    expectedPhoneNumberId: "phone-1",
  };
  const payload = cloudText("wamid.IN", "+15551212000", "Hello Hanna");
  const first = acceptCloudPayload([], payload, opts);
  assert.equal(first.messages.length, 1);
  assert.equal(first.messages[0].wamid, "wamid.IN");
  assert.equal(first.messages[0].personId, "person-1");
  assert.equal(first.messages[0].missionId, "case-1");
  assert.equal(first.wakes.length, 1);
  assert.deepEqual(first.wakes[0], {
    messageId: "wamid.IN",
    sender: "+15551212000",
    personId: "person-1",
    caseId: "case-1",
  });
  const second = acceptCloudPayload(first.messages, payload, opts);
  assert.equal(second.messages.length, 1);
  assert.equal(second.wakes.length, 0);

  const voice = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ from: "15551212000", id: "wamid.VOICE", timestamp: "1760000001", type: "audio" }],
            },
          },
        ],
      },
    ],
  };
  const ignored = acceptCloudPayload(second.messages, voice, opts);
  assert.equal(ignored.messages.length, 1);
  assert.equal(ignored.wakes.length, 0);
  assert.equal(ignored.ignoredNonText, 1);

  assert.deepEqual(wakeEnvForRole("hr"), {
    url: "BOT_WAKE_URL_HR",
    key: "BOT_WAKE_KEY_HR",
  });
  const runtime = read("src/lib/data/bot-runtime.ts");
  const store = read("src/lib/data/whatsapp.ts");
  assert.match(runtime, /whatsapp_inbound/);
  assert.match(runtime, /BOT_WAKE_URL_/);
  assert.match(store, /event: "whatsapp_inbound"/);
  assert.match(store, /messageId: ctx\.messageId/);
  assert.match(store, /sender: ctx\.sender/);
  assert.match(store, /caseId: ctx\.caseId/);
});

test("status update updates row", () => {
  const messages = [
    {
      wamid: "wamid.OUT",
      direction: "outbound",
      from: "+15550001111",
      to: "+15551212000",
      text: "On our way",
      timestamp: "2026-10-01T08:00:00.000Z",
      status: "sent",
      personId: null,
      missionId: null,
      woken: true,
    },
  ];
  const delivered = {
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                { id: "wamid.OUT", status: "delivered", timestamp: "1760001000", recipient_id: "15551212000" },
              ],
            },
          },
        ],
      },
    ],
  };
  const next = acceptCloudPayload(messages, delivered, {
    allowlist: null,
    businessNumber: "+15550001111",
    matchFor: () => ({ personId: null, missionId: null }),
  });
  assert.equal(next.messages.length, 1);
  assert.equal(next.messages[0].status, "delivered");
  const older = acceptCloudPayload(next.messages, {
    entry: [{ changes: [{ value: { statuses: [{ id: "wamid.OUT", status: "sent", timestamp: "1760000000" }] } }] }],
  }, {
    allowlist: null,
    businessNumber: "+15550001111",
    matchFor: () => ({ personId: null, missionId: null }),
  });
  assert.equal(older.messages[0].status, "delivered");
});

test("draft-only (no send without approval)", () => {
  const draft = planDraft({
    agentId: "hanna",
    to: "+1 555 121 2000",
    text: "We can put two people forward.",
    replyTo: "wamid.IN",
    templateName: null,
  });
  assert.equal(draft.ok, true);
  assert.equal(draft.sends, false);
  const base = {
    status: "draft",
    to: "+15551212000",
    text: "We can put two people forward.",
    draftTemplate: null,
    allowlist: ["+15551212000"],
    lastInboundAt: "2026-10-01T08:00:00.000Z",
    now: new Date("2026-10-01T12:00:00.000Z"),
    approvedTemplate: "pilot_hello",
    templateLanguageCode: "en",
    sendAttempted: false,
  };
  const unapproved = decideSend({ ...base, actor: "human", approve: false });
  assert.equal(unapproved.ok, false);
  const machine = decideSend({ ...base, actor: "machine", approve: true });
  assert.equal(machine.ok, false);
  const approved = decideSend({ ...base, actor: "human", approve: true });
  assert.equal(approved.ok, true);
  assert.equal(approved.mode, "text");

  const draftsRoute = read("src/app/api/agent/whatsapp/drafts/route.ts");
  const webhook = read("src/app/api/whatsapp/webhook/route.ts");
  const sendRoute = read("src/app/api/whatsapp/send/route.ts");
  assert.match(draftsRoute, /verifyMachineToken/);
  assert.match(draftsRoute, /sends: false/);
  assert.doesNotMatch(draftsRoute, /graph\.facebook|postToGraph|sendApprovedWhatsAppDraft/);
  assert.doesNotMatch(webhook, /postToGraph|graph\.facebook/);
  assert.match(sendRoute, /refuseUnlessHuman/);
  assert.match(sendRoute, /approve: body\?\.approve === true/);
  assert.doesNotMatch(read("src/lib/whatsapp/pilot.ts"), /\bfetch\s*\(/);
});

test("24h window enforcement", () => {
  const inbound = "2026-10-01T08:00:00.000Z";
  const shared = {
    actor: "human",
    approve: true,
    status: "draft",
    to: "+15551212000",
    text: "Free text",
    draftTemplate: null,
    allowlist: null,
    lastInboundAt: inbound,
    approvedTemplate: "pilot_hello",
    templateLanguageCode: "en",
    sendAttempted: false,
  };
  const inside = decideSend({ ...shared, now: new Date("2026-10-02T07:59:59.000Z") });
  assert.equal(inside.ok && inside.mode, "text");
  const edge = decideSend({ ...shared, now: new Date("2026-10-02T08:00:00.000Z") });
  assert.equal(edge.ok && edge.mode, "template");
  assert.equal(edge.ok && edge.templateName, "pilot_hello");
  const outside = decideSend({
    ...shared,
    now: new Date("2026-10-03T08:00:00.000Z"),
    approvedTemplate: null,
  });
  assert.equal(outside.ok, false);
  assert.match(outside.error, /24-hour/);
  const wrongTemplate = decideSend({
    ...shared,
    now: new Date("2026-10-03T08:00:00.000Z"),
    draftTemplate: "some_other_template",
  });
  assert.equal(wrongTemplate.ok, false);
  assert.match(wrongTemplate.error, /not the approved one/);
});

test("allowlist", () => {
  const allowlist = readAllowlist("+15551212000, +15551212999");
  const opts = {
    allowlist,
    businessNumber: "+15550001111",
    matchFor: () => ({ personId: null, missionId: null }),
  };
  const stored = acceptCloudPayload([], cloudText("wamid.OTHER", "+15559999999", "stranger"), opts);
  assert.equal(stored.messages.length, 1);
  assert.equal(stored.wakes.length, 0);
  const allowed = acceptCloudPayload(stored.messages, cloudText("wamid.RALPH", "+15551212999", "hello"), opts);
  assert.equal(allowed.messages.length, 2);
  assert.equal(allowed.wakes.length, 1);
  const send = decideSend({
    actor: "human",
    approve: true,
    status: "draft",
    to: "+15559999999",
    text: "no",
    draftTemplate: null,
    allowlist,
    lastInboundAt: "2026-10-01T08:00:00.000Z",
    now: new Date("2026-10-01T09:00:00.000Z"),
    approvedTemplate: null,
    templateLanguageCode: "en",
    sendAttempted: false,
  });
  assert.equal(send.ok, false);
  assert.match(send.error, /allowlist/);
});

test("the draft line renders Send and does not send by rendering", () => {
  const load = moduleLoader();
  const { renderToStaticMarkup } = require("react-dom/server");
  const { createElement } = require("react");
  const { WhatsAppOnRecord } = load("src/components/modules/whatsapp-on-record.tsx");
  const calls = [];
  global.fetch = (...args) => {
    calls.push(args[0]);
    throw new Error("fetch during render");
  };
  const waiting = renderToStaticMarkup(
    createElement(WhatsAppOnRecord, {
      record: {
        approvedTemplate: null,
        drafts: [],
        waiting: [{ id: "w1", who: "A person", from: "+15551212000", text: "Are you there?", at: "1 Oct 2026" }],
      },
    }),
  );
  assert.match(waiting, /No draft yet/);
  assert.doesNotMatch(waiting, /Send/);
  const html = renderToStaticMarkup(
    createElement(WhatsAppOnRecord, {
      record: {
        approvedTemplate: "pilot_hello",
        waiting: [],
        drafts: [
          {
            id: "draft-1",
            to: "+15551212000",
            body: "Two people can start in November.",
            who: "A person",
            inboundText: "Are you there?",
            windowOpen: true,
          },
        ],
      },
    }),
  );
  assert.match(html, /Send/);
  assert.match(html, /Are you there/);
  assert.equal(calls.length, 0);
  delete global.fetch;

  const sql = read("supabase/migrations/054_whatsapp_messages.sql");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS/);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /notify pgrst, 'reload schema'/);
  assert.match(sql, /DO NOT APPLY/);
  assert.match(sql, /wamid/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL  ${name}`);
    console.log("  " + (err instanceof Error ? err.stack ?? err.message : err));
  }
}
console.log(failed === 0 ? `${tests.length}/${tests.length} ok` : `${tests.length - failed}/${tests.length} passed`);
process.exit(failed === 0 ? 0 : 1);
