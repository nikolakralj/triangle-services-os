// P1 offline checks: frequent mail read, cursor, idempotent wording, forwards.
// No mailbox, no database, no secrets, nothing sent.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = process.cwd();

function moduleLoader() {
  const cache = new Map();
  return function load(file) {
    const full = path.resolve(root, file);
    if (cache.has(full)) return cache.get(full);
    const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const mod = { exports: {} };
    cache.set(full, mod.exports);
    const localRequire = (name) => {
      if (name === 'server-only') return {};
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

const plan = moduleLoader()('src/lib/job-intake/sync-plan.ts');
const status = moduleLoader()('src/lib/job-intake/sync-status.ts');
const email = moduleLoader()('src/lib/job-intake/contact-email.ts');

const read = (file) => fs.readFileSync(path.resolve(root, file), 'utf8');
const route = read('src/app/api/job-intake/sync/route.ts');
const ingest = read('src/lib/job-intake/ingest.ts');
const record = read('src/lib/data/job-intake.ts');
const vercel = JSON.parse(read('vercel.json'));
const workflow = read('.github/workflows/mail-sync.yml');
const settings = read('src/app/(app)/settings/page.tsx');

function iso(day) {
  return `2026-09-${String(day).padStart(2, '0')}T08:00:00.000Z`;
}

test('fresh mail is taken while an older gap is still draining', () => {
  const older = [];
  for (let day = 8; day <= 20; day += 1) {
    older.push({ id: `<d${day}@example>`, sentAt: iso(day) });
  }
  const fresh = { id: '<fresh@example>', sentAt: '2026-09-29T11:00:00.000Z' };
  const got = plan.planMailboxSync({
    now: '2026-09-29T11:10:00.000Z',
    cursor: iso(8),
    envelopes: [...older, fresh],
    freshLimit: 8,
    backlogLimit: 8,
  });
  assert.equal(got.ids[0], fresh.id);
  assert.equal(got.truncated, true);
  assert.equal(got.advanceTo, iso(15));
  assert.ok(got.ids.includes('<d8@example>'));
  assert.equal(got.ids.includes('<d20@example>'), false);
});

test('a gap that fits advances the cursor to now', () => {
  const got = plan.planMailboxSync({
    now: '2026-09-29T11:10:00.000Z',
    cursor: '2026-09-29T10:00:00.000Z',
    envelopes: [
      { id: '<a@example>', sentAt: '2026-09-29T10:30:00.000Z' },
      { id: '<b@example>', sentAt: '2026-09-29T11:05:00.000Z' },
    ],
  });
  assert.equal(got.truncated, false);
  assert.equal(got.advanceTo, '2026-09-29T11:10:00.000Z');
  assert.deepEqual(got.ids, ['<b@example>', '<a@example>']);
});

test('a burst of new mail is not skipped when it exceeds the fresh budget', () => {
  const envelopes = [];
  for (let i = 0; i < 10; i += 1) {
    envelopes.push({
      id: `<f${i}@example>`,
      sentAt: `2026-09-29T11:${String(i).padStart(2, '0')}:00.000Z`,
    });
  }
  const got = plan.planMailboxSync({
    now: '2026-09-29T11:10:00.000Z',
    cursor: '2026-09-29T10:00:00.000Z',
    envelopes,
    freshLimit: 8,
    backlogLimit: 8,
  });
  assert.equal(got.truncated, false);
  assert.equal(got.ids.length, 10);
  assert.equal(got.advanceTo, '2026-09-29T11:10:00.000Z');
});

test('a message error does not move the cursor', () => {
  assert.equal(
    plan.nextReadThrough({
      cursor: '2026-09-08T06:00:00.000Z',
      plannedAdvance: '2026-09-29T11:10:00.000Z',
      hadMessageErrors: true,
    }),
    '2026-09-08T06:00:00.000Z',
  );
});

test('diagnostics name the last success and a failure', () => {
  const format = (iso) => iso;
  assert.match(
    status.mailboxReadSentence({
      emailAddress: 'nikola.kralj86@gmail.com',
      readThrough: '2026-09-29T11:10:00.000Z',
      lastAttempt: '2026-09-29T11:10:05.000Z',
      failure: null,
      format,
    }),
    /nikola\.kralj86@gmail\.com — Last successful read 2026-09-29T11:10:05\.000Z\./,
  );
  assert.match(
    status.mailboxReadSentence({
      readThrough: '2026-09-08T06:00:00.000Z',
      lastAttempt: '2026-09-29T11:10:00.000Z',
      failure: 'Authentication failed.',
      format,
    }),
    /Last check failed: Authentication failed\. Last successful read 2026-09-08T06:00:00\.000Z\./,
  );
  assert.match(
    status.mailboxReadSentence({
      readThrough: '2026-09-10T08:00:00.000Z',
      lastAttempt: '2026-09-29T11:10:00.000Z',
      failure: null,
      format,
    }),
    /Still reading older mail, through 2026-09-10T08:00:00\.000Z\./,
  );
  assert.match(
    status.mailboxReadSentence({
      readThrough: null,
      lastAttempt: '2026-09-29T11:10:00.000Z',
      failure: null,
      format,
    }),
    /No successful read yet\./,
  );
});

test('a colleague forward names the original sender', () => {
  const got = email.resolveRecruiterContact({
    extractedEmail: 'ralph.example@gmail.com',
    extractedName: 'Ralph',
    senderEmail: 'ralph.example@gmail.com',
    senderName: 'Ralph',
    recipientEmail: 'nikola.kralj86@gmail.com',
    subject: 'Fwd: Commissioning engineers Cologne',
    bodyText: [
      '---------- Forwarded message ---------',
      'From: Plant Manager <plant@example-dc.de>',
      'We need six commissioning engineers near Cologne.',
    ].join('\n'),
  });
  assert.equal(got.email, 'plant@example-dc.de');
  assert.match(got.name, /Plant Manager/);
});

test('a quoted reply is not treated as a colleague forward', () => {
  const got = email.resolveRecruiterContact({
    extractedEmail: 'oliver@g2recruitment.com',
    senderEmail: 'oliver@g2recruitment.com',
    recipientEmail: 'nikola.kralj86@gmail.com',
    subject: 'Re: PLC role',
    bodyText: 'From: Plant Manager <plant@example-dc.de>\nThanks.',
  });
  assert.equal(got.email, 'oliver@g2recruitment.com');
});

test('the scheduled route accepts GET and refuses a browser without the secret', () => {
  assert.match(route, /export async function GET/);
  assert.match(route, /status: 401/);
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /scheduled: isCron/);
  const mailCron = vercel.crons.find((job) => job.path === '/api/job-intake/sync');
  assert.equal(mailCron.schedule, '0 6 * * *');
});

test('Hobby stays daily; the ten-minute read is the repository schedule', () => {
  assert.match(workflow, /cron: "\*\/10 \* \* \* \*"/);
  assert.match(workflow, /GET|\/api\/job-intake\/sync/);
  assert.match(workflow, /CRON_SECRET/);
  assert.doesNotMatch(workflow, /\/api\/mail\/send/);
  assert.doesNotMatch(workflow, /sk-|Bearer [A-Za-z0-9+/=]{20,}/);
  assert.match(ingest, /provider", "imap"/);
  assert.match(record, /23505/);
  assert.match(settings, /Mail check/);
  assert.match(settings, /MailSyncStatus/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(err);
  }
}
if (failed > 0) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log(`${tests.length} passed`);
