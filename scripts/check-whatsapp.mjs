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

const load = moduleLoader();
const pilot = load("src/lib/whatsapp/pilot.ts");
const routing = load("src/lib/whatsapp/routing.ts");
const {
  acceptCloudPayload,
  decideSend,
  graphDocumentBody,
  graphMediaUrl,
  planDraft,
  readAllowlist,
  signatureHex,
  wakeEnvForRole,
  webhookGetDecision,
  webhookPostDecision,
} = pilot;
const {
  WHATSAPP_DATA_RULE,
  WHATSAPP_DRAFT_ENDPOINT,
  draftTextAllowed,
  EMAIL_REFUSAL_DRAFT,
  NO_OUTBOUND_EMAIL_HANDOFF,
  SOFTWARE_REFUSAL_DRAFT,
  WHATSAPP_EMPLOYEES,
  WHATSAPP_SENDERS,
  asksForSoftwareChange,
  asksToSendEmail,
  decideInbound,
  employeeMayDraftWhatsApp,
  keywordRoute,
  parseModelRoute,
  permissionFor,
  resolveRoute,
  senderMayTalkTo,
  workerProfileAttachment,
} = routing;

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
  assert.equal(first.wakes[0].messageId, "wamid.IN");
  assert.equal(first.wakes[0].sender, "+15551212000");
  assert.equal(first.wakes[0].text, "Hello Hanna");
  assert.equal(first.wakes[0].personId, "person-1");
  assert.equal(first.wakes[0].caseId, "case-1");
  assert.equal(first.wakes[0].draftEndpoint, WHATSAPP_DRAFT_ENDPOINT);
  assert.equal(first.wakes[0].employee, "hanna");
  assert.match(first.wakes[0].reason, /Unsure/);
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
  assert.match(store, /text: ctx\.text/);
  assert.match(store, /draftEndpoint: ctx\.draftEndpoint/);
  assert.match(store, /classifyInbound/);
  assert.match(store, /decideInbound/);
  assert.doesNotMatch(store, /wakeHanna/);
  assert.match(read("src/lib/data/bot-runtime.ts"), /draftEndpoint/);
});

test("routing to Scout or Hanna, and unsure to Hanna", () => {
  const list = keywordRoute("Send the contractor list for the Cologne project");
  assert.equal(list.employee, "scout");
  assert.equal(list.unsure, false);
  const companies = keywordRoute("Research the companies on this data centre");
  assert.equal(companies.employee, "scout");
  const subs = keywordRoute("Who are the subcontractors?");
  assert.equal(subs.employee, "scout");

  const people = keywordRoute("Who is available for the commissioning role?");
  assert.equal(people.employee, "hanna");
  assert.equal(people.unsure, false);
  const cvs = keywordRoute("Please send the CVs");
  assert.equal(cvs.employee, "hanna");

  const unsure = keywordRoute("Thanks");
  assert.equal(unsure.employee, "hanna");
  assert.equal(unsure.unsure, true);
  assert.match(unsure.reason, /Unsure/);
  const both = keywordRoute("Research who is available");
  assert.equal(both.employee, "hanna");
  assert.equal(both.unsure, true);

  const model = resolveRoute("Thanks", { employee: "scout", reason: "Contractor list." });
  assert.equal(model.employee, "scout");
  assert.equal(model.unsure, false);
  const modelUnsure = resolveRoute("Send the contractor list", { employee: "unsure", reason: "" });
  assert.equal(modelUnsure.employee, "scout");
  assert.equal(parseModelRoute('{"employee":"hanna","reason":"Resourcing."}')?.employee, "hanna");
  assert.equal(parseModelRoute("not json"), null);

  const opts = {
    allowlist: readAllowlist("+15551212000"),
    businessNumber: "+15550001111",
    matchFor: () => ({ personId: "person-1", missionId: "case-1" }),
  };
  const scoutWake = acceptCloudPayload([], cloudText("wamid.SCOUT", "+15551212000", "Send the subcontractor list"), opts);
  assert.equal(scoutWake.wakes.length, 1);
  assert.equal(scoutWake.wakes[0].employee, "scout");
  assert.equal(scoutWake.wakes[0].draftEndpoint, "/api/agent/whatsapp/drafts");
  const again = acceptCloudPayload(scoutWake.messages, cloudText("wamid.SCOUT", "+15551212000", "Send the subcontractor list"), opts);
  assert.equal(again.wakes.length, 0);
  const hannaWake = acceptCloudPayload(again.messages, cloudText("wamid.HANNA", "+15551212000", "Two engineers available?"), opts);
  assert.equal(hannaWake.wakes.length, 1);
  assert.equal(hannaWake.wakes[0].employee, "hanna");
});

