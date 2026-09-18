// DEV-015: context-preserving handoff + Ask Bob case_type.
// Isolated fixtures. No env, no live database, no messages sent, SQL is not applied.
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

const sqlPath = 'supabase/data-fixes/2026-09-16-ask-bob-commercial-follow-through.sql';
const askBobSrc = read('src/lib/data/ask-bob.ts');
const policySrc = read('src/lib/data/ask-bob-policy.ts');
const findingSql = read('supabase/migrations/041_finding_contract.sql');
const {
  COMMERCIAL_FOLLOW_THROUGH_CASE_TYPE,
  RESEARCH_FINDING_CASE_TYPES,
  askBobObjective,
} = moduleLoader()('src/lib/data/ask-bob-policy.ts');

test('Ask Bob case_type is commercial_follow_through, not a research finding', () => {
  assert.equal(COMMERCIAL_FOLLOW_THROUGH_CASE_TYPE, 'commercial_follow_through');
  assert.equal(
    RESEARCH_FINDING_CASE_TYPES.includes(COMMERCIAL_FOLLOW_THROUGH_CASE_TYPE),
    false,
  );
  assert.match(askBobSrc, /case_type:\s*COMMERCIAL_FOLLOW_THROUGH_CASE_TYPE/);
  assert.match(askBobSrc, /source:\s*"today_ask_bob"/);
  assert.match(policySrc, /commercial_follow_through/);
});

test('migration 041 still defaults a missing case_type to open_research', () => {
  assert.match(
    findingSql,
    /COALESCE\(NEW\.constraints->>'case_type',\s*'open_research'\)/,
  );
  assert.match(
    findingSql,
    /case_type NOT IN \('open_research', 'company_qualification', 'contact_reachability'\)/,
  );
});

test('Ask Bob still carries entity ids so UI can show Bob working on the case', () => {
  assert.match(askBobSrc, /leadId: params\.context\.leadId/);
  assert.match(askBobSrc, /contactId: params\.context\.contactId/);
  assert.match(askBobSrc, /personId: params\.context\.personId/);
  assert.match(askBobSrc, /companyId: params\.context\.companyId/);
  assert.match(askBobSrc, /missionId: params\.context\.missionId/);
  assert.match(askBobSrc, /params\.context\.also/);
  const text = askBobObjective({
    instruction: 'Follow up with Veronika Igic.',
    who: 'Veronika Igic',
    leadId: '11111111-1111-4111-8111-111111111111',
    companyId: '33333333-3333-4333-8333-333333333333',
  });
  assert.match(text, /leadId: 11111111-1111-4111-8111-111111111111/);
  assert.match(text, /companyId: 33333333-3333-4333-8333-333333333333/);
});

test('Ask Bob already-out notice stays on Today, not Workforce', () => {
  assert.match(askBobSrc, /Open thread on Today/);
  assert.doesNotMatch(askBobSrc, /land on Workforce/);
});

test('data-fix SQL exists, is previewable, and is not a migration', () => {
  assert.equal(fs.existsSync(path.resolve(root, sqlPath)), true);
  const sql = read(sqlPath);
  assert.match(sql, /DO NOT APPLY/i);
  assert.match(sql, /Preview/i);
  assert.match(sql, /today_ask_bob/);
  assert.match(sql, /commercial_follow_through/);
  assert.match(sql, /constraints \|\| '\{"case_type":"commercial_follow_through"\}'::jsonb/);
  assert.doesNotMatch(sql, /SET constraints = 'open_research'/i);
  assert.equal(
    fs.existsSync(path.resolve(root, 'supabase/migrations/' + path.basename(sqlPath))),
    false,
  );
});

test('Bob role file tells him commercial_follow_through completes with result', () => {
  const bobMd = read('agents/bob.md');
  assert.match(bobMd, /commercial_follow_through/);
  assert.match(bobMd, /assignmentId, result/);
  assert.match(bobMd, /sends nothing/i);
});

const emailActions = read('src/components/modules/today-email-actions.tsx');
const askBobRoute = read('src/app/api/ask/bob/route.ts');
const todayScreen = read('src/components/modules/today-screen.tsx');
const todayMissions = read('src/components/modules/today-missions.tsx');
const handoffCtx = read('src/components/modules/today-handoff-context.tsx');
const drawer = read('src/components/modules/assignment-thread-drawer.tsx');
const thread = read('src/components/modules/assignment-thread.tsx');
const decisionsPage = read('src/app/(app)/decisions/page.tsx');
const todayAlias = read('src/app/(app)/today/page.tsx');
const decisions = read('DECISIONS.md');
const roadmap = read('ROADMAP.md');
const execution = read('ROADMAP_EXECUTION.md');
const {
  matchesWait,
  findWait,
  findWaitForAny,
  withLabelFor,
} = moduleLoader()('src/lib/data/today-handoff.ts');

