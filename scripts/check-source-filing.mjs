// DEV-002 acceptance: real filing code, isolated HTTP/database fixtures. No env or live writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const root = process.cwd();
function moduleLoader(mocks = {}) {
  const cache = new Map();
  return function load(file) {
    const full = path.resolve(root, file);
    if (cache.has(full)) return cache.get(full);
    const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }}).outputText;
    const mod = { exports: {} };
    cache.set(full, mod.exports);
    const localRequire = (name) => {
      if (name === 'server-only') return {};
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
      return require(name);
    };
    new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
    return mod.exports;
  };
}
const source = moduleLoader()('src/lib/data/finding-source-check.ts');
const url = 'https://supplier.eu/contact';
const channel = { kind: 'email', value: 'buyer@supplier.eu' };
const page = (text, links = []) => ({ text, links });
const unreadable = { reason: 'Source returned HTTP 403.' };
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
const check = (content, payload = channel, urls = [url]) => source.checkFindingSource(payload, urls, async () => content);

test('published email matches case-insensitively', async () => assert.equal((await check(page('Email BUYER@SUPPLIER.EU'))).status, 'matched'));
test('email substrings do not match another mailbox', async () => assert.equal((await check(page('otherbuyer@supplier.eu'))).status, 'refused'));
test('encoded mailto matches; subject is not evidence', async () => {
  assert.equal((await check(page('Contact', ['mailto:buyer%40supplier.eu?subject=Hello']))).status, 'matched');
  assert.equal((await check(page('Contact', ['mailto:else@supplier.eu?subject=buyer@supplier.eu']))).status, 'refused');
});
test('international phone formatting and optional trunk prefix match', async () => {
  assert.equal((await check(page('Call +43 (0)1 234-5678'), { kind: 'phone', value: '0043 1 2345678' })).status, 'matched');
  assert.equal((await check(page('Contact', ['tel:%2B4312345678']), { kind: 'phone', value: '+43 1 2345678' })).status, 'matched');
});
test('phone suffix and longer number never match', async () => {
  assert.equal((await check(page('+43 1 234567890'), { phone: '+43 1 2345678' })).status, 'refused');
  assert.equal((await check(page('+43 1 2345678'), { phone: '12345678' })).status, 'refused');
});
test('bot quote and forged source_check cannot prove publication', async () => assert.equal((await check(page('No contact here'), { ...channel, evidenceText: channel.value, source_check: { status: 'matched' } })).status, 'refused'));
test('unreadable is unchecked with actionable reason', async () => {
  const result = await check(unreadable); assert.equal(result.status, 'unchecked'); assert.match(result.reason, /Source unchecked.*403/);
});
test('one matching citation wins despite another unreadable citation', async () => {
  const r = await source.checkFindingSource(channel, [url, url + '/blocked'], async u => u === url ? page(channel.value) : unreadable);
  assert.equal(r.status, 'matched'); assert.equal(r.matches[0].url, url);
});
test('mixed absent and unreadable citations remain unchecked', async () => {
  const r = await source.checkFindingSource(channel, [url, url + '/blocked'], async u => u === url ? page('No address') : unreadable);
  assert.equal(r.status, 'unchecked');
});
test('all supplied channels must be supported', async () => assert.equal((await check(page(channel.value), { ...channel, phone: '+4312345678' })).status, 'refused'));
test('unsupported channel, missing source, malformed phone are refused', async () => {
  for (const payload of [{ kind: 'linkedin', value: url }, { value: 'ask the team' }, {}]) {
    assert.equal((await check(page('Contact'), payload)).status, 'refused');
  }
  assert.equal((await check(page(channel.value), channel, [])).status, 'refused');
});
test('source limit is honest and reader failures are unchecked', async () => {
  assert.equal((await check(page('No address'), channel, Array.from({length: 6}, (_, i) => url + i))).status, 'unchecked');
  assert.equal((await source.checkFindingSource(channel, [url], async () => { throw Error('fail'); })).status, 'unchecked');
});
test('public-address guard rejects local, mapped, reserved IPv4/IPv6', () => {
  for (const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','192.168.1.1','0.0.0.0','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::']) assert.equal(source.publicAddress(ip), false, ip);
  for (const ip of ['8.8.8.8','2606:4700:4700::1111']) assert.equal(source.publicAddress(ip), true, ip);
});

function readerFixture(responses, addresses = [{ address: '8.8.8.8', family: 4 }]) {
  const requests = [];
  const request = (u, options, cb) => {
    requests.push({ url: u.href, options });
    const req = new EventEmitter();
    req.end = () => queueMicrotask(() => {
      const fixture = responses.shift();
      if (!fixture) throw Error('Unexpected GET ' + u.href);
      const res = new PassThrough();
      res.statusCode = fixture.status ?? 200;
      res.headers = { 'content-type': fixture.type ?? 'text/html', location: fixture.location };
      cb(res); if (!res.destroyed) res.end(fixture.body ?? '');
    });
    return req;
  };
  return { requests, reader: moduleLoader({
    'node:dns/promises': { lookup: async () => addresses },
    'node:http': { request }, 'node:https': { request },
  })('src/lib/data/finding-source-check.ts').readSourcePage };
}
test('HTML entities and link attributes are read; scripts/hidden content are excluded', async () => {
  const { reader } = readerFixture([{ body: '<body><p>buyer&#64;supplier.eu</p><script>fake@supplier.eu</script><div hidden>hidden@supplier.eu</div><a href="tel:+4312345678">Call</a></body>' }]);
  const r = await reader(url); assert.equal(source.pageContains(r, 'email', channel.value), true);
  assert.equal(source.pageContains(r, 'email', 'fake@supplier.eu'), false);
  assert.equal(source.pageContains(r, 'email', 'hidden@supplier.eu'), false);
  assert.equal(source.pageContains(r, 'phone', '+4312345678'), true);
});
test('adjacent HTML blocks do not join two phone numbers', async () => {
  const { reader } = readerFixture([{ body: '<p>+43 1 2345678</p><p>+43 1 9999999</p>' }]);
  assert.equal(source.pageContains(await reader(url), 'phone', '+4312345678'), true);
});
test('HTTP error, browser challenge, empty and unsupported pages stay unchecked', async () => {
  for (const fixture of [{status:403}, {body:'<title>Just a moment</title><body>Waiting</body>'}, {body:'<script>app()</script>'}, {type:'application/pdf',body:'PDF'}]) {
    const r = await readerFixture([fixture]).reader(url); assert.ok('reason' in r);
  }
});
test('redirect destinations are validated and credentials never reach HTTP', async () => {
  // Every destination is reached through a redirect from a public page, and none is requested.
  for (const destination of ['http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data', 'file:///private', 'https://user:password@supplier.eu/']) {
    const { requests, reader } = readerFixture([{ status:302, location: destination }]);
    const r = await reader(url);
    assert.ok('reason' in r, destination); assert.equal(requests.length, 1, destination);
  }
  // A private address written straight into the cited URL is refused without a request, whatever DNS says.
  const literal = readerFixture([]);
  assert.ok('reason' in await literal.reader('http://10.0.0.5/contact')); assert.equal(literal.requests.length, 0);
  const privateReader = readerFixture([], [{address:'127.0.0.1',family:4}]);
  assert.ok('reason' in await privateReader.reader(url)); assert.equal(privateReader.requests.length, 0);
});
test('DNS is pinned and no authorization or cookies are sent', async () => {
  const { reader, requests } = readerFixture([{body:'Contact'}]); await reader(url);
  assert.equal(requests[0].options.headers.Authorization, undefined); assert.equal(requests[0].options.headers.Cookie, undefined);
  requests[0].options.lookup('supplier.eu', {}, (err, ip) => {assert.equal(err,null); assert.equal(ip,'8.8.8.8');});
  // Node's own connection asks for all addresses; a bare address there fails every real page.
  requests[0].options.lookup('supplier.eu', { all: true }, (err, list) => {
    assert.equal(err, null); assert.deepEqual(list, [{ address: '8.8.8.8', family: 4 }]);
  });
});

function database() {
  const tables = {}; const writes = []; let serial = 0; let failure = null;
  const svc = { from(table) {
    const filters = []; let operation = 'read'; let values; let one = false; let desc;
    const q = {
      select() { return q; }, eq(k,v) { filters.push(r => r[k] === v); return q; },
      is(k,v) { filters.push(r => (r[k] ?? null) === v); return q; },
      in(k,vs) { filters.push(r => vs.includes(r[k])); return q; },
      neq(k,v) { filters.push(r => r[k] !== v); return q; },
      ilike(k,v) { filters.push(r => String(r[k] ?? '').toLowerCase().includes(v.replaceAll('%','').toLowerCase())); return q; },
      contains(k,v) { filters.push(r => Object.entries(v).every(([a,b]) => r[k]?.[a] === b)); return q; },
      order(k,opts) { desc = opts?.ascending === false ? k : null; return q; }, limit() { return q; },
      insert(v) { operation='insert'; values=v; return q; }, update(v) { operation='update'; values=v; return q; },
      single() { one=true; return q; }, maybeSingle() { one=true; return q; },
      then(resolve, reject) { try {
        let rows=(tables[table] ?? []).filter(r => filters.every(f => f(r)));
        if (desc) rows.sort((a,b) => String(b[desc]).localeCompare(String(a[desc])));
        if (operation !== 'read') {
          writes.push({ table, operation, values });
          if (failure) return Promise.resolve({ data:null, error:{message:failure} }).then(resolve,reject);
          if (operation==='insert') { const row={ id: 'row-'+(++serial), created_at: new Date(Date.now()+serial).toISOString(), status:'pending', ...values }; (tables[table] ??= []).push(row); rows=[row]; }
          else rows.forEach(r => Object.assign(r, values));
        }
        return Promise.resolve({data:one ? rows[0] ?? null : rows,error:null}).then(resolve,reject);
      } catch(e) { return Promise.reject(e).then(resolve,reject); } },
    }; return q;
  }};
  return { svc, tables, writes, fail(message) { failure=message; } };
}
const ctx = { orgId:'org-a', missionId:'mission-a', missionTitle:'Isolated source check', stepId:'step-a', agentInstanceId:'agent-a', agentName:'Scout', createdBy:'human-a' };
const target = { company:'Helios Montage', companyKey:'helios montage', website:'https://supplier.eu',domain:'supplier.eu', city:null,country:'AT',role:null,why:'Published business contact', person:'Petra Novak',personTitle:'Procurement', channel:{...channel,whose:'person'}, words:'Discuss a crew',project:null,state:'reachable',missing:null,missingOwner:null,deadReason:null,sources:[{url,claim:'A bot quote cannot establish the channel.'}] };
function filingFixture(content) {
  const db=database();
  const sourceMock = { ...source, sourceReader: () => async () => content, checkFindingSource: (p,u) => source.checkFindingSource(p,u,async () => content) };
  const load=moduleLoader({ '@/lib/supabase/server':{ createServiceSupabaseClient:()=>db.svc }, '@/lib/data/finding-source-check':sourceMock });
  return {db,load,records:load('src/lib/data/mission-records.ts'),findings:load('src/lib/data/findings.ts')};
}
const finding = { orgId:'org-a', agentInstanceId:'agent-a', findingType:'contact', payload:{full_name:target.person,...channel}, sourceUrl:url,evidenceText:'Published business contact',findingState:'reachable' };
test('mission refuses before any company/contact/finding mutation', async () => {
  const {db,records}=filingFixture(page('No address')); const [r]=await records.fileMissionTargets(ctx,[target]);
  assert.match(r.refused,/does not appear/); assert.equal(db.writes.length,0);
});
test('mission files matched evidence and remains agent-found, unverified', async () => {
  const {db,records}=filingFixture(page(channel.value)); const [r]=await records.fileMissionTargets(ctx,[target]);
  assert.equal(r.refused,null); assert.equal(r.target.state,'reachable');
  assert.equal(db.tables.contacts[0].email,channel.value); assert.equal(db.tables.contacts[0].verified_at,undefined);
  assert.equal(db.tables.agent_findings.length,2); assert.ok(db.tables.agent_findings.every(f=>f.payload.source_check.status==='matched'));
});
test('mission files unreadable sources as missing with owner; channel is evidence only', async () => {
  const {db,records}=filingFixture(unreadable); const [r]=await records.fileMissionTargets(ctx,[target]);
  assert.equal(r.refused,null); assert.equal(r.target.state,'one_thing_missing'); assert.equal(r.target.missingOwner,'Scout');
  assert.equal(db.tables.contacts[0].email,null);
  assert.ok(db.tables.agent_findings.every(f=>f.finding_state==='one_thing_missing' && f.payload.source_check.status==='unchecked' && /Source unchecked/.test(f.payload.missing)));
});
test('mission retries do not duplicate records or findings', async () => {
  const {db,records}=filingFixture(page(channel.value)); await records.fileMissionTargets(ctx,[target]); await records.fileMissionTargets(ctx,[target]);
  assert.equal(db.tables.companies.length,1);assert.equal(db.tables.contacts.length,1);assert.equal(db.tables.agent_findings.length,2);
});
test('placeholder refusal survives and non-reachable findings need no page read', async () => {
  const {records}=filingFixture(unreadable);
  assert.match((await records.fileMissionTargets(ctx,[{...target,company:'Example GmbH'}]))[0].refused,/placeholder/);
  const [r]=await records.fileMissionTargets(ctx,[{...target,state:'dead',deadReason:'Not relevant',channel:null}]);
  assert.equal(r.target.state,'dead'); assert.equal(r.sourceCheck,undefined);
});
test('generic filing refuses absent source and cannot trust caller source_check', async () => {
  const {db,findings}=filingFixture(page('No address'));
  const r=await findings.createFinding({...finding,payload:{...finding.payload,source_check:{status:'matched'}}});
  assert.match(r.refused,/does not appear/); assert.equal(db.writes.length,0);
});
test('generic filing stores unchecked and returns its real state on retry', async () => {
  const {db,findings}=filingFixture(unreadable);
  const first=await findings.createFinding({...finding,idempotencyKey:'stable'});
  const next=await findings.createFinding({...finding,idempotencyKey:'stable'});
  assert.equal(first.findingState,'one_thing_missing');assert.equal(next.duplicate,true);assert.equal(next.sourceCheck.status,'unchecked');assert.equal(db.tables.agent_findings.length,1);
});
test('another tenant does not reuse a finding with the same key or value', async () => {
  const {db,findings}=filingFixture(page(channel.value));
  await findings.createFinding({...finding,idempotencyKey:'same'});
  await findings.createFinding({...finding,orgId:'org-b',idempotencyKey:'same'});
  assert.equal(db.tables.agent_findings.length,2); assert.equal(db.tables.agent_findings[1].org_id,'org-b');
});
test('database refusal is returned verbatim', async () => {
  const {db,findings}=filingFixture(page(channel.value)); db.fail('reachable needs a named person');
  const old=console.error; console.error=()=>{};
  try { assert.equal((await findings.createFinding(finding)).refused,'reachable needs a named person'); } finally { console.error=old; }
});
test('unchecked finding cannot silently promote its channel during approval', async () => {
  const {findings}=filingFixture(unreadable); const r=await findings.createFinding(finding);
  await assert.rejects(()=>findings.acceptFinding({findingId:r.id,orgId:'org-a',userId:'human-a'}),/Source unchecked/);
});
test('API returns refusal and unchecked state for nested and flat payloads', async () => {
  for(const content of [page('No address'),unreadable,page(channel.value)]) {
    const {findings}=filingFixture(content);
    const api=moduleLoader({ '@/lib/auth/machine':{verifyMachineToken:async()=>({orgId:'org-a',agentInstanceId:'agent-a'}),hasScope:()=>true}, '@/lib/data/findings':findings })('src/app/api/agent/findings/route.ts');
    for(const flat of [false,true]) {
      const body={findingType:'contact',findingState:'reachable',sourceUrl:url,evidenceText:'Published contact',...(flat?finding.payload:{payload:finding.payload})};
      const res=await api.POST(new Request('http://localhost/api/agent/findings',{method:'POST',body:JSON.stringify(body)}));
      const json=await res.json();
      assert.equal(res.status,content.text==='No address'?422:200);
      if(res.status===422) assert.match(json.error,/does not appear/);
      else assert.equal(json.findingState,content===unreadable?'one_thing_missing':'reachable');
    }
  }
});
test('API rejects missing or insufficient badges before reading or writing', async () => {
  for(const machine of [null,{name:'read only'}]) {
    const api=moduleLoader({'@/lib/auth/machine':{verifyMachineToken:async()=>machine,hasScope:()=>false},'@/lib/data/findings':{createFinding:()=>{throw Error('must not file');}}})('src/app/api/agent/findings/route.ts');
    assert.equal((await api.POST(new Request('http://localhost',{method:'POST',body:'{}'}))).status,machine?403:401);
  }
});
test('active approvals show Source unchecked and its reason', async () => {
  const {db,findings}=filingFixture(unreadable); await findings.createFinding(finding);
  const approvals=moduleLoader({'@/lib/supabase/server':{createServiceSupabaseClient:()=>db.svc},'@/lib/data/agent-identity':{loadAgentFaces:async()=>({byId:new Map(),fromCredentialName:()=>undefined})}})('src/lib/data/approvals.ts');
  const items=await approvals.listApprovals('org-a');assert.match(items[0].detail,/Source unchecked/);
});

let failed=0;
for(const [name,fn] of tests) { try { await fn(); console.log('PASS '+name); } catch(e) {failed++;console.error('FAIL '+name+'\n'+e.stack);} }
console.log('\n'+(tests.length-failed)+'/'+tests.length+' DEV-002 checks passed. No live database or messages used.');
if(failed)process.exitCode=1;
