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
// The Ask Hanna button left the card on 18 September ("Employees, not
// buttons"): her half is reached through the one Ask on the case.
const actionSrc = read('src/lib/data/case-ask.ts');
const drawerSrc = read('src/components/modules/assignment-thread-drawer.tsx');
const threadSrc = read('src/components/modules/assignment-thread.tsx');
const emailActionsSrc = read('src/components/modules/today-email-actions.tsx');
const todayScreenSrc = read('src/components/modules/today-screen.tsx');
const todayMissionsSrc = read('src/components/modules/today-missions.tsx');
// Who we put forward is shown as the team's decision (18 September), in the
// block that replaced the separate Hanna block and the radio list.
const blockSrc = read('src/components/modules/case-decision.tsx');
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

test('asking for a short one gets the short one, not the long bio', () => {
  for (const words of [
    'short bio please',
    'just a short profile',
    'can you do a one-pager',
    'one page version',
    'brief bio for the recruiter',
    'keep it short',
    'just the headlines',
  ]) {
    assert.equal(parsePackIntent(words), 'short_bio', words);
  }
  // "short bio" contains "bio"; read in the other order it would come back
  // as the long one, which is the wrong document for somebody who said short.
  assert.equal(parsePackIntent('a short bio, initials only'), 'short_bio');
});

test('short is still anonymised, and still never carries the name', () => {
  assert.equal(packDisplayName('Matej Pavlović', 'short_bio'), 'M. P.');
  assert.equal(
    filenames.packFilename({
      intent: 'short_bio',
      reference: 'TS-1A2B3C4D',
      workerName: 'Matej Pavlović',
    }),
    'ts-1a2b3c4d-short-profile.pdf',
  );
  assert.doesNotMatch(
    filenames.packFilename({
      intent: 'short_bio',
      reference: 'TS-1A2B3C4D',
      workerName: 'Matej Pavlović',
    }),
    /matej|pavlovic/i,
  );
  assert.equal(putForward.isAnonymisedIntent('short_bio'), true);
  assert.equal(putForward.isAnonymisedIntent('bio_anonymised'), true);
  assert.equal(putForward.isAnonymisedIntent('full_cv'), false);
});

