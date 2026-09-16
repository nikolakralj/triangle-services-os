// DEV-010: context-aware Ask. Isolated fixtures — no env, no live database,
// nothing sent, no AI call.
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

// ── a fake database: one org's records, one roster, one table of assignments ─
const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const COMPANY = '44444444-4444-4444-8444-444444444444';
const REQ = '55555555-5555-4555-8555-555555555555';
const WORKER = '66666666-6666-4666-8666-666666666666';
const USER = '77777777-7777-4777-8777-777777777777';

const records = {
  discovered_projects: [{ id: PROJECT, organization_id: ORG, project_name: 'Stahlwerk Linz' }],
  companies: [{ id: COMPANY, organization_id: OTHER_ORG, name: 'Someone Else GmbH' }],
  commercial_requirements: [
    { id: REQ, org_id: ORG, title: '6 PCS7 engineers, Linz', discovered_project_id: PROJECT },
  ],
  workers: [{ id: WORKER, organization_id: ORG, full_name: 'Igor Pejkovic' }],
};

let created = [];
let messages = [];
let openAssignments = [];

function fakeSvc() {
  const from = (table) => {
    const q = { table, filters: [] };
    const api = {
      select() {
        return api;
      },
      eq(col, val) {
        q.filters.push([col, val]);
        return api;
      },
      maybeSingle() {
        const rows = records[table] ?? [];
        const hit = rows.find((r) => q.filters.every(([c, v]) => r[c] === v)) ?? null;
        return Promise.resolve({ data: hit, error: null });
      },
      insert(row) {
        if (table === 'assignment_messages') messages.push(row);
        return Promise.resolve({ data: null, error: null });
      },
    };
    return api;
  };
  return { from };
}

const roster = [
  { id: 'scout-1', roleKey: 'project_researcher', displayName: 'Scout', emoji: '🔭', status: 'active' },
  { id: 'hanna-1', roleKey: 'hr', displayName: 'Hanna', emoji: '👤', status: 'active' },
  { id: 'bob-1', roleKey: 'inbox_coordinator', displayName: 'Bob', emoji: '📬', status: 'active' },
];

const load = moduleLoader({
  '@/lib/supabase/server': { createServiceSupabaseClient: fakeSvc },
  '@/lib/data/workforce': {
    listWorkforce: async () => roster,
    nextAttemptKey: async (_org, baseKey) =>
      openAssignments.includes(baseKey) ? { openAssignmentId: 'open-1' } : { key: baseKey },
    createAssignment: async (params) => {
      created.push(params);
      return { id: 'asg-' + created.length, runtime: 'bot', wake: null, notice: 'Queued for Scout.' };
    },
  },
  '@/lib/data/bot-runtime': { employeeMissionRuntime: async (_o, id) => (id === 'hanna-1' ? 'in_app' : 'bot') },
});
const { askOnRecord, leadRoleForAsk, askOnRecordTitle, ASK_ON_RECORD_SOURCE } = load(
  'src/lib/data/ask-on-record.ts',
);

function reset() {
  created = [];
  messages = [];
  openAssignments = [];
}

const routeSrc = read('src/app/api/ask/route.ts');
const launcherSrc = read('src/components/missions/ask-launcher.tsx');
const contextSrc = read('src/components/missions/ask-context.tsx');
const caseSrc = read('src/lib/data/company-case.ts');
const roadmap = read('ROADMAP_EXECUTION.md');

// ── acceptance 1: page context → missionless assignment on the record ───────
test('project context: a substantial Ask is one missionless job bound to the project', async () => {
  reset();
  const r = await askOnRecord({
    orgId: ORG,
    userId: USER,
    question: 'Scout, find out who the MEP contractor is and whether they buy commissioning labour.',
    context: { type: 'project', id: PROJECT },
    canSeeWorkers: true,
  });
  assert.equal(r.ok, true);
  assert.equal(r.alreadyOut, false);
  assert.equal(r.lead.name, 'Scout');
  assert.equal(r.label, 'Stahlwerk Linz');
  assert.equal(created.length, 1);
  const a = created[0];
  assert.equal(a.missionId, null, 'must not open a mission');
  assert.equal(a.agentInstanceId, 'scout-1');
  assert.equal(a.projectId, PROJECT);
  assert.deepEqual(a.entityRefs, [{ type: 'project', id: PROJECT, relation: 'target' }]);
  assert.equal(a.constraints.source, ASK_ON_RECORD_SOURCE);
  assert.equal(a.constraints.context_type, 'project');
  assert.equal(a.constraints.context_id, PROJECT);
  assert.match(a.title, /MEP contractor/);
  assert.match(a.title, /— Stahlwerk Linz$/);
  assert.match(a.objective, /Work only this record/);
  assert.match(a.objective, /Do not send anything/);
  assert.match(a.expectedOutput, /Nothing sent/);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, 'human');
  assert.equal(messages[0].author_user_id, USER);
});

