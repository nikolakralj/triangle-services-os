// Event Outbox checks: client reply, follow-up due, availability stale.
// Isolated fixtures. No env, no live database, no messages sent.
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

function mockDatabase(seed = {}) {
  const tables = {
    agent_instances: seed.agent_instances ?? [],
    agent_assignments: seed.agent_assignments ?? [],
    agent_assignment_entities: seed.agent_assignment_entities ?? [],
    commercial_actions: seed.commercial_actions ?? [],
    supply_partners: seed.supply_partners ?? [],
    workers: seed.workers ?? [],
    worker_notes: seed.worker_notes ?? [],
  };

  const svc = {
    from(tableName) {
      if (!tables[tableName]) tables[tableName] = [];
      const currentTable = tables[tableName];
      let filters = [];
      let insertRows = null;
      let updatePatch = null;
      let limitCount = null;
      const query = {
        select() {
          return query;
        },
        eq(col, val) {
          filters.push((r) => r[col] === val);
          return query;
        },
        neq(col, val) {
          filters.push((r) => r[col] !== val);
          return query;
        },
        in(col, vals) {
          const set = new Set(vals);
          filters.push((r) => set.has(r[col]));
          return query;
        },
        not(col, op, val) {
          if (op === 'is' && val === null) {
            filters.push((r) => r[col] !== null && r[col] !== undefined);
          }
          return query;
        },
        lt(col, val) {
          filters.push((r) => r[col] < val);
          return query;
        },
        contains(col, obj) {
          filters.push((r) => {
            const data = r[col];
            if (!data || typeof data !== 'object') return false;
            for (const [k, v] of Object.entries(obj)) {
              if (data[k] !== v) return false;
            }
            return true;
          });
          return query;
        },
        order() {
          return query;
        },
        limit(n) {
          limitCount = n;
          return query;
        },
        insert(rows) {
          const arr = Array.isArray(rows) ? rows : [rows];
          insertRows = arr.map((r) => ({
            id: r.id || 'assign-' + Math.random().toString(36).slice(2, 9),
            created_at: new Date().toISOString(),
            ...r,
          }));
          return query;
        },
        update(patch) {
          updatePatch = patch;
          return query;
        },
        async single() {
          if (insertRows) {
            currentTable.push(...insertRows);
            return { data: insertRows[0], error: null };
          }
          const filtered = currentTable.filter((r) => filters.every((f) => f(r)));
          return { data: filtered[0] || null, error: filtered[0] ? null : { message: 'Not found' } };
        },
        async maybeSingle() {
          const filtered = currentTable.filter((r) => filters.every((f) => f(r)));
          return { data: filtered[0] || null, error: null };
        },
        then(resolve) {
          if (insertRows) {
            currentTable.push(...insertRows);
            return resolve({ data: insertRows, error: null });
          }
          if (updatePatch) {
            const affected = [];
            for (const row of currentTable) {
              if (filters.every((f) => f(row))) {
                Object.assign(row, updatePatch);
                affected.push(row);
              }
            }
            return resolve({ data: affected, error: null });
          }
          let res = currentTable.filter((r) => filters.every((f) => f(r)));
          if (limitCount !== null) res = res.slice(0, limitCount);
          return resolve({ data: res, error: null });
        },
      };
      return query;
    },
  };

  return { svc, tables };
}

const tests = [];
function test(name, fn) {
  tests.push([name, fn]);
}

test('WakeEvent types support outbox events', () => {
  const content = fs.readFileSync(path.resolve(root, 'src/lib/data/bot-runtime.ts'), 'utf8');
  assert(content.includes('"client_reply"'), 'must include client_reply');
  assert(content.includes('"follow_up_due"'), 'must include follow_up_due');
  assert(content.includes('"availability_stale"'), 'must include availability_stale');
});

test('Event outbox dispatches client_reply to Bob and respects idempotency', async () => {
  const orgId = '00000000-0000-0000-0000-000000000001';
  const { svc, tables } = mockDatabase({
    agent_instances: [
      { id: 'inst-bob', org_id: orgId, role_key: 'inbox_coordinator', display_name: 'Bob', status: 'active' },
      { id: 'inst-scout', org_id: orgId, role_key: 'project_researcher', display_name: 'Scout', status: 'active' },
      { id: 'inst-hanna', org_id: orgId, role_key: 'hr', display_name: 'Hanna', status: 'active' },
    ],
  });

  const wakes = [];
  const loader = moduleLoader({
    '@/lib/supabase/server': {
      createServiceSupabaseClient: () => svc,
    },
    './bot-runtime': {
      wakeEmployee: async (params) => {
        wakes.push(params);
        return { status: 'not_configured', httpStatus: null };
      },
    },
    './follow-ups': {
      listFollowUpsDue: async () => ({ items: [], total: 0 }),
    },
    './supply-partners': {
      CAPACITY_SHELF_LIFE_DAYS: 14,
    },
  });

  const { recordClientReplyEvent } = loader('src/lib/data/event-outbox.ts');

  // 1. Dispatch client reply
  const first = await recordClientReplyEvent({
    orgId,
    sourceType: 'outreach_draft',
    sourceId: 'draft-123',
    recipientName: 'Alice Buyer',
    recipientEmail: 'alice@example.com',
    recipientCompany: 'Big Builder GmbH',
    subject: 'Electrical Subcontracting Proposal',
    replySummary: 'Interested in 4 electricians starting Nov 1',
  });

  assert.equal(first.ok, true);
  assert.equal(first.alreadyRecorded, false);
  assert.equal(first.owningEmployee.name, 'Bob');
  assert.equal(first.owningEmployee.roleKey, 'inbox_coordinator');
  assert.equal(tables.agent_assignments.length, 1);
  assert.equal(tables.agent_assignments[0].title, 'Client reply: Alice Buyer');
  assert.equal(tables.agent_assignments[0].constraints.case_type, 'event_outbox');
  assert.equal(tables.agent_assignments[0].constraints.outbox_event, 'client_reply');
  assert.equal(wakes.length, 1);
  assert.equal(wakes[0].event, 'client_reply');
  assert.equal(wakes[0].agentInstanceId, 'inst-bob');

  // 2. Second dispatch with identical idempotency key is a no-op
  const second = await recordClientReplyEvent({
    orgId,
    sourceType: 'outreach_draft',
    sourceId: 'draft-123',
    recipientName: 'Alice Buyer',
  });

  assert.equal(second.ok, true);
  assert.equal(second.alreadyRecorded, true);
  assert.equal(tables.agent_assignments.length, 1, 'must not create duplicate assignment');
  assert.equal(wakes.length, 1, 'must not trigger duplicate wake');
});

