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

// ── slice B: the team's decision, not a radio list or a wall of ids ─────────

const decisionHelpers = load('src/lib/data/case-decision.ts');
const todayScreen = read('src/components/modules/today-screen.tsx');
const todayMissions = read('src/components/modules/today-missions.tsx');
const decisionBlock = read('src/components/modules/case-decision.tsx');
const nextMove = read('src/lib/data/next-move.ts');
const sendReview = read('src/components/modules/send-from-triangle.tsx');
const leadMatch = read('src/lib/data/lead-match.ts');

// Bob's real write-up on Oliver Hall's card, 18 September.
const BOB_ON_OLIVER = `Status on Ask Bob “we should use matej and add attachment” (Oliver Hall · Automation Engineer - PLC Commissioning · lead c74e1ccd-d433-4a34-882f-ffefe70619f1):

Already done in Gmail (no further send from Bob).

Evidence
- Matej = anonymised CV #244 / M.P. (Triangle_Services_CV_244_MP.pdf, Drive 1_wpvuPFgKcSsCaP7KBxnGP7GnQcoPmhs). Named file also exists as Triangle_Services_CV_Matej_Plesivcak.pdf (Drive 1TVxRJs4bj9uKw0MWRjzUW8y1G6rb3jCJ) — not used in the send.
- Thread 1a0ae1c9394c47a0 · subject “Re: Automation Engineer - PLC commissioning engineer — USA”
- Oliver asked for the profile 2026-09-17T10:07:55Z (oliver.hall@g2recruitment.com).
- Sent 2026-09-18T07:35:05Z from nikola.kralj@triangle-services.com with PDF attachment Triangle_Services_CV_244_MP.pdf.

This Ask Bob wake arrived ~5 minutes after that send (assignment at 2026-09-18T07:39:50Z).

Human decision only if you meant the named Matej PDF instead of anonymised CV #244 — say so and Bob can draft a correction follow-up (will not send). Otherwise: wait for Oliver’s reply; no further outbound needed.

Bob did not send, publish, delete, or archive anything on this wake.`;

test('a report loses its machinery: no uuids, no Drive or thread ids, dates a person reads', () => {
  const clean = decisionHelpers.humaniseReport(BOB_ON_OLIVER);
  assert.doesNotMatch(clean, /[0-9a-f]{8}-[0-9a-f]{4}-/);
  assert.doesNotMatch(clean, /1_wpvuPF|1TVxRJs4/);
  assert.doesNotMatch(clean, /1a0ae1c9394c47a0/);
  assert.doesNotMatch(clean, /T\d{2}:\d{2}:\d{2}Z/);
  assert.match(clean, /17 Sep 10:07/);
  assert.match(clean, /\(Oliver Hall · Automation Engineer - PLC Commissioning\)/);
  assert.match(clean, /\(Triangle_Services_CV_244_MP\.pdf\)/);
  assert.doesNotMatch(clean, /\(\s*\)|,\s*\)/);
  // Hanna's own shape: "for M.P. (worker 174ef973-…) vs PLC commissioning".
  assert.equal(
    decisionHelpers.humaniseReport('Anonymised bio check for M.P. (worker 174ef973-2f41-4e49-b40a-10cd1730a644) vs PLC commissioning'),
    'Anonymised bio check for M.P. vs PLC commissioning',
  );
});

test('In progress and Done show the decision lines, not the raw report', () => {
  assert.match(todayMissions, /reportOpening\(wait\.lastAgentBody\)/);
  assert.match(todayMissions, /reportOpening\(item\.lastAgentBody \|\| item\.resultSummary\)/);
});

test('the opening lines are the decision and the one thing to do, not the echo or the evidence', () => {
  const opening = decisionHelpers.reportOpening(BOB_ON_OLIVER);
  assert.match(opening, /^Already done in Gmail/);
  assert.match(opening, /Human decision only if/);
  assert.doesNotMatch(opening, /Status on Ask Bob|Evidence|wake arrived|did not send, publish/);
});

test('the form comes with its reason', () => {
  assert.match(
    decisionHelpers.formSentence('bio_anonymised', 'g2 Recruitment'),
    /anonymised bio — g2 Recruitment is an agency, so the name stays with us/,
  );
  assert.match(decisionHelpers.formSentence('full_cv', 'g2 Recruitment'), /a person released the name/);
  assert.match(decisionHelpers.formSentence('short_bio', null), /short anonymised bio/);
  assert.equal(decisionHelpers.othersSentence(['Igor Pejkovic', 'Nikola Kralj']), 'Igor Pejkovic and Nikola Kralj');
  assert.equal(decisionHelpers.othersSentence(['A', 'B', 'C', 'D', 'E']), 'A, B, C and 2 more');
});

test('the card shows the team\'s decision instead of a radio list, a pool search and Bob\'s wall', () => {
  assert.match(todayScreen, /<CaseDecision/);
  assert.doesNotMatch(todayScreen, /type="radio"|today-offering|Someone else in the pool|EmployeePrepared|PutForwardBlock/);
  assert.doesNotMatch(todayScreen, /Copy pitch|Copy what they wrote/);
  assert.match(todayMissions, /<CaseDecision/);
  assert.equal(fs.existsSync(path.resolve(root, 'src/components/modules/put-forward-block.tsx')), false);
  // Others who fit are named, never offered as controls; switching is words.
  assert.match(decisionBlock, /Also fit:/);
  assert.match(decisionBlock, /in Ask to switch/);
  assert.doesNotMatch(decisionBlock, /type="radio"|<select/);
  // Nobody is asked to pick.
  assert.doesNotMatch(nextMove, /pick who to put forward/);
});

// ── slice C: Send decided, not picked ────────────────────────────────────────

test('the Send review has no radio list, and the From address is where they wrote', () => {
  assert.doesNotMatch(sendReview, /type="radio"|Who the reply is about|Someone else in the pool/);
  assert.match(sendReview, /senders\.find\(\(box\) => box\.id === replyFrom\)/);
  // A choice appears only when Triangle cannot tell.
  assert.match(sendReview, /!decided && senders\.length > 1 \?/);
  assert.match(sendReview, /the address \{target\.who\} wrote to/);
  assert.match(todayScreen, /replyFrom=\{action\.receivedIn \?\? null\}/);
  assert.match(leadMatch, /from\("inbound_emails"\)/);
  assert.match(leadMatch, /mail_account_id/);
});

test('the approved document goes with the reply; the server still re-reads the approval', () => {
  assert.match(sendReview, /useState\(canAttach\)/);
  assert.match(sendReview, /attachPack: attach && canAttach/);
  assert.match(read('src/lib/data/mail-send.ts'), /approvedPackForSend\(/);
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
