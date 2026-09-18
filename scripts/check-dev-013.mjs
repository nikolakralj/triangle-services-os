// DEV-013: human-approved Send from Triangle. Isolated fixtures — no env, no
// live database, no network, nothing sent. The SMTP transport is a stub.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.resolve(root, file), 'utf8');
}

function moduleLoader(mocks = {}) {
  const cache = new Map();
  return function load(file) {
    const full = path.resolve(root, file);
    if (cache.has(full)) return cache.get(full);
    const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
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
      if (name === 'server-only') return {};
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) {
        const base = 'src/' + name.slice(2);
        if (fs.existsSync(path.resolve(root, base + '.ts'))) return load(base + '.ts');
        if (fs.existsSync(path.resolve(root, base + '.tsx'))) return load(base + '.tsx');
      }
      return require(name);
    };
    new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
    return mod.exports;
  };
}

const tests = [];
function test(name, fn) {
  tests.push([name, fn]);
}
async function run() {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log('ok  ' + name);
    } catch (err) {
      failed += 1;
      console.log('FAIL  ' + name);
      console.log('  ' + (err instanceof Error ? err.message : err));
    }
  }
  console.log(
    failed === 0 ? `${tests.length}/${tests.length} ok` : `${tests.length - failed}/${tests.length} passed`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

// ── plain modules ───────────────────────────────────────────────────────────
const { pickSendableMailbox, SEND_NOT_ENABLED } = moduleLoader()('src/lib/mail/send-policy.ts');
const { buildMime, dotStuff, defaultSmtpHost, isPlainAddress, sendViaMailbox } = moduleLoader({
  '@/lib/job-intake/credentials': {
    resolveMailboxPassword: (a) => {
      if (!a.credential_encrypted) throw new Error(`Mailbox ${a.email_address} has no password stored.`);
      return 'app-password';
    },
  },
})('src/lib/mail/smtp-send.ts');

test('only the owner of a mailbox with sending on may send; a colleague never', () => {
  const accounts = [
    { id: 'a', email_address: 'owner@x.com', owner_user_id: 'owner', can_send: true, status: 'active' },
    { id: 'b', email_address: 'colleague@x.com', owner_user_id: 'colleague', can_send: true, status: 'active' },
    { id: 'c', email_address: 'ingest@x.com', owner_user_id: 'owner', can_send: false, status: 'active' },
    { id: 'd', email_address: 'paused@x.com', owner_user_id: 'owner', can_send: true, status: 'paused' },
  ];
  assert.equal(pickSendableMailbox(accounts, 'owner').id, 'a');
  assert.equal(pickSendableMailbox(accounts, 'owner', 'b').id, 'a', "a colleague's box is not a fallback");
  assert.equal(pickSendableMailbox(accounts, 'owner', 'c').id, 'a', 'ingest-only box is skipped');
  assert.equal(pickSendableMailbox(accounts, 'colleague').id, 'b');
  assert.equal(pickSendableMailbox(accounts, 'employee-bot'), null);
  assert.equal(pickSendableMailbox([accounts[2]], 'owner'), null, 'default is off');
});

test('MIME: headers, threading, non-ASCII subject, dot-stuffing', () => {
  const mime = buildMime({
    from: 'owner@x.com',
    fromName: 'Owner One',
    to: 'oliver@g2.com',
    subject: 'Re: PLC engineer — USA',
    body: 'Hi Oliver,\n.starts with a dot\nRegards',
    inReplyTo: '<abc@g2.com>',
    rfc822Id: '<1.2@x.com>',
  });
  assert.match(mime, /^From: Owner One <owner@x\.com>\r\n/);
  assert.match(mime, /\r\nTo: oliver@g2\.com\r\n/);
  assert.match(mime, /\r\nSubject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/);
  assert.match(mime, /\r\nMessage-ID: <1\.2@x\.com>\r\n/);
  assert.match(mime, /\r\nIn-Reply-To: <abc@g2\.com>\r\nReferences: <abc@g2\.com>\r\n/);
  assert.match(mime, /Content-Type: text\/plain; charset=utf-8/);
  assert.match(mime, /\r\n\r\nHi Oliver,\r\n\.starts with a dot\r\nRegards\r\n$/);
  assert.match(dotStuff(mime), /\r\n\.\.starts with a dot\r\n/);
  const plain = buildMime({ from: 'a@b.co', to: 'c@d.co', subject: 'Plain', body: 'x', rfc822Id: '<1@b.co>' });
  assert.match(plain, /^From: a@b\.co\r\n/);
  assert.match(plain, /\r\nSubject: Plain\r\n/);
  assert.doesNotMatch(plain, /In-Reply-To/);
  // Header injection through a subject is flattened.
  const inj = buildMime({ from: 'a@b.co', to: 'c@d.co', subject: 'Hi\r\nBcc: x@y.z', body: 'x', rfc822Id: '<1@b.co>' });
  assert.doesNotMatch(inj, /\r\nBcc:/);
});

test('MIME: attachments are multipart/mixed, base64, and the filename is sanitised', () => {
  const mime = buildMime({
    from: 'owner@x.com',
    to: 'oliver@g2.com',
    subject: 'Re: profile',
    body: 'Please find the anonymised profile attached.',
    rfc822Id: '<1.2@x.com>',
    attachments: [
      {
        filename: 'ts-aabbccdd-profile.pdf',
        contentType: 'application/pdf',
        bytes: Buffer.from('%PDF-mock'),
      },
    ],
  });
  assert.match(mime, /Content-Type: multipart\/mixed; boundary="/);
  assert.match(mime, /Content-Type: text\/plain; charset=utf-8/);
  assert.match(mime, /Content-Type: application\/pdf; name="ts-aabbccdd-profile.pdf"/);
  assert.match(mime, /Content-Disposition: attachment; filename="ts-aabbccdd-profile.pdf"/);
  assert.match(mime, /Content-Transfer-Encoding: base64/);
  assert.match(mime, /JVBERi1tb2Nr/);
  const sneaky = buildMime({
    from: 'a@b.co',
    to: 'c@d.co',
    subject: 'x',
    body: 'x',
    rfc822Id: '<1@b.co>',
    attachments: [
      { filename: '../../Secret Name.pdf', contentType: 'application/pdf', bytes: Buffer.from('x') },
    ],
  });
  assert.equal(sneaky.includes(".."), false);
  assert.match(sneaky, /filename="Secret-Name.pdf"/);
  assert.doesNotMatch(sneaky, /filename="\.\./);
});

test('anonymised profile filename is the reference, never a person name', () => {
  const { anonymisedCvFilename } = moduleLoader()('src/lib/data/anonymised-cv-filename.ts');
  assert.equal(anonymisedCvFilename('TS-AABBCCDD'), 'ts-aabbccdd-profile.pdf');
  assert.equal(anonymisedCvFilename('  weird///ref  '), 'weird-ref-profile.pdf');
  assert.doesNotMatch(anonymisedCvFilename('TS-AABBCCDD'), /name|cv_244|\.docx/i);
});

test('SMTP host by provider; only plain addresses are accepted', () => {
  assert.equal(defaultSmtpHost('a@gmail.com'), 'smtp.gmail.com');
  assert.equal(defaultSmtpHost('a@outlook.com'), 'smtp.office365.com');
  assert.equal(defaultSmtpHost('a@triangle-services.eu'), 'mail.triangle-services.eu');
  assert.equal(isPlainAddress('oliver.hall@g2recruitment.com'), true);
  assert.equal(isPlainAddress('Oliver <oliver@g2.com>'), false);
  assert.equal(isPlainAddress('not an address'), false);
});

test('sendViaMailbox: the server is asked, and a refusal is returned, not swallowed', async () => {
  const calls = [];
  const okTransport = async (p) => {
    calls.push(p);
  };
  const box = { email_address: 'owner@gmail.com', credential_encrypted: 'enc' };
  const sent = await sendViaMailbox(box, { to: 'o@g2.com', subject: 'S', body: 'B' }, okTransport);
  assert.ok('rfc822Id' in sent && /^<.+@gmail\.com>$/.test(sent.rfc822Id));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].host, 'smtp.gmail.com');
  assert.equal(calls[0].user, 'owner@gmail.com');
  assert.equal(calls[0].password, 'app-password');
  assert.equal(calls[0].to, 'o@g2.com');
  assert.match(calls[0].mime, /^From: owner@gmail\.com\r\n/);

  const refused = await sendViaMailbox(box, { to: 'o@g2.com', subject: 'S', body: 'B' }, async () => {
    throw new Error('smtp.gmail.com refused at password — for Gmail and Microsoft this must be an app password: 535');
  });
  assert.ok('error' in refused);
  assert.match(refused.error, /535/);

  const noPassword = await sendViaMailbox({ email_address: 'x@y.com' }, { to: 'o@g2.com', subject: 'S', body: 'B' }, okTransport);
  assert.ok('error' in noPassword);
  assert.equal(calls.length, 1, 'no transport call without a password');
});

// ── sendFromTriangle end to end against a fake database ─────────────────────
const ORG = '11111111-1111-4111-8111-111111111111';
const OWNER = '77777777-7777-4777-8777-777777777777';
const COLLEAGUE = '88888888-8888-4888-8888-888888888888';
const LEAD = '55555555-5555-4555-8555-555555555555';
const WORKER = '66666666-6666-4666-8666-666666666666';

const PACK_CASE = '77777777-7777-4777-8777-777777777777';
const OTHER_CASE_PACK = '88888888-8888-4888-8888-888888888888';
let mailboxes = [];
let logged = [];
let refusals = [];
let smtpCalls = [];
let smtpFail = null;
let approvedPacks = {};

function fakeSvc() {
  return {
    from(table) {
      const q = { filters: [] };
      const api = {
        select() {
          return api;
        },
        eq(c, v) {
          q.filters.push([c, v]);
          return api;
        },
        then(resolve) {
          if (table !== 'mail_accounts') return resolve({ data: [], error: null });
          const rows = mailboxes.filter((r) => q.filters.every(([c, v]) => r[c] === v));
          return resolve({ data: rows, error: null });
        },
      };
      return api;
    },
  };
}

const loadSend = moduleLoader({
  '@/lib/supabase/server': { createServiceSupabaseClient: fakeSvc },
  '@/lib/data/contact-log': {
    logContactAttempt: async (p) => {
      logged.push(p);
      return { ok: true, actionId: 'act-1', draftId: 'draft-1', followUpAt: '2026-09-19T00:00:00.000Z' };
    },
  },
  '@/lib/data/refusals': {
    recordRefusal: async (p) => {
      refusals.push(p);
    },
  },
  '@/lib/mail/smtp-send': {
    isPlainAddress: (v) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v.trim()),
    sendViaMailbox: async (box, mail) => {
      smtpCalls.push({ box, mail });
      if (smtpFail) return { error: smtpFail };
      return { rfc822Id: '<msg-1@x.com>' };
    },
  },
  '@/lib/mail/pack-attachment': {
    buildPackAttachment: async ({ workerId, intent }) => {
      if (!workerId || workerId === 'missing') return null;
      return {
        filename:
          intent === 'full_cv' ? 'matej-pavlovic-cv.pdf' : 'ts-aabbccdd-profile.pdf',
        contentType: 'application/pdf',
        bytes: Buffer.from('%PDF-mock'),
      };
    },
  },
  // The human review gate. `approvedPackForSend` is the only thing that may
  // put a person's profile on a message, and it reads the record, not the
  // browser — so the fake stands in for the record here.
  '@/lib/data/put-forward-cases': {
    approvedPackForSend: async ({ assignmentId, ids }) => {
      const found = approvedPacks[assignmentId];
      if (!found) {
        return { ok: false, error: 'Nobody has approved this one for sending.', status: 409 };
      }
      const here = [ids.leadId, ids.contactId, ids.personId].filter(Boolean);
      if (!here.includes(found.caseId)) {
        return { ok: false, error: 'That was approved on a different case.', status: 409 };
      }
      return { ok: true, workerId: found.workerId, intent: found.intent, filename: found.filename };
    },
  },
});
const { sendFromTriangle, sendableMailboxFor } = loadSend('src/lib/data/mail-send.ts');

