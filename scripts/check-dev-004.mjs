// DEV-004: Bob takes commercial follow-through. Isolated fixtures.
// No env, no live database, no messages sent, SQL is not applied.
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

const sqlPath = 'supabase/data-fixes/2026-09-16-bob-mission-work-scope.sql';
const scopesSrc = read('src/lib/data/agent-scopes.ts');
const hireSrc = read('src/components/modules/hire-employee.tsx');
const workforceSrc = read('src/lib/data/workforce.ts');
const assignmentsSrc = read('src/app/api/agents/assignments/route.ts');
const askBobSrc = read('src/lib/data/ask-bob.ts');
const bobMd = read('agents/bob.md');
const roadmap = read('ROADMAP_EXECUTION.md');

const {
  AGENT_SCOPES,
  ROLE_PRESETS,
} = moduleLoader()('src/lib/data/agent-scopes.ts');
const {
  bobFollowThroughBlockedReason,
  isBobRole,
  isBobEmployee,
  bobWakeEnvNames,
  MISSION_WORK_SCOPE,
} = moduleLoader()('src/lib/data/ask-bob-policy.ts');
const { employeeRuntimeOf, isScoutRole, wakeEnvNames } = moduleLoader({
  '@/lib/supabase/server': { createServiceSupabaseClient: () => null },
})('src/lib/data/bot-runtime.ts');

test('mission.work is in the manager-facing scope catalog', () => {
  const spec = AGENT_SCOPES.find((s) => s.value === 'mission.work');
  assert.ok(spec, 'mission.work missing from AGENT_SCOPES');
  assert.match(spec.description, /own mission/i);
  assert.match(spec.description, /assignment/i);
  assert.match(spec.description, /cannot send/i);
  assert.equal(MISSION_WORK_SCOPE, 'mission.work');
  assert.match(scopesSrc, /suggestedFor: \["inbox"\]/);
});

test("Bob's hire preset is mail ingest plus mission.work", () => {
  const bob = ROLE_PRESETS.find((p) => p.displayName === 'Bob' || p.key === 'inbox');
  assert.ok(bob);
  assert.deepEqual([...bob.scopes].sort(), ['job_intake.ingest', 'mission.work']);
  assert.match(bob.roleTitle, /Commercial Operations/i);
  assert.match(hireSrc, /AGENT_SCOPES/);
  assert.match(hireSrc, /ROLE_PRESETS/);
});

