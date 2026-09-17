// DEV-019: mailbox-observed sent / replied. Isolated fixtures — no env, no
// live database, no network, nothing sent.
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
      if (name.startsWith('.')) {
        const resolved = path.resolve(path.dirname(full), name);
        if (fs.existsSync(resolved + '.ts')) return load(path.relative(root, resolved + '.ts'));
        if (fs.existsSync(resolved + '.tsx')) return load(path.relative(root, resolved + '.tsx'));
        if (fs.existsSync(resolved)) return load(path.relative(root, resolved));
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

const load = moduleLoader();
const {
  observationFor,
  observationsFrom,
  normalizeMessageId,
  parseMessageIds,
  normalizeEmail,
  stripSubject,
  SAME_SEND_WINDOW_MS,
} = load('src/lib/mail/observe-policy.ts');
const { pickSentMailboxPath, headerValue } = load('src/lib/job-intake/mail-source.ts');

const OURS = ['owner@x.com'];
const OLIVER = {
  leadId: 'lead-1',
  email: 'oliver@g2.com',
  outboundRfc822Ids: [],
  threadIds: [],
  latest: 'none',
};

function msg(partial) {
  return {
    messageId: '<a@x.com>',
    inReplyTo: null,
    references: [],
    from: 'owner@x.com',
    to: 'oliver@g2.com',
    subject: 'Re: PLC engineer',
    sentAt: '2026-09-10T10:00:00.000Z',
    folder: 'sent',
    threadId: null,
    ...partial,
  };
}

test('normalize Message-ID, email, subject; parse References', () => {
  assert.equal(normalizeMessageId('<AbC@Host>'), '<abc@host>');
  assert.equal(normalizeMessageId('abc@host'), '<abc@host>');
  assert.equal(normalizeMessageId(''), null);
  assert.equal(normalizeEmail('Oliver Hall <Oliver@G2.com>'), 'oliver@g2.com');
  assert.equal(stripSubject('Re: Fw: PLC — USA'), 'plc usa');
  assert.deepEqual(parseMessageIds('<a@x.com> <b@y.com>'), ['<a@x.com>', '<b@y.com>']);
});

test('Sent To: a person we are working is a send', () => {
  const obs = observationFor(msg({ folder: 'sent', from: 'owner@x.com' }), [OLIVER], OURS, new Set());
  assert.equal(obs?.kind, 'sent');
  assert.equal(obs?.target.leadId, 'lead-1');
});

test('already recorded Message-ID is skipped, including a DEV-013 send', () => {
  const id = '<1.2@x.com>';
  const m = msg({ messageId: id });
  assert.equal(observationFor(m, [OLIVER], OURS, new Set(['<1.2@x.com>'])), null);
  const withId = { ...OLIVER, outboundRfc822Ids: [id], latest: 'sent' };
  assert.equal(observationFor(m, [withId], OURS, new Set()), null);
});

test('Sent to ourselves or to an unknown address is skipped', () => {
  assert.equal(observationFor(msg({ to: 'owner@x.com' }), [OLIVER], OURS, new Set()), null);
  assert.equal(observationFor(msg({ to: 'stranger@x.com' }), [OLIVER], OURS, new Set()), null);
});

test('reply In-Reply-To / References our outbound Message-ID', () => {
  const target = { ...OLIVER, outboundRfc822Ids: ['<out@x.com>'], latest: 'sent', lastSubject: 'PLC' };
  const reply = msg({
    folder: 'inbox',
    from: 'oliver@g2.com',
    to: 'owner@x.com',
    messageId: '<r@g2.com>',
    inReplyTo: '<out@x.com>',
  });
  assert.equal(observationFor(reply, [target], OURS, new Set())?.kind, 'replied');
  const viaRefs = { ...reply, inReplyTo: null, references: ['<out@x.com> <z@z.com>'] };
  assert.equal(observationFor(viaRefs, [target], OURS, new Set())?.kind, 'replied');
});

test('Gmail thread id matches a reply', () => {
  const target = { ...OLIVER, threadIds: ['gm-99'], latest: 'sent', outboundRfc822Ids: ['<out@x.com>'] };
  const reply = msg({
    folder: 'inbox',
    from: 'oliver@g2.com',
    to: 'owner@x.com',
    messageId: '<r@g2.com>',
    threadId: 'gm-99',
  });
  assert.equal(observationFor(reply, [target], OURS, new Set())?.kind, 'replied');
});

test('subject + sender after a send is a reply; a new job from the same recruiter is not', () => {
  const sent = {
    ...OLIVER,
    latest: 'sent',
    lastSubject: 'PLC engineer — USA',
    outboundRfc822Ids: ['<out@x.com>'],
  };
  const reply = msg({
    folder: 'inbox',
    from: 'oliver@g2.com',
    to: 'owner@x.com',
    messageId: '<r@g2.com>',
    subject: 'Re: PLC engineer — USA',
  });
  assert.equal(observationFor(reply, [sent], OURS, new Set())?.kind, 'replied');

  const newJob = msg({
    folder: 'inbox',
    from: 'oliver@g2.com',
    to: 'owner@x.com',
    messageId: '<job2@g2.com>',
    subject: 'Commissioning role — Rotterdam',
  });
  assert.equal(observationFor(newJob, [sent], OURS, new Set()), null, 'different subject is not a reply');

  const neverSent = { ...OLIVER, latest: 'none', lastSubject: null };
  assert.equal(
    observationFor(reply, [neverSent], OURS, new Set()),
    null,
    'subject match without a prior send is not a reply',
  );
});

test('inbox mail from us is treated as sent', () => {
  const obs = observationFor(
    msg({ folder: 'inbox', from: 'owner@x.com', to: 'oliver@g2.com' }),
    [OLIVER],
    OURS,
    new Set(),
  );
  assert.equal(obs?.kind, 'sent');
});

test('same subject close in time is the send already logged without a Message-ID', () => {
  const logged = {
    ...OLIVER,
    latest: 'sent',
    lastSubject: 'Re: PLC engineer',
    lastAt: '2026-09-10T10:00:00.000Z',
    outboundRfc822Ids: [],
  };
  assert.equal(observationFor(msg({ sentAt: '2026-09-10T10:05:00.000Z' }), [logged], OURS, new Set()), null);
  const later = msg({
    messageId: '<follow@x.com>',
    sentAt: new Date(Date.parse('2026-09-10T10:00:00.000Z') + SAME_SEND_WINDOW_MS + 60_000).toISOString(),
  });
  assert.equal(observationFor(later, [logged], OURS, new Set())?.kind, 'sent');
});

test('a send after they replied is recorded; another reply is not', () => {
  const reached = { ...OLIVER, latest: 'reached', lastSubject: 'PLC', outboundRfc822Ids: ['<out@x.com>'] };
  assert.equal(
    observationFor(msg({ messageId: '<new@x.com>', subject: 'Next step' }), [reached], OURS, new Set())?.kind,
    'sent',
  );
  const reply = msg({
    folder: 'inbox',
    from: 'oliver@g2.com',
    to: 'owner@x.com',
    messageId: '<r2@g2.com>',
    inReplyTo: '<out@x.com>',
  });
  assert.equal(observationFor(reply, [reached], OURS, new Set()), null);
});

test('one sync: Sent then inbox reply sees the Message-ID we just observed', () => {
  const hits = observationsFrom(
    [
      msg({
        folder: 'inbox',
        from: 'oliver@g2.com',
        to: 'owner@x.com',
        messageId: '<r@g2.com>',
        inReplyTo: '<a@x.com>',
        sentAt: '2026-09-10T11:00:00.000Z',
      }),
      msg({ folder: 'sent', messageId: '<a@x.com>', sentAt: '2026-09-10T10:00:00.000Z' }),
    ],
    [{ ...OLIVER }],
    OURS,
    new Set(),
  );
  assert.equal(hits.length, 2);
  assert.equal(hits[0].kind, 'sent');
  assert.equal(hits[1].kind, 'replied');
});

test('To: several addresses still matches the target', () => {
  const obs = observationFor(
    msg({ to: 'assistant@g2.com, Oliver Hall <oliver@g2.com>' }),
    [OLIVER],
    OURS,
    new Set(),
  );
  assert.equal(obs?.kind, 'sent');
});

test('Sent folder: SPECIAL-USE wins, then Gmail / Outlook names', () => {
  assert.equal(
    pickSentMailboxPath([
      { path: 'INBOX', specialUse: '\\Inbox' },
      { path: '[Gmail]/Sent Mail', name: 'Sent Mail', specialUse: '\\Sent' },
    ]),
    '[Gmail]/Sent Mail',
  );
  assert.equal(
    pickSentMailboxPath([
      { path: 'INBOX' },
      { path: 'Sent Items', name: 'Sent Items' },
    ]),
    'Sent Items',
  );
  assert.equal(pickSentMailboxPath([{ path: 'INBOX' }]), null);
});

test('headerValue unfolds wrapped IMAP header lines', () => {
  const buf = Buffer.from('In-Reply-To: <a@x.com>\r\nReferences: <a@x.com>\r\n <b@y.com>\r\n');
  assert.equal(headerValue(buf, 'in-reply-to'), '<a@x.com>');
  assert.match(headerValue(buf, 'references'), /<a@x.com>/);
  assert.match(headerValue(buf, 'references'), /<b@y.com>/);
});

test('observe fetch is envelopes only: INBOX even with a watch label, no body download, no LLM', () => {
  const src = read('src/lib/job-intake/mail-source.ts');
  const observe = src.slice(src.indexOf('async fetchForObserve'), src.indexOf('private async fetchFolderEnvelopes'));
  assert.match(observe, /INBOX/);
  assert.doesNotMatch(observe, /watchLabel/);
  assert.doesNotMatch(observe, /downloadPart/);
  assert.doesNotMatch(observe, /classifyAndExtract/);
  const folder = src.slice(src.indexOf('private async fetchFolderEnvelopes'), src.indexOf('private async resolveMailbox'));
  assert.match(folder, /threadId: true/);
  assert.match(folder, /in-reply-to/);
  assert.doesNotMatch(folder, /downloadPart/);
  assert.doesNotMatch(folder, /bodyStructure/);
});

test('ingest classifies the watch folder, then observes; Sent is never classified', () => {
  const ingest = read('src/lib/job-intake/ingest.ts');
  assert.match(ingest, /classifyAndExtract/);
  assert.match(ingest, /observeAccount/);
  assert.ok(ingest.indexOf('classifyAndExtract') < ingest.indexOf('observeAccount'));
  const observe = read('src/lib/data/mailbox-observe.ts');
  assert.doesNotMatch(observe, /classifyAndExtract/);
  assert.match(observe, /fetchForObserve/);
  assert.match(observe, /Observed in the Sent folder/);
  assert.match(observe, /Reply observed in the inbox/);
  assert.match(observe, /observedFromMailbox/);
});

test('logContactAttempt records observed mail as outside, Message-ID, occurredAt for the follow-up', () => {
  const src = read('src/lib/data/contact-log.ts');
  assert.match(src, /observedFromMailbox\?:/);
  assert.match(src, /sent_via: "outside"/);
  assert.match(src, /occurredAt\?: string \| null/);
  assert.match(src, /followUpDate\(FOLLOW_UP_AFTER_DAYS, /);
  assert.match(src, /occurred_at: occurredIso/);
  assert.match(src, /existingByRfc822/);
});

test('sync still never sends; Today still has no Sent / They replied buttons', () => {
  const sync = read('src/app/api/job-intake/sync/route.ts');
  assert.match(sync, /Never sends/);
  assert.doesNotMatch(sync, /smtp-send|sendFromTriangle|sendViaMailbox/);
  const emailActions = read('src/components/modules/today-email-actions.tsx');
  assert.doesNotMatch(emailActions, />Sent</);
  assert.doesNotMatch(emailActions, />They replied</);
  assert.match(emailActions, /Ask Bob/);
  assert.match(emailActions, /observed from the connected mailbox/);
});

test('migration 050 is idempotent, adds headers/folder/thread, changes no rows', () => {
  const sql = read('supabase/migrations/050_mailbox_observe.sql');
  assert.match(sql, /add column if not exists in_reply_to text/);
  assert.match(sql, /add column if not exists references_header text/);
  assert.match(sql, /add column if not exists folder text not null default 'inbox'/);
  assert.match(sql, /add column if not exists outbound_thread_id text/);
  assert.match(sql, /notify pgrst, 'reload schema'/);
  assert.doesNotMatch(sql, /^\s*update /mi);
  assert.doesNotMatch(sql, /drop table|delete from/i);
});

test('policy: SENT_MESSAGES_RECORDED stays false; autonomous outbound still frozen', () => {
  const src = read('src/lib/data/communication-policy.ts');
  assert.match(src, /export const SENT_MESSAGES_RECORDED = false;/);
  assert.match(src, /freeze on autonomous outbound holds/);
});

test('ROADMAP_EXECUTION records DEV-019', () => {
  const roadmap = read('ROADMAP_EXECUTION.md');
  assert.match(roadmap, /### DEV-019/);
  const slice = roadmap.slice(roadmap.indexOf('### DEV-019'), roadmap.indexOf('### DEV-014'));
  assert.match(slice, /mailbox-observed|mailbox observed/i);
  assert.match(slice, /050_mailbox_observe\.sql/);
});

run();