function reset() {
  mailboxes = [
    {
      id: 'box-owner',
      org_id: ORG,
      email_address: 'owner@x.com',
      display_name: 'Owner One',
      owner_user_id: OWNER,
      can_send: true,
      status: 'active',
      credential_encrypted: 'enc',
      credential_ref: null,
    },
    {
      id: 'box-colleague',
      org_id: ORG,
      email_address: 'colleague@x.com',
      display_name: null,
      owner_user_id: COLLEAGUE,
      can_send: false,
      status: 'active',
      credential_encrypted: 'enc',
      credential_ref: null,
    },
  ];
  logged = [];
  refusals = [];
  smtpCalls = [];
  smtpFail = null;
  approvedPacks = {
    [PACK_CASE]: {
      caseId: LEAD,
      workerId: WORKER,
      intent: 'bio_anonymised',
      filename: 'ts-aabbccdd-profile.pdf',
    },
    [OTHER_CASE_PACK]: {
      caseId: '99999999-9999-4999-8999-999999999999',
      workerId: WORKER,
      intent: 'bio_anonymised',
      filename: 'ts-aabbccdd-profile.pdf',
    },
  };
}

const message = {
  orgId: ORG,
  to: 'oliver.hall@g2recruitment.com',
  subject: 'Re: Automation Engineer — PLC commissioning, USA',
  body: 'Hi Oliver,\n\nWe have an Automation Engineer available who fits it.\n\nN.',
  draft: 'Hi Oliver,\n\nOn the Automation Engineer role we have someone.\n\nN.',
  leadId: LEAD,
};

