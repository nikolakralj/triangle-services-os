// Human-only writes: a machine key or a badge cannot approve, note, or
// rewrite intake rules. Isolated. No env, no database, nothing sent.
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

const { refuseUnlessHuman } = moduleLoader()('src/lib/auth/api-guards.ts');

const tests = [];
function test(name, fn) {
  tests.push([name, fn]);
}

async function refused(access, doing = 'approve or reject a proposal') {
  const res = refuseUnlessHuman(access, 'canWrite', doing);
  assert.ok(res, 'expected a refusal');
  assert.equal(res.status, 403);
  return res.json();
}

test('a static machine key is refused even when the borrowed role is admin', async () => {
  const body = await refused({ demo: false, actor: 'machine', role: 'admin' });
  assert.match(body.error, /machine key/i);
});

test('a badge is refused: a badge is a machine actor, not a person', async () => {
  const body = await refused({ demo: false, actor: 'machine', role: 'admin' }, 'add a note about a person');
  assert.match(body.error, /machine key/i);
  assert.match(body.error, /add a note about a person/);
});

test('demo mode is refused', async () => {
  const body = await refused({ demo: true, actor: 'demo', role: 'admin' });
  assert.match(body.error, /demo mode/i);
});

test('a viewer cannot write', async () => {
  const body = await refused({ demo: false, actor: 'human', role: 'viewer' });
  assert.match(body.error, /viewer/i);
});

test('a signed-in person who can write is allowed', () => {
  for (const role of ['admin', 'partner', 'researcher']) {
    assert.equal(
      refuseUnlessHuman({ demo: false, actor: 'human', role }, 'canWrite', 'approve or reject a proposal'),
      null,
      role,
    );
  }
});

function read(rel) {
  return fs.readFileSync(path.resolve(root, rel), 'utf8');
}

function handler(src, name) {
  const marker = `export async function ${name}`;
  const start = src.indexOf(marker);
  assert.notEqual(start, -1, marker);
  const next = src.indexOf('export async function', start + marker.length);
  return src.slice(start, next === -1 ? undefined : next);
}

test('write routes call the guard and reads do not', () => {
  const approvals = read('src/app/api/approvals/route.ts');
  const patch = handler(approvals, 'PATCH');
  assert.match(patch, /refuseUnlessHuman\(access, "canWrite", "approve or reject a proposal"\)/);
  assert.ok(patch.indexOf('refuseUnlessHuman') < patch.indexOf('acceptFinding'));
  assert.ok(patch.indexOf('refuseUnlessHuman') < patch.indexOf('acceptResearchSuggestion'));

  const workerNotes = read('src/app/api/workers/[id]/notes/route.ts');
  assert.doesNotMatch(handler(workerNotes, 'GET'), /refuseUnlessHuman/);
  const post = handler(workerNotes, 'POST');
  assert.match(post, /refuseUnlessHuman\(access, "canWrite", "add a note about a person"\)/);
  assert.ok(post.indexOf('refuseUnlessHuman') < post.indexOf('addWorkerNote'));
  assert.equal(workerNotes.includes('export async function PUT'), false);
  assert.equal(workerNotes.includes('export async function DELETE'), false);

  const projectNotes = read('src/app/api/projects/[id]/notes/route.ts');
  assert.doesNotMatch(handler(projectNotes, 'GET'), /refuseUnlessHuman/);
  const putNote = handler(projectNotes, 'PUT');
  assert.match(putNote, /refuseUnlessHuman\(access, "canWrite", "change a project note"\)/);
  assert.ok(putNote.indexOf('refuseUnlessHuman') < putNote.indexOf('upsertProjectNote'));

  const rules = read('src/app/api/job-intake/rules/route.ts');
  assert.doesNotMatch(handler(rules, 'GET'), /refuseUnlessHuman/);
  const putRules = handler(rules, 'PUT');
  assert.match(putRules, /refuseUnlessHuman\(access, "canWrite", "change the scoring rules"\)/);
  assert.match(putRules, /access\.role !== "admin" && access\.role !== "partner"/);
  assert.ok(putRules.indexOf('refuseUnlessHuman') < putRules.indexOf('upsertIntakeRules'));

  const reply = read('src/app/api/job-intake/reply-style/route.ts');
  assert.doesNotMatch(handler(reply, 'GET'), /refuseUnlessHuman/);
  const putReply = handler(reply, 'PUT');
  assert.match(putReply, /refuseUnlessHuman\(access, "canWrite", "change the reply style"\)/);
  assert.match(putReply, /access\.role !== "admin" && access\.role !== "partner"/);
  assert.ok(putReply.indexOf('refuseUnlessHuman') < putReply.indexOf('upsertReplyStyleMemory'));
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log('✓ ' + name);
  } catch (err) {
    failed++;
    console.error('✗ ' + name);
    console.error(err);
  }
}
if (failed > 0) {
  process.exit(1);
} else {
  console.log('\nAll human-write checks passed.');
}