test("Scout can draft, a list document is a draft, a CV is refused", () => {
  assert.equal(employeeMayDraftWhatsApp({ roleKey: "project_researcher", displayName: "Scout" }), true);
  assert.equal(employeeMayDraftWhatsApp({ roleKey: "hr", displayName: "Hanna" }), true);
  assert.equal(employeeMayDraftWhatsApp({ roleKey: "triangle_hr", displayName: "Hanna" }), true);
  assert.equal(employeeMayDraftWhatsApp({ roleKey: "inbox_coordinator", displayName: "Bob" }), true);
  assert.equal(employeeMayDraftWhatsApp({ roleKey: "viewer", displayName: "Pat" }), false);
  assert.match(read("src/lib/data/whatsapp.ts"), /employeeMayDraftWhatsApp/);
  assert.match(read("src/lib/data/whatsapp.ts"), /Only Scout or Hanna can draft/);

  const list = planDraft({
    agentId: "scout",
    to: "+1 555 121 2000",
    text: "The contractor list for Cologne.",
    replyTo: "wamid.IN",
    templateName: null,
    attachment: {
      filename: "cologne-contractors.csv",
      mime: "text/csv",
      kind: "contractor_list",
      sourceTable: null,
      hasContent: true,
    },
  });
  assert.equal(list.ok, true);
  assert.equal(list.sends, false);
  assert.equal(list.attachment.filename, "cologne-contractors.csv");
  assert.equal(list.attachment.bucket, "whatsapp-drafts");

  const byName = planDraft({
    agentId: "scout",
    to: "+15551212000",
    text: "Attached.",
    replyTo: null,
    templateName: null,
    attachment: { filename: "matej-cv.pdf", mime: "application/pdf", kind: "contractor_list", hasContent: true },
  });
  assert.equal(byName.ok, false);
  assert.match(byName.error, /CV|bio|worker profile/i);

  const byKind = workerProfileAttachment({ filename: "list.csv", kind: "full_cv", sourceTable: null });
  assert.equal(byKind.blocked, true);
  const byTable = workerProfileAttachment({
    filename: "notes.pdf",
    kind: "company_list",
    sourceTable: "workers",
  });
  assert.equal(byTable.blocked, true);
  const byLink = workerProfileAttachment({
    filename: "notes.pdf",
    kind: "company_list",
    linkedEntityType: "worker",
  });
  assert.equal(byLink.blocked, true);
  const pack = workerProfileAttachment({ filename: "ts-1a2b3c4d-profile.pdf", kind: "document" });
  assert.equal(pack.blocked, true);

  const anonymised = draftTextAllowed(
    "M.P., Senior Electrical Automation Engineer, available from November. Initials only. Passport held.",
  );
  assert.equal(anonymised.ok, true);
  const email = draftTextAllowed("Write to matej@example.com");
  assert.equal(email.ok, false);
  const phone = draftTextAllowed("His number is +385911234567");
  assert.equal(phone.ok, false);
  const rate = draftTextAllowed("Hourly rate 45 EUR");
  assert.equal(rate.ok, false);
  const named = draftTextAllowed("Here is the full named CV");
  assert.equal(named.ok, false);
  assert.match(WHATSAPP_DATA_RULE, /No CV or worker profile/);
  assert.match(read("DECISIONS.md"), /no CV or worker profile\s+leaves by WhatsApp/i);
});