test('a person with sending on: server first, then the DEV-001 record with draft, final text, mailbox and Message-ID', async () => {
  reset();
  const r = await sendFromTriangle({ ...message, userId: OWNER });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.from, 'owner@x.com');
  assert.equal(r.actionId, 'act-1');
  assert.equal(r.followUpAt, '2026-09-19T00:00:00.000Z', 'a follow-up date is always set');
  assert.equal(smtpCalls.length, 1);
  assert.equal(smtpCalls[0].box.email_address, 'owner@x.com');
  assert.equal(smtpCalls[0].mail.fromName, 'Owner One');
  assert.equal(logged.length, 1);
  const l = logged[0];
  assert.equal(l.outcome, 'sent');
  assert.equal(l.channelKind, 'email');
  assert.equal(l.value, message.to);
  assert.equal(l.leadId, LEAD);
  assert.equal(l.content, message.body, 'final text as sent');
  assert.equal(l.draft, message.draft, 'AI draft kept beside it');
  assert.equal(l.subject, message.subject);
  assert.deepEqual(l.sentFromTriangle, { mailAccountId: 'box-owner', rfc822Id: '<msg-1@x.com>' });
  assert.equal(refusals.length, 0);
});

test("a person without sending on is refused before the server is asked; it goes to the ledger", async () => {
  reset();
  const r = await sendFromTriangle({ ...message, userId: COLLEAGUE });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(r.error, SEND_NOT_ENABLED);
  assert.equal(smtpCalls.length, 0);
  assert.equal(logged.length, 0);
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0].surface, 'Send from Triangle');
  assert.equal(refusals[0].kind, 'boundary');
  assert.equal(refusals[0].entityType, 'job_lead');
});

