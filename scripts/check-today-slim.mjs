// DEV-009: Today email cards slim to Open mail / Ask Bob / scoped Dismiss.
// Isolated fixtures. No env, no live database, no messages sent.
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

const todayScreen = read('src/components/modules/today-screen.tsx');
const todayMissions = read('src/components/modules/today-missions.tsx');
const emailActions = read('src/components/modules/today-email-actions.tsx');
const askBobRoute = read('src/app/api/ask/bob/route.ts');
const dismissRoute = read('src/app/api/today/dismiss/route.ts');

test('Ask Bob is present on the shared email card actions', () => {
  assert.match(emailActions, /Ask Bob/);
  assert.match(emailActions, /Hand to Bob/);
  assert.match(emailActions, /\/api\/ask\/bob/);
  assert.match(emailActions, /Dismiss/);
  assert.match(emailActions, /also:/);
});

test('primary email outcome buttons are off the Today rail', () => {
  assert.match(todayScreen, /EmailCardActions/);
  assert.match(todayMissions, /EmailCardActions/);
  assert.match(emailActions, /Ask Bob/);
  assert.doesNotMatch(emailActions, />Sent</);
  assert.doesNotMatch(emailActions, />They replied</);
  assert.doesNotMatch(emailActions, />Sent a follow-up</);
  assert.doesNotMatch(todayScreen, /press Sent once the email has actually/);
});

test('follow-up email rows no longer offer Sent a follow-up as the main path', () => {
  const followUpFn = todayMissions.slice(
    todayMissions.indexOf('function FollowUpRow'),
    todayMissions.indexOf('function ReadyPerson'),
  );
  assert.match(followUpFn, /isEmail/);
  assert.match(followUpFn, /EmailCardActions/);
  assert.match(followUpFn, /isEmail && !compact/);
  // Later / outcome buttons remain only on the non-email branch.
  const emailBranch = followUpFn.slice(followUpFn.indexOf('{isEmail &&'));
  assert.doesNotMatch(emailBranch, /Sent a follow-up/);
});

test('grouped follow-ups have one Ask Bob at person level, not per role', () => {
  const groupFn = todayMissions.slice(
    todayMissions.indexOf('function FollowUpGroup'),
    todayMissions.indexOf('function FollowUpRow'),
  );
  assert.match(groupFn, /EmailCardActions/);
  assert.match(groupFn, /also:/);
  assert.match(groupFn, /findWaitForAny/);
  assert.match(groupFn, /Open mail/);
  assert.match(groupFn, /compact/);
  const compactRow = todayMissions.slice(
    todayMissions.indexOf('function FollowUpRow'),
    todayMissions.indexOf('function ReadyPerson'),
  );
  assert.match(compactRow, /isEmail && !compact/);
});

test('ready-to-contact email people use Ask Bob, not Sent', () => {
  const readyFn = todayMissions.slice(todayMissions.indexOf('function ReadyPerson'));
  assert.match(readyFn, /channel\.kind === "email"/);
  assert.match(readyFn, /EmailCardActions/);
  assert.match(readyFn, /personId: person.contactId/);
});

test('Ask Bob and Dismiss are real API routes', () => {
  assert.match(askBobRoute, /askBob\(/);
  assert.match(askBobRoute, /refuseUnlessHuman/);
  assert.match(dismissRoute, /dismissTodayCard\(/);
  assert.match(dismissRoute, /not_now/);
  assert.match(dismissRoute, /recorded_outside/);
});

const {
  isBobEmployee,
  bobFollowThroughBlockedReason,
  askBobTitle,
  askBobObjective,
} = moduleLoader()('src/lib/data/ask-bob-policy.ts');
const { dismissSentence, isEmailDismissReason } = moduleLoader()(
  'src/lib/data/today-card-actions.ts',
);

test('Bob is recognised by role key and by name', () => {
  assert.equal(isBobEmployee({ roleKey: 'inbox_coordinator', displayName: 'Ops' }), true);
  assert.equal(isBobEmployee({ roleKey: 'hr', displayName: 'Bob' }), true);
  assert.equal(isBobEmployee({ roleKey: 'project_researcher', displayName: 'Scout' }), false);
});

test('DEV-004 blocks honestly when the badge has no mission scope', () => {
  const reason = bobFollowThroughBlockedReason({
    bob: { id: 'bob-1', name: 'Bob' },
    scopes: ['job_intake.ingest'],
    runtime: 'bot',
  });
  assert.match(reason, /mission scope \(DEV-004\)/);
});

test('DEV-004 blocks honestly when the wake-up routine is off', () => {
  const reason = bobFollowThroughBlockedReason({
    bob: { id: 'bob-1', name: 'Bob' },
    scopes: ['mission.work'],
    runtime: 'in_app',
  });
  assert.match(reason, /wake-up routine is on \(DEV-004\)/);
});

test('Bob can take work when the badge and bot runtime are on', () => {
  assert.equal(
    bobFollowThroughBlockedReason({
      bob: { id: 'bob-1', name: 'Bob' },
      scopes: ['job_intake.ingest', 'mission.work'],
      runtime: 'bot',
    }),
    null,
  );
});

test('missing Bob is an honest failure, not a queued pretend job', () => {
  assert.match(
    bobFollowThroughBlockedReason({ bob: null, scopes: ['mission.work'], runtime: 'bot' }),
    /Nobody named Bob/,
  );
});

test('Ask Bob objective carries the card entity ids', () => {
  const text = askBobObjective({
    instruction: 'Chase Oliver about the Ireland commissioning role.',
    who: 'Oliver Hall',
    about: 'PLC Commissioning Engineer — Ireland',
    leadId: '11111111-1111-4111-8111-111111111111',
    missionId: '22222222-2222-4222-8222-222222222222',
    channelKind: 'email',
    value: 'oliver@g2.co.uk',
  });
  assert.match(text, /leadId: 11111111-1111-4111-8111-111111111111/);
  assert.match(text, /missionId: 22222222-2222-4222-8222-222222222222/);
  assert.match(text, /Do not send anything/);
  assert.equal(askBobTitle(text, 'Oliver Hall').startsWith('Chase Oliver'), true);
});

test('Dismiss reasons are scoped judgments, not a blacklist', () => {
  assert.equal(isEmailDismissReason('dont_contact'), true);
  assert.equal(isEmailDismissReason('blacklist'), false);
  assert.match(dismissSentence('dont_contact'), /Don't contact on this opportunity/);
  assert.match(dismissSentence('recorded_outside'), /Handled outside Triangle/);
  assert.match(dismissSentence('not_now'), /four days/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log('ok  ' + name);
  } catch (err) {
    failed += 1;
    console.log('FAIL  ' + name);
    console.log('  ' + (err instanceof Error ? err.message : err));
  }
}
console.log(failed === 0 ? `${tests.length}/${tests.length} ok` : `${tests.length - failed}/${tests.length} passed`);
process.exit(failed === 0 ? 0 : 1);
