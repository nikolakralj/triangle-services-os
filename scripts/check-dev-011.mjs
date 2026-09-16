// DEV-011: the menu is Today · Missions · Talent · Settings. Hidden pages keep
// their data and URLs. Source checks only — no env, no database, nothing sent.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.resolve(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.resolve(root, file));

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const sidebar = read('src/components/layout/sidebar.tsx');
const topbar = read('src/components/layout/topbar.tsx');
const hunter = read('src/app/(app)/hunter/page.tsx');
const workers = read('src/app/(app)/workers/page.tsx');
const workersFilter = read('src/components/modules/workers-filter.tsx');
const documents = read('src/app/(app)/documents/page.tsx');
const compliance = read('src/components/modules/compliance-overview.tsx');
const settings = read('src/app/(app)/settings/page.tsx');
const decisions = read('src/app/(app)/decisions/page.tsx');
const todayScreen = read('src/components/modules/today-screen.tsx');
const todayCerts = read('src/components/modules/today-certs.tsx');

test('sidebar shows Today, Missions, Talent and Settings only', () => {
  const hrefs = [...sidebar.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ['/decisions', '/missions', '/workers', '/settings']);
  for (const gone of ['/agents', '/hunter', '/workers/cert-checklist', '/documents', '/onboarding', '/imports']) {
    assert.equal(hrefs.includes(gone), false, `${gone} is still in the menu`);
  }
});

test('Quick add follows the same list', () => {
  const hrefs = [...topbar.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
  for (const h of hrefs) {
    assert.match(h, /^\/(missions|workers)(\?|$)/, `Quick add points outside the shell: ${h}`);
  }
  assert.doesNotMatch(topbar, /href: "\/documents"/);
});

test('/hunter keeps its list behind a diagnostics banner', () => {
  assert.match(hunter, /function DiagnosticsBanner/);
  assert.match(hunter, /not a daily operating surface/);
  assert.match(hunter, /<DiagnosticsBanner \/>/);
  assert.match(hunter, /DiscoveredProjectsTable/);
});

test('Talent has a Compliance tab and the documents page renders the same component', () => {
  assert.match(workers, /tab=compliance/);
  assert.match(workers, /ComplianceOverview/);
  assert.match(documents, /ComplianceOverview/);
  assert.match(compliance, /DocumentUploadPanel/);
  assert.match(compliance, /\/documents\/checklist/);
});

test('Cert Alerts is a filter in Talent', () => {
  assert.match(workers, /certs === "attention"|params\.certs === "attention"/);
  assert.match(workers, /listCertAlerts/);
  assert.match(workersFilter, /certs/);
  assert.match(workersFilter, /Certs need attention/);
  assert.match(workersFilter, /aria-pressed/);
});

test('certificate exceptions are a Needs you card on Today', () => {
  assert.match(decisions, /listCertAlerts/);
  assert.match(decisions, /certs=\{certs\}/);
  assert.match(todayScreen, /CertExceptions/);
  assert.match(todayScreen, /certs\.length/);
  assert.match(todayCerts, /KindChip kind="Renew"/);
  assert.match(todayCerts, /\/workers\?certs=attention/);
  assert.doesNotMatch(todayCerts, /fetch\(/);
});

test('Setup readiness, Data imports and the hidden lists open from Settings', () => {
  for (const href of ['/onboarding', '/imports', '/hunter', '/job-intake', '/workers/cert-checklist']) {
    assert.match(settings, new RegExp(`href: "${href.replace(/\//g, '\\/')}"`), `${href} missing from Settings`);
  }
  assert.match(settings, /id="setup"/);
});

test('no page was deleted', () => {
  for (const page of [
    'src/app/(app)/hunter/page.tsx',
    'src/app/(app)/hunter/[id]/page.tsx',
    'src/app/(app)/workers/cert-checklist/page.tsx',
    'src/app/(app)/documents/page.tsx',
    'src/app/(app)/documents/checklist/page.tsx',
    'src/app/(app)/documents/templates/page.tsx',
    'src/app/(app)/onboarding/page.tsx',
    'src/app/(app)/imports/page.tsx',
    'src/app/(app)/job-intake/page.tsx',
  ]) {
    assert.equal(exists(page), true, `${page} is gone`);
  }
});

test('no migration came with the menu change', () => {
  const dir = path.resolve(root, 'supabase/migrations');
  const today = new Date().toISOString().slice(0, 10);
  const fresh = fs.readdirSync(dir).filter((f) => {
    const st = fs.statSync(path.join(dir, f));
    return st.mtime.toISOString().slice(0, 10) === today && /dev.?011|menu/i.test(f);
  });
  assert.deepEqual(fresh, []);
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
console.log(failed === 0 ? `${tests.length}/${tests.length} ok` : `${tests.length - failed}/${tests.length} passed`);
process.exit(failed === 0 ? 0 : 1);