test('Hand to Bob does not dismiss the Today card', () => {
  assert.doesNotMatch(askBobRoute, /dismissTodayCard/);
  assert.doesNotMatch(emailActions, /dismissActionId: target.actionId/);
  assert.match(askBobRoute, /does not dismiss the card/i);
});

test('After an Ask the card says who has it; the chip opens the thread, where Take back lives', () => {
  assert.match(emailActions, /withLabel/);
  assert.match(emailActions, /openCaseThread\(threadOf\(holder\), false\)/);
  assert.match(drawer, /Take back/);
  assert.match(drawer, /\/api\/agents\/assignments/);
  assert.doesNotMatch(emailActions, /router\.push\(["']\/agents/);
});

test('Toast copy is Handed to <employee> · Open thread, and the drawer opens on the case', () => {
  // Named rather than literally "Bob": Hanna takes cases from Today too, and
  // the toast must not claim the wrong owner (DEV-021).
  assert.match(handoffCtx, /Handed to \{toast\.handedTo \|\| toast\.agentName/);
  assert.match(handoffCtx, /The answer returns on this case/);
  assert.match(handoffCtx, /Open thread/);
  const impl = handoffCtx.slice(handoffCtx.indexOf('export function TodayHandoffProvider'));
  const announce = impl.slice(impl.indexOf('announceHanded'), impl.indexOf('isPinned'));
  assert.match(announce, /setThread\(next\)/);
  assert.doesNotMatch(announce, /setThread\(null\)/);
  assert.match(todayMissions, /isPinned/);
  assert.match(emailActions, /openCaseThread/);
  assert.match(emailActions, /AssignmentThreadDrawer/);
});

test('Open thread is a right-side drawer on Today, reusing AssignmentThread', () => {
  assert.match(drawer, /createPortal/);
  assert.match(drawer, /document\.body/);
  assert.match(drawer, /role="dialog"/);
  assert.match(drawer, /max-w-md/);
  assert.match(drawer, /AssignmentThread/);
  assert.match(drawer, /alwaysOpen/);
  assert.match(thread, /alwaysOpen/);
  assert.match(handoffCtx, /AssignmentThreadDrawer/);
  assert.match(todayScreen, /TodayHandoffProvider/);
  assert.doesNotMatch(drawer, /router\.push\(["']\/agents/);
});

// ── the drawer is a case, not a chat window (DEV-022) ──────────────────────

const {
  caseWorkState,
  caseWorkSentence,
  caseWorkIsYours,
} = moduleLoader()('src/lib/data/case-work-status.ts');

test('the status says whose move it is, and never claims a pickup that did not happen', () => {
  assert.equal(caseWorkState({ status: 'queued', awaitingAgent: 1 }), 'queued');
  assert.equal(caseWorkState({ status: 'active', awaitingAgent: 0 }), 'working');
  assert.equal(caseWorkState({ status: 'completed', awaitingAgent: 0 }), 'answered');
  assert.equal(caseWorkState({ status: 'cancelled', awaitingAgent: 0 }), 'stopped');

  const queued = caseWorkSentence({ state: 'queued', agentName: 'Bob', awaitingAgent: 1 });
  assert.match(queued, /Not picked up yet/);
  assert.match(queued, /1 message not picked up yet/);
  assert.match(
    caseWorkSentence({ state: 'answered', agentName: 'Hanna', awaitingAgent: 0 }),
    /Hanna answered\. It is back with you\./,
  );

  // The colour of the dot is the same judgement: answered and stopped are
  // yours, queued and working are theirs.
  assert.equal(caseWorkIsYours('answered'), true);
  assert.equal(caseWorkIsYours('stopped'), true);
  assert.equal(caseWorkIsYours('queued'), false);
  assert.equal(caseWorkIsYours('working'), false);
});

test('the drawer opens on status and the last word, not a wall of everything', () => {
  // Status comes from the record, through the same GET the thread already made.
  const route = read('src/app/api/assignments/[id]/messages/route.ts');
  assert.match(route, /getAssignmentWork/);
  assert.match(route, /messages, work/);
  const work = read('src/lib/data/assignment-work.ts');
  assert.match(work, /caseWorkState/);
  assert.match(work, /withLabelFor/);
  assert.match(work, /agent_assignments/);

  assert.match(thread, /function WorkStatus/);
  assert.match(thread, /work\.statusLine/);
  // Everything before the last message is folded; the last one is open.
  assert.match(thread, /Earlier in this case/);
  assert.match(thread, /messages\.slice\(0, -1\)/);
  assert.match(thread, /latest/);
  // A long reply is folded to its opening rather than printed whole.
  assert.match(thread, /const LONG_REPLY = \d+/);
  assert.match(thread, /Read all of it/);
  // And it is still a case, not an email: the composer says so.
  assert.match(thread, /Message \{recipientPhrase\}/);
  assert.match(thread, /Nothing is emailed/);
  assert.doesNotMatch(thread, /<Send /);
});

test('Today has Needs you and In progress; Needs you is not the wait list', () => {
  assert.match(todayScreen, /Needs you/);
  assert.match(todayScreen, /In progress/);
  assert.match(todayMissions, /InProgressWaits/);
  assert.match(decisionsPage, /listInProgressWaits/);
});

test('Handoff matching uses lead/contact/person ids, not assignment title', () => {
  const wait = {
    assignmentId: 'a1',
    title: 'Follow up',
    agentName: 'Bob',
    agentEmoji: '📦',
    roleKey: 'inbox_coordinator',
    withLabel: 'With Bob',
    status: 'queued',
    leadId: 'lead-1',
    contactId: null,
    personId: null,
    companyId: null,
    missionId: null,
    entityIds: ['lead-1'],
    messageCount: 1,
    awaitingAgent: 0,
    createdAt: '',
    lastAgentBody: null,
  };
  assert.equal(matchesWait(wait, { leadId: 'lead-1' }), true);
  assert.equal(matchesWait(wait, { leadId: 'lead-2' }), false);
  assert.equal(findWait([wait], { contactId: 'nope' }), null);
  assert.equal(withLabelFor('inbox_coordinator', 'Ops'), 'With Bob');
  assert.equal(withLabelFor('project_researcher', 'Scout'), 'With Scout');
  assert.equal(withLabelFor('hr', 'Hanna'), 'With Hanna');
});

test('findWaitForAny matches any role on a grouped person card', () => {
  const wait = {
    assignmentId: 'a1',
    title: 'Follow up',
    agentName: 'Bob',
    agentEmoji: '📦',
    roleKey: 'inbox_coordinator',
    withLabel: 'With Bob',
    status: 'queued',
    leadId: 'lead-1',
    contactId: null,
    personId: null,
    companyId: null,
    missionId: null,
    entityIds: ['lead-1', 'lead-2'],
    messageCount: 1,
    awaitingAgent: 0,
    createdAt: '',
  };
  assert.equal(findWaitForAny([wait], [{ leadId: 'lead-2' }])?.assignmentId, 'a1');
  assert.equal(findWaitForAny([wait], [{ leadId: 'lead-9' }]), null);
});

test('/today aliases /decisions', () => {
  assert.match(todayAlias, /redirect\("\/decisions"\)/);
});

test('docs lock the handoff rule and commercial_follow_through', () => {
  assert.match(decisions, /Handoff changes the owner of the work/);
  assert.match(decisions, /Needs you/);
  assert.match(decisions, /In progress/);
  assert.match(decisions, /commercial_follow_through/);
  assert.match(roadmap, /Handoff changes the/);
  assert.match(execution, /DEV-015/);
  assert.match(execution, /commercial_follow_through/);
});

test('Today keeps the Now card when Bob has the case; Bob wrote in Triangle is on it', () => {
  assert.match(todayScreen, /nowShowCard/);
  assert.match(todayScreen, /EmployeePrepared/);
  assert.match(todayScreen, /Nothing is in the Triangle thread yet/);
  assert.match(todayScreen, /Copy what they wrote/);
  assert.doesNotMatch(todayScreen, /Nothing needs you on this case/);
  assert.match(todayScreen, /Who we put forward/);
  assert.match(todayScreen, /today-offering/);
  assert.match(todayScreen, /Someone else in the pool/);
});

test('Done follow-through matches the same lead/contact as the card', () => {
  const {
    findDone,
  } = moduleLoader()('src/lib/data/today-handoff.ts');
  const item = {
    assignmentId: 'done-1',
    leadId: 'lead-1',
    contactId: null,
    personId: null,
  };
  assert.equal(findDone([item], { leadId: 'lead-1' })?.assignmentId, 'done-1');
  assert.equal(findDone([item], { leadId: 'lead-2' }), null);
});

test('Workforce console is gone (DEV-012 slice B); Team hands nothing out', () => {
  assert.equal(
    fs.existsSync(path.resolve(root, 'src/components/modules/agent-console.tsx')),
    false,
  );
  const agentsPage = read('src/app/(app)/agents/page.tsx');
  assert.match(agentsPage, /redirect\("\/settings\?notice=workforce#team"\)/);
  const teamSettings = read('src/components/modules/team-settings.tsx');
  assert.match(teamSettings, /Nothing is handed out from here/);
  assert.doesNotMatch(teamSettings, /Team marketplace/);
  const sidebar = read('src/components/layout/sidebar.tsx');
  assert.doesNotMatch(sidebar, /href: "\/agents"/);
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
