// The workspace: an answer in the shape the question needs ("The workspace is
// the answer", 29 September). Isolated fixtures: no env, no database, no send.
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

const load = moduleLoader();
const {
  parseWorkspace,
  workspaceProgress,
  describeTest,
  shapeSentence,
  evaluateCalc,
  WORKSPACE_CAPS,
} = load('src/lib/data/workspace.ts');

const sourced = (text, source, extra = {}) => ({ text, basis: 'source', source, ...extra });
const unknown = (note) => ({ basis: 'unknown', note });

// ── question one: the rates question from the Germany Rates mission ─────────

const RATES = {
  shape: 'comparison',
  title: 'German electrician lease rates',
  question: 'What do industrial electricians lease for in Germany, and how do erection rates compare with troubleshooting?',
  answer: {
    verdict:
      'Erection work leases at about 30–45 €/h. Nobody publishes a separate troubleshooting rate, so that half is not established.',
    confidence: 'partial',
    notEstablished: ['A published troubleshooting or commissioning bill rate'],
  },
  blocks: [
    {
      kind: 'table',
      id: 'rates',
      caption: 'Lease rates by work',
      columns: [
        { key: 'work', label: 'Work' },
        { key: 'rate', label: 'Rate', unit: '€/h' },
        { key: 'model', label: 'Engagement' },
        { key: 'included', label: 'Included' },
      ],
      rows: [
        {
          cells: {
            work: { text: 'Industrial erection', basis: 'our_record' },
            rate: sourced('30–45', 'go2work'),
            model: sourced('Labour lease', 'go2work'),
            included: unknown('The page does not say whether travel is in the rate'),
          },
        },
        {
          cells: {
            work: { text: 'Troubleshooting and commissioning', basis: 'our_record' },
            rate: unknown('No published bill rate found'),
            model: sourced('Service contract, not labour lease', 'zeitarbeit'),
            included: unknown('Not established'),
          },
        },
      ],
    },
    {
      kind: 'calc',
      id: 'margin',
      caption: 'What it leaves us',
      inputs: [
        { key: 'bill', label: 'We bill', value: 38, unit: '€/h' },
        { key: 'cost', label: 'The worker costs', value: 22, unit: '€/h' },
        { key: 'hours', label: 'Hours a month', value: 174 },
        { key: 'housing', label: 'Accommodation a month', value: 600, unit: '€' },
      ],
      outputs: [
        { key: 'per_hour', label: 'Margin an hour', expr: 'bill - cost', unit: '€/h' },
        { key: 'per_month', label: 'Margin a month', expr: '(bill - cost) * hours - housing', unit: '€' },
      ],
      assumptions: ['One worker, no travel, no idle days'],
    },
    {
      kind: 'gaps',
      id: 'open',
      items: [
        {
          missing: 'A written troubleshooting rate',
          nextStep: 'Ask two lessors for a written quote for erection against troubleshooting',
          whoCould: 'Scout',
        },
      ],
    },
  ],
  doneWhen: [
    { kind: 'every_row_has', block: 'rates', column: 'rate' },
    { kind: 'every_row_dated', block: 'rates' },
    { kind: 'sources_at_least', count: 2 },
  ],
  sources: [
    { id: 'go2work', title: 'Cost of leased Polish specialists', url: 'https://go2-work.de/kosten', date: '2026-01' },
    { id: 'zeitarbeit', title: 'Subcontracting and freelance costs', url: 'https://zeitarbeit-produktion.de/kosten', date: '2026-01-24' },
  ],
};

// ── question two: a different question, from the same vocabulary ────────────

const SERBIAN_CITIZENS = {
  shape: 'route',
  title: 'Serbian citizens working in the EU',
  question: 'How do we employ Serbian citizens on EU sites?',
  sensitive: true,
  caution:
    'This is what the official pages say, not legal advice. Confirm each route with counsel before promising a start date.',
  answer: {
    verdict:
      'Germany takes the West Balkans route with a work contract and a labour-market check; Austria needs a shortage-occupation permit first.',
    confidence: 'partial',
    notEstablished: ['How long the German consulate in Belgrade is taking for appointments'],
  },
  blocks: [
    {
      kind: 'table',
      id: 'countries',
      caption: 'Route by country',
      columns: [
        { key: 'country', label: 'Country' },
        { key: 'route', label: 'Permit route' },
        { key: 'weeks', label: 'Weeks' },
      ],
      rows: [
        {
          cells: {
            country: sourced('Germany', 'de-rule'),
            route: sourced('West Balkans regulation, work contract first', 'de-rule'),
            weeks: unknown('Appointment waiting time not published'),
          },
        },
        {
          cells: {
            country: sourced('Austria', 'at-rule'),
            route: sourced('Shortage occupation permit', 'at-rule'),
            weeks: sourced('8', 'at-rule'),
          },
        },
      ],
    },
    {
      kind: 'route',
      id: 'steps',
      caption: 'What we do, in order',
      steps: [
        { title: 'Sign a work contract naming the site and the pay', who: 'Nikola', duration: '1 day', basis: 'source', source: 'de-rule' },
        { title: 'File the labour-market check', who: 'Hanna', duration: '2 weeks', basis: 'source', source: 'de-rule' },
        { title: 'Book the consulate appointment in Belgrade', who: 'The worker', basis: 'unknown' },
      ],
    },
  ],
  doneWhen: [
    { kind: 'steps_have_owner', block: 'steps' },
    { kind: 'every_row_has', block: 'countries', column: 'weeks' },
    { kind: 'sources_at_least', count: 2 },
  ],
  sources: [
    { id: 'de-rule', title: 'Western Balkans regulation', url: 'https://www.make-it-in-germany.com/westbalkan', publisher: 'Federal Government', date: '2026-06' },
    { id: 'at-rule', title: 'Shortage occupation list', url: 'https://www.migration.gv.at/mangelberufe', publisher: 'Republic of Austria', date: '2026-01' },
  ],
};

