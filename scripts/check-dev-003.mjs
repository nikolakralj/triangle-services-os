// DEV-003: Hanna writes to the pool from her bot. Isolated fixtures.
// No env, no live database, no messages sent.
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

function database() {
  const tables = {};
  const writes = [];
  let serial = 0;
  let failure = null;
  const svc = {
    from(table) {
      const filters = [];
      let operation = 'read';
      let values = null;
      let one = false;
      let desc = null;
      const q = {
        select() { return q; },
        eq(k, v) { filters.push((r) => r[k] === v); return q; },
        neq(k, v) { filters.push((r) => r[k] !== v); return q; },
        in(k, vals) { filters.push((r) => vals.includes(r[k])); return q; },
        ilike(k, v) {
          filters.push((r) => String(r[k] ?? '').toLowerCase().includes(String(v).replaceAll('%', '').toLowerCase()));
          return q;
        },
        contains() { return q; },
        or() { return q; },
        is(k, v) { filters.push((r) => r[k] == v); return q; },
        order(k, opts) { desc = opts?.ascending === false ? k : null; return q; },
        limit() { return q; },
        insert(v) { operation = 'insert'; values = v; return q; },
        update(v) { operation = 'update'; values = v; return q; },
        single() { one = true; return q; },
        maybeSingle() { one = true; return q; },
        then(resolve, reject) {
          try {
            let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
            if (desc) rows.sort((a, b) => String(b[desc]).localeCompare(String(a[desc])));
            if (operation !== 'read') {
              writes.push({ table, operation, values });
              if (failure) return Promise.resolve({ data: null, error: { message: failure } }).then(resolve, reject);
              if (operation === 'insert') {
                const row = { id: 'row-' + (++serial), created_at: new Date().toISOString(), status: 'pending', ...values };
                (tables[table] ??= []).push(row);
                rows = [row];
              } else {
                rows.forEach((r) => Object.assign(r, values));
              }
            }
            return Promise.resolve({ data: one ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
          } catch (e) {
            return Promise.reject(e).then(resolve, reject);
          }
        },
      };
      return q;
    },
  };
  return { svc, tables, writes, fail(message) { failure = message; } };
}

const step = {
  id: '11111111-1111-1111-1111-111111111111',
  orgId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  missionId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  agentInstanceId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  scopes: ['worker.propose'],
  badgeName: 'triangle_hr',
};
const workerId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const anton = {
  id: workerId,
  organization_id: step.orgId,
  full_name: 'Anton Kovac',
  role: 'Electrical Supervisor',
  status: 'active',
  availability_status: 'unknown',
  available_from: null,
  city: 'Linz',
  country: 'AT',
  certificates: ['SCC'],
  skills: ['PCS7'],
  languages: ['German B2'],
  work_authorisation: ['EU'],
  email: 'anton@example.com',
  phone: '+430000',
};

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

const drafts = [];
function loadPool(db) {
  return moduleLoader({
    '@/lib/supabase/server': { createServiceSupabaseClient: () => db.svc },
    '@/lib/data/outreach': {
      createOutreachDraft: async (params) => {
        drafts.push(params);
        return { id: 'draft-' + drafts.length };
      },
      markOutreachSent: async () => { throw new Error('must not send'); },
    },
  })('src/lib/data/mission-pool.ts');
}

test('privacy: LinkedIn and CV text are refused; initials hide the name', () => {
  const pool = loadPool(database());
  assert.match(pool.openWebPersonSource('https://www.linkedin.com/in/anton-kovac'), /open web/);
  assert.equal(pool.openWebPersonSource('triangle://workers/' + workerId), null);
  const refused = pool.pickCandidateFields({ full_name: 'Anton', cv_text: 'secret cv' });
  assert.match(refused.refused, /cv_text/);
  const avail = pool.pickCandidateFields({ full_name: 'Anton', availability_status: 'available' });
  assert.match(avail.refused, /availability/);
  assert.equal(pool.initialsOf('Anton Kovac'), 'A. K.');
  assert.equal(pool.workerForBot(anton).initials, 'A. K.');
  assert.equal(pool.workerForBot(anton).email, undefined);
  assert.equal(pool.workerForBot(anton).phone, undefined);
  assert.equal(pool.workerForBot(anton).full_name, undefined);
});

test('scopes: Hanna writes the pool, Scout writes company targets', () => {
  const pool = loadPool(database());
  assert.equal(pool.hasPoolWriteScope(['worker.propose']), true);
  assert.equal(pool.hasTargetWriteScope(['worker.propose']), false);
  assert.equal(pool.hasPoolWriteScope(['research.suggestion.create']), false);
  assert.equal(pool.hasTargetWriteScope(['research.suggestion.create']), true);
  assert.equal(pool.hasPoolWriteScope(['admin']), true);
});

test('naming an existing worker files an applied finding and never inserts a worker', async () => {
  const db = database();
  db.tables.workers = [{ ...anton }];
  const pool = loadPool(db);
  const result = await pool.fileMissionPool(step, [{ kind: 'candidate', workerId, why: 'PCS7 supervisor for Linz' }]);
  assert.equal(result.filed[0].refused, null);
  assert.equal(result.filed[0].stillPending, false);
  assert.equal(result.filed[0].initials, 'A. K.');
  assert.equal(db.tables.agent_findings[0].status, 'applied');
  assert.equal(db.tables.agent_findings[0].promoted_entity_id, workerId);
  assert.equal(db.writes.some((w) => w.table === 'workers' && w.operation === 'insert'), false);
  assert.equal(db.tables.workers[0].availability_status, 'unknown');
});

test('availability proposal stays pending, writes a draft, and does not mark the worker available', async () => {
  drafts.length = 0;
  const db = database();
  db.tables.workers = [{ ...anton }];
  const pool = loadPool(db);
  const result = await pool.fileMissionPool(step, [{
    kind: 'availability',
    workerId,
    proposed: 'available',
    availableFrom: '2026-10-01',
    evidence: 'Last note in Triangle said free from October.',
    check: { channel: 'email', subject: 'Availability', body: 'Are you free from October for Linz?' },
  }]);
  assert.equal(result.filed[0].refused, null);
  assert.equal(result.filed[0].stillPending, true);
  assert.ok(result.filed[0].draftId);
  assert.equal(db.tables.agent_findings[0].status, 'pending');
  assert.equal(db.tables.workers[0].availability_status, 'unknown');
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].channel, 'email_cold');
  assert.match(drafts[0].body, /person sends/);
  assert.equal(db.writes.some((w) => w.table === 'workers' && w.operation === 'update'), false);
  assert.equal(db.writes.some((w) => w.table === 'commercial_actions'), false);
});