test("a colleague's mailbox is never used, even when asked for by id", async () => {
  reset();
  const r = await sendFromTriangle({ ...message, userId: COLLEAGUE, mailAccountId: 'box-owner' });
  assert.equal(r.ok, false);
  assert.equal(smtpCalls.length, 0);
});

test('when the mail server refuses, nothing is recorded as sent and the person is told why', async () => {
  reset();
  smtpFail = 'smtp.x.com refused at password: 535 5.7.8 Username and Password not accepted';
  const r = await sendFromTriangle({ ...message, userId: OWNER });
  assert.equal(r.ok, false);
  assert.equal(r.status, 502);
  assert.match(r.error, /^Not sent\. /);
  assert.match(r.error, /535/);
  assert.equal(logged.length, 0, 'no Sent record');
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0].kind, 'truth');
  assert.deepEqual(refusals[0].details, { mailbox: 'owner@x.com', to: message.to });
});

test('a bad address, empty subject or empty body never reaches the server', async () => {
  reset();
  for (const bad of [
    { to: 'Oliver <oliver@g2.com>' },
    { subject: '   ' },
    { body: ' ' },
  ]) {
    const r = await sendFromTriangle({ ...message, ...bad, userId: OWNER });
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.equal(r.status, 400);
  }
  assert.equal(smtpCalls.length, 0);
});

