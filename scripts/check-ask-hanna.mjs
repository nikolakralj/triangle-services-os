// Ask Hanna: who we put forward, on the same case, bio vs full CV.
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
const putForward = load('src/lib/data/put-forward.ts');
const hannaPolicy = load('src/lib/data/ask-hanna-policy.ts');
const handoff = load('src/lib/data/today-handoff.ts');

const {
  DEFAULT_PACK_INTENT,
  PUT_FORWARD_CASE_TYPE,
  PACK_APPROVED_OUTCOME,
  PACK_NOT_USED_OUTCOME,
  asksForAPutForward,
  initialsOf,
  mayAttachPack,
  packApprovalNote,
  packApprovalOf,
  packApprovalSentence,
  packDisplayName,
  packIntentLabel,
  parsePackIntent,
} = putForward;

const filenames = load('src/lib/data/anonymised-cv-filename.ts');

const askHannaSrc = read('src/lib/data/ask-hanna.ts');
const policySrc = read('src/lib/data/ask-hanna-policy.ts');
const routeSrc = read('src/app/api/ask/hanna/route.ts');
const actionSrc = read('src/components/modules/ask-hanna-action.tsx');
const drawerSrc = read('src/components/modules/assignment-thread-drawer.tsx');
const threadSrc = read('src/components/modules/assignment-thread.tsx');
const emailActionsSrc = read('src/components/modules/today-email-actions.tsx');
const todayScreenSrc = read('src/components/modules/today-screen.tsx');
const todayMissionsSrc = read('src/components/modules/today-missions.tsx');
const blockSrc = read('src/components/modules/put-forward-block.tsx');
const casesSrc = read('src/lib/data/put-forward-cases.ts');
const decisionsPage = read('src/app/(app)/decisions/page.tsx');
const findingSql = read('supabase/migrations/041_finding_contract.sql');

// ── the parse: what the human's own words asked for ─────────────────────────

test('bio wording asks for the anonymised packet', () => {
  for (const words of [
    'send a bio',
    'anonymised profile please',
    'initials only',
    'prepare the capability packet',
    'Matej as M.P.',
    'no name on it',
    'blind profile for the recruiter',
  ]) {
    assert.equal(parsePackIntent(words), 'bio_anonymised', words);
  }
});

test('only an explicit full/named CV releases the identity', () => {
  for (const words of [
    'send the full CV',
    'they want a named CV',
    'full named cv',
    'CV with his name',
    'release the identity',
  ]) {
    assert.equal(parsePackIntent(words), 'full_cv', words);
  }
});

test('a bio marker beats "full named CV" in the same sentence', () => {
  // The CEO's own example. A parser that read the last marker it found would
  // have sent the name.
  assert.equal(
    parsePackIntent('Matej as M.P., not full name, not a full named CV'),
    'bio_anonymised',
  );
  assert.equal(parsePackIntent('bio only, not the full CV'), 'bio_anonymised');
});

test('silence and nonsense default to anonymised', () => {
  assert.equal(DEFAULT_PACK_INTENT, 'bio_anonymised');
  assert.equal(parsePackIntent(''), 'bio_anonymised');
  assert.equal(parsePackIntent(null), 'bio_anonymised');
  assert.equal(parsePackIntent('prepare something for the recruiter'), 'bio_anonymised');
});

test('a bio never prints the name, on the card or the filename', () => {
  assert.equal(initialsOf('Matej Pavlović'), 'M. P.');
  assert.equal(packDisplayName('Matej Pavlović', 'bio_anonymised'), 'M. P.');
  assert.equal(packDisplayName('Matej Pavlović', 'full_cv'), 'Matej Pavlović');
  const { anonymisedCvFilename } = load('src/lib/data/anonymised-cv-filename.ts');
  assert.equal(anonymisedCvFilename('TS-1A2B3C4D'), 'ts-1a2b3c4d-profile.pdf');
  assert.doesNotMatch(anonymisedCvFilename('TS-1A2B3C4D'), /matej|pavlovic/i);
  assert.match(packIntentLabel('bio_anonymised'), /initials/i);
});

