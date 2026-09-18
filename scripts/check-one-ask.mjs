// One Ask on the case ("Employees, not buttons", 18 September).
// Isolated fixtures. No env, no live database, no messages sent, no SQL applied.
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
const { routeCaseAsk, routedSentence, DEFAULT_CASE_ASK } = load('src/lib/data/case-ask-routing.ts');
const { explicitPackIntent, parsePackIntent } = load('src/lib/data/put-forward.ts');

const emailActions = read('src/components/modules/today-email-actions.tsx');
const drawer = read('src/components/modules/assignment-thread-drawer.tsx');
const caseAsk = read('src/lib/data/case-ask.ts');
const caseRoute = read('src/app/api/ask/case/route.ts');
const messagesRoute = read('src/app/api/assignments/[id]/messages/route.ts');
const rules = read('PRODUCT_OPERATING_RULES.md');

const route = (text, opts) => {
  const r = routeCaseAsk(text, opts);
  return `${r.bob ? 'bob' : ''}${r.bob && r.hanna ? '+' : ''}${r.hanna ? 'hanna' : ''}`;
};

// ── the routing: the person never picks the employee ────────────────────────

test('the brief\'s own sentences reach the right half', () => {
  assert.equal(route('find CVs for this offer and prepare bios'), 'hanna');
  assert.equal(route('prepare anonymised bio for Matej as M.P. only'), 'hanna');
  assert.equal(route('follow up Oliver on Saxony — don\'t send'), 'bob');
  assert.equal(route('find who fits and prepare initials bios'), 'hanna');
});

test('the default Ask hands both halves over in one click', () => {
  assert.equal(route(DEFAULT_CASE_ASK), 'bob+hanna');
});

test('questions about the conversation are Bob\'s', () => {
  assert.equal(route('did Oliver answer?'), 'bob');
  assert.equal(route('was the profile already sent?'), 'bob');
  assert.equal(route('draft a short reply about rates'), 'bob');
});

test('naming somebody on the books is Hanna\'s half, even without a CV word', () => {
  assert.equal(route('we should use matej and add attachment', { namesSomeoneOnTheBooks: true }), 'hanna');
  assert.equal(route('not Igor, use Matej instead', { namesSomeoneOnTheBooks: true }), 'hanna');
});

test('words that need both reach both', () => {
  assert.equal(route('send him Matej\'s bio'), 'bob+hanna');
  assert.equal(route('reply to Oliver with the anonymised profile'), 'bob+hanna');
});

test('words that name neither half go to Bob, who owns the chase', () => {
  assert.equal(route('handle this'), 'bob');
  assert.equal(route('what now?'), 'bob');
});

test('the sentence says who has it and where the answer comes back', () => {
  assert.equal(routedSentence(['Bob']), 'Bob has it. The answer comes back on this card.');
  assert.equal(
    routedSentence(['Bob', 'Hanna']),
    'Bob and Hanna have it. The answer comes back on this card.',
  );
  assert.equal(routedSentence(['Hanna', 'Hanna']), 'Hanna has it. The answer comes back on this card.');
});

// ── the form: decided by the words only when the words decide it ───────────

test('the form changes only when the words name one', () => {
  assert.equal(explicitPackIntent('follow up with Oliver'), null);
  assert.equal(explicitPackIntent('use Matej instead'), null);
  assert.equal(explicitPackIntent('send the full CV'), 'full_cv');
  assert.equal(explicitPackIntent('just a short bio'), 'short_bio');
  assert.equal(explicitPackIntent('Matej as M.P.'), 'bio_anonymised');
  // Silence still means the anonymised packet when a job is opened.
  assert.equal(parsePackIntent('find who fits'), 'bio_anonymised');
});

// ── the card: one Ask, no employee buttons, no machinery ───────────────────

test('the card has one Ask and never asks the person to pick an employee', () => {
  assert.match(emailActions, /\/api\/ask\/case/);
  assert.doesNotMatch(emailActions, /Ask Bob|Ask Hanna|Hand to Bob|Hand to Hanna/);
  assert.doesNotMatch(emailActions, /type="radio"/);
  assert.doesNotMatch(emailActions, /\/api\/ask\/bob|\/api\/ask\/hanna/);
  assert.equal(fs.existsSync(path.resolve(root, 'src/components/modules/ask-hanna-action.tsx')), false);
});

test('Take back left the card for the thread, where the work is', () => {
  // A button's own text line, not a comment that mentions it.
  assert.doesNotMatch(emailActions, /^\s*Take back\s*$/m);
  assert.match(drawer, /^\s*Take back\s*$/m);
});

test('the drawer has no second Ask; words in Bob\'s thread reach Hanna by themselves', () => {
  assert.doesNotMatch(drawer, /AskHannaAction/);
  assert.match(messagesRoute, /routeThreadWords/);
  // Only a signed-in person's words hand work on; a machine key never does.
  assert.match(messagesRoute, /refuseUnlessHuman\(access, "canWrite", "hand work to the team"\)/);
});

// ── the server: same case, no second job, no stale approval ─────────────────

test('the route is a person\'s, and sends nothing', () => {
  assert.match(caseRoute, /refuseUnlessHuman\(access, "canWrite"/);
  assert.match(caseRoute, /askTheTeam\(/);
  for (const src of [caseAsk, caseRoute]) {
    assert.doesNotMatch(src, /sendViaMailbox|nodemailer|createTransport|\/api\/mail\/send/);
  }
});

test('an employee already on the case gets the words in that thread, not a second job', () => {
  assert.match(caseAsk, /latestCaseWork\(/);
  assert.match(caseAsk, /addHumanMessage\(\{/);
  assert.match(caseAsk, /how: "thread"/);
});

test('changing the person or the form clears the approval the send gate reads', () => {
  const rebind = caseAsk.slice(caseAsk.indexOf('async function rebindPutForward'), caseAsk.indexOf('async function giveHanna'));
  assert.match(rebind, /review_outcome: null/);
  assert.match(rebind, /reviewed_at: null/);
  assert.match(rebind, /reviewed_by: null/);
  assert.match(rebind, /worker_id/);
  assert.match(rebind, /pack_intent/);
});

test('the recipient\'s own name never binds a worker', () => {
  assert.match(caseAsk, /withoutRecipient\(text, ctx\.who\)/);
});

test('the law this implements is written where coding agents read it', () => {
  assert.match(rules, /Employees, not buttons/);
  assert.match(rules, /more primary buttons than it removes/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(err);
  }
}
console.log(`${tests.length - failed}/${tests.length} ok`);
if (failed) process.exit(1);
