// Knowledge list: the read helper, and the shape of migration 057 and its
// hand-run seed. No database. The migration is not applied.
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
      }
      return require(name);
    };
    new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
    return mod.exports;
  };
}

function mockClient(rowsByTable) {
  const calls = [];
  const svc = {
    from(table) {
      const filters = [];
      let limitCount = null;
      const query = {
        select() { return query; },
        eq(col, val) {
          filters.push((row) => row[col] === val);
          calls.push({ table, op: 'eq', col, val });
          return query;
        },
        in(col, vals) {
          const set = new Set(vals);
          filters.push((row) => set.has(row[col]));
          return query;
        },
        order() { return query; },
        limit(n) {
          limitCount = n;
          return query;
        },
        then(resolve) {
          let rows = (rowsByTable[table] ?? []).filter((row) => filters.every((fn) => fn(row)));
          if (limitCount !== null) rows = rows.slice(0, limitCount);
          return resolve({ data: rows, error: null });
        },
      };
      return query;
    },
  };
  return { svc, calls };
}

const tests = [];
function test(name, fn) {
  tests.push([name, fn]);
}

test('an empty applies-to list is for every role, and a named list is not', () => {
  const { knowledgeVisibleToRole } = moduleLoader()('src/lib/data/knowledge.ts');
  assert.equal(knowledgeVisibleToRole([], 'hr'), true);
  assert.equal(knowledgeVisibleToRole(null, 'hr'), true);
  assert.equal(knowledgeVisibleToRole(['hr', 'inbox_coordinator'], 'hr'), true);
  assert.equal(knowledgeVisibleToRole(['hr', 'inbox_coordinator'], 'project_researcher'), false);
  assert.equal(knowledgeVisibleToRole(['hr'], null), true);
});

test('listKnowledgeItems keeps the org, maps the row, and honours the role', async () => {
  const orgId = '00000000-0000-0000-0000-000000000001';
  const { svc, calls } = mockClient({
    knowledge_items: [
      {
        id: 'item-all',
        org_id: orgId,
        category: 'worker_note',
        topic: 'candidate-filtering',
        title: 'Leave out Svrznjak, Togea, Popa, Nilic, Stroe and Novakovic',
        body: 'Do not contact them.',
        applies_to_roles: [],
        source_kind: 'voice',
        source_ref: 'nikola-voice-2026-11-02:rule-6',
        quote: 'Of the 26 candidates',
        said_by: 'Nikola',
        said_on: '2026-11-02',
        status: 'proposed',
        created_at: '2026-11-02T00:00:00.000Z',
        updated_at: '2026-11-02T00:00:00.000Z',
      },
      {
        id: 'item-hr',
        org_id: orgId,
        category: 'house_rule',
        topic: 'candidate-filtering',
        title: 'Never discuss rates with a candidate',
        body: 'Rates stay between Nikola and Ralph.',
        applies_to_roles: ['hr', 'inbox_coordinator'],
        source_kind: 'voice',
        status: 'proposed',
        created_at: '2026-11-02T00:00:01.000Z',
        updated_at: '2026-11-02T00:00:01.000Z',
      },
      {
        id: 'item-scout',
        org_id: orgId,
        category: 'process',
        title: 'Scout only',
        body: 'Not for Hanna.',
        applies_to_roles: ['project_researcher'],
        source_kind: 'chat',
        status: 'approved',
        created_at: '2026-11-02T00:00:02.000Z',
        updated_at: '2026-11-02T00:00:02.000Z',
      },
      {
        id: 'item-other-org',
        org_id: '00000000-0000-0000-0000-000000000002',
        category: 'house_rule',
        title: 'Other org',
        body: 'Hidden.',
        applies_to_roles: [],
        source_kind: 'voice',
        status: 'proposed',
        created_at: '2026-11-02T00:00:03.000Z',
        updated_at: '2026-11-02T00:00:03.000Z',
      },
    ],
  });
  const { listKnowledgeItems } = moduleLoader({
    '@/lib/supabase/server': { createServiceSupabaseClient: () => svc },
  })('src/lib/data/knowledge.ts');

  const items = await listKnowledgeItems(orgId, { roleKey: 'hr' });
  assert.deepEqual(items.map((item) => item.id), ['item-all', 'item-hr']);
  assert.equal(items[1].appliesToRoles.includes('inbox_coordinator'), true);
  assert.equal(items[1].saidBy, null);
  assert.equal(calls.some((call) => call.table === 'knowledge_items' && call.col === 'org_id' && call.val === orgId), true);

  const rejected = await listKnowledgeItems(orgId, { roleKey: 'hr; drop table' });
  assert.deepEqual(rejected, []);
});