const ok = (input) => {
  const result = parseWorkspace(input);
  assert.equal(result.ok, true, result.ok ? '' : result.errors.join(' | '));
  return result.workspace;
};

const refused = (input, expected) => {
  const result = parseWorkspace(input);
  assert.equal(result.ok, false, 'this should have been refused');
  assert.ok(
    result.errors.some((e) => expected.test(e)),
    `refusal did not say why: ${result.errors.join(' | ')}`,
  );
};

const clone = (value) => JSON.parse(JSON.stringify(value));

// ── the same vocabulary answers both questions ──────────────────────────────

test('a rates question is answered as a comparison, a calculation and the gaps', () => {
  const w = ok(RATES);
  assert.equal(w.shape, 'comparison');
  assert.deepEqual(w.blocks.map((b) => b.kind), ['table', 'calc', 'gaps']);
  assert.match(shapeSentence(w.shape), /comparison with dated evidence/);
});

test('a permit question is answered from the same blocks — no new code', () => {
  const w = ok(SERBIAN_CITIZENS);
  assert.equal(w.shape, 'route');
  for (const block of w.blocks) {
    assert.ok(['table', 'route', 'list', 'calc', 'decision', 'gaps'].includes(block.kind));
  }
});

// ── simple enough for a person ──────────────────────────────────────────────

test('the short answer is a field, so it is always first', () => {
  const noAnswer = clone(RATES);
  delete noAnswer.answer;
  refused(noAnswer, /answer/);
});

test('a person is never shown more than five blocks or six columns', () => {
  assert.equal(WORKSPACE_CAPS.blocks, 5);
  assert.equal(WORKSPACE_CAPS.tableColumns, 6);
  const tooMany = clone(RATES);
  tooMany.blocks = [
    ...tooMany.blocks,
    { kind: 'gaps', id: 'more1', items: [{ missing: 'one' }] },
    { kind: 'gaps', id: 'more2', items: [{ missing: 'two' }] },
    { kind: 'gaps', id: 'more3', items: [{ missing: 'three' }] },
  ];
  refused(tooMany, /blocks/);
  const wideTable = clone(RATES);
  wideTable.blocks[0].columns = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) => ({ key: k, label: k.toUpperCase() }));
  refused(wideTable, /columns/);
});

test('ids and markup never reach what a person reads', () => {
  const withId = clone(RATES);
  withId.answer.verdict = 'Rates for lead c74e1ccd-d433-4a34-882f-ffefe70619f1 are 30–45 €/h.';
  refused(withId, /ids belong in the thread/);
  const withDriveId = clone(RATES);
  withDriveId.blocks[0].rows[0].cells.work.text = 'Erection 1_wpvuPFgKcSsCaP7KBxnGP7GnQcoPmhs';
  refused(withDriveId, /ids belong in the thread/);
  const withMarkup = clone(RATES);
  withMarkup.answer.verdict = '**Erection** leases at 30–45 €/h.';
  refused(withMarkup, /plain words only/);
  // A long German compound noun is a word, not an id.
  const compound = clone(RATES);
  compound.blocks[0].rows[0].cells.model.text = 'Nachunternehmerverrechnungssatz';
  ok(compound);
});

test('an unknown block is refused, not drawn', () => {
  const invented = clone(RATES);
  invented.blocks.push({ kind: 'gauge', id: 'speedo', value: 7 });
  refused(invented, /kind|block/i);
});

// ── every fact carries its basis ────────────────────────────────────────────

test('a sourced fact must name a source, and the source must exist', () => {
  const noSource = clone(RATES);
  noSource.blocks[0].rows[0].cells.rate = { text: '30–45', basis: 'source' };
  refused(noSource, /must name its source/);
  const danglingSource = clone(RATES);
  danglingSource.blocks[0].rows[0].cells.rate = { text: '30–45', basis: 'source', source: 'made-up' };
  refused(danglingSource, /cited but not in the sources/);
});