test('Event outbox sweep handles due follow-ups and wakes commercial ops', async () => {
  const orgId = '00000000-0000-0000-0000-000000000001';
  const { svc, tables } = mockDatabase({
    agent_instances: [
      { id: 'inst-bob', org_id: orgId, role_key: 'inbox_coordinator', display_name: 'Bob', status: 'active' },
    ],
  });

  const wakes = [];
  const loader = moduleLoader({
    '@/lib/supabase/server': {
      createServiceSupabaseClient: () => svc,
    },
    './bot-runtime': {
      wakeEmployee: async (params) => {
        wakes.push(params);
        return { status: 'sent', httpStatus: 200 };
      },
    },
    './follow-ups': {
      listFollowUpsDue: async () => ({
        items: [
          {
            actionId: 'act-456',
            target: 'contact',
            who: 'Klaus Schmidt',
            company: 'Hochbau AG',
            about: 'Data center electricians',
            channelKind: 'email',
            value: 'klaus@hochbau.de',
            subject: 'Subcontract crew for Frankfurt',
            sent: 'intro email',
            at: '2026-09-10',
            dueAt: '2026-09-14',
            daysOverdue: 1,
            outcome: 'sent',
          },
        ],
        total: 1,
      }),
    },
    './supply-partners': {
      CAPACITY_SHELF_LIFE_DAYS: 14,
    },
  });

  const { sweepDueFollowUps } = loader('src/lib/data/event-outbox.ts');
  const res = await sweepDueFollowUps(orgId);

  assert.equal(res.checked, 1);
  assert.equal(res.dispatched, 1);
  assert.equal(tables.agent_assignments.length, 1);
  assert.equal(tables.agent_assignments[0].title, 'Follow-up due: Klaus Schmidt');
  assert.equal(tables.agent_assignments[0].constraints.outbox_event, 'follow_up_due');
  assert.equal(wakes.length, 1);
  assert.equal(wakes[0].event, 'follow_up_due');
  assert.equal(wakes[0].agentInstanceId, 'inst-bob');
});

test('Event outbox sweep handles stale availability (>14d) and wakes Hanna', async () => {
  const orgId = '00000000-0000-0000-0000-000000000001';
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();

  const { svc, tables } = mockDatabase({
    agent_instances: [
      { id: 'inst-hanna', org_id: orgId, role_key: 'hr', display_name: 'Hanna', status: 'active' },
    ],
    supply_partners: [
      {
        id: 'partner-stale',
        organization_id: orgId,
        name: 'Balkan Elektro d.o.o.',
        country: 'HR',
        status: 'active',
        availability_status: 'available',
        confirmed_at: thirtyDaysAgo, // expired
      },
      {
        id: 'partner-fresh',
        organization_id: orgId,
        name: 'Nordic Cabling AS',
        country: 'NO',
        status: 'active',
        availability_status: 'available',
        confirmed_at: twoDaysAgo, // fresh
      },
    ],
    workers: [
      {
        id: 'worker-stale',
        organization_id: orgId,
        full_name: 'Marko Horvat',
        role: 'Cable puller',
        status: 'active',
        availability_status: 'available',
        updated_at: thirtyDaysAgo, // stale
      },
      {
        id: 'worker-fresh',
        organization_id: orgId,
        full_name: 'Petar Novak',
        role: 'Site lead',
        status: 'active',
        availability_status: 'available',
        updated_at: twoDaysAgo, // fresh
      },
    ],
    worker_notes: [],
  });

  const wakes = [];
  const loader = moduleLoader({
    '@/lib/supabase/server': {
      createServiceSupabaseClient: () => svc,
    },
    './bot-runtime': {
      wakeEmployee: async (params) => {
        wakes.push(params);
        return { status: 'sent', httpStatus: 200 };
      },
    },
    './follow-ups': {
      listFollowUpsDue: async () => ({ items: [], total: 0 }),
    },
    './supply-partners': {
      CAPACITY_SHELF_LIFE_DAYS: 14,
    },
  });

  const { sweepStaleAvailability } = loader('src/lib/data/event-outbox.ts');
  const res = await sweepStaleAvailability(orgId);

  assert.equal(res.partnersChecked, 2);
  assert.equal(res.workersChecked, 2);
  assert.equal(res.dispatched, 2, 'should dispatch for the 1 stale partner and 1 stale worker');

  assert.equal(tables.agent_assignments.length, 2);
  const titles = tables.agent_assignments.map((a) => a.title);
  assert(titles.some((t) => t.includes('Balkan Elektro')));
  assert(titles.some((t) => t.includes('Marko Horvat')));

  for (const w of wakes) {
    assert.equal(w.event, 'availability_stale');
    assert.equal(w.agentInstanceId, 'inst-hanna');
  }
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
  console.log('\nAll event outbox checks passed.');
}
