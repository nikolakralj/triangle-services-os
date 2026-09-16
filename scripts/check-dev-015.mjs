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