test('a value with no basis, and an unknown with a value, are both refused', () => {
  const noBasis = clone(RATES);
  noBasis.blocks[0].rows[0].cells.rate = { text: '30–45' };
  refused(noBasis, /basis/);
  const empty = clone(RATES);
  empty.blocks[0].rows[0].cells.rate = { basis: 'our_record' };
  refused(empty, /must be marked unknown/);
  const bothWays = clone(RATES);
  bothWays.blocks[0].rows[0].cells.rate = { text: '30–45', basis: 'unknown' };
  refused(bothWays, /carries no value/);
});

test('a sensitive answer needs a caution, and cannot lean on our own record', () => {
  const noCaution = clone(SERBIAN_CITIZENS);
  delete noCaution.caution;
  refused(noCaution, /not legal advice/);
  const ourWord = clone(SERBIAN_CITIZENS);
  ourWord.blocks[0].rows[0].cells.route = { text: 'Work contract first', basis: 'our_record' };
  refused(ourWord, /our own record is not authority/);
});

// ── finished is counted from the artifact ───────────────────────────────────

test('progress comes from the tests, and says what is still open', () => {
  const w = ok(RATES);
  const progress = workspaceProgress(w);
  // Troubleshooting has no rate, so the first test fails honestly.
  assert.equal(progress.total, 3);
  assert.equal(progress.passed, 2);
  assert.equal(progress.percent, 67);
  assert.equal(progress.open.length, 1);
  assert.match(progress.open[0], /every row in Lease rates by work has rate/);
});

test('filling the gap moves it to finished — nothing else does', () => {
  const filled = clone(RATES);
  filled.blocks[0].rows[1].cells.rate = { text: '45–60', basis: 'source', source: 'zeitarbeit' };
  const progress = workspaceProgress(ok(filled));
  assert.equal(progress.passed, 3);
  assert.equal(progress.percent, 100);
  assert.deepEqual(progress.open, []);
});

test('a test must fit the block it names, and the column must exist', () => {
  const wrongKind = clone(RATES);
  wrongKind.doneWhen = [{ kind: 'steps_have_owner', block: 'rates' }];
  refused(wrongKind, /needs a route/);
  const noColumn = clone(RATES);
  noColumn.doneWhen = [{ kind: 'every_row_has', block: 'rates', column: 'gross_margin' }];
  refused(noColumn, /not a column/);
  const permits = ok(SERBIAN_CITIZENS);
  assert.match(describeTest(permits.doneWhen[0], permits), /every step in What we do, in order says who does it/);
});

test('an undated source does not count as dated evidence', () => {
  const undated = clone(RATES);
  undated.sources = undated.sources.map((s) => ({ ...s, date: undefined }));
  const progress = workspaceProgress(ok(undated));
  assert.ok(progress.open.some((line) => /dated source/.test(line)));
});

// ── the calculation is data, never code ─────────────────────────────────────

test('the person\'s own numbers run through the employee\'s arithmetic', () => {
  const w = ok(RATES);
  const calc = w.blocks.find((b) => b.kind === 'calc');
  const out = evaluateCalc(calc);
  assert.equal(out.per_hour, 16);
  assert.equal(out.per_month, 16 * 174 - 600);
  // "What if accommodation is 900 and we bill 42?"
  const changed = evaluateCalc(calc, { housing: 900, bill: 42 });
  assert.equal(changed.per_hour, 20);
  assert.equal(changed.per_month, 20 * 174 - 900);
});

test('an expression may only use the inputs above it, and never call anything', () => {
  const unknownName = clone(RATES);
  unknownName.blocks[1].outputs[0].expr = 'bill - salary';
  refused(unknownName, /not an input above it/);
  const code = clone(RATES);
  code.blocks[1].outputs[0].expr = 'fetch("/api/mail/send")';
  refused(code, /arithmetic over the inputs only/);
  const semicolons = clone(RATES);
  semicolons.blocks[1].outputs[0].expr = 'bill; process.exit(1)';
  refused(semicolons, /arithmetic over the inputs only/);
});

// ── the law is written where every agent reads it ────────────────────────────

test('the law says the workspace is the answer, and keeps it human', () => {
  const decisions = read('DECISIONS.md');
  assert.match(decisions, /The workspace is the answer/);
  assert.match(decisions, /Simple enough for a person/);
  assert.match(decisions, /Every fact carries its basis/);
  assert.match(decisions, /Done is counted from the artifact/);
  const rules = read('PRODUCT_OPERATING_RULES.md');
  assert.match(rules, /The workspace is the answer/);
  assert.match(rules, /Reject a result that/);
  const constitution = read('agents/shared-constitution.md');
  assert.match(constitution, /Answer in the shape the question needs/);
  assert.match(constitution, /not established/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(`  ${err instanceof Error ? err.message : err}`);
  }
}
console.log(`${tests.length - failed}/${tests.length} ok`);
if (failed) process.exit(1);
