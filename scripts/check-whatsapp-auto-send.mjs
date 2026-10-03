// WhatsApp: a reply to the owner or the field sender goes without approval.
// The CEO's grant of 3 October 2026, and its three conditions.
//
// Everything here is a fixture. The database is an in-memory fake, Graph is a
// stubbed fetch that records the call and returns a made-up id, and the
// numbers, names, and secrets are invented. No env is read from disk, no
// live database is touched, no message is sent, no SQL is applied.
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

function moduleLoader(stubs = {}) {
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
      if (name in stubs) return stubs[name];
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

// ── fixtures ────────────────────────────────────────────────────────────────

const ORG = "11111111-1111-4111-8111-111111111111";
const OWNER = "+15551000001";
const FIELD = "+15551000002";
const STRANGER = "+15559999999";
const SECRET = "fixture-app-secret";
const HANNA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const BOB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const SCOUT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const LEDGER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
const MATTIA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const DARIO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const MATTIA_CV_PATH = `${ORG}/workers/${MATTIA}/1700000000000-cv.pdf`;

const ENV_KEYS = [
  "DEFAULT_ORGANIZATION_ID",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_WABA_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_OWNER_NUMBERS",
  "WHATSAPP_FIELD_NUMBERS",
  "WHATSAPP_ALLOWED_NUMBERS",
  "WHATSAPP_FIELD_DRIVE_FOLDERS",
  "WHATSAPP_AUTO_SEND",
  "WHATSAPP_TEMPLATE_NAME",
  "WHATSAPP_GRAPH_VERSION",
  "OPENAI_API_KEY",
];

/** An in-memory stand-in for the service client. Only what whatsapp.ts calls. */
function fakeDatabase() {
  let seq = 0;
  const uuid = () => `cccccccc-cccc-4ccc-8ccc-${String(++seq).padStart(12, "0")}`;
  const tables = {
    whatsapp_messages: [],
    agent_assignments: [],
    agent_assignment_entities: [],
    employee_reports: [],
    missions: [],
    organizations: [{ id: ORG, name: "Acme Crew" }],
    agent_instances: [
      { id: HANNA, org_id: ORG, role_key: "hr", display_name: "Hanna", status: "active" },
      { id: BOB, org_id: ORG, role_key: "inbox_coordinator", display_name: "Bob", status: "active" },
      { id: SCOUT, org_id: ORG, role_key: "project_researcher", display_name: "Scout", status: "active" },
      { id: LEDGER, org_id: ORG, role_key: "bookkeeper", display_name: "Ledger", status: "active" },
    ],
    workers: [
      { id: MATTIA, organization_id: ORG, full_name: "Mattia Rossi", phone: null },
      { id: DARIO, organization_id: ORG, full_name: "Dario Martić", phone: null },
    ],
    documents: [
      {
        id: uuid(),
        organization_id: ORG,
        title: "CV",
        document_category: "cv",
        linked_entity_type: "worker",
        linked_entity_id: MATTIA,
        storage_bucket: "documents",
        storage_path: MATTIA_CV_PATH,
        file_name: "Mattia Rossi CV.pdf",
        mime_type: "application/pdf",
        is_current_version: true,
        created_at: "2026-09-01T10:00:00.000Z",
      },
    ],
  };
  const files = new Map([[`documents/${MATTIA_CV_PATH}`, new Uint8Array([37, 80, 68, 70])]]);

  function clashes(table, row) {
    const rows = tables[table];
    if (table === "whatsapp_messages") {
      if (row.wamid && rows.some((item) => item.wamid === row.wamid)) return true;
      if (row.draft_key && rows.some((item) => item.org_id === row.org_id && item.draft_key === row.draft_key)) {
        return true;
      }
    }
    if (table === "agent_assignments" && row.idempotency_key) {
      return rows.some((item) => item.org_id === row.org_id && item.idempotency_key === row.idempotency_key);
    }
    return false;
  }

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.op = "select";
      this.payload = null;
      this.sort = null;
      this.max = null;
    }
    select() {
      return this;
    }
    insert(payload) {
      this.op = "insert";
      this.payload = payload;
      return this;
    }
    update(payload) {
      this.op = "update";
      this.payload = payload;
      return this;
    }
    eq(column, value) {
      this.filters.push((row) => row[column] === value);
      return this;
    }
    is(column, value) {
      this.filters.push((row) => (row[column] ?? null) === value);
      return this;
    }
    in(column, values) {
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }
    not(column, op, value) {
      assert.equal(op, "is");
      assert.equal(value, null);
      this.filters.push((row) => (row[column] ?? null) !== null);
      return this;
    }
    order(column, opts = {}) {
      this.sort = { column, ascending: opts.ascending !== false };
      return this;
    }
    limit(count) {
      this.max = count;
      return this;
    }
    run() {
      const rows = tables[this.table] ?? (tables[this.table] = []);
      if (this.op === "insert") {
        const made = [];
        for (const item of Array.isArray(this.payload) ? this.payload : [this.payload]) {
          if (clashes(this.table, item)) return { data: null, error: { code: "23505", message: "duplicate key" } };
          const row = { id: uuid(), created_at: new Date().toISOString(), ...item };
          rows.push(row);
          made.push(row);
        }
        return { data: made, error: null };
      }
      let hit = rows.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.op === "update") {
        for (const row of hit) Object.assign(row, this.payload);
        return { data: hit, error: null };
      }
      if (this.sort) {
        const { column, ascending } = this.sort;
        hit = [...hit].sort((a, b) => {
          const left = String(a[column] ?? "");
          const right = String(b[column] ?? "");
          return (left < right ? -1 : left > right ? 1 : 0) * (ascending ? 1 : -1);
        });
      }
      if (this.max != null) hit = hit.slice(0, this.max);
      return { data: hit, error: null };
    }
    async maybeSingle() {
      const { data, error } = this.run();
      return error ? { data: null, error } : { data: data[0] ?? null, error: null };
    }
    then(resolve, reject) {
      return Promise.resolve(this.run()).then(resolve, reject);
    }
  }

  const client = {
    from: (table) => new Query(table),
    storage: {
      from: (bucket) => ({
        upload: async (key, bytes) => {
          files.set(`${bucket}/${key}`, new Uint8Array(bytes));
          return { error: null };
        },
        download: async (key) => {
          const bytes = files.get(`${bucket}/${key}`);
          if (!bytes) return { data: null, error: { message: "not found" } };
          return {
            data: { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) },
            error: null,
          };
        },
        remove: async () => ({ error: null }),
      }),
    },
  };
  return { tables, files, client };
}