test('a put-forward ask typed into a chase thread is recognised', () => {
  assert.equal(asksForAPutForward('ask hanna for a bio'), true);
  assert.equal(asksForAPutForward('prepare draft with matej cv'), true);
  assert.equal(asksForAPutForward('anonymised profile, initials only'), true);
  assert.equal(asksForAPutForward('shortlist two people'), true);
  assert.equal(asksForAPutForward('chase them for the start date'), false);
});

// ── the handoff: a real job, on the same case ───────────────────────────────

test('who_we_put_forward is not a research finding, so a plain result lands', () => {
  assert.equal(PUT_FORWARD_CASE_TYPE, 'who_we_put_forward');
  assert.match(
    findingSql,
    /case_type NOT IN \('open_research', 'company_qualification', 'contact_reachability'\)/,
  );
  assert.equal(
    ['open_research', 'company_qualification', 'contact_reachability'].includes(
      PUT_FORWARD_CASE_TYPE,
    ),
    false,
  );
});

test('the Hanna assignment carries the same case ids as the card', () => {
  assert.match(askHannaSrc, /case_type:\s*PUT_FORWARD_CASE_TYPE/);
  assert.match(askHannaSrc, /source:\s*PUT_FORWARD_SOURCE/);
  assert.match(askHannaSrc, /pack_intent:\s*context\.intent/);
  for (const id of ['leadId', 'contactId', 'personId', 'companyId', 'missionId']) {
    assert.match(askHannaSrc, new RegExp(`${id}: context\\.${id}`), id);
  }
  assert.match(askHannaSrc, /from_assignment_id: context\.fromAssignmentId/);
  const objective = hannaPolicy.askHannaObjective({
    instruction: 'Prepare the bio.',
    intent: 'bio_anonymised',
    leadId: '11111111-1111-4111-8111-111111111111',
    workerId: '22222222-2222-4222-8222-222222222222',
  });
  assert.match(objective, /leadId: 11111111-1111-4111-8111-111111111111/);
  assert.match(objective, /workerId: 22222222-2222-4222-8222-222222222222/);
  assert.match(objective, /Initials only/);
  assert.match(objective, /do not file reachable/i);
});

test('a full CV objective says identity was released, and still no rate', () => {
  const objective = hannaPolicy.askHannaObjective({
    instruction: 'Send the full CV.',
    intent: 'full_cv',
  });
  assert.match(objective, /identity/i);
  assert.match(objective, /no rate/i);
});

