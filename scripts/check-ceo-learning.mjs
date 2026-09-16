// Learning from CEO's edits checks:
// Verify appendHouseRule and role resolution in house-rules.
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

test('appendHouseRule combines rules cleanly', async () => {
  const orgId = '00000000-0000-0000-0000-000000000001';
  const employeeId = 'emp-123';

  let currentRules = null;
  const saves = [];

  const loader = moduleLoader({
    '@/lib/supabase/server': {
      createServiceSupabaseClient: () => ({
        rpc: async (name, params) => {
          saves.push(params);
          const version = (currentRules?.version ?? 0) + 1;
          const saved = {
            id: 'rule-' + version,
            org_id: params.p_org_id,
            agent_instance_id: params.p_agent_instance_id,
            body: params.p_body,
            version,
            set_by: params.p_user_id,
            created_at: new Date().toISOString(),
          };
          currentRules = saved;
          return { data: saved, error: null };
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    then: (resolve) => resolve({ data: currentRules ? [currentRules] : [], error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    },
  });

  const { appendHouseRule } = loader('src/lib/data/house-rules.ts');

  // First rule added
  const first = await appendHouseRule({
    orgId,
    agentInstanceId: employeeId,
    newRule: 'Always ask for headcount first.',
    userId: 'user-1',
  });

  assert.equal(first.version, 1);
  assert.equal(first.body, '- Always ask for headcount first.');

  // Second rule appended
  const second = await appendHouseRule({
    orgId,
    agentInstanceId: employeeId,
    newRule: 'Never write to an Austrian in English.',
    userId: 'user-1',
  });

  assert.equal(second.version, 2);
  assert(second.body.includes('- Always ask for headcount first.'));
  assert(second.body.includes('- Never write to an Austrian in English.'));
});

test('LearnRulePrompt component exists and imports correctly', () => {
  const content = fs.readFileSync(path.resolve(root, 'src/components/modules/learn-rule-prompt.tsx'), 'utf8');
  assert(content.includes('export function LearnRulePrompt'), 'must export LearnRulePrompt');
  assert(content.includes('Save as house rule'), 'must have button action');
});

test('Draft panels offer LearnRulePrompt upon edit', () => {
  const leadPanel = fs.readFileSync(path.resolve(root, 'src/components/modules/lead-reply-panel.tsx'), 'utf8');
  assert(leadPanel.includes('<LearnRulePrompt'), 'lead reply panel must include LearnRulePrompt');
  assert(leadPanel.includes('setShowLearnPrompt(true)'), 'lead reply panel must trigger prompt on edit');

  const outreachPanel = fs.readFileSync(path.resolve(root, 'src/components/modules/outreach-drafts-panel.tsx'), 'utf8');
  assert(outreachPanel.includes('<LearnRulePrompt'), 'outreach panel must include LearnRulePrompt');
  assert(outreachPanel.includes('setShowLearnPrompt(true)'), 'outreach panel must trigger prompt on edit');
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
  console.log('\nAll CEO edit learning checks passed.');
}