test('the short version is a shorter document, not the same one relabelled', () => {
  const pdf = read('src/lib/pdf/worker-cv-pdf.tsx');
  assert.match(pdf, /short_bio: \{ skills: 5, projects: 3, certificates: 4, mobility: false \}/);
  assert.match(pdf, /bio_anonymised: \{ skills: 10, projects: 6, certificates: 8/);
  assert.match(pdf, /KEEP\[cv\.intent\]/);
  const cv = read('src/lib/data/worker-cv.ts');
  assert.match(cv, /intent,/);
  assert.match(cv, /isAnonymisedIntent\(intent\)/);
  // The route serves the exact version the case approved.
  const route = read('src/app/api/workers/[id]/cv/route.ts');
  assert.match(route, /isPackIntent\(asked\)/);
  assert.match(route, /packFilename\(/);
  assert.match(casesSrc, /cv\?variant=\$\{intent\}/);
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

test('Hanna is reached through the one Ask, which stays on the card while Bob has the chase', () => {
  assert.match(emailActionsSrc, /\/api\/ask\/case/);
  assert.doesNotMatch(emailActionsSrc, /AskHannaAction|Ask Hanna/);
  // The Ask button is not hidden when somebody already holds the case.
  const askButton = emailActionsSrc.indexOf('aria-expanded={asking}');
  assert.notEqual(askButton, -1);
  const guard = emailActionsSrc.lastIndexOf('holders.length === 0 && (', askButton);
  const holdersRow = emailActionsSrc.lastIndexOf('holders.length > 0 && (', askButton);
  assert.ok(guard === -1 || guard < holdersRow, 'Ask must not sit behind the no-holder guard');
});

test('Hanna\'s half posts a handoff, not an email, and defaults to the bio', () => {
  assert.match(actionSrc, /askHanna\(/);
  assert.match(actionSrc, /explicitPackIntent/);
  assert.match(actionSrc, /intent \?\? DEFAULT_PACK_INTENT/);
  assert.doesNotMatch(actionSrc, /\/api\/mail\/send/);
  assert.match(routeSrc, /refuseUnlessHuman/);
  assert.match(routeSrc, /parsePackIntent/);
  assert.match(routeSrc, /DEFAULT_PACK_INTENT/);
  // The two halves stay joined: Hanna's job carries Bob's thread on the case.
  assert.match(actionSrc, /fromAssignmentId: params\.chaseThread/);
});

test('the result returns on the same case, not a second chat', () => {
  assert.match(casesSrc, /PUT_FORWARD_CASE_TYPE/);
  assert.match(casesSrc, /buildWorkerCv/);
  assert.match(casesSrc, /buildWorkerCv\(\{ orgId, workerId, intent \}\)/);
  assert.match(casesSrc, /packFilename/);
  assert.match(decisionsPage, /listPutForwardCases/);
  assert.match(todayScreenSrc, /<CaseDecision/);
  assert.match(blockSrc, /The team&apos;s decision/);
  assert.match(blockSrc, /&apos;s thread/);
  assert.doesNotMatch(blockSrc, /router\.push\(["']\/agents/);
  assert.match(blockSrc, /Triangle&apos;s own record/);
  assert.match(blockSrc, /not recorded/);
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
  assert.match(threadSrc, /Message \{recipientPhrase\}/);
  assert.match(threadSrc, /Nothing is emailed/);
  assert.doesNotMatch(threadSrc, /^\s*Send\s*$/m);
  assert.match(drawerSrc, /composerHint/);
  assert.match(drawerSrc, /asksForAPutForward/);
  assert.match(drawerSrc, /Hanna gets this too/);
  assert.doesNotMatch(drawerSrc, /AskHannaAction/);
  // Words typed in Bob's thread reach Hanna by themselves.
  assert.match(read('src/app/api/assignments/[id]/messages/route.ts'), /routeThreadWords/);
});

test('the toast names the employee who took it', () => {
  const ctx = read('src/components/modules/today-handoff-context.tsx');
  assert.match(ctx, /Handed to \{toast\.handedTo \|\| toast\.agentName/);
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
  // No button to press for her half: the one Ask and Bob's thread reach her.
  assert.match(bobMd, /reaches Hanna by itself/);
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
  assert.match(blockSrc, /Open \{doc\.label\}/);
  assert.match(blockSrc, /label: pack\.filename/);
  assert.match(blockSrc, /Approve for sending/);
  assert.match(blockSrc, /"\/api\/put-forward"/);
  assert.match(blockSrc, /method: "PATCH"/);
  assert.match(blockSrc, /packApprovalSentence/);
  // "Not this one" is words in the one Ask now: the case is rebound and the
  // approval cleared (case-ask.ts), rather than a second button with a reason box.
  assert.doesNotMatch(blockSrc, /Not this one/);
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

test('docs lock the review gate, the third version and the From picker', () => {
  const decisions = read('DECISIONS.md');
  assert.match(decisions, /A person opens it and approves it, or it does not go/);
  assert.match(decisions, /The server is the gate, not the browser/);
  assert.match(decisions, /An approval lapses when the employee answers after it/);
  assert.match(decisions, /The drawer is a case, not a chat window/);
  assert.match(decisions, /short_bio/);
  const execution = read('ROADMAP_EXECUTION.md');
  assert.match(execution, /DEV-022/);
  assert.match(execution, /Approve before attach/);
  const state = read('CURRENT_STATE.md');
  assert.match(state, /DEV-022/);
  // Hanna is told her answer releases nothing.
  const hanna = read('agents/hanna.md');
  assert.match(hanna, /short_bio/);
  assert.match(hanna, /Your answer does not release anything/);
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