test('Hanna is woken here, because createAssignment does not wake her', () => {
  const workforce = read('src/lib/data/workforce.ts');
  assert.match(workforce, /Hanna is left to her own hand-off path/);
  assert.match(askHannaSrc, /wakeEmployee\(/);
  assert.match(askHannaSrc, /runtime === "bot"/);
  // in_app on the constraints would hide the row from her own inbox filter.
  assert.doesNotMatch(askHannaSrc, /execution_mode:\s*"in_app"/);
});

test('the pickup notice never claims a wake that did not happen', () => {
  const { hannaPickupNotice } = hannaPolicy;
  assert.match(
    hannaPickupNotice({ hannaName: 'Hanna', runtime: 'bot', wake: { status: 'sent' } }),
    /was woken/,
  );
  assert.match(
    hannaPickupNotice({ hannaName: 'Hanna', runtime: 'bot', wake: { status: 'not_configured' } }),
    /no wake-up webhook is set/i,
  );
  assert.match(
    hannaPickupNotice({ hannaName: 'Hanna', runtime: 'bot', wake: { status: 'failed' } }),
    /did not answer/i,
  );
  assert.match(
    hannaPickupNotice({ hannaName: 'Hanna', runtime: 'in_app', wake: null }),
    /in-app/i,
  );
});

test('Hanna is refused honestly when she is not there or cannot propose', () => {
  const { hannaPutForwardBlockedReason, WORKER_PROPOSE_SCOPE } = hannaPolicy;
  assert.match(
    hannaPutForwardBlockedReason({ hanna: null, scopes: [] }),
    /Nobody named Hanna/,
  );
  assert.match(
    hannaPutForwardBlockedReason({ hanna: { id: 'h', name: 'Hanna' }, scopes: [] }),
    /worker\.propose/,
  );
  assert.equal(
    hannaPutForwardBlockedReason({
      hanna: { id: 'h', name: 'Hanna' },
      scopes: [WORKER_PROPOSE_SCOPE],
    }),
    null,
  );
  assert.equal(
    hannaPutForwardBlockedReason({ hanna: { id: 'h', name: 'Hanna' }, scopes: ['admin'] }),
    null,
  );
});

test('the person is resolved from worker records, never invented', () => {
  assert.match(askHannaSrc, /from\("workers"\)/);
  assert.match(askHannaSrc, /organization_id/);
  assert.match(askHannaSrc, /ambiguous/);
  // Two people matching binds nobody rather than guessing one.
  assert.match(askHannaSrc, /tied\.length > 1/);
  assert.match(hannaPolicy.askHannaObjective({
    instruction: 'Prepare a bio.',
    intent: 'bio_anonymised',
  }), /Do not invent a person/);
});

test('Hanna is matched by role key or name, like Bob', () => {
  const { isHannaEmployee, HANNA_ROLE_KEYS } = hannaPolicy;
  assert.equal(HANNA_ROLE_KEYS.has('triangle_hr'), true);
  assert.equal(HANNA_ROLE_KEYS.has('hr'), true);
  assert.equal(isHannaEmployee({ roleKey: 'hr', displayName: 'Resourcing' }), true);
  assert.equal(isHannaEmployee({ roleKey: 'other', displayName: 'Hanna' }), true);
  assert.equal(isHannaEmployee({ roleKey: 'inbox_coordinator', displayName: 'Bob' }), false);
});

// ── the case: one owner per half, and the card never moves ──────────────────

test('a put-forward job is the other half of the case, not a new owner', () => {
  const { chaseWaits } = handoff;
  const base = {
    assignmentId: 'a',
    title: 't',
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
    entityIds: [],
    messageCount: 1,
    awaitingAgent: 0,
    createdAt: '',
    lastAgentBody: null,
    caseType: 'commercial_follow_through',
  };
  const hanna = {
    ...base,
    assignmentId: 'b',
    agentName: 'Hanna',
    roleKey: 'triangle_hr',
    withLabel: 'With Hanna',
    caseType: PUT_FORWARD_CASE_TYPE,
  };
  assert.deepEqual(
    chaseWaits([base, hanna]).map((w) => w.assignmentId),
    ['a'],
  );
  // Hanna alone on the case must leave the chase unowned, so Ask Bob stays
  // and the follow-up does not drop out of Needs you.
  assert.deepEqual(chaseWaits([hanna]), []);
  assert.equal(handoff.findWait(chaseWaits([hanna]), { leadId: 'lead-1' }), null);
  assert.equal(handoff.findWait([hanna], { leadId: 'lead-1' })?.assignmentId, 'b');
});

test('Today and the follow-up rail both decide ownership on the chase half', () => {
  assert.match(todayScreenSrc, /const chase = chaseWaits\(waits\)/);
  assert.match(todayScreenSrc, /findWait\(chase,/);
  assert.match(todayMissionsSrc, /const chase = chaseWaits\(waits\)/);
  assert.match(todayMissionsSrc, /findWait\(chase,/);
  // In progress still shows every employee, including Hanna.
  assert.match(todayScreenSrc, /<InProgressByEmployee waits=\{waits\}/);
});

test('Ask Hanna is on the card, and stays there while Bob has the chase', () => {
  assert.match(emailActionsSrc, /AskHannaAction/);
  assert.match(emailActionsSrc, /isHannaHolding/);
  const from = emailActionsSrc.indexOf('{withBob ? (');
  const to = emailActionsSrc.indexOf('\n      ) : (', from);
  assert.notEqual(from, -1);
  assert.ok(to > from, 'withBob branch not found');
  assert.match(emailActionsSrc.slice(from, to), /AskHannaAction/);
});

test('Ask Hanna posts a handoff, not an email, and defaults to the bio', () => {
  assert.match(actionSrc, /\/api\/ask\/hanna/);
  assert.match(actionSrc, /parsePackIntent/);
  assert.match(actionSrc, /Hand to Hanna/);
  assert.match(actionSrc, /you still press Send/i);
  assert.doesNotMatch(actionSrc, /\/api\/mail\/send/);
  assert.match(routeSrc, /refuseUnlessHuman/);
  assert.match(routeSrc, /parsePackIntent/);
  assert.match(routeSrc, /DEFAULT_PACK_INTENT/);
  assert.match(emailActionsSrc, /fromAssignmentId=\{withBob\.assignmentId\}/);
});

test('the result returns on the same case, not a second chat', () => {
  assert.match(casesSrc, /PUT_FORWARD_CASE_TYPE/);
  assert.match(casesSrc, /buildWorkerCv/);
  assert.match(casesSrc, /includeIdentity: named/);
  assert.match(casesSrc, /packFilename/);
  assert.match(decisionsPage, /listPutForwardCases/);
  assert.match(todayScreenSrc, /PutForwardBlock/);
  assert.match(blockSrc, /Who we put forward/);
  assert.match(blockSrc, /Open thread/);
  assert.doesNotMatch(blockSrc, /router\.push\(["']\/agents/);
  assert.match(blockSrc, /Triangle&apos;s own record/);
  assert.match(blockSrc, /Not recorded:/);
  // Oliver Hall is a follow-up card, not only the hero.
  assert.match(todayMissionsSrc, /PutForwardOnCard/);
  assert.match(todayMissionsSrc, /putForward=\{putForward\}/);
  assert.match(todayMissionsSrc, /caseRefFromWait/);
});

test('a finished put-forward pack returns to the case, not the old reports list', () => {
  const cameBack = read('src/lib/data/came-back.ts');
  assert.match(cameBack, /caseType === PUT_FORWARD_CASE_TYPE/);
});

test('the thread composer says it messages the employee, and emails nobody', () => {
  assert.match(threadSrc, /Message \{recipient\}/);
  assert.match(threadSrc, /Nothing is emailed/);
  assert.doesNotMatch(threadSrc, /^\s*Send\s*$/m);
  assert.match(drawerSrc, /composerHint/);
  assert.match(drawerSrc, /asksForAPutForward/);
  assert.match(drawerSrc, /Ask Hanna/);
});

test('the toast names the employee who took it', () => {
  const ctx = read('src/components/modules/today-handoff-context.tsx');
  assert.match(ctx, /Handed to \{toast\.agentName/);
  assert.match(ctx, /The answer returns on this case/);
});

test('Triangle still sends nothing: no SMTP on any path added here', () => {
  for (const src of [askHannaSrc, routeSrc, actionSrc, blockSrc, casesSrc]) {
    assert.doesNotMatch(src, /sendViaMailbox|nodemailer|createTransport/);
  }
  assert.match(policySrc, /Proposes only|proposes only|contacts nobody/i);
});

test('no migration and no SQL come with this change', () => {
  const migrations = fs.readdirSync(path.resolve(root, 'supabase/migrations'));
  assert.equal(migrations.some((f) => /put.?forward|ask.?hanna/i.test(f)), false);
});

test('the role files tell Bob and Hanna whose half this is', () => {
  const hannaMd = read('agents/hanna.md');
  assert.match(hannaMd, /who_we_put_forward/);
  assert.match(hannaMd, /pack_intent/);
  assert.match(hannaMd, /assignmentId, result/);
  assert.match(hannaMd, /do not file `reachable`/i);
  const bobMd = read('agents/bob.md');
  assert.match(bobMd, /Who we put forward is Hanna's/);
  assert.match(bobMd, /Ask Hanna/);
  const inbox = read('src/app/api/agent/inbox/route.ts');
  assert.match(inbox, /who_we_put_forward/);
  assert.match(inbox, /pack_intent/);
});

// ── the human review gate (DEV-022) ────────────────────────────────────────

test('nothing is approved until a person approves it', () => {
  const none = packApprovalOf({ reviewOutcome: null, reviewedAt: null, completedAt: null });
  assert.equal(none, 'not_checked');
  assert.equal(mayAttachPack(none), false, 'an unreviewed pack can never be attached');
  // A half-written review row is not an approval either.
  assert.equal(
    packApprovalOf({ reviewOutcome: 'sent_back', reviewedAt: '2026-09-18T09:00:00Z', completedAt: null }),
    'not_checked',
  );
});

test('approved is approved, and a ruled-out pack stays out', () => {
  assert.equal(
    mayAttachPack(
      packApprovalOf({
        reviewOutcome: PACK_APPROVED_OUTCOME,
        reviewedAt: '2026-09-18T09:00:00Z',
        completedAt: '2026-09-18T08:00:00Z',
      }),
    ),
    true,
  );
  const out = packApprovalOf({
    reviewOutcome: PACK_NOT_USED_OUTCOME,
    reviewedAt: '2026-09-18T09:00:00Z',
    completedAt: null,
  });
  assert.equal(out, 'not_used');
  assert.equal(mayAttachPack(out), false);
});

test('an approval lapses when Hanna answers after it', () => {
  const stale = packApprovalOf({
    reviewOutcome: PACK_APPROVED_OUTCOME,
    reviewedAt: '2026-09-18T09:00:00Z',
    completedAt: '2026-09-18T11:00:00Z',
  });
  assert.equal(stale, 'superseded');
  assert.equal(mayAttachPack(stale), false, 'what was approved is not what the case now says');
  assert.match(
    packApprovalSentence({
      approval: stale,
      agentName: 'Hanna',
      finished: true,
      intent: 'bio_anonymised',
    }),
    /approve it again/i,
  );
});

test('a person may approve before Hanna answers, and the record says which it was', () => {
  const waiting = packApprovalSentence({
    approval: 'not_checked',
    agentName: 'Hanna',
    finished: false,
    intent: 'bio_anonymised',
  });
  assert.match(waiting, /has not checked the facts yet/);
  assert.match(waiting, /nothing attaches until you do/);
  const early = packApprovalNote({
    intent: 'bio_anonymised',
    who: 'M. P.',
    filename: 'ts-aabbccdd-profile.pdf',
    agentName: 'Hanna',
    finished: false,
  });
  assert.match(early, /anonymised bio for M\. P\./);
  assert.match(early, /had not checked the facts yet/);
  const late = packApprovalNote({
    intent: 'full_cv',
    who: 'Matej Pavlović',
    filename: 'matej-pavlovic-cv.pdf',
    agentName: 'Hanna',
    finished: true,
  });
  assert.match(late, /full named CV/);
  assert.match(late, /check was in/);
});

test('the filename on the card is the filename on the wire', () => {
  assert.equal(
    filenames.packFilename({
      intent: 'bio_anonymised',
      reference: 'TS-AABBCCDD',
      workerName: 'Matej Pavlović',
    }),
    'ts-aabbccdd-profile.pdf',
    'a bio is named after the reference, never the person',
  );
  assert.equal(
    filenames.packFilename({
      intent: 'full_cv',
      reference: 'TS-AABBCCDD',
      workerName: 'Matej Pavlović',
    }),
    'matej-pavlovic-cv.pdf',
  );
});

test('the card is where a person opens it and approves it', () => {
  assert.match(blockSrc, /Open \{pack\.filename\}/);
  assert.match(blockSrc, /Approve for sending/);
  assert.match(blockSrc, /Not this one/);
  assert.match(blockSrc, /"\/api\/put-forward"/);
  assert.match(blockSrc, /method: "PATCH"/);
  assert.match(blockSrc, /packApprovalSentence/);
  // Ruling one out costs a reason, like every other discard on Today.
  assert.match(blockSrc, /reason\.trim\(\)\.length < 3/);
});

test('the Send review is told about the pack, and only an approved one arrives ticked-able', () => {
  assert.match(todayScreenSrc, /attachablePackFrom/);
  assert.match(todayScreenSrc, /pack=\{attachable\}/);
  assert.match(todayScreenSrc, /mayAttachPack\(item\.approval\)/);
});

test('docs record the split and the human-only Send', () => {
  const decisions = read('DECISIONS.md');
  assert.match(decisions, /Bob chases the thread; Hanna says who we put forward/);
  assert.match(decisions, /bio_anonymised/);
  assert.match(decisions, /full_cv/);
  const execution = read('ROADMAP_EXECUTION.md');
  assert.match(execution, /DEV-021/);
  assert.match(execution, /who_we_put_forward/);
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