test('sendableMailboxFor tells the Today page whose button to show', async () => {
  reset();
  assert.deepEqual(await sendableMailboxFor(ORG, OWNER), { id: 'box-owner', emailAddress: 'owner@x.com' });
  assert.equal(await sendableMailboxFor(ORG, COLLEAGUE), null);
});

test('an approved profile: builder runs, SMTP gets the file, the record names the filename', async () => {
  reset();
  const r = await sendFromTriangle({
    ...message,
    userId: OWNER,
    attachPack: true,
    putForwardAssignmentId: PACK_CASE,
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.attachedFilename, 'ts-aabbccdd-profile.pdf');
  assert.equal(smtpCalls.length, 1);
  assert.equal(smtpCalls[0].mail.attachments.length, 1);
  assert.equal(smtpCalls[0].mail.attachments[0].filename, 'ts-aabbccdd-profile.pdf');
  assert.equal(smtpCalls[0].mail.attachments[0].contentType, 'application/pdf');
  assert.match(logged[0].note, /ts-aabbccdd-profile\.pdf/);
});

test('the version that goes out is the version that was approved', async () => {
  reset();
  approvedPacks[PACK_CASE].intent = 'full_cv';
  approvedPacks[PACK_CASE].filename = 'matej-pavlovic-cv.pdf';
  const r = await sendFromTriangle({
    ...message,
    userId: OWNER,
    attachPack: true,
    putForwardAssignmentId: PACK_CASE,
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(
    r.attachedFilename,
    'matej-pavlovic-cv.pdf',
    'a case approved as a full CV must not silently attach the anonymised one',
  );
});

test('a tick with no approved pack behind it sends nothing and is a refusal', async () => {
  reset();
  const r = await sendFromTriangle({
    ...message,
    userId: OWNER,
    attachPack: true,
    putForwardAssignmentId: '00000000-0000-4000-8000-000000000000',
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
  assert.match(r.error, /Nobody has approved/i);
  assert.equal(smtpCalls.length, 0, 'not even the words go out');
  assert.equal(logged.length, 0);
  assert.equal(refusals.length, 1, 'a blocked attach is in the ledger');
  assert.equal(refusals[0].kind, 'boundary');
});

test('a tick with no case id at all is refused before anything is built', async () => {
  reset();
  const r = await sendFromTriangle({ ...message, userId: OWNER, attachPack: true });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(r.error, /approve/i);
  assert.equal(smtpCalls.length, 0);
  assert.equal(logged.length, 0);
});

test('an approval given on another case does not travel to this one', async () => {
  reset();
  const r = await sendFromTriangle({
    ...message,
    userId: OWNER,
    attachPack: true,
    putForwardAssignmentId: OTHER_CASE_PACK,
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
  assert.match(r.error, /different case/i);
  assert.equal(smtpCalls.length, 0);
});

test('a missing profile is a 404 and nothing is sent', async () => {
  reset();
  approvedPacks[PACK_CASE].workerId = 'missing';
  const r = await sendFromTriangle({
    ...message,
    userId: OWNER,
    attachPack: true,
    putForwardAssignmentId: PACK_CASE,
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
  assert.equal(smtpCalls.length, 0);
});

test('no attach asked for, no attachment and no gate call', async () => {
  reset();
  const r = await sendFromTriangle({ ...message, userId: OWNER });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.attachedFilename, null);
  assert.equal(smtpCalls[0].mail.attachments.length, 0);
});

// ── the record keeps working on a database without migration 049 ────────────
test('logContactAttempt writes sent_via / mail_account_id / Message-ID only when a Triangle send says so', () => {
  const src = read('src/lib/data/contact-log.ts');
  assert.match(src, /sentFromTriangle\?: \{ mailAccountId: string; rfc822Id: string \} \| null/);
  assert.match(src, /\.\.\.\(params\.sentFromTriangle\s*\?\s*\{\s*sent_via: "triangle"/);
  assert.match(src, /outbound_rfc822_id: params\.sentFromTriangle\.rfc822Id/);
});

// ── the route is human-only and the UI is where the policy says ─────────────
test('/api/mail/send refuses machines and demo before reading the body', () => {
  const src = read('src/app/api/mail/send/route.ts');
  const guard = src.indexOf('refuseUnlessHuman(access, "canWrite"');
  const body = src.indexOf('bodySchema.safeParse');
  assert.ok(guard > 0 && body > guard, 'guard before body');
  assert.match(src, /sendFromTriangle\(/);
  assert.doesNotMatch(src, /agentInstanceId|machine_credentials/);
  assert.match(src, /attachPack: z\.boolean\(\)\.optional\(\)/);
  assert.match(src, /putForwardAssignmentId: z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/);
  assert.match(src, /attachedFilename: result\.attachedFilename/);
  // The old pair let a browser name any worker and get a profile built for
  // it. Both are gone; the case id is what the approval is read from.
  assert.doesNotMatch(src, /attachAnonymisedCv/);
  assert.doesNotMatch(src, /workerId: z\.string\(\)/);
});

test('nothing but the human route reaches the SMTP transport', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    }
  };
  walk(path.resolve(root, 'src'));
  const importers = files.filter(
    (f) => /from ["']@\/lib\/mail\/smtp-send["']/.test(fs.readFileSync(f, 'utf8')) && !f.endsWith('smtp-send.ts'),
  );
  assert.deepEqual(
    importers.map((f) => path.relative(root, f)).sort(),
    ['src/lib/data/mail-send.ts'],
    'only mail-send.ts talks to SMTP',
  );
  const callers = files.filter(
    (f) => /sendFromTriangle\(/.test(fs.readFileSync(f, 'utf8')) && !f.endsWith('mail-send.ts'),
  );
  assert.deepEqual(callers.map((f) => path.relative(root, f)).sort(), ['src/app/api/mail/send/route.ts']);
});

test('Today card: Send from Triangle only with a sender; Open mail stays; review shows To/From/Subject and the text', () => {
  const screen = read('src/components/modules/today-screen.tsx');
  assert.match(screen, /<SendFromTriangleButton/);
  assert.match(screen, /<SendFromTriangleReview/);
  assert.match(screen, /Open mail/);
  assert.match(screen, /sendableMailboxFor|sender=\{sender\}/);
  const page = read('src/app/(app)/decisions/page.tsx');
  assert.match(page, /sendableMailboxFor\(org, session\.userId\)/);
  const comp = read('src/components/modules/send-from-triangle.tsx');
  assert.match(comp, /if \(!sender\) return null;/);
  assert.match(comp, /Send now/);
  assert.match(comp, /nothing is\s+recorded as sent/);
  assert.match(comp, /draft: target\.draft/);
  assert.match(comp, /attachPack: attach && canAttach/);
  assert.match(comp, /putForwardAssignmentId/);
  assert.match(comp, /packet-worker/);
});

// ── the tick is the last step of a decision, not the decision ──────────────
test('the attach starts off and exists only for a pack somebody approved', () => {
  const comp = read('src/components/modules/send-from-triangle.tsx');
  // Picking a person used to switch the attach on for you.
  assert.match(comp, /const \[attach, setAttach\] = useState\(false\)/);
  assert.doesNotMatch(comp, /setAttach\(true\)/);
  assert.match(comp, /const canAttach = Boolean\(pack && mayAttachPack\(pack\.approval\)\)/);
  // No checkbox at all until it is approved; an unapproved state says why.
  const row = comp.slice(comp.indexOf('function AttachRow'));
  assert.match(row, /if \(!mayAttachPack\(pack\.approval\)\)/);
  assert.match(row, /PACK_NOT_APPROVED/);
  assert.match(row, /PACK_SUPERSEDED/);
  const tickAt = row.indexOf('type="checkbox"');
  const guardAt = row.indexOf('if (!mayAttachPack');
  assert.ok(guardAt > 0 && tickAt > guardAt, 'the refusal branch returns before the tick');
});

test('the server re-reads the approval; the browser boolean is never enough', () => {
  const src = read('src/lib/data/mail-send.ts');
  assert.match(src, /approvedPackForSend\(/);
  assert.match(src, /putForwardAssignmentId/);
  // The gate runs before anything is built and before SMTP is touched.
  const gate = src.indexOf('approvedPackForSend(');
  const build = src.indexOf('buildPackAttachment(');
  const smtp = src.indexOf('sendViaMailbox(');
  assert.ok(gate > 0 && build > gate && smtp > build, 'gate, then build, then send');
  assert.match(src, /intent: approved\.intent/);
  assert.doesNotMatch(src, /includeIdentity: false/);
});

test('approval is recorded with who and when, and a refusal needs a reason', () => {
  const cases = read('src/lib/data/put-forward-cases.ts');
  assert.match(cases, /review_outcome:/);
  assert.match(cases, /reviewed_by: params\.userId/);
  assert.match(cases, /reviewed_at: new Date\(\)\.toISOString\(\)/);
  assert.match(cases, /decision === "not_used" && note\.length < 3/);
  const route = read('src/app/api/put-forward/route.ts');
  assert.match(route, /refuseUnlessHuman\(\s*access,\s*"canWrite"/);
  assert.match(route, /refuseUnlessHuman\(\s*access,\s*"canSeeWorkers"/);
  const guard = route.indexOf('refuseUnlessHuman');
  const body = route.indexOf('patchSchema.safeParse');
  assert.ok(guard > 0 && body > guard, 'machines are refused before the body is read');
});

test('mailbox switch: owner only, off by default, PATCH refuses machines', () => {
  const route = read('src/app/api/job-intake/accounts/route.ts');
  assert.match(route, /export async function PATCH/);
  assert.match(route, /refuseUnlessHuman\(access, "canWrite", "change who may send from a mailbox"\)/);
  assert.match(route, /owner_user_id !== access\.userId/);
  assert.match(route, /canSend: Boolean\(a\.can_send\)/);
  const panel = read('src/components/modules/mailbox-settings-panel.tsx');
  assert.match(panel, /Let me send from Triangle/);
  assert.match(panel, /a\.isMine \?/);
});

test('migration 049 is idempotent, opt-in by default, and changes no rows', () => {
  const sql = read('supabase/migrations/049_send_from_triangle.sql');
  assert.match(sql, /add column if not exists can_send boolean not null default false/);
  assert.match(sql, /add column if not exists sent_via text/);
  assert.match(sql, /add column if not exists outbound_rfc822_id text/);
  assert.match(sql, /notify pgrst, 'reload schema'/);
  assert.doesNotMatch(sql, /^\s*update /mi);
  assert.doesNotMatch(sql, /drop table|delete from/i);
});

test('policy: SENT_MESSAGES_RECORDED stays false; the freeze on autonomous outbound holds', () => {
  const src = read('src/lib/data/communication-policy.ts');
  assert.match(src, /export const SENT_MESSAGES_RECORDED = false;/);
  assert.match(src, /freeze on autonomous outbound holds/);
});

test('ROADMAP_EXECUTION records DEV-013 as done in code, with the live steps still owed', () => {
  const roadmap = read('ROADMAP_EXECUTION.md');
  const slice = roadmap.slice(roadmap.indexOf('### DEV-013'), roadmap.indexOf('### DEV-014'));
  assert.match(slice, /`DONE`/);
  assert.match(slice, /049_send_from_triangle\.sql/);
  assert.match(slice, /signed-in check/i);
});

run();