test('hire UI lists catalog scopes rather than a hardcoded Bob-only list', () => {
  assert.match(hireSrc, /AGENT_SCOPES\.map/);
  assert.doesNotMatch(hireSrc, /job_intake\.ingest['"]\s*,\s*['"]research/);
});

test('data-fix SQL exists, is previewable, and is idempotent', () => {
  assert.equal(fs.existsSync(path.resolve(root, sqlPath)), true);
  const sql = read(sqlPath);
  assert.match(sql, /DO NOT APPLY/i);
  assert.match(sql, /Preview/i);
  assert.match(sql, /share one database/i);
  assert.match(sql, /inbox_coordinator/);
  assert.match(sql, /mission\.work/);
  assert.match(sql, /not \('mission\.work' = any/i);
  assert.match(sql, /array\['mission\.work'\]/);
  assert.match(sql, /BOT_WAKE_URL_INBOX_COORDINATOR/);
  assert.doesNotMatch(sql, /project_researcher/);
  assert.doesNotMatch(sql, /research\.suggestion\.create/);
  assert.equal(fs.existsSync(path.resolve(root, 'supabase/migrations/' + path.basename(sqlPath))), false);
});

test('Ask Bob still fails honestly without mission.work', () => {
  const reason = bobFollowThroughBlockedReason({
    bob: { id: 'bob-1', name: 'Bob' },
    scopes: ['job_intake.ingest'],
    runtime: 'bot',
  });
  assert.match(reason, /mission scope \(DEV-004\)/);
});

test('Ask Bob is unblocked when scope and bot runtime are present', () => {
  assert.equal(
    bobFollowThroughBlockedReason({
      bob: { id: 'bob-1', name: 'Bob' },
      scopes: ['job_intake.ingest', 'mission.work'],
      runtime: 'bot',
    }),
    null,
  );
});

test('Bob commercial roles are bot-owned even with empty config', () => {
  assert.equal(isBobRole('inbox_coordinator'), true);
  assert.equal(isBobRole('commercial_ops'), true);
  assert.equal(isBobRole('inbox_courier'), true);
  assert.equal(isBobRole('project_researcher'), false);
  assert.equal(isBobEmployee({ roleKey: 'hr', displayName: 'Bob' }), true);
  assert.equal(employeeRuntimeOf('inbox_coordinator', {}), 'bot');
  assert.equal(employeeRuntimeOf('inbox_coordinator', { mission_runtime: 'in_app' }), 'bot');
  assert.equal(employeeRuntimeOf('hr', {}), 'in_app');
  assert.equal(employeeRuntimeOf('hr', { mission_runtime: 'bot' }), 'bot');
  assert.equal(isScoutRole('project_researcher'), true);
});

test('live Bob wake env names are INBOX_COORDINATOR, not invented URLs', () => {
  assert.deepEqual(bobWakeEnvNames('inbox_coordinator'), {
    url: 'BOT_WAKE_URL_INBOX_COORDINATOR',
    key: 'BOT_WAKE_KEY_INBOX_COORDINATOR',
  });
  assert.deepEqual(wakeEnvNames('inbox_coordinator'), bobWakeEnvNames('inbox_coordinator'));
  assert.doesNotMatch(read('src/lib/data/bot-runtime.ts'), /https?:\/\/.*grok/i);
  assert.doesNotMatch(read('src/lib/data/ask-bob.ts'), /https?:\/\//);
});

test('Bob assignments force execution_mode bot and wake like Scout', () => {
  assert.match(workforceSrc, /isBobRole\(roleKey\)/);
  assert.match(workforceSrc, /execution_mode: "bot"/);
  assert.match(workforceSrc, /event: "assignment"/);
  assert.match(assignmentsSrc, /isScoutRole\(roleKey\) \|\| isBobRole\(roleKey\)/);
  assert.match(assignmentsSrc, /execution_mode: "bot"/);
  assert.match(askBobSrc, /execution_mode: "bot"/);
  assert.match(askBobSrc, /created\.notice/);
  assert.doesNotMatch(askBobSrc, /wakeEmployee\(/);
});

test('Bob role file covers follow-through and still forbids sending', () => {
  assert.match(bobMd, /Commercial follow-through/i);
  assert.match(bobMd, /mission\.work/);
  assert.match(bobMd, /sends nothing/i);
  assert.match(bobMd, /without being anyone's boss/i);
  assert.match(bobMd, /Do not reply, delete, archive, label, or\nforward any email/);
});

test('Ask Bob objective still forbids sending', () => {
  const text = moduleLoader()('src/lib/data/ask-bob-policy.ts').askBobObjective({
    instruction: 'Chase the Ireland commissioning follow-up.',
  });
  assert.match(text, /Do not send anything/);
});

test('ROADMAP_EXECUTION records DEV-004 code done with SQL/wake limit', () => {
  const slice = roadmap.slice(roadmap.indexOf('### DEV-004'), roadmap.indexOf('### DEV-005'));
  assert.match(slice, /`DONE`/);
  assert.match(slice, /2026-09-16-bob-mission-work-scope\.sql/);
  assert.match(slice, /BOT_WAKE_URL_INBOX_COORDINATOR/);
  assert.match(slice, /not\napplied|not applied/i);
  assert.match(slice, /sends nothing/i);
});

test('mission-bot already accepts mission.work as a write scope', () => {
  const src = read('src/lib/data/mission-bot.ts');
  assert.match(src, /WRITE_SCOPES = \["mission\.work"/);
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
console.log(
  failed === 0
    ? `${tests.length}/${tests.length} ok`
    : `${tests.length - failed}/${tests.length} passed`,
);
process.exit(failed === 0 ? 0 : 1);