test('requirement context: linked as `other` plus its project, within the entity_type check constraint', async () => {
  reset();
  const r = await askOnRecord({
    orgId: ORG,
    userId: USER,
    question: 'Check whether the buyer here is the GC or the owner.',
    context: { type: 'requirement', id: REQ },
    canSeeWorkers: false,
  });
  assert.equal(r.ok, true);
  const a = created[0];
  assert.equal(a.missionId, null);
  assert.equal(a.projectId, PROJECT, 'project taken from the requirement row');
  assert.deepEqual(a.entityRefs, [
    { type: 'other', id: REQ, relation: 'target' },
    { type: 'project', id: PROJECT, relation: 'context' },
  ]);
  const allowed = ['worker', 'job_lead', 'project', 'project_package', 'company', 'contact', 'crew', 'other'];
  for (const ref of a.entityRefs) assert.ok(allowed.includes(ref.type), ref.type);
});

test('worker context goes to the pool reader, and is refused for a role that cannot see workers', async () => {
  reset();
  const refused = await askOnRecord({
    orgId: ORG,
    userId: USER,
    question: 'Is he free in October and does he hold a valid A1?',
    context: { type: 'worker', id: WORKER },
    canSeeWorkers: false,
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 403);
  assert.equal(created.length, 0);

  const ok = await askOnRecord({
    orgId: ORG,
    userId: USER,
    question: 'Is he free in October and does he hold a valid A1?',
    context: { type: 'worker', id: WORKER },
    canSeeWorkers: true,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.lead.name, 'Hanna');
  assert.equal(created[0].constraints.execution_mode, 'in_app', 'Hanna keeps her own runtime');
  assert.deepEqual(created[0].entityRefs, [{ type: 'worker', id: WORKER, relation: 'target' }]);
});

test("a record from another organization is not this organization's to work", async () => {
  reset();
  const r = await askOnRecord({
    orgId: ORG,
    userId: USER,
    question: 'Qualify this company as a buyer of automation labour.',
    context: { type: 'company', id: COMPANY },
    canSeeWorkers: true,
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
  assert.equal(created.length, 0);
});

test('a second Ask on the same record the same day reopens the thread, no twin job', async () => {
  reset();
  const today = new Date().toISOString().slice(0, 10);
  openAssignments.push(`ask-record:scout-1:project:${PROJECT}:${today}`);
  const r = await askOnRecord({
    orgId: ORG,
    userId: USER,
    question: 'Scout, also check who the electrical subcontractor is.',
    context: { type: 'project', id: PROJECT },
    canSeeWorkers: true,
  });
  assert.equal(r.ok, true);
  assert.equal(r.alreadyOut, true);
  assert.equal(r.assignmentId, 'open-1');
  assert.equal(created.length, 0);
});

test('too short an Ask is sent back for more words', async () => {
  reset();
  const r = await askOnRecord({
    orgId: ORG,
    userId: USER,
    question: 'MEP?',
    context: { type: 'project', id: PROJECT },
    canSeeWorkers: true,
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test('lead choice and title are plain rules, not an AI call', () => {
  assert.equal(leadRoleForAsk('project', 'Who is the MEP contractor?'), 'project_researcher');
  assert.equal(leadRoleForAsk('project', 'Which of our engineers could start there?'), 'hr');
  assert.equal(leadRoleForAsk('worker', 'Anything'), 'hr');
  assert.equal(
    askOnRecordTitle('Find the MEP contractor. Then check their tender history.', 'Stahlwerk Linz'),
    'Find the MEP contractor. — Stahlwerk Linz',
  );
  assert.ok(askOnRecordTitle('x'.repeat(300), 'y'.repeat(100)).length <= 120);
  const src = read('src/lib/data/ask-on-record.ts');
  assert.doesNotMatch(src, /nameMission|mission-namer|openai|anthropic/i);
});

// ── the route keeps the four branches in the right order ────────────────────
test('/api/ask: instruction inside a mission, pool question inline, then record, then mission', () => {
  const iMission = routeSrc.indexOf('if (missionId) {');
  const iPool = routeSrc.indexOf('if (isPoolQuestion(question)) {');
  const iRecord = routeSrc.indexOf('if (context) {');
  const iNew = routeSrc.indexOf('await startMission({');
  assert.ok(iMission > 0 && iPool > iMission && iRecord > iPool && iNew > iRecord, 'branch order');
  assert.match(routeSrc, /context: contextSchema\.optional\(\)\.nullable\(\)/);
  assert.match(routeSrc, /kind: "assignment"/);
  assert.match(routeSrc, /askOnRecord\(/);
  assert.doesNotMatch(routeSrc, /work_items|workItems/);
});

// ── the box carries the page, and stays on it ───────────────────────────────
test('AskLauncher reads the page context, offers "On <record>", and stays on the page', () => {
  assert.match(launcherSrc, /useAskPageContext\(\)/);
  assert.match(launcherSrc, /On \{record\.label\}/);
  assert.match(launcherSrc, /context:\s*\n?\s*bound && !missionId/);
  assert.match(launcherSrc, /body\.kind === "assignment"/);
  assert.match(launcherSrc, /router\.refresh\(\)/);
  // The assignment branch must not navigate away.
  const branch = launcherSrc.slice(
    launcherSrc.indexOf('body.kind === "assignment"'),
    launcherSrc.indexOf('body.kind === "talent"'),
  );
  assert.doesNotMatch(branch, /router\.push/);
  assert.match(launcherSrc, /returns under this record/);
});

test('inside a mission the box defaults to that mission; "Start a mission" is explicit', () => {
  assert.match(launcherSrc, /page\?\.kind === "mission"\) return \{ missionId: page\.missionId/);
  assert.match(read('src/components/missions/mission-tabs.tsx'), /openAsk\(\{ missionId: null \}\)/);
  assert.match(read('src/components/missions/missions-index.tsx'), /openAsk\(\{ missionId: null \}\)/);
  assert.match(read('src/app/(app)/missions/[id]/page.tsx'), /<AskPageContext kind="mission" missionId=\{id\} \/>/);
});

test('record pages mount the context: project, company, requirement, person', () => {
  assert.match(read('src/app/(app)/hunter/[id]/page.tsx'), /<AskPageContext kind="record" type="project"/);
  assert.match(read('src/app/(app)/companies/[id]/page.tsx'), /<AskPageContext kind="record" type="company"/);
  assert.match(read('src/app/(app)/commercial/[id]/page.tsx'), /type="requirement"/);
  const worker = read('src/app/(app)/workers/[id]/page.tsx');
  assert.match(worker, /<AskPageContext kind="record" type="worker"/);
  assert.match(worker, /getEntityCase\("worker"/, 'the person page shows its case so the answer has a place');
  assert.match(contextSrc, /useSyncExternalStore/);
});

// ── the result returns on EntityCase ────────────────────────────────────────
test("EntityCase treats an Ask-on-record job as dedicated to the record", () => {
  assert.match(caseSrc, /ASK_ON_RECORD_SOURCE/);
  assert.match(caseSrc, /completed_at,constraints"/);
});

// ── nothing that was ruled out ──────────────────────────────────────────────
test('no new table, no nav change, no send path', () => {
  const migrations = fs.readdirSync(path.resolve(root, 'supabase/migrations'));
  assert.equal(migrations.some((f) => /ask|work_item|context/i.test(f)), false);
  const sidebar = read('src/components/layout/sidebar.tsx');
  assert.doesNotMatch(sidebar, /Work items/i);
  const src = read('src/lib/data/ask-on-record.ts');
  assert.doesNotMatch(src, /outreach|sendMail|gmail|resend/i);
});

test('ROADMAP_EXECUTION records DEV-010 as done in code with a signed-in check pending', () => {
  const slice = roadmap.slice(roadmap.indexOf('### DEV-010'), roadmap.indexOf('### DEV-011'));
  assert.match(slice, /`DONE`/);
  assert.match(slice, /ask-on-record\.ts/);
  assert.match(slice, /signed-in check/i);
});

run();