/** A fresh world: a fake database, a recorded Graph, and the data layer loaded on top of them. */
function world(env = {}) {
  const db = fakeDatabase();
  const wakes = [];
  const graph = [];
  const load = moduleLoader({
    "@/lib/supabase/server": { createServiceSupabaseClient: () => db.client },
    "@/lib/ai/openai-client": {
      getOpenAIClient: () => {
        throw new Error("no model in a fixture");
      },
    },
    "@/lib/data/bot-runtime": {
      wakeEmployee: async (params) => {
        wakes.push(params);
        return { status: "sent", httpStatus: 200 };
      },
    },
  });
  const settings = {
    DEFAULT_ORGANIZATION_ID: ORG,
    WHATSAPP_APP_SECRET: SECRET,
    WHATSAPP_PHONE_NUMBER_ID: "phone-1",
    WHATSAPP_ACCESS_TOKEN: "fixture-token",
    WHATSAPP_OWNER_NUMBERS: OWNER,
    WHATSAPP_FIELD_NUMBERS: FIELD,
    ...env,
  };
  const pilot = load("src/lib/whatsapp/pilot.ts");
  const data = load("src/lib/data/whatsapp.ts");

  async function within(fn) {
    const before = {};
    for (const key of ENV_KEYS) {
      before[key] = process.env[key];
      delete process.env[key];
    }
    for (const [key, value] of Object.entries(settings)) {
      if (value != null) process.env[key] = value;
    }
    const realFetch = global.fetch;
    const realError = console.error;
    console.error = () => {};
    global.fetch = async (url, init) => {
      const target = String(url);
      // Nothing in a fixture may reach the network. Graph is answered here.
      if (!target.startsWith("https://graph.facebook.com/")) throw new Error(`unexpected fetch: ${target}`);
      assert.equal(init.headers.Authorization, "Bearer fixture-token");
      if (target.endsWith("/media")) {
        graph.push({ kind: "media", filename: init.body.get("file").name });
        return new Response(JSON.stringify({ id: `media-${graph.length}` }), { status: 200 });
      }
      graph.push({ kind: "message", body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.OUT${graph.length}` }] }), { status: 200 });
    };
    try {
      return await fn();
    } finally {
      global.fetch = realFetch;
      console.error = realError;
      for (const key of ENV_KEYS) {
        if (before[key] === undefined) delete process.env[key];
        else process.env[key] = before[key];
      }
    }
  }

  function payload(wamid, from, text, at = Date.now()) {
    return JSON.stringify({
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
                    timestamp: String(Math.floor(at / 1000)),
                    type: "text",
                    text: { body: text },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
  }

  /** A message as Meta delivers it: signed with the app secret. */
  async function arrives(wamid, from, text, at) {
    const raw = payload(wamid, from, text, at);
    return data.ingestWhatsAppWebhook(raw, `sha256=${pilot.signatureHex(raw, SECRET)}`);
  }

  function reply(agent, body) {
    return data.fileWhatsAppDraft({ orgId: ORG, agentInstanceId: agent, body });
  }

  const messages = () => graph.filter((call) => call.kind === "message");
  const outbound = () => db.tables.whatsapp_messages.filter((row) => row.direction === "outbound");
  const inbound = (wamid) => db.tables.whatsapp_messages.find((row) => row.wamid === wamid);

  return { db, wakes, graph, data, pilot, within, payload, arrives, reply, messages, outbound, inbound };
}

const tests = [];
function test(name, fn) {
  tests.push([name, fn]);
}

// ── 1. A reply goes only to the number that wrote, and only the owner's or the field sender's ──

test("the field sender writes, and Hanna's reply goes to that number with no approval", async () => {
  const w = world();
  await w.within(async () => {
    const stored = await w.arrives("wamid.F1", FIELD, "Who is available for the Cologne commissioning role?");
    assert.equal(stored.status, 200);
    assert.equal(w.wakes.length, 1);
    assert.equal(w.wakes[0].agentInstanceId, HANNA);
    assert.equal(w.wakes[0].context.replySends, true);
    const step = w.db.tables.agent_assignments[0];
    assert.match(step.objective, /It goes to that number as you file it; nobody approves it first/);
    assert.equal(step.constraints.reply_sends, true);
    assert.doesNotMatch(step.objective, /Do not send/);

    const filed = await w.reply(HANNA, {
      replyTo: "wamid.F1",
      text: "Two people: M.R. and D.M., both available from November.",
    });
    assert.equal(filed.ok, true);
    assert.equal(filed.sends, true);
    assert.equal(filed.status, "sent");
    assert.equal(filed.held, null);
    assert.equal(w.messages().length, 1);
    assert.equal(w.messages()[0].body.to, FIELD);
    assert.equal(w.messages()[0].body.type, "text");
    assert.equal(w.messages()[0].body.text.body, "Two people: M.R. and D.M., both available from November.");

    const row = w.outbound()[0];
    assert.equal(row.status, "sent");
    assert.equal(row.to_number, FIELD);
    assert.equal(row.reply_to_wamid, "wamid.F1");
    assert.equal(row.agent_instance_id, HANNA);
    assert.equal(row.approved_by ?? null, null);
    assert.match(row.route_reason, /^Sent without approval: a reply to the field sender's own message\./);
    assert.equal(row.wamid, filed.wamid);

    // Filing the same reply again does not send it again.
    const again = await w.reply(HANNA, {
      replyTo: "wamid.F1",
      text: "Two people: M.R. and D.M., both available from November.",
    });
    assert.equal(again.duplicate, true);
    assert.equal(again.sends, true);
    assert.equal(w.messages().length, 1);
  });
});

test("the owner writes, and the reply goes to the owner's number", async () => {
  const w = world();
  await w.within(async () => {
    await w.arrives("wamid.O1", OWNER, "Please follow up with the client on the proposal");
    assert.equal(w.wakes[0].agentInstanceId, BOB);
    assert.equal(w.wakes[0].context.replySends, true);
    assert.equal(w.wakes[0].context.senderNote, undefined);
    const filed = await w.reply(BOB, { replyTo: "wamid.O1", text: "The proposal went on Tuesday. No answer yet." });
    assert.equal(filed.sends, true);
    assert.equal(w.messages()[0].body.to, OWNER);
    assert.match(w.outbound()[0].route_reason, /a reply to the owner's own message/);
  });
});

test("a reply is never redirected to another number, even the owner's", async () => {
  const w = world();
  await w.within(async () => {
    await w.arrives("wamid.O1", OWNER, "Who is available?");
    await w.arrives("wamid.F1", FIELD, "Who is available for Cologne?");
    // Woken by the field sender's message, addressed to the owner: it does not go.
    const crossed = await w.reply(HANNA, { replyTo: "wamid.F1", to: OWNER, text: "The field sender asks about Cologne." });
    assert.equal(crossed.ok, true);
    assert.equal(crossed.sends, false);
    assert.match(crossed.held, /different number than the one that wrote/);
    assert.equal(w.messages().length, 0);
    assert.equal(w.outbound()[0].status, "draft");

    // And the other way round.
    const back = await w.reply(HANNA, { replyTo: "wamid.O1", to: FIELD, text: "The owner asks who is free." });
    assert.equal(back.sends, false);
    assert.equal(w.messages().length, 0);

    // A reply that answers no message at all waits, whoever it is addressed to.
    const cold = await w.reply(HANNA, { to: FIELD, text: "A candidate just replied." });
    assert.equal(cold.sends, false);
    assert.match(cold.held, /does not answer a stored message/);
    const unknown = await w.reply(HANNA, { replyTo: "wamid.NOT-ON-FILE", to: FIELD, text: "Hello." });
    assert.equal(unknown.sends, false);
    assert.equal(w.messages().length, 0);
  });
});

test("everyone else still waits for a person, and a person can still send", async () => {
  const w = world();
  await w.within(async () => {
    await w.arrives("wamid.S1", STRANGER, "Hello, is anybody there?");
    assert.equal(w.wakes.length, 0);
    const filed = await w.reply(HANNA, { replyTo: "wamid.S1", text: "Hello. A person will come back to you." });
    assert.equal(filed.ok, true);
    assert.equal(filed.sends, false);
    assert.match(filed.held, /not on the owner or field list/);
    assert.equal(w.messages().length, 0);
    assert.equal(w.outbound()[0].status, "draft");
    // Not a principal: there is no reason to explain on the draft.
    assert.equal(w.outbound()[0].route_reason ?? null, null);
  });

  // The deprecated allowlist wakes an employee and is the field role, but the grant does not reach it.
  const legacy = world({
    WHATSAPP_OWNER_NUMBERS: null,
    WHATSAPP_FIELD_NUMBERS: null,
    WHATSAPP_ALLOWED_NUMBERS: STRANGER,
  });
  await legacy.within(async () => {
    await legacy.arrives("wamid.L1", STRANGER, "Who is available?");
    assert.equal(legacy.wakes.length, 1);
    assert.equal(legacy.wakes[0].context.replySends, false);
    assert.match(legacy.db.tables.agent_assignments[0].objective, /Do not send\. No CV or worker profile\./);
    const filed = await legacy.reply(HANNA, { replyTo: "wamid.L1", text: "M.R. is available from November." });
    assert.equal(filed.sends, false);
    assert.equal(legacy.messages().length, 0);

    const machine = await legacy.data.sendApprovedWhatsAppDraft({
      orgId: ORG,
      userId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
      actor: "machine",
      draftId: filed.draftId,
      text: "",
      approve: true,
    });
    assert.equal(machine.ok, false);
    assert.equal(legacy.messages().length, 0);

    const person = await legacy.data.sendApprovedWhatsAppDraft({
      orgId: ORG,
      userId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
      actor: "human",
      draftId: filed.draftId,
      text: "",
      approve: true,
    });
    assert.equal(person.ok, true);
    assert.equal(legacy.messages().length, 1);
    assert.equal(legacy.messages()[0].body.to, STRANGER);
    const row = legacy.outbound()[0];
    assert.equal(row.status, "sent");
    assert.equal(row.approved_by, "dddddddd-dddd-4ddd-8ddd-ddddddddddd1");
    assert.equal(row.route_reason ?? null, null);
  });

  // An open pilot, with no list at all, treats every number as field. The grant does not reach it either.
  const open = world({ WHATSAPP_OWNER_NUMBERS: null, WHATSAPP_FIELD_NUMBERS: null });
  await open.within(async () => {
    await open.arrives("wamid.P1", STRANGER, "Who is available?");
    assert.equal(open.wakes.length, 1);
    assert.equal(open.wakes[0].context.replySends, false);
    const filed = await open.reply(HANNA, { replyTo: "wamid.P1", text: "M.R. is available." });
    assert.equal(filed.sends, false);
    assert.equal(open.messages().length, 0);
  });
});

// ── 2. No CV, profile, or file unless that message asked for it ─────────────

test("'send me CV from Mattia' sends Mattia's CV, to the number that asked", async () => {
  const w = world();
  await w.within(async () => {
    await w.arrives("wamid.F1", FIELD, "Send me CV from Mattia");
    assert.equal(w.wakes[0].agentInstanceId, HANNA);
    const filed = await w.reply(HANNA, {
      replyTo: "wamid.F1",
      text: "Mattia's CV, as you asked.",
      document: { workerId: MATTIA },
    });
    assert.equal(filed.ok, true);
    assert.equal(filed.sends, true);
    assert.deepEqual(
      w.graph.map((call) => call.kind),
      ["media", "message"],
    );
    assert.equal(w.graph[0].filename, "Mattia Rossi CV.pdf");
    const sent = w.messages()[0].body;
    assert.equal(sent.to, FIELD);
    assert.equal(sent.type, "document");
    assert.equal(sent.document.filename, "Mattia Rossi CV.pdf");
    assert.equal(sent.document.caption, "Mattia's CV, as you asked.");

    const row = w.outbound()[0];
    assert.equal(row.status, "sent");
    assert.equal(row.person_id, MATTIA);
    assert.equal(row.attachment_bucket, "documents");
    assert.equal(row.attachment_path, MATTIA_CV_PATH);
    assert.equal(row.attachment_source_table, "workers");
    assert.match(row.route_reason, /with the file that message asked for/);

    // It is on Mattia's own record: who was sent his CV, and that no person approved it.
    const record = await w.data.listWhatsAppForPerson(ORG, MATTIA, "Mattia Rossi");
    assert.equal(record.sent.length, 1);
    assert.equal(record.sent[0].by, "Hanna");
    assert.equal(record.sent[0].to, FIELD);
    assert.equal(record.sent[0].documentName, "Mattia Rossi CV.pdf");
    assert.equal(record.sent[0].withoutApproval, true);
    assert.equal(record.drafts.length, 0);
  });
});

test("a CV nobody asked for is refused before it is stored", async () => {
  const w = world();
  await w.within(async () => {
    await w.arrives("wamid.F1", FIELD, "Who is available in November?");
    const unasked = await w.reply(HANNA, {
      replyTo: "wamid.F1",
      text: "Mattia is available.",
      document: { workerId: MATTIA },
    });
    assert.equal(unasked.ok, false);
    assert.equal(unasked.status, 400);
    assert.match(unasked.error, /Nobody asked for a CV or a profile in that message/);

    await w.arrives("wamid.F2", FIELD, "Send me CV from Mattia");
    // The wrong person's CV: Dario has no CV on file, and with one it would still be refused by name.
    w.db.tables.documents.push({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
      organization_id: ORG,
      title: "CV",
      document_category: "cv",
      linked_entity_type: "worker",
      linked_entity_id: DARIO,
      storage_bucket: "documents",
      storage_path: `${ORG}/workers/${DARIO}/1700000000001-cv.pdf`,
      file_name: "Dario Martić CV.pdf",
      is_current_version: true,
      created_at: "2026-09-02T10:00:00.000Z",
    });
    const wrong = await w.reply(HANNA, { replyTo: "wamid.F2", text: "Here.", document: { workerId: DARIO } });
    assert.equal(wrong.ok, false);
    assert.match(wrong.error, /does not name this person/);

    // The same file named by its storage path is recognised from the record.
    const byPath = await w.reply(HANNA, {
      replyTo: "wamid.F1",
      text: "Attached.",
      document: { filename: "notes.pdf", storageBucket: "documents", storagePath: MATTIA_CV_PATH },
    });
    assert.equal(byPath.ok, false);
    assert.match(byPath.error, /Nobody asked for a CV or a profile/);

    // A CV the employee uploads itself: Triangle cannot know whose it is.
    const uploaded = await w.reply(HANNA, {
      replyTo: "wamid.F2",
      text: "Here.",
      document: {
        filename: "mattia-cv.pdf",
        mime: "application/pdf",
        contentBase64: Buffer.from("%PDF").toString("base64"),
      },
    });
    assert.equal(uploaded.ok, false);
    assert.match(uploaded.error, /not known whose document/);

    // Asked for by the field sender, addressed to the owner: it goes only to the number that asked.
    await w.arrives("wamid.O1", OWNER, "Thanks");
    const redirected = await w.reply(HANNA, {
      replyTo: "wamid.F2",
      to: OWNER,
      text: "Mattia's CV.",
      document: { workerId: MATTIA },
    });
    assert.equal(redirected.ok, false);
    assert.match(redirected.error, /only to the number that asked/);

    // Somebody who is not the owner or the field sender asks: refused.
    await w.arrives("wamid.S1", STRANGER, "Send me CV from Mattia");
    const stranger = await w.reply(HANNA, { replyTo: "wamid.S1", text: "Here.", document: { workerId: MATTIA } });
    assert.equal(stranger.ok, false);
    assert.match(stranger.error, /not on the owner or field list/);

    // No message at all.
    const cold = await w.reply(HANNA, { to: FIELD, text: "Here.", document: { workerId: MATTIA } });
    assert.equal(cold.ok, false);

    assert.equal(w.graph.length, 0);
    assert.equal(w.outbound().length, 0);
  });
});

test("a CV draft a person finds later is checked again before it can be sent", async () => {
  // The switch is off, so an asked-for CV is stored as a draft for a person.
  const w = world({ WHATSAPP_AUTO_SEND: "off" });
  await w.within(async () => {
    await w.arrives("wamid.F1", FIELD, "Send me CV from Mattia");
    const filed = await w.reply(HANNA, {
      replyTo: "wamid.F1",
      text: "Mattia's full CV.",
      document: { workerId: MATTIA },
    });
    assert.equal(filed.ok, true);
    assert.equal(filed.sends, false);
    assert.match(filed.held, /switched off/);
    assert.equal(w.graph.length, 0);
    assert.match(w.outbound()[0].route_reason, /^Held: Sending without approval is switched off\./);

    const person = await w.data.sendApprovedWhatsAppDraft({
      orgId: ORG,
      userId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
      actor: "human",
      draftId: filed.draftId,
      text: "",
      approve: true,
    });
    assert.equal(person.ok, true);
    assert.equal(w.messages()[0].body.to, FIELD);
    assert.equal(w.messages()[0].body.type, "document");
  });

  // A stored draft whose question never asked for the CV cannot be sent by a person either.
  const tampered = world({ WHATSAPP_AUTO_SEND: "off" });
  await tampered.within(async () => {
    await tampered.arrives("wamid.F1", FIELD, "Who is available?");
    tampered.db.tables.whatsapp_messages.push({
      id: "ffffffff-ffff-4fff-8fff-fffffffffff1",
      org_id: ORG,
      direction: "outbound",
      from_number: "business",
      to_number: FIELD,
      body: "Here.",
      wa_timestamp: new Date().toISOString(),
      status: "draft",
      reply_to_wamid: "wamid.F1",
      agent_instance_id: HANNA,
      attachment_filename: "notes.pdf",
      attachment_mime: "application/pdf",
      attachment_bucket: "documents",
      attachment_path: MATTIA_CV_PATH,
      attachment_kind: "contractor_list",
    });
    const person = await tampered.data.sendApprovedWhatsAppDraft({
      orgId: ORG,
      userId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
      actor: "human",
      draftId: "ffffffff-ffff-4fff-8fff-fffffffffff1",
      text: "",
      approve: true,
    });
    assert.equal(person.ok, false);
    assert.match(person.error, /Nobody asked for a CV or a profile/);
    assert.equal(tampered.graph.length, 0);
  });
});

test("a list goes on its own only when that message asked for it", async () => {
  const w = world();
  const csv = Buffer.from("company,country\nAcme,DE\n").toString("base64");
  const document = { filename: "cologne-subcontractors.csv", mime: "text/csv", kind: "contractor_list", contentBase64: csv };
  await w.within(async () => {
    await w.arrives("wamid.F1", FIELD, "Who are the subcontractors in Cologne?");
    assert.equal(w.wakes[0].agentInstanceId, SCOUT);
    const unasked = await w.reply(SCOUT, { replyTo: "wamid.F1", text: "Three firms. The list is attached.", document });
    assert.equal(unasked.ok, true);
    assert.equal(unasked.sends, false);
    assert.match(unasked.held, /Nobody asked for a file in that message/);
    assert.equal(w.graph.length, 0);
    assert.equal(w.outbound()[0].status, "draft");
    assert.match(w.outbound()[0].route_reason, /^Held: Nobody asked for a file/);

    await w.arrives("wamid.F2", FIELD, "Send me the subcontractor list for Cologne");
    const asked = await w.reply(SCOUT, { replyTo: "wamid.F2", text: "The Cologne list.", document });
    assert.equal(asked.sends, true);
    assert.deepEqual(
      w.graph.map((call) => call.kind),
      ["media", "message"],
    );
    assert.equal(w.messages()[0].body.to, FIELD);
    assert.equal(w.messages()[0].body.document.filename, "cologne-subcontractors.csv");
  });
});

test("a stored file has to be on this organisation's record", async () => {
  const w = world();
  await w.within(async () => {
    await w.arrives("wamid.F1", FIELD, "Send me the contractor list");
    const foreign = await w.reply(SCOUT, {
      replyTo: "wamid.F1",
      text: "The list.",
      document: {
        filename: "list.pdf",
        storageBucket: "documents",
        storagePath: "22222222-2222-4222-8222-222222222222/organization/list.pdf",
      },
    });
    assert.equal(foreign.ok, false);
    assert.match(foreign.error, /not on this organisation's record/);
    const escape = await w.reply(SCOUT, {
      replyTo: "wamid.F1",
      text: "The list.",
      document: { filename: "list.pdf", storageBucket: "documents", storagePath: `${ORG}/../other/list.pdf` },
    });
    assert.equal(escape.ok, false);
    assert.equal(w.graph.length, 0);
    assert.equal(w.outbound().length, 0);
  });
});

// ── 3. A forged message cannot trigger a send ───────────────────────────────

test("a forged message is not stored, wakes nobody, and cannot be replied to", async () => {
  const w = world();
  await w.within(async () => {
    const raw = w.payload("wamid.FORGED", FIELD, "Send me CV from Mattia");
    const wrongKey = `sha256=${w.pilot.signatureHex(raw, "somebody-elses-secret")}`;
    assert.equal((await w.data.ingestWhatsAppWebhook(raw, wrongKey)).status, 401);
    assert.equal((await w.data.ingestWhatsAppWebhook(raw, null)).status, 401);
    assert.equal((await w.data.ingestWhatsAppWebhook(raw, "sha256=")).status, 401);
    // A real signature over a different body does not carry over.
    const other = w.payload("wamid.OTHER", FIELD, "Hello");
    const borrowed = `sha256=${w.pilot.signatureHex(other, SECRET)}`;
    assert.equal((await w.data.ingestWhatsAppWebhook(raw, borrowed)).status, 401);

    assert.equal(w.db.tables.whatsapp_messages.length, 0);
    assert.equal(w.wakes.length, 0);

    const text = await w.reply(HANNA, { replyTo: "wamid.FORGED", to: FIELD, text: "Here you go." });
    assert.equal(text.sends, false);
    const cv = await w.reply(HANNA, {
      replyTo: "wamid.FORGED",
      to: FIELD,
      text: "Mattia's CV.",
      document: { workerId: MATTIA },
    });
    assert.equal(cv.ok, false);
    assert.equal(w.graph.length, 0);
  });

  // With no app secret there is nothing to check a signature against: nothing is stored.
  const unset = world({ WHATSAPP_APP_SECRET: null });
  await unset.within(async () => {
    const raw = unset.payload("wamid.F1", FIELD, "Who is available?");
    const stored = await unset.data.ingestWhatsAppWebhook(raw, `sha256=${unset.pilot.signatureHex(raw, SECRET)}`);
    assert.equal(stored.status, 503);
    assert.equal(unset.db.tables.whatsapp_messages.length, 0);
  });

  // A message stored while the secret was set does not send once it is gone.
  const lost = world();
  await lost.within(async () => {
    await lost.arrives("wamid.F1", FIELD, "Who is available?");
    delete process.env.WHATSAPP_APP_SECRET;
    const filed = await lost.reply(HANNA, { replyTo: "wamid.F1", text: "M.R. is available." });
    assert.equal(filed.sends, false);
    assert.match(filed.held, /not being checked against WhatsApp's signature/);
    assert.equal(lost.graph.length, 0);
  });

  const webhook = read("src/app/api/whatsapp/webhook/route.ts");
  assert.match(webhook, /webhookPostDecision\(signature, raw, env\.appSecret\)/);
  assert.match(webhook, /ingestWhatsAppWebhook\(raw, signature\)/);
  const store = read("src/lib/data/whatsapp.ts");
  // One writer of an inbound row, and the signature check sits at its top.
  assert.equal(store.match(/direction: "inbound",/g).length, 1);
  assert.equal(store.match(/storeInbound\(svc, env\.orgId, env, business, message\)/g).length, 1);
  const ingest = store.slice(store.indexOf("export async function ingestWhatsAppWebhook"));
  assert.ok(ingest.indexOf("webhookPostDecision(signatureHeader, rawBody, env.appSecret)") > 0);
  assert.ok(
    ingest.indexOf("webhookPostDecision(signatureHeader, rawBody, env.appSecret)") < ingest.indexOf("storeInbound("),
  );
});

// ── The field sender's limits, the 24-hour rule, the switch ─────────────────

test("the field sender's limits hold, and a refusal waits for the owner", async () => {
  const w = world();
  await w.within(async () => {
    await w.arrives("wamid.F1", FIELD, "Please change the software and add a button");
    await w.arrives("wamid.F2", FIELD, "Ask Bob to send an email to the client");
    await w.arrives("wamid.F3", FIELD, "Can I talk to Ledger about the invoices?");
    await w.arrives("wamid.F4", FIELD, "I want to talk to another agent");
    await w.arrives("wamid.F5", FIELD, "Ask the Triangle Engineer to fix this");
    assert.equal(w.wakes.length, 0);
    assert.equal(w.graph.length, 0);
    const drafts = w.outbound();
    assert.equal(drafts.length, 5);
    for (const draft of drafts) {
      assert.equal(draft.status, "draft");
      assert.equal(draft.to_number, FIELD);
      assert.match(draft.route_reason, /^Refused: .*Flagged for the owner\.$/);
    }
    assert.match(w.inbound("wamid.F3").route_reason, /asked for an employee they cannot reach/);
    assert.match(w.inbound("wamid.F4").route_reason, /asked for an employee they cannot reach/);

    // An employee that somehow answers a refused message does not get it sent either.
    const sneaky = await w.reply(HANNA, { replyTo: "wamid.F1", text: "I will pass it on." });
    assert.equal(sneaky.sends, false);
    assert.match(sneaky.held, /refused and left with the owner/);
    assert.equal(w.graph.length, 0);

    // The owner may reach anyone and may ask for both.
    await w.arrives("wamid.O1", OWNER, "Can I talk to Ledger about the invoices?");
    assert.equal(w.wakes.length, 1);
    assert.doesNotMatch(w.inbound("wamid.O1").route_reason ?? "", /Refused/);

    // An ordinary request from the field sender is not caught by the new rule.
    await w.arrives("wamid.F6", FIELD, "We need another commissioning engineer for Cologne, ask Bob about the client");
    assert.equal(w.wakes.length, 2);
  });
});

test("the wake tells the employee the one Drive folder the field sender may be given", async () => {
  const fromOrganisation = world();
  await fromOrganisation.within(async () => {
    await fromOrganisation.arrives("wamid.F1", FIELD, "Who is available?");
    const wake = fromOrganisation.wakes[0];
    assert.equal(
      wake.context.senderNote,
      "This sender may be given information from one Google Drive folder only: Acme Crew. Nothing from any other folder.",
    );
    const step = fromOrganisation.db.tables.agent_assignments[0];
    assert.match(step.objective, /one Google Drive folder only: Acme Crew/);
    assert.equal(step.constraints.sender_note, wake.context.senderNote);
  });
  const configured = world({ WHATSAPP_FIELD_DRIVE_FOLDERS: "Field Share" });
  await configured.within(async () => {
    await configured.arrives("wamid.F1", FIELD, "Who is available?");
    assert.match(configured.wakes[0].context.senderNote, /one Google Drive folder only: Field Share\./);
    await configured.arrives("wamid.O1", OWNER, "Who is available?");
    assert.equal(configured.wakes[1].context.senderNote, undefined);
  });
});

test("the 24-hour rule, the switch, and the cap", async () => {
  const late = world();
  await late.within(async () => {
    await late.arrives("wamid.F1", FIELD, "Who is available?", Date.now() - 25 * 60 * 60 * 1000);
    const filed = await late.reply(HANNA, { replyTo: "wamid.F1", text: "M.R. is available." });
    assert.equal(filed.sends, false);
    assert.match(filed.held, /Outside the 24-hour window/);
    assert.equal(late.graph.length, 0);
    assert.match(late.outbound()[0].route_reason, /^Held: Outside the 24-hour window/);
    // A newer message from the same number opens the window again, as WhatsApp's own rule says.
    await late.arrives("wamid.F2", FIELD, "Hello?");
    const again = await late.reply(HANNA, { replyTo: "wamid.F1", text: "M.R. is available." });
    assert.equal(again.duplicate, true);
    assert.equal(again.sends, true);
    assert.equal(late.messages().length, 1);
  });

  const off = world({ WHATSAPP_AUTO_SEND: "off" });
  await off.within(async () => {
    await off.arrives("wamid.F1", FIELD, "Who is available?");
    assert.equal(off.wakes[0].context.replySends, false);
    const filed = await off.reply(HANNA, { replyTo: "wamid.F1", text: "M.R. is available." });
    assert.equal(filed.sends, false);
    assert.match(filed.held, /switched off/);
    assert.equal(off.graph.length, 0);
  });

  const many = world();
  await many.within(async () => {
    await many.arrives("wamid.F1", FIELD, "Who is available?");
    for (let n = 1; n <= 5; n += 1) {
      const filed = await many.reply(HANNA, { replyTo: "wamid.F1", text: `Part ${n}.` });
      assert.equal(filed.sends, true);
    }
    const sixth = await many.reply(HANNA, { replyTo: "wamid.F1", text: "Part 6." });
    assert.equal(sixth.sends, false);
    assert.match(sixth.held, /5 replies to that message have already gone on their own/);
    assert.equal(many.messages().length, 5);
  });

  // The words still follow the data rule: no email address, no phone number, no rate.
  const words = world();
  await words.within(async () => {
    await words.arrives("wamid.F1", FIELD, "Who is available?");
    const email = await words.reply(HANNA, { replyTo: "wamid.F1", text: "Write to mattia@example.com" });
    assert.equal(email.ok, false);
    const rate = await words.reply(HANNA, { replyTo: "wamid.F1", text: "Hourly rate 45 EUR" });
    assert.equal(rate.ok, false);
    assert.equal(words.graph.length, 0);
  });
});

test("when WhatsApp refuses, the reply stays a draft that says why", async () => {
  const w = world();
  await w.within(async () => {
    await w.arrives("wamid.F1", FIELD, "Who is available?");
    const answered = global.fetch;
    global.fetch = async () =>
      new Response(JSON.stringify({ error: { message: "Recipient is not a test number" } }), { status: 400 });
    const filed = await w.reply(HANNA, { replyTo: "wamid.F1", text: "M.R. is available." });
    global.fetch = answered;
    assert.equal(filed.ok, true);
    assert.equal(filed.sends, false);
    assert.match(filed.held, /Recipient is not a test number/);
    const row = w.outbound()[0];
    assert.equal(row.status, "draft");
    assert.equal(row.send_attempted_at, null);
    assert.match(row.route_reason, /^Held: Recipient is not a test number/);
  });
});

test("the record shows what went without approval and stops calling it waiting", async () => {
  const w = world();
  await w.within(async () => {
    w.db.tables.missions.push({ id: "99999999-9999-4999-8999-999999999991", org_id: ORG, closed_at: null });
    await w.arrives("wamid.F1", FIELD, "Who is available?");
    w.inbound("wamid.F1").mission_id = "99999999-9999-4999-8999-999999999991";
    const before = await w.data.listWhatsAppForCase(ORG, "99999999-9999-4999-8999-999999999991");
    assert.equal(before.waiting.length, 1);
    await w.reply(HANNA, { replyTo: "wamid.F1", text: "M.R. is available from November." });
    const after = await w.data.listWhatsAppForCase(ORG, "99999999-9999-4999-8999-999999999991");
    assert.equal(after.waiting.length, 0);
    assert.equal(after.drafts.length, 0);
    assert.equal(after.sent.length, 1);
    assert.equal(after.sent[0].by, "Hanna");
    assert.equal(after.sent[0].withoutApproval, true);
    assert.equal(after.sent[0].failed, false);
    assert.equal(after.sent[0].text, "M.R. is available from November.");

    // WhatsApp reports later that it could not deliver it: the line says so, and the question waits again.
    w.outbound()[0].status = "failed";
    const failed = await w.data.listWhatsAppForCase(ORG, "99999999-9999-4999-8999-999999999991");
    assert.equal(failed.sent[0].failed, true);
    assert.equal(failed.waiting.length, 1);
  });

  const { renderToStaticMarkup } = require("react-dom/server");
  const { createElement } = require("react");
  const { WhatsAppOnRecord } = moduleLoader()("src/components/modules/whatsapp-on-record.tsx");
  const html = renderToStaticMarkup(
    createElement(WhatsAppOnRecord, {
      record: {
        approvedTemplate: null,
        waiting: [],
        drafts: [
          {
            id: "d1",
            to: FIELD,
            body: "The list.",
            who: FIELD,
            inboundText: "Who are the subcontractors?",
            windowOpen: true,
            documentName: "list.csv",
            heldBecause: "Nobody asked for a file in that message, so it does not go on its own.",
          },
        ],
        sent: [
          {
            id: "s1",
            to: FIELD,
            by: "Hanna",
            text: "M.R. is available from November.",
            at: "3 Oct 2026",
            documentName: null,
            withoutApproval: true,
          },
          {
            id: "s2",
            to: FIELD,
            by: "Bob",
            text: "The proposal went on Tuesday.",
            at: "3 Oct 2026",
            documentName: null,
            withoutApproval: true,
            failed: true,
          },
        ],
      },
    }),
  );
  assert.match(html, /Hanna replied on WhatsApp to \+15551000002: M\.R\. is available from November\./);
  assert.match(html, /Sent without approval\./);
  assert.match(html, /WhatsApp could not deliver it\./);
  assert.match(html, /Not sent on its own: Nobody asked for a file in that message/);
});

// ── The rules themselves, as pure decisions ─────────────────────────────────

test("decideAutoSend: every condition, one at a time", () => {
  const { pilot } = world();
  const routing = moduleLoader()("src/lib/whatsapp/routing.ts");
  const senders = routing.bindWhatsAppSenders(OWNER, FIELD).senders;
  const now = new Date("2026-10-03T12:00:00.000Z");
  const base = {
    enabled: true,
    signatureChecked: true,
    senders,
    inbound: { from: FIELD, text: "Who is available?", woken: true, routeReason: "Resourcing, so Hanna." },
    employee: "hanna",
    to: FIELD,
    text: "M.R. is available.",
    templateName: null,
    lastInboundAt: "2026-10-03T11:00:00.000Z",
    now,
    repliesAlreadySent: 0,
    document: null,
  };
  const ok = pilot.decideAutoSend(base);
  assert.equal(ok.send, true);
  assert.equal(ok.to, FIELD);
  assert.equal(ok.role, "field");

  const held = (patch) => {
    const plan = pilot.decideAutoSend({ ...base, ...patch });
    assert.equal(plan.send, false);
    return plan;
  };
  assert.equal(held({ inbound: null }).granted, false);
  assert.equal(held({ inbound: { ...base.inbound, from: STRANGER }, to: STRANGER }).granted, false);
  assert.equal(held({ to: OWNER }).granted, false);
  assert.equal(held({ to: "not a number" }).granted, false);
  assert.equal(held({ enabled: false }).granted, true);
  assert.match(held({ signatureChecked: false }).reason, /signature/);
  assert.match(held({ inbound: { ...base.inbound, routeReason: "Refused: no." } }).reason, /refused/);
  assert.match(held({ inbound: { ...base.inbound, woken: false } }).reason, /Nobody was woken/);
  assert.match(held({ employee: null }).reason, /cannot reach this employee/);
  assert.match(held({ employee: "ledger" }).reason, /cannot reach this employee/);
  assert.match(held({ templateName: "pilot_hello" }).reason, /template/);
  assert.match(held({ repliesAlreadySent: 5 }).reason, /already gone on their own/);
  assert.match(held({ lastInboundAt: "2026-10-02T12:00:00.000Z" }).reason, /24-hour/);
  assert.match(held({ lastInboundAt: null }).reason, /24-hour/);
  assert.match(held({ text: "  " }).reason, /no words/);
  assert.match(held({ text: "Call +385911234567" }).reason, /phone number/);
  const file = { filename: "list.csv", mime: "text/csv", workerDocument: false, workerName: null };
  assert.match(held({ document: file }).reason, /Nobody asked for a file/);
  const askedFile = pilot.decideAutoSend({
    ...base,
    inbound: { ...base.inbound, text: "Send me the contractor list" },
    document: file,
  });
  assert.equal(askedFile.send && askedFile.mode, "document");

  // The owner may be answered by any employee, including one added later.
  const owner = pilot.decideAutoSend({
    ...base,
    inbound: { ...base.inbound, from: OWNER },
    to: OWNER,
    employee: "ledger",
  });
  assert.equal(owner.send, true);
  assert.equal(owner.role, "owner");

  // Only the owner and field lists carry the grant.
  const legacy = pilot.readWhatsAppEnv({ WHATSAPP_ALLOWED_NUMBERS: FIELD });
  assert.equal(pilot.decideAutoSend({ ...base, senders: legacy.senders }).send, false);
  assert.equal(pilot.decideAutoSend({ ...base, senders: [] }).send, false);
  const granted = routing.WHATSAPP_SENDERS.filter((role) => role.repliesSendWithoutApproval).map((role) => role.id);
  assert.deepEqual(granted, ["owner", "field"]);
  assert.equal(routing.UNLISTED_SENDER.repliesSendWithoutApproval, false);
  assert.equal(routing.permissionFor(STRANGER, senders, "field").repliesSendWithoutApproval, false);
  assert.equal(routing.fieldSendersFor([STRANGER])[0].repliesSendWithoutApproval, false);

  // The switch: unset is on, and anything that is not a clear yes is off.
  assert.equal(pilot.whatsAppAutoSendEnabled(undefined), true);
  assert.equal(pilot.whatsAppAutoSendEnabled(""), true);
  assert.equal(pilot.whatsAppAutoSendEnabled("on"), true);
  assert.equal(pilot.whatsAppAutoSendEnabled("off"), false);
  assert.equal(pilot.whatsAppAutoSendEnabled("0"), false);
  assert.equal(pilot.whatsAppAutoSendEnabled("maybe"), false);
});

test("what counts as asking, and whose name it is", () => {
  const routing = moduleLoader()("src/lib/whatsapp/routing.ts");
  const { attachmentAskedFor, asksForPersonDocument, asksForFile, namesPerson, storedDocumentFilename } = routing;

  assert.equal(asksForPersonDocument("send me CV from Mattia"), true);
  assert.equal(asksForPersonDocument("Can I have Mattia's profile?"), true);
  assert.equal(asksForPersonDocument("Pošalji mi životopis od Darija"), true);
  assert.equal(asksForPersonDocument("Schick mir den Lebenslauf von Mattia"), true);
  assert.equal(asksForPersonDocument("Who is available in November?"), false);
  assert.equal(asksForPersonDocument("Don't send me the CV yet"), false);
  assert.equal(asksForPersonDocument("Mattia has a strong biography"), false);
  // A short question, or a please, is an ask. Naming the thing in passing is not.
  assert.equal(asksForPersonDocument("Mattia CV?"), true);
  assert.equal(asksForPersonDocument("CV from Mattia please"), true);
  assert.equal(asksForPersonDocument("Mattia CV"), false);
  assert.equal(asksForPersonDocument("No CV yet?"), false);
  assert.equal(asksForPersonDocument("The CV is outdated"), false);
  assert.equal(asksForFile("Thanks for the list"), false);
  assert.equal(asksForFile("Contractor list?"), true);
  assert.equal(asksForFile("Send me the subcontractor list for Cologne"), true);
  assert.equal(asksForFile("Who are the subcontractors in Cologne?"), false);

  assert.equal(namesPerson("send me CV from Mattia", "Mattia Rossi"), true);
  assert.equal(namesPerson("the CV of Rossi please", "Mattia Rossi"), true);
  assert.equal(namesPerson("Mattia's CV", "Mattia Rossi"), true);
  assert.equal(namesPerson("pošalji CV od Darija Martića", "Dario Martić"), true);
  assert.equal(namesPerson("send me the CV of Martic", "Dario Martić"), true);
  assert.equal(namesPerson("send me CV from Mattia", "Dario Martić"), false);
  assert.equal(namesPerson("send me his CV", "Mattia Rossi"), false);
  assert.equal(namesPerson("send me the CV", ""), false);

  const cv = (request, workerName) => attachmentAskedFor({ request, workerDocument: true, workerName });
  assert.equal(cv("send me CV from Mattia", "Mattia Rossi").ok, true);
  assert.equal(cv("send me his CV", "Mattia Rossi").ok, false);
  assert.equal(cv("send me CV from Mattia", null).ok, false);
  assert.equal(cv("Who is Mattia?", "Mattia Rossi").ok, false);
  assert.equal(cv("do not send me the CV from Mattia", "Mattia Rossi").ok, false);
  const file = (request) => attachmentAskedFor({ request, workerDocument: false, workerName: null });
  assert.equal(file("Send the contractor list").ok, true);
  assert.equal(file("Thanks").ok, false);

  assert.equal(storedDocumentFilename("Dario Martić – životopis.pdf"), "Dario Martic - zivotopis.pdf");
  assert.equal(storedDocumentFilename("scan.jpg"), null);
  assert.equal(storedDocumentFilename("no-extension"), null);
  assert.equal(routing.safeDocumentFilename(storedDocumentFilename("Dario Martić – životopis.pdf")), "Dario Martic - zivotopis.pdf");

  // The plan still refuses a CV unless the data layer has established the ask.
  const { planDraft } = moduleLoader()("src/lib/whatsapp/pilot.ts");
  const attachment = {
    filename: "Mattia Rossi CV.pdf",
    kind: "cv",
    sourceTable: "workers",
    linkedEntityType: "worker",
    storageBucket: "documents",
    storagePath: MATTIA_CV_PATH,
  };
  const draft = { agentId: "hanna", to: FIELD, text: "Mattia's full CV.", replyTo: "wamid.F1", templateName: null, attachment };
  assert.equal(planDraft(draft).ok, false);
  const asked = planDraft({ ...draft, workerDocumentAsked: true });
  assert.equal(asked.ok, true);
  assert.equal(asked.sends, false);
  assert.equal(asked.attachment.bucket, "documents");
  // Asked for or not, the words carry no phone number.
  assert.equal(planDraft({ ...draft, text: "Call him on +385911234567", workerDocumentAsked: true }).ok, false);
});

test("the grant and its limits are written down where agents read them", () => {
  const decisions = read("DECISIONS.md");
  assert.match(decisions, /### 2026-10-03: WhatsApp replies to the owner and the field sender go without approval/);
  assert.match(decisions, /only to the number that wrote/i);
  const routing = read("src/lib/whatsapp/routing.ts");
  assert.doesNotMatch(routing, /\+\d{8,}/);
  assert.match(read(".env.example"), /WHATSAPP_AUTO_SEND=/);
  assert.match(read(".env.example"), /WHATSAPP_FIELD_DRIVE_FOLDERS=/);
  for (const file of ["agents/hanna.md", "agents/bob.md", "agents/scout.md"]) {
    assert.match(read(file), /replySends/);
  }
  const draftsRoute = read("src/app/api/agent/whatsapp/drafts/route.ts");
  assert.match(draftsRoute, /verifyMachineToken/);
  assert.doesNotMatch(draftsRoute, /graph\.facebook|postToGraph/);
  const sendRoute = read("src/app/api/whatsapp/send/route.ts");
  assert.match(sendRoute, /refuseUnlessHuman/);
  // One function posts to Graph, and it is reached only with a person's approval or an audit reason.
  const store = read("src/lib/data/whatsapp.ts");
  assert.equal(store.match(/await postToGraph\(/g).length, 1);
  assert.match(store, /if \(!args\.approvedBy && !args\.audit\)/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL  ${name}`);
    console.log("  " + (err instanceof Error ? err.stack ?? err.message : err));
  }
}
console.log(failed === 0 ? `${tests.length}/${tests.length} ok` : `${tests.length - failed}/${tests.length} passed`);
process.exit(failed === 0 ? 0 : 1);