test("send requires approve, including a document", () => {
  const base = {
    status: "draft",
    to: "+15551212000",
    text: "The contractor list.",
    draftTemplate: null,
    allowlist: ["+15551212000"],
    lastInboundAt: "2026-10-01T08:00:00.000Z",
    now: new Date("2026-10-01T12:00:00.000Z"),
    approvedTemplate: "pilot_hello",
    templateLanguageCode: "en",
    sendAttempted: false,
    document: { filename: "cologne-contractors.csv", mime: "text/csv" },
  };
  assert.equal(decideSend({ ...base, actor: "human", approve: false }).ok, false);
  assert.equal(decideSend({ ...base, actor: "machine", approve: true }).ok, false);
  const approved = decideSend({ ...base, actor: "human", approve: true });
  assert.equal(approved.ok, true);
  assert.equal(approved.mode, "document");
  const outside = decideSend({
    ...base,
    actor: "human",
    approve: true,
    now: new Date("2026-10-03T12:00:00.000Z"),
  });
  assert.equal(outside.ok, false);
  assert.match(outside.error, /document/);
  const body = graphDocumentBody({
    to: "+15551212000",
    mediaId: "media-1",
    filename: "cologne-contractors.csv",
    caption: "The contractor list.",
  });
  assert.equal(body.type, "document");
  assert.equal(body.document.filename, "cologne-contractors.csv");
  assert.equal(body.document.caption, "The contractor list.");
  assert.equal(graphMediaUrl("v25.0", "phone-1"), "https://graph.facebook.com/v25.0/phone-1/media");
  assert.match(read("src/lib/data/whatsapp.ts"), /uploadGraphMedia/);
  assert.match(read("src/lib/data/whatsapp.ts"), /graphDocumentBody/);
  assert.match(read("src/app/api/whatsapp/webhook/route.ts"), /WHATSAPP_APP_SECRET is not set/);
  assert.match(read("src/app/api/whatsapp/webhook/route.ts"), /was not stored/);
  const sql = read("supabase/migrations/055_whatsapp_routing.sql");
  assert.match(sql, /add column if not exists routed_employee/i);
  assert.match(sql, /add column if not exists route_reason/i);
  assert.match(sql, /add column if not exists attachment_filename/i);
  assert.match(sql, /DO NOT APPLY/);
  assert.match(sql, /notify pgrst, 'reload schema'/);
  assert.match(sql, /whatsapp-drafts/);
  assert.match(sql, /\^\[a-z\]/);
  assert.doesNotMatch(sql, /in \('scout', 'hanna'\)/);
});