test('Scout cannot file the pool; Hanna cannot invent a placeholder person or enrich from LinkedIn', async () => {
  const db = database();
  db.tables.workers = [{ ...anton }];
  const pool = loadPool(db);
  const scout = await pool.fileMissionPool({ ...step, scopes: ['research.suggestion.create'] }, [{ kind: 'candidate', workerId }]);
  assert.match(scout.error, /worker.propose/);
  const fake = await pool.fileMissionPool(step, [{ kind: 'candidate', fields: { full_name: 'Jane Doe', role: 'Electrician' } }]);
  assert.match(fake.filed[0].refused, /placeholder/);
  const web = await pool.fileMissionPool(step, [{ kind: 'candidate', fields: { full_name: 'Petra Novak', role: 'Electrician', source_url: 'https://linkedin.com/in/petra' } }]);
  assert.match(web.filed[0].refused, /open web/);
});

test('new candidate fields stay pending and never create a worker', async () => {
  const db = database();
  const pool = loadPool(db);
  const result = await pool.fileMissionPool(step, [{
    kind: 'candidate',
    fields: { full_name: 'Petra Novak', role: 'Cable Puller', skills: ['MV termination'] },
    why: 'Named in the CEO instruction, not found on the open web.',
  }]);
  assert.equal(result.filed[0].stillPending, true);
  assert.equal(result.filed[0].initials, 'P. N.');
  assert.equal(db.tables.agent_findings[0].status, 'pending');
  assert.equal(db.tables.workers, undefined);
});

