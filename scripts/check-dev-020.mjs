// DEV-020: personal mailbox vs shared space. Isolated fixtures — no env, no
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
  canViewLead,
  canShareLead,
  isInSharedSpace,
  isPersonalUnshared,
  shouldWakeOnIngest,
} = load('src/lib/mail/mailbox-space.ts');
const { pickSendableMailbox } = load('src/lib/mail/send-policy.ts');

const owner = 'user-a';
const colleague = 'user-b';
const personal = { sharedAt: null, mailboxOwnerUserId: owner };
const shared = { sharedAt: '2026-09-17T12:00:00Z', mailboxOwnerUserId: owner };
const legacy = { sharedAt: undefined, mailboxOwnerUserId: owner };
const unowned = { sharedAt: null, mailboxOwnerUserId: null };

test('personal mail is visible only to the mailbox owner', () => {
  assert.equal(canViewLead(personal, owner), true);
  assert.equal(canViewLead(personal, colleague), false);
});

test('cron and machines do not see personal unshared mail', () => {
  assert.equal(canViewLead(personal, null), false);
  assert.equal(shouldWakeOnIngest(personal), false);
});

test('shared mail is visible to a colleague and to cron', () => {
  assert.equal(isInSharedSpace(shared.sharedAt), true);
  assert.equal(canViewLead(shared, colleague), true);
  assert.equal(canViewLead(shared, null), true);
  assert.equal(canShareLead(shared, owner), false);
});

test('pre-051 rows (sharedAt undefined) read as already shared', () => {
  assert.equal(isInSharedSpace(legacy.sharedAt), true);
  assert.equal(canViewLead(legacy, colleague), true);
  assert.equal(canViewLead(legacy, null), true);
});

test('unowned mailbox is org-visible and may wake Bob', () => {
  assert.equal(canViewLead(unowned, colleague), true);
  assert.equal(canViewLead(unowned, null), true);
  assert.equal(shouldWakeOnIngest(unowned), true);
  assert.equal(canShareLead(unowned, owner), false);
});

test('only the mailbox owner can share an unshared lead', () => {
  assert.equal(canShareLead(personal, owner), true);
  assert.equal(canShareLead(personal, colleague), false);
  assert.equal(isPersonalUnshared(personal, owner), true);
  assert.equal(isPersonalUnshared(personal, colleague), false);
  assert.equal(isPersonalUnshared(shared, owner), false);
});

test('send still requires the owner and can_send; a colleague never sends', () => {
  const accounts = [
    { id: '1', email_address: 'a@example.com', owner_user_id: owner, can_send: true, status: 'active' },
    { id: '2', email_address: 'b@example.com', owner_user_id: colleague, can_send: true, status: 'active' },
  ];
  assert.equal(pickSendableMailbox(accounts, owner)?.id, '1');
  assert.equal(pickSendableMailbox(accounts, colleague)?.id, '2');
  assert.equal(
    pickSendableMailbox(
      [{ id: '1', email_address: 'a@example.com', owner_user_id: owner, can_send: false, status: 'active' }],
      owner,
    ),
    null,
  );
});

test('migration 051 adds shared_at/shared_by, first-apply backfill, notify; no drop', () => {
  const sql = read('supabase/migrations/051_mailbox_space.sql');
  assert.match(sql, /Migration 051/);
  assert.match(sql, /add column if not exists shared_at/);
  assert.match(sql, /add column if not exists shared_by/);
  assert.match(sql, /set shared_at = created_at/);
  assert.match(sql, /not exists \(select 1 from public\.job_leads where shared_at is not null\)/);
  assert.match(sql, /notify pgrst, 'reload schema'/);
  assert.doesNotMatch(sql, /drop table|delete from/i);
});

test('new leads insert shared_at null (personal until Share)', () => {
  const src = read('src/lib/data/job-intake.ts');
  assert.match(src, /insert\(\{ \.\.\.row, shared_at: null \}\)/);
  assert.match(src, /export async function shareJobLead/);
  assert.match(src, /listPersonalInbox/);
  assert.match(src, /viewerUserId/);
});

test('person Sync reads only their mailbox; cron still reads all', () => {
  const sync = read('src/app/api/job-intake/sync/route.ts');
  const ingest = read('src/lib/job-intake/ingest.ts');
  assert.match(sync, /ownerUserId: isCron \? undefined : access\.userId|if \(access\.actor === "human"\) ownerUserId = access\.userId/);
  assert.match(sync, /ingestAllAccounts\(orgId, \{ limit, sinceDays, ownerUserId \}\)/);
  assert.match(ingest, /ownerUserId\?: string/);
  assert.match(ingest, /query\.eq\("owner_user_id", opts\.ownerUserId\)/);
});

test('personal ingest does not wake Bob; share route is human-only', () => {
  const ingest = read('src/lib/job-intake/ingest.ts');
  const share = read('src/app/api/job-intake/leads/[id]/share/route.ts');
  assert.match(ingest, /shouldWakeOnIngest/);
  assert.match(share, /refuseUnlessHuman/);
  assert.match(share, /put mail in the shared space/);
  assert.match(share, /shareJobLead/);
  assert.match(share, /recordClientReplyEvent/);
});

