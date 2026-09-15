// CASE-004 visibility slice: cited doors, holding hashes, deep-links.
// Isolated fixtures. No env, no live database.
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

const {
  companyCitedIn,
  holdingDeepLink,
  missionHasContext,
  missionHoldingAnchor,
  missionHoldingsHref,
  missionStepAnchor,
  missionStepHref,
  parseMissionHoldingHash,
  parseMissionStepHash,
  parseMissionSurfaceTab,
} = moduleLoader()('src/lib/data/mission-shared.ts');

const PMS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROESLER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SCOUT_MISSION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const HANNA_MISSION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const HANNA_STEP = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

test('Hanna citing Scout doors matches PMS even at three letters', () => {
  const brief =
    'Scout filed reachable doors at PMS and Rösler. I am matching electricians against those buyers.';
  assert.equal(companyCitedIn(brief, 'PMS'), true);
  assert.equal(companyCitedIn(brief, 'PMS GmbH'), true);
});

test('Rösler matches the umlaut and the oe spelling', () => {
  assert.equal(companyCitedIn('Call Rösler first.', 'Rösler'), true);
  assert.equal(companyCitedIn('Scout found Roesler in Bavaria.', 'Rösler'), true);
  assert.equal(companyCitedIn('Rösler GmbH is the door.', 'Roesler GmbH'), true);
});

test('legal endings and other companies do not false-match', () => {
  const brief = 'Scout filed reachable doors at PMS and Rösler.';
  assert.equal(companyCitedIn(brief, 'GmbH'), false);
  assert.equal(companyCitedIn(brief, 'STRABAG'), false);
  assert.equal(companyCitedIn('symptoms of a delay', 'PMS'), false);
});

test('holding chips deep-link to this mission tab, the source mission tab, or the record', () => {
  assert.equal(missionHoldingAnchor(PMS), `holding-${PMS}`);
  assert.equal(
    holdingDeepLink({
      companyId: PMS,
      sourceMissionId: SCOUT_MISSION,
      onThisMission: true,
      thisMissionId: HANNA_MISSION,
    }),
    `/missions/${HANNA_MISSION}?tab=companies#holding-${PMS}`,
  );
  assert.equal(
    holdingDeepLink({ companyId: PMS, sourceMissionId: SCOUT_MISSION, onThisMission: true }),
    `?tab=companies#holding-${PMS}`,
  );
  assert.equal(
    holdingDeepLink({ companyId: PMS, sourceMissionId: SCOUT_MISSION, onThisMission: false }),
    `/missions/${SCOUT_MISSION}?tab=companies#holding-${PMS}`,
  );
  assert.equal(
    holdingDeepLink({ companyId: ROESLER, sourceMissionId: null, onThisMission: false }),
    `/companies/${ROESLER}`,
  );
});

test('hash parsers accept the anchors the chips write', () => {
  assert.equal(parseMissionHoldingHash(`#holding-${PMS}`), PMS);
  assert.equal(parseMissionHoldingHash(`holding-${PMS}`), PMS);
  assert.equal(parseMissionStepHash(`#${missionStepAnchor(HANNA_STEP)}`), HANNA_STEP);
  assert.equal(parseMissionHoldingHash('#holding-not-a-uuid'), null);
});

test('empty context hides; Hanna DACH context shows', () => {
  assert.equal(
    missionHasContext({ requests: [], sourceMissions: [], holdings: [] }),
    false,
  );
  assert.equal(
    missionHasContext({
      requests: [
        {
          assignmentId: HANNA_STEP,
          title: 'DACH buyers for Elektromontage',
          askedOf: 'Scout',
          askedBy: 'Hanna',
          status: 'completed',
          headline: 'PMS and Rösler',
        },
      ],
      sourceMissions: [{ missionId: SCOUT_MISSION, title: 'Austria EPC', emoji: 'AT' }],
      holdings: [
        {
          companyId: PMS,
          name: 'PMS',
          sourceMissionId: SCOUT_MISSION,
          onThisMission: false,
        },
      ],
    }),
    true,
  );
});

test('surface tab parser and shareable holdings/step hrefs', () => {
  assert.equal(parseMissionSurfaceTab('companies'), 'companies');
  assert.equal(parseMissionSurfaceTab('Doors'), null);
  assert.equal(parseMissionSurfaceTab('overview'), 'overview');
  assert.equal(parseMissionSurfaceTab('nope'), null);
  assert.equal(
    missionHoldingsHref(HANNA_MISSION, PMS),
    `/missions/${HANNA_MISSION}?tab=companies#holding-${PMS}`,
  );
  assert.equal(
    missionStepHref(HANNA_MISSION, HANNA_STEP),
    `/missions/${HANNA_MISSION}#step-${HANNA_STEP}`,
  );
});

test('recruiting Overview click path: chips open Doors tab, not a dead hash', () => {
  const chips = fs.readFileSync(path.resolve(root, 'src/components/missions/mission-context.tsx'), 'utf8');
  const view = fs.readFileSync(path.resolve(root, 'src/components/missions/mission-view.tsx'), 'utf8');
  const page = fs.readFileSync(path.resolve(root, 'src/app/(app)/missions/[id]/page.tsx'), 'utf8');
  assert.match(chips, /onOpenHolding/);
  assert.match(chips, /thisMissionId: missionId/);
  assert.match(chips, /missionStepHref/);
  assert.match(view, /parseMissionSurfaceTab/);
  assert.match(view, /openHolding/);
  assert.match(view, /setActive\("companies"\)/);
  assert.match(view, /focusHoldingId/);
  assert.match(page, /searchParams/);
  assert.match(page, /initialTab/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log('ok ', name);
  } catch (err) {
    failed += 1;
    console.log('FAIL', name);
    console.log(err);
  }
}
if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log(`\n${tests.length}/${tests.length} CASE-004 checks`);