test('recruiting finish line counts named pool people; available only from the worker record', async () => {
  const db = database();
  const busy = { ...anton, availability_status: 'unknown' };
  const free = { ...anton, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', full_name: 'Mila Horvat', availability_status: 'available' };
  db.tables.workers = [busy, free];
  db.tables.agent_findings = [
    { org_id: step.orgId, mission_id: step.missionId, finding_type: 'worker', status: 'applied', promoted_entity_id: busy.id, payload: { worker_id: busy.id } },
    { org_id: step.orgId, mission_id: step.missionId, finding_type: 'worker', status: 'pending', promoted_entity_id: free.id, payload: { proposal: 'availability', worker_id: free.id } },
  ];
  const pool = loadPool(db);
  const loaded = await pool.loadMissionPool(step.orgId, step.missionId);
  assert.equal(loaded.candidates.length, 2);
  const progress = moduleLoader()('src/lib/data/mission-progress.ts');
  const facts = { companies: [], candidates: loaded.candidates, partners: [] };
  assert.equal(progress.countMetric('candidates_named', facts), 2);
  assert.equal(progress.countMetric('candidates_available', facts), 1);
});

test('a person accepting an availability proposal updates the worker; Hanna cannot', async () => {
  const db = database();
  db.tables.workers = [{ ...anton }];
  db.tables.agent_findings = [{
    id: 'finding-avail',
    org_id: step.orgId,
    finding_type: 'worker',
    status: 'pending',
    payload: { proposal: 'availability', worker_id: workerId, proposed_availability: 'available', available_from: '2026-10-01' },
  }];
  const findings = moduleLoader({
    '@/lib/supabase/server': { createServiceSupabaseClient: () => db.svc },
    '@/lib/data/finding-source-check': { checkFindingSource: async () => ({ status: 'matched' }), citedUrls: () => [] },
  })('src/lib/data/findings.ts');
  await findings.acceptFinding({ findingId: 'finding-avail', orgId: step.orgId, userId: 'human-a' });
  assert.equal(db.tables.workers[0].availability_status, 'available');
  assert.equal(db.tables.agent_findings[0].status, 'accepted');
});

test('worker lookup hides email and phone', async () => {
  const db = database();
  db.tables.workers = [{ ...anton }];
  const pool = loadPool(db);
  const rows = await pool.lookupWorkers(step.orgId, 'Anton');
  assert.equal(rows[0].workerId, workerId);
  assert.equal(rows[0].initials, 'A. K.');
  assert.equal(rows[0].email, undefined);
  assert.equal(rows[0].phone, undefined);
});

test('pool API refuses a missing badge before writing', async () => {
  const api = moduleLoader({
    '@/lib/data/mission-bot': {
      authorizeBotStep: async () => ({ ok: false, status: 401, error: 'Machine credential required (tri_mc_… token).' }),
      fileBotPool: () => { throw new Error('must not file'); },
      pickUpBotStep: () => { throw new Error('must not pick up'); },
    },
  })('src/app/api/agent/missions/[id]/pool/route.ts');
  const res = await api.POST(new Request('http://localhost/api/agent/missions/x/pool', { method: 'POST', body: '{}' }), { params: Promise.resolve({ id: step.missionId }) });
  assert.equal(res.status, 401);
});

test('Hanna is told to use /pool when she posts company targets', async () => {
  const bot = moduleLoader({
    '@/lib/supabase/server': { createServiceSupabaseClient: () => database().svc },
    '@/lib/auth/machine': { verifyMachineToken: async () => null },
    '@/lib/data/assignment-threads': { addAgentMessage: async () => true },
    '@/lib/data/workforce': { completeAssignment: async () => true },
    '@/lib/data/supply-partners': { listSupplyPartners: async () => [] },
    '@/lib/data/house-rules': { loadHouseRules: async () => null },
    '@/lib/data/delegation': { listColleagues: async () => [], listRequestedWork: async () => [], reportBack: async () => null },
    '@/lib/data/communication-policy': { communicationPolicyFor: () => ({ classes: {}, rule: '' }) },
    '@/lib/data/agent-brief': { loadMissionProtocol: async () => '' },
    '@/lib/data/bot-runtime': { employeeConfig: async () => null },
    '@/lib/data/mission-records': { fileMissionTargets: async () => { throw new Error('must not file companies'); } },
    '@/lib/data/mission-runs': { activity: (k, t) => ({ kind: k, text: t }), appendMissionActivity: async () => {}, finishMissionRun: async () => {}, startMissionRun: async () => 'run' },
    '@/lib/data/mission-memory': { describeMissionState: () => '', normaliseQuote: (s) => s, recordDecision: async () => null, supersedeDecisions: async () => [] },
    '@/lib/data/mission-plan': { loadMissionPlan: async () => ({ criteria: [], plan: [] }), saveMissionPlan: async () => true },
    '@/lib/data/mission-progress': { evaluateProgress: () => null, progressSentence: () => '', settlePlan: () => null },
    '@/lib/data/missions': { loadMissionHoldings: async () => ({ companies: [] }), loadMissionRunContext: async () => { throw new Error('must not load'); }, touchMission: async () => {} },
    '@/lib/ai/mission-report': { citesASource: () => false, cleanTargets: (t) => ({ kept: t, dropped: [] }), companyKey: (s) => s, domainOf: () => null, missionTargetSchema: { safeParse: () => ({ success: true, data: {} }) }, siteOfEmail: () => null },
  })('src/lib/data/mission-bot.ts');
  const result = await bot.fileBotTargets({ ...step, scopes: ['worker.propose'], title: 'x', status: 'active', constraints: {} }, [{ company: 'Helios' }]);
  assert.match(result.error, /\/pool/);
});

test('Approvals copy for availability includes the draft a person sends', () => {
  const pool = loadPool(database());
  const copy = pool.availabilityFindingCopy({
    proposal: 'availability',
    full_name: 'Anton Kovac',
    proposed_availability: 'available',
    available_from: '2026-10-01',
    evidence: 'Last note said free from October.',
    check: { channel: 'email', subject: 'Availability', body: 'Are you free from October for Linz?' },
  }, 'filed');
  assert.equal(copy.itemType, 'worker_availability');
  assert.match(copy.headline, /available/);
  assert.match(copy.detail, /person confirms/);
  assert.match(copy.evidenceText, /Are you free from October/);
  assert.equal(pool.availabilityFindingCopy({ proposal: 'candidate', full_name: 'Anton' }, null), null);
});

test('source files never send a message', () => {
  const poolSrc = fs.readFileSync(path.resolve(root, 'src/lib/data/mission-pool.ts'), 'utf8');
  const routeSrc = fs.readFileSync(path.resolve(root, 'src/app/api/agent/missions/[id]/pool/route.ts'), 'utf8');
  assert.doesNotMatch(poolSrc, /markOutreachSent/);
  assert.doesNotMatch(routeSrc, /markOutreachSent/);
  assert.match(poolSrc, /createOutreachDraft/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log('PASS ' + name);
  } catch (e) {
    failed++;
    console.error('FAIL ' + name + '\n' + e.stack);
  }
}
console.log('\n' + (tests.length - failed) + '/' + tests.length + ' DEV-003 checks passed. No live database or messages used.');
if (failed) process.exitCode = 1;
