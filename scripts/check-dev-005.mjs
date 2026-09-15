// DEV-005 offline checks: forwarded-mail contact, recommended-card matching.
// Isolated fixtures. No env, no live database, no messages sent.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = process.cwd();

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

const email = moduleLoader()('src/lib/job-intake/contact-email.ts');
const { pickRecommendedCompany } = moduleLoader()('src/lib/data/mission-shared.ts');

const mailbox = 'nikola.kralj@triangle-services.com';

test('forwarded Gmail header yields the recruiter, not the mailbox', () => {
  const body = [
    '---------- Forwarded message ---------',
    'From: Veronika Igić <v.igic@computerfutures.at>',
    'Date: Mon, 15 Sep 2026',
    'Subject: SPS engineer Austria',
    'To: ' + mailbox,
    '',
    'Hi, looking for an SPS engineer in Austria.',
  ].join('\n');
  const got = email.resolveRecruiterContact({
    extractedEmail: mailbox,
    extractedName: 'Triangle',
    senderEmail: mailbox,
    senderName: 'Nikola',
    recipientEmail: mailbox,
    bodyText: body,
  });
  assert.equal(got.email, 'v.igic@computerfutures.at');
  assert.match(got.name, /Veronika/i);
});

test('Outlook mailto header yields the recruiter', () => {
  const body = [
    '-----Original Message-----',
    'From: Veronika Igić [mailto:v.igic@computerfutures.at]',
    'Sent: Monday, 15 September 2026 10:00',
    'To: Nikola',
    'Subject: Role',
  ].join('\n');
  const got = email.resolveRecruiterContact({
    senderEmail: mailbox,
    recipientEmail: 'ralph.loesekamm@triangle-services.com',
    bodyText: body,
  });
  assert.equal(got.email, 'v.igic@computerfutures.at');
});

test('German Von: header yields the recruiter', () => {
  const got = email.resolveRecruiterContact({
    senderEmail: mailbox,
    recipientEmail: mailbox,
    bodyText: 'Von: Anna Schmidt <anna@g2recruitment.com>\nGesendet: Montag',
  });
  assert.equal(got.email, 'anna@g2recruitment.com');
  assert.equal(got.name, 'Anna Schmidt');
});

test('direct agency mail keeps the envelope sender', () => {
  const got = email.resolveRecruiterContact({
    extractedEmail: 'oliver@g2recruitment.com',
    extractedName: 'Oliver Hall',
    senderEmail: 'oliver@g2recruitment.com',
    senderName: 'Oliver Hall',
    recipientEmail: mailbox,
    bodyText: 'Hi, we have a PLC role in Germany.',
  });
  assert.equal(got.email, 'oliver@g2recruitment.com');
  assert.equal(got.name, 'Oliver Hall');
});

test('internal envelope and no inner From leaves contact empty', () => {
  const got = email.resolveRecruiterContact({
    extractedEmail: mailbox,
    senderEmail: mailbox,
    recipientEmail: mailbox,
    bodyText: 'Please look at this role.',
  });
  assert.equal(got.email, null);
});

test('isInternalMailbox treats own domain and receiving mailbox as internal', () => {
  assert.equal(email.isInternalMailbox(mailbox, mailbox), true);
  assert.equal(email.isInternalMailbox('ralph.loesekamm@triangle-services.com', mailbox), true);
  assert.equal(email.isInternalMailbox('v.igic@computerfutures.at', mailbox), false);
  assert.equal(email.isInternalMailbox('oliver@g2recruitment.com'), false);
});

function company(overrides) {
  return {
    companyId: 'co-1',
    name: 'STRABAG',
    city: null,
    country: 'Austria',
    website: null,
    role: null,
    why: '',
    state: 'reachable',
    notForUs: null,
    missing: null,
    deadReason: null,
    person: { contactId: 'p-1', name: 'First Reachable', title: null },
    channel: { kind: 'phone', value: '+43 1 000', whose: 'person' },
    words: 'hello',
    project: null,
    sources: [],
    agentFound: false,
    verified: false,
    alsoIn: [],
    lastAttempt: null,
    reachChecked: true,
    reachNote: null,
    foundAt: '2026-09-15',
    updatedAt: '2026-09-15',
    ...overrides,
  };
}

test('recommended card matches the named company, not the first reachable', () => {
  const first = company({ companyId: 'strabag', name: 'STRABAG' });
  const named = company({
    companyId: 'goldbeck',
    name: 'GOLDBECK GmbH',
    person: { contactId: 'p-2', name: 'Anna Müller', title: 'Einkauf' },
    channel: { kind: 'phone', value: '+49 1 234', whose: 'person' },
  });
  const picked = pickRecommendedCompany(
    'Call Anna Müller at GOLDBECK first — published buyer line.',
    [first, named],
  );
  assert.equal(picked.companyId, 'goldbeck');
  assert.equal(picked.person.name, 'Anna Müller');
});

test('recommended card matches Köster by folded name', () => {
  const first = company({ companyId: 'andritz', name: 'ANDRITZ' });
  const koster = company({
    companyId: 'koster',
    name: 'KÖSTER Bau',
    person: { contactId: 'p-k', name: 'Einkauf Osnabrück', title: null },
    channel: { kind: 'phone', value: '+49 541 998-1400', whose: 'department' },
  });
  const picked = pickRecommendedCompany('Start with Köster — department phone is published.', [
    first,
    koster,
  ]);
  assert.equal(picked.companyId, 'koster');
});

test('falls back to first untried reachable only when nothing is named', () => {
  const tried = company({
    companyId: 'tried',
    name: 'Tried Co',
    lastAttempt: { at: '2026-09-14', actionId: 'a1', outcome: 'sent' },
  });
  const fresh = company({ companyId: 'fresh', name: 'Fresh Co' });
  const picked = pickRecommendedCompany('Nothing is ready to call yet.', [tried, fresh]);
  assert.equal(picked.companyId, 'fresh');
});

test('named company wins even when it is not the first untried reachable', () => {
  const fresh = company({ companyId: 'fresh', name: 'Fresh Co' });
  const named = company({
    companyId: 'goldbeck',
    name: 'GOLDBECK',
    lastAttempt: { at: '2026-09-14', actionId: 'a1', outcome: 'sent' },
    person: { contactId: 'p-2', name: 'Peter Gold', title: null },
  });
  const picked = pickRecommendedCompany('Stay with GOLDBECK.', [fresh, named]);
  assert.equal(picked.companyId, 'goldbeck');
});

test('ruled-out companies are never the recommended action', () => {
  const dead = company({
    companyId: 'koster',
    name: 'KÖSTER Bau',
    notForUs: { reason: 'unsourced number', at: '2026-09-15' },
  });
  const live = company({ companyId: 'goldbeck', name: 'GOLDBECK' });
  const picked = pickRecommendedCompany('Call Köster.', [dead, live]);
  assert.equal(picked.companyId, 'goldbeck');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log('PASS ' + name);
  } catch (e) {
    failed += 1;
    console.error('FAIL ' + name + '\n' + e.stack);
  }
}
console.log(
  '\n' + (tests.length - failed) + '/' + tests.length + ' DEV-005 checks passed. No live database or messages used.',
);
if (failed) process.exitCode = 1;