test('listKnowledge reads the view and an empty applies_to means every role', async () => {
  const orgId = 'org-1';
  const { svc } = mockClient({
    knowledge_view: [
      {
        source_table: 'worker_notes',
        id: 'note-1',
        org_id: orgId,
        category: 'worker_note',
        title: 'availability: free in March',
        body: 'Free in March',
        applies_to: [],
        source: 'worker_notes',
        status: 'approved',
        created_at: '2026-11-01T00:00:00.000Z',
      },
      {
        source_table: 'agent_house_rules',
        id: 'rule-1',
        org_id: orgId,
        category: 'house_rule',
        title: 'Hanna — how they work',
        body: 'Ask before you write.',
        applies_to: ['hr'],
        source: 'house rules, version 2',
        status: 'approved',
        created_at: '2026-11-02T00:00:00.000Z',
      },
    ],
  });
  const { listKnowledge } = moduleLoader({
    '@/lib/supabase/server': { createServiceSupabaseClient: () => svc },
  })('src/lib/data/knowledge.ts');
  const rows = await listKnowledge(orgId, { roleKey: 'inbox_coordinator' });
  assert.deepEqual(rows.map((row) => row.id), ['note-1']);
  assert.equal(rows[0].sourceTable, 'worker_notes');
});

test('migration 057 defines the table, the view, and no seed rows', () => {
  const sql = fs.readFileSync(path.resolve(root, 'supabase/migrations/057_knowledge_items.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.knowledge_items/i);
  assert.match(sql, /org_id uuid not null references public\.organizations/i);
  assert.match(sql, /category in \(\s*'house_rule', 'decision', 'process', 'rate',\s*'worker_note', 'project_note', 'intake_rule'/);
  assert.match(sql, /source_kind in \('voice', 'whatsapp', 'email', 'chat', 'call_note', 'migrated'\)/);
  assert.match(sql, /status in \('proposed', 'approved', 'retired', 'superseded', 'rejected'\)/);
  assert.match(sql, /status <> 'approved' or \(approved_by is not null and approved_at is not null\)/);
  assert.match(sql, /proposed_by_agent_instance_id is null/);
  assert.match(sql, /references public\.missions\(id\)/);
  assert.match(sql, /references public\.companies\(id\)/);
  assert.match(sql, /references public\.workers\(id\)/);
  assert.match(sql, /references public\.discovered_projects\(id\)/);
  assert.match(sql, /references public\.agent_instances\(id\)/);
  assert.match(sql, /references public\.agent_findings\(id\)/);
  assert.match(sql, /knowledge_items \(org_id, status, category\)/);
  assert.match(sql, /using gin \(applies_to_roles\)/);
  assert.match(sql, /set status = 'superseded'/);
  assert.match(sql, /for select[\s\S]*is_org_member\(org_id\)/);
  assert.match(sql, /for insert[\s\S]*with check \(false\)/);
  assert.match(sql, /create or replace view public\.knowledge_view[\s\S]*security_invoker = true/i);
  for (const source of [
    'knowledge_items',
    'agent_house_rules',
    'mission_decisions',
    'worker_notes',
    'job_intake_rules',
    'project_notes',
    'research_suggestions',
  ]) {
    assert.ok(sql.includes(`'${source}'`), source);
  }
  assert.match(sql, /rules\.reply_style/);
  assert.match(sql, /suggestion_type = 'note'/);
  assert.match(sql, /edited_and_accepted/);
  const view = sql.slice(sql.indexOf('create or replace view public.knowledge_view'));
  assert.match(view, /from public\.worker_notes note/);
  assert.match(view, /note\.org_id/);
  assert.doesNotMatch(view, /organization_id/);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.knowledge_items/i);
});

test('the hand-run seed proposes Nikola\'s six rules and is not a migration', () => {
  const seedPath = path.resolve(root, 'supabase/seed/knowledge-seed-2026-11-02.sql');
  const seed = fs.readFileSync(seedPath, 'utf8');
  assert.match(seed, /NOT A MIGRATION/);
  assert.match(seed, /where name = 'Triangle Services'/);
  assert.doesNotMatch(seed, /00000000-0000-0000-0000-000000000001/);
  for (let n = 1; n <= 6; n += 1) {
    assert.ok(seed.includes(`nikola-voice-2026-11-02:rule-${n}`), `rule ${n}`);
  }
  assert.match(seed, /'voice'/);
  assert.match(seed, /'Nikola'/);
  assert.match(seed, /date '2026-11-02'/);
  assert.match(seed, /'proposed'/);
  assert.match(seed, /array\['hr', 'inbox_coordinator'\]/);
  assert.match(seed, /Postovani \[Name\]/);
  assert.match(seed, /Ralph Loesekamm/);
  assert.match(seed, /Domagoj Marijanovic/);
  assert.match(seed, /Teodor Luposoru/);
  assert.match(seed, /teodor lupusoru/);
  assert.match(seed, /Svrznjak and Togea/);
  assert.equal(fs.existsSync(path.resolve(root, 'supabase/migrations/057_knowledge_items.sql')), true);
  const migrations = fs.readdirSync(path.resolve(root, 'supabase/migrations'));
  assert.equal(migrations.some((name) => name.includes('knowledge-seed')), false);
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
if (failed > 0) process.exit(1);
console.log('\nAll knowledge checks passed.');