test('Today Your mail + Share; Open mail · Ask Bob · Dismiss stay; no Sent / They replied', () => {
  const today = read('src/components/modules/today-screen.tsx');
  const missions = read('src/components/modules/today-missions.tsx');
  const actions = read('src/components/modules/today-email-actions.tsx');
  const decisions = read('src/app/(app)/decisions/page.tsx');
  assert.match(today, /YourMail/);
  assert.match(today, /yourMail/);
  assert.match(missions, /export function YourMail/);
  assert.match(missions, /ShareLeadButton/);
  assert.match(missions, /KindChip kind="Your mail"/);
  assert.match(decisions, /listPersonalInbox/);
  assert.match(decisions, /listFollowUpsDue\(org, 8, session\.userId\)/);
  assert.match(decisions, /getNextMove\(org, undefined, session\.userId\)/);
  assert.match(actions, /Ask Bob/);
  assert.match(actions, /Dismiss/);
  assert.doesNotMatch(actions, />Sent</);
  assert.doesNotMatch(actions, />They replied</);
  assert.doesNotMatch(missions, />They replied</);
});

test('Job Intake has Mine and Shared; Share button on personal cards', () => {
  const page = read('src/app/(app)/job-intake/page.tsx');
  assert.match(page, /Mine/);
  assert.match(page, /Shared/);
  assert.match(page, /space: MailSpace/);
  assert.match(page, /ShareLeadButton/);
  assert.match(page, /viewerUserId: session\.userId/);
});

test('next-move, follow-ups and lead match take the viewer', () => {
  const next = read('src/lib/data/next-move.ts');
  const follow = read('src/lib/data/follow-ups.ts');
  const match = read('src/lib/data/lead-match.ts');
  assert.match(next, /viewerUserId\?: string \| null/);
  assert.match(next, /matchOpenLeads\(orgId, 5, viewerUserId\)/);
  assert.match(follow, /viewerUserId\?: string \| null/);
  assert.match(follow, /canViewLead/);
  assert.match(match, /viewerUserId\?: string \| null/);
  assert.match(match, /canViewLead/);
});

test('send, dismiss, Ask Bob and reply hide a colleague’s personal lead', () => {
  const send = read('src/lib/data/mail-send.ts');
  const dismiss = read('src/app/api/today/dismiss/route.ts');
  const bob = read('src/app/api/ask/bob/route.ts');
  const reply = read('src/app/api/job-intake/leads/[id]/reply/route.ts');
  assert.match(send, /getJobLead\(input\.leadId, input\.orgId, input\.userId\)/);
  assert.match(dismiss, /getJobLead\(parsed\.data\.leadId/);
  assert.match(bob, /getJobLead\(parsed\.data\.leadId/);
  assert.match(reply, /getJobLead\(id, access\.organizationId, access\.userId\)/);
});

test('settings copy: own inbox, share, send optional and off', () => {
  const settings = read('src/app/(app)/settings/page.tsx');
  const panel = read('src/components/modules/mailbox-settings-panel.tsx');
  assert.match(settings, /Sending from Triangle is optional/);
  assert.match(panel, /Share a lead into the common space/);
  assert.match(panel, /optional and off until you tick it/);
});

test('policy: SENT_MESSAGES_RECORDED stays false; nothing in this item sends', () => {
  const src = read('src/lib/data/communication-policy.ts');
  const share = read('src/app/api/job-intake/leads/[id]/share/route.ts');
  const sync = read('src/app/api/job-intake/sync/route.ts');
  assert.match(src, /export const SENT_MESSAGES_RECORDED = false;/);
  assert.doesNotMatch(share, /sendViaMailbox|sendFromTriangle/);
  assert.match(sync, /Never sends/);
});

test('duplicate detection does not hide a personal copy of a colleague’s unshared lead', () => {
  const src = read('src/lib/data/job-intake.ts');
  assert.match(src, /onlyShared: false/);
  assert.match(src, /onlyShared: true/);
  assert.match(src, /sameMailbox/);
  assert.match(src, /A personal copy in another mailbox is not a duplicate/);
});

test('CSV export and Job Intake counts honour the viewer', () => {
  const exp = read('src/app/api/job-intake/export/route.ts');
  const counts = read('src/lib/data/job-intake.ts');
  assert.match(exp, /viewerUserId: access\.userId/);
  assert.match(exp, /space: url\.searchParams\.get\("space"\) === "shared" \? "shared" : "mine"/);
  assert.match(counts, /export async function getIntakeCounts\(\s*orgId: string,\s*viewerUserId\?: string \| null,/);
});

test('ShareLeadButton posts to the share route and does not send', () => {
  const btn = read('src/components/modules/share-lead-button.tsx');
  assert.match(btn, /\/api\/job-intake\/leads\/\$\{leadId\}\/share/);
  assert.match(btn, /Share with the team/);
  assert.doesNotMatch(btn, /sendFromTriangle|smtp/i);
});

test('ROADMAP_EXECUTION records DEV-020 after DEV-019; DEV-014 still later', () => {
  const roadmap = read('ROADMAP_EXECUTION.md');
  assert.match(roadmap, /### DEV-020/);
  const start = roadmap.indexOf('### DEV-020');
  const end = roadmap.indexOf('### DEV-014');
  assert.ok(start > 0 && end > start, 'DEV-020 should sit before DEV-014');
  const slice = roadmap.slice(start, end);
  assert.match(slice, /051_mailbox_space\.sql/);
  assert.match(slice, /shared space/i);
  assert.match(slice, /not READY|later/i);
});

run();