test("sender permissions, Bob, software refusal, and no email from the field sender", () => {
  const ownerNumber = "+15551000001";
  const fieldNumber = "+15551000002";
  const senders = [
    {
      id: "owner",
      e164: ownerNumber,
      employees: "all",
      mayRequestSoftwareChange: true,
      mayTriggerOutboundEmail: true,
    },
    {
      id: "field",
      e164: fieldNumber,
      employees: ["hanna", "bob", "scout"],
      mayRequestSoftwareChange: false,
      mayTriggerOutboundEmail: false,
    },
  ];
  const field = permissionFor(fieldNumber, senders);
  assert.deepEqual([...field.employees].sort(), ["bob", "hanna", "scout"]);
  assert.equal(field.mayRequestSoftwareChange, false);
  assert.equal(field.mayTriggerOutboundEmail, false);
  assert.equal(permissionFor(ownerNumber, senders).employees, "all");
  assert.equal(permissionFor("+15559999999", senders).id, "unlisted");
  assert.equal(permissionFor("+15559999999").mayTriggerOutboundEmail, false);
  const shippedField = WHATSAPP_SENDERS.find((sender) => sender.id === "field");
  assert.deepEqual([...shippedField.employees].sort(), ["bob", "hanna", "scout"]);
  assert.equal(shippedField.e164, null);
  assert.equal(WHATSAPP_SENDERS.find((sender) => sender.id === "owner").employees, "all");

  const followUp = decideInbound({
    text: "Please follow up with the client on the proposal",
    from: fieldNumber,
    senders,
  });
  assert.equal(followUp.action, "route");
  assert.equal(followUp.employee, "bob");
  assert.equal(followUp.handoffNote, "requester may not trigger outbound email");
  assert.equal(followUp.handoffNote, NO_OUTBOUND_EMAIL_HANDOFF);

  const ownerFollowUp = decideInbound({
    text: "Please follow up with the client on the proposal",
    from: ownerNumber,
    senders,
  });
  assert.equal(ownerFollowUp.employee, "bob");
  assert.equal(ownerFollowUp.handoffNote, null);

  assert.equal(asksForSoftwareChange("Please fix the software"), true);
  const software = decideInbound({
    text: "Please change the software and add a button",
    from: fieldNumber,
    senders,
  });
  assert.equal(software.action, "refuse");
  assert.equal(software.employee, null);
  assert.equal(software.flagOwner, true);
  assert.equal(software.draftText, SOFTWARE_REFUSAL_DRAFT);
  assert.match(software.reason, /Flagged for the owner/);
  const ownerSoftware = decideInbound({
    text: "Please fix the software",
    from: ownerNumber,
    senders,
  });
  assert.equal(ownerSoftware.action, "route");
  assert.notEqual(ownerSoftware.employee, null);

  assert.equal(asksToSendEmail("Ask Bob to email the client"), true);
  assert.equal(asksToSendEmail("What did the client email say?"), false);
  const email = decideInbound({
    text: "Ask Bob to email the client the proposal",
    from: fieldNumber,
    senders,
  });
  assert.equal(email.action, "refuse");
  assert.equal(email.flagOwner, true);
  assert.equal(email.draftText, EMAIL_REFUSAL_DRAFT);
  assert.equal(email.handoffNote, null);
  assert.match(email.reason, /email/);
  const ownerEmail = decideInbound({
    text: "Ask Bob to email the client",
    from: ownerNumber,
    senders,
  });
  assert.equal(ownerEmail.action, "route");
  assert.notEqual(ownerEmail.action, "refuse");

  const accounting = {
    key: "accounting",
    roleKeys: ["accounting"],
    displayNames: ["accounting"],
    reason: "Company report, so accounting.",
    patterns: [/\bcompany report\b/i],
  };
  const extended = [...WHATSAPP_EMPLOYEES, accounting];
  const toAccounts = decideInbound({
    text: "Thanks",
    from: ownerNumber,
    senders,
    employees: extended,
    model: { employee: "accounting", reason: "Company report." },
  });
  assert.equal(toAccounts.action, "route");
  assert.equal(toAccounts.employee, "accounting");
  const fieldBlocked = decideInbound({
    text: "Thanks",
    from: fieldNumber,
    senders,
    employees: extended,
    model: { employee: "accounting", reason: "Company report." },
  });
  assert.equal(fieldBlocked.employee, "hanna");
  assert.equal(senderMayTalkTo(field, "accounting"), false);
  assert.equal(senderMayTalkTo(field, "scout"), true);

  const opts = {
    allowlist: readAllowlist(`${fieldNumber},${ownerNumber}`),
    businessNumber: "+15550001111",
    matchFor: () => ({ personId: null, missionId: null }),
  };
  const bobWake = acceptCloudPayload(
    [],
    cloudText("wamid.BOB", fieldNumber, "Please follow up with the client on the proposal"),
    opts,
  );
  assert.equal(bobWake.wakes.length, 1);
  assert.equal(bobWake.wakes[0].employee, "bob");
  assert.equal(bobWake.wakes[0].handoffNote, NO_OUTBOUND_EMAIL_HANDOFF);
  const again = acceptCloudPayload(
    bobWake.messages,
    cloudText("wamid.BOB", fieldNumber, "Please follow up with the client on the proposal"),
    opts,
  );
  assert.equal(again.wakes.length, 0);
  const refused = acceptCloudPayload(
    again.messages,
    cloudText("wamid.SOFT", fieldNumber, "Please fix the software"),
    opts,
  );
  assert.equal(refused.wakes.length, 0);
  assert.equal(refused.messages.length, again.messages.length + 1);
  const emailWake = acceptCloudPayload(
    refused.messages,
    cloudText("wamid.MAIL", fieldNumber, "Ask Bob to email the client"),
    opts,
  );
  assert.equal(emailWake.wakes.length, 0);

  const store = read("src/lib/data/whatsapp.ts");
  assert.match(store, /NO_OUTBOUND_EMAIL_HANDOFF|handoffNote/);
  assert.match(store, /ensureRefusalDraft/);
  assert.match(store, /decideInbound/);
  assert.doesNotMatch(store, /mail-send|sendMail|nodemailer/);
  assert.match(read("src/lib/data/bot-runtime.ts"), /handoffNote/);

  const sheet = planDraft({
    agentId: "scout",
    to: fieldNumber,
    text: "The company list is attached.",
    replyTo: "wamid.BOB",
    templateName: null,
    attachment: {
      filename: "companies.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      kind: "company_list",
      hasContent: true,
    },
  });
  assert.equal(sheet.ok, true);
  assert.equal(sheet.sends, false);
  assert.equal(sheet.attachment.filename, "companies.xlsx");
  assert.equal(sheet.attachment.mime, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const cvSheet = planDraft({
    agentId: "scout",
    to: fieldNumber,
    text: "Attached.",
    replyTo: null,
    templateName: null,
    attachment: {
      filename: "worker-cv.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      kind: "company_list",
      hasContent: true,
    },
  });
  assert.equal(cvSheet.ok, false);
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
  const withFile = renderToStaticMarkup(
    createElement(WhatsAppOnRecord, {
      record: {
        approvedTemplate: null,
        waiting: [],
        drafts: [
          {
            id: "draft-2",
            to: "+15551212000",
            body: "The contractor list.",
            who: "A person",
            inboundText: null,
            windowOpen: true,
            documentName: "cologne-contractors.csv",
          },
        ],
      },
    }),
  );
  assert.match(withFile, /Document: cologne-contractors\.csv/);
  assert.match(withFile, /Send/);
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
