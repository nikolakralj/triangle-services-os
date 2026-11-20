// Candidate import and CV fields. Isolated fixtures.
// No env, no live database, no real people.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = process.cwd();

function moduleLoader(mocks = {}) {
  const cache = new Map();
  return function load(file) {
    const full = path.resolve(root, file);
    if (cache.has(full)) return cache.get(full);
    const code = ts.transpileModule(fs.readFileSync(full, "utf8"), {
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
      if (name === "server-only") return {};
      if (name in mocks) return mocks[name];
      if (name.startsWith("@/")) {
        const base = "src/" + name.slice(2);
        if (fs.existsSync(path.resolve(root, base + ".ts"))) return load(base + ".ts");
        if (fs.existsSync(path.resolve(root, base + ".tsx"))) return load(base + ".tsx");
      }
      return require(name);
    };
    new Function("require", "module", "exports", code)(localRequire, mod, mod.exports);
    return mod.exports;
  };
}

function database() {
  const tables = {};
  let serial = 0;
  const svc = {
    from(table) {
      const filters = [];
      let operation = "read";
      let values = null;
      let one = false;
      const q = {
        select() { return q; },
        eq(k, v) { filters.push((r) => r[k] === v); return q; },
        ilike(k, v) {
          filters.push((r) => String(r[k] ?? "").toLowerCase().includes(String(v).replaceAll("%", "").toLowerCase()));
          return q;
        },
        in() { return q; },
        or() { return q; },
        order() { return q; },
        limit() { return q; },
        insert(v) { operation = "insert"; values = v; return q; },
        update(v) { operation = "update"; values = v; return q; },
        single() { one = true; return q; },
        maybeSingle() { one = true; return q; },
        then(resolve, reject) {
          try {
            let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
            if (operation === "insert") {
              const row = {
                id: "row-" + (++serial),
                created_at: new Date().toISOString(),
                status: "pending",
                ...values,
              };
              (tables[table] ??= []).push(row);
              rows = [row];
            } else if (operation === "update") {
              rows.forEach((r) => Object.assign(r, values));
            }
            return Promise.resolve({ data: one ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
          } catch (e) {
            return Promise.reject(e).then(resolve, reject);
          }
        },
      };
      return q;
    },
  };
  return { svc, tables };
}

const orgId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const workerId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function load(db) {
  return moduleLoader({
    "@/lib/supabase/server": { createServiceSupabaseClient: () => db.svc },
    "@/lib/data/finding-source-check": {
      checkFindingSource: async () => ({ status: "matched" }),
      citedUrls: () => [],
    },
    "@/lib/data/outreach": { createOutreachDraft: async () => ({ id: "draft" }) },
  });
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test("drive links: file id, /file/d/, ?id=, and folders are refused", () => {
  const links = load(database())("src/lib/data/person-links.ts");
  assert.equal(links.parseDriveFileId("1AbCdEfGhIjK").id, "1AbCdEfGhIjK");
  assert.equal(
    links.parseDriveFileId("https://drive.google.com/file/d/1AbCdEfGhIjK/view?usp=sharing").id,
    "1AbCdEfGhIjK",
  );
  assert.equal(
    links.parseDriveFileId("https://drive.google.com/open?id=2BcDeFgHiJkL").id,
    "2BcDeFgHiJkL",
  );
  assert.match(
    links.parseDriveFileId("https://drive.google.com/drive/folders/1AbCdEfGhIjK").error,
    /folder/i,
  );
  assert.match(
    links.parseDriveFileId("https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjK").error,
    /folder/i,
  );
  assert.equal(
    links.driveFileViewUrl("1AbCdEfGhIjK"),
    "https://drive.google.com/file/d/1AbCdEfGhIjK/view",
  );
  assert.equal(
    links.canonicalLinkedinUrl("HTTPS://www.LinkedIn.com/in/AdaNovak/?trk=public"),
    "https://linkedin.com/in/adanovak",
  );
  assert.equal(links.canonicalLinkedinUrl("https://example.com/in/ada"), null);
});

test("duplicates match linkedin, then email, then name plus country; a name alone is flagged", () => {
  const fields = load(database())("src/lib/data/candidate-fields.ts");
  const index = new fields.DuplicateIndex();
  index.add(
    fields.identityOf({
      full_name: "Ada Link",
      email: "ada-link@example.com",
      linkedin_url: "https://www.linkedin.com/in/AdaLink/",
      country: "HR",
    }),
    { kind: "worker", id: "w-link" },
  );
  index.add(
    fields.identityOf({
      full_name: "Ada Mail",
      email: "ada@example.com",
      country: "DE",
    }),
    { kind: "worker", id: "w-mail" },
  );
  const both = index.match(fields.identityOf({
    full_name: "Someone Else",
    email: "ada@example.com",
    linkedin_url: "https://linkedin.com/in/adalink",
    country: "HR",
  }));
  assert.equal(both.status, "duplicate");
  assert.equal(both.via, "linkedin_url");
  assert.equal(both.ref.id, "w-link");
  const mail = index.match(fields.identityOf({
    full_name: "Ada Mail",
    email: "ADA@example.com",
    country: "DE",
  }));
  assert.equal(mail.via, "email");
  assert.equal(mail.ref.id, "w-mail");
  const named = index.match(fields.identityOf({
    full_name: "Ada Mail",
    country: "de",
  }));
  assert.equal(named.via, "name_country");
  const nameOnly = index.match(fields.identityOf({ full_name: "Ada Mail", country: "AT" }));
  assert.equal(nameOnly.status, "name_only");
  assert.equal(nameOnly.ref.id, "w-mail");
});

test("import fields: open_to_work, aliases, and a required name", () => {
  const fields = load(database())("src/lib/data/candidate-fields.ts");
  const parsed = fields.parseCandidateRecord({
    full_name: "Mila Horvat",
    open_to_work: true,
    cv_drive_file: "https://drive.google.com/file/d/1AbCdEfGhIjK/view",
    visa: "Posted worker until 2027.",
    years_experience: "8",
  }, { allowAvailability: true, strict: true });
  assert.equal(parsed.error, null);
  assert.equal(parsed.fields.availability_status, "available");
  assert.equal(parsed.fields.original_cv_drive_file_id, "1AbCdEfGhIjK");
  assert.equal(parsed.fields.visa_notes, "Posted worker until 2027.");
  assert.equal(parsed.fields.years_experience, 8);
  const explicit = fields.parseCandidateRecord({
    full_name: "Mila Horvat",
    open_to_work: true,
    availability_status: "busy",
  }, { allowAvailability: true, strict: true });
  assert.equal(explicit.fields.availability_status, "busy");
  const missing = fields.parseCandidateRecord({ role: "Fitter" }, { strict: true });
  assert.match(missing.error, /full_name/);
});

test("a batch files pending findings, matches inside the batch, and does not insert workers", async () => {
  const db = database();
  db.tables.workers = [{
    id: "w-link",
    organization_id: orgId,
    full_name: "Ada Link",
    email: "ada-link@example.com",
    linkedin_url: "https://linkedin.com/in/adalink",
    country: "HR",
  }, {
    id: "w-mail",
    organization_id: orgId,
    full_name: "Ada Mail",
    email: "ada@example.com",
    country: "DE",
  }];
  const api = load(db)("src/lib/data/candidate-import.ts");
  const result = await api.fileCandidateBatch({
    orgId,
    agentInstanceId: "agent-1",
    badgeName: "triangle_hr",
    candidates: [
      { full_name: "Someone Else", email: "ada@example.com", linkedin_url: "https://linkedin.com/in/adalink" },
      { full_name: "Ada Mail", email: "ADA@example.com", country: "DE" },
      { full_name: "Petra Novak", country: "HR", role: "Fitter", open_to_work: true },
      { full_name: "petra novak", country: "hr" },
      { full_name: "Petra Novak" },
      { role: "Fitter" },
      { full_name: "Ivo Kolar", original_cv_drive_file_id: "https://drive.google.com/drive/folders/1AbCdEfGhIjK" },
      { full_name: "Jane Doe", role: "Fitter" },
      {
        full_name: "Ivo Kolar",
        cv_drive_file: "https://drive.google.com/open?id=1AbCdEfGhIjK",
        open_to_work: true,
      },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].status, "duplicate_of");
  assert.equal(result.results[0].matchedOn, "linkedin_url");
  assert.equal(result.results[0].workerId, "w-link");
  assert.equal(result.results[1].status, "duplicate_of");
  assert.equal(result.results[1].matchedOn, "email");
  assert.equal(result.results[2].status, "created");
  assert.equal(result.results[3].status, "duplicate_of");
  assert.equal(result.results[3].matchedOn, "name_country");
  assert.equal(result.results[3].findingId, result.results[2].findingId);
  assert.equal(result.results[4].status, "created");
  assert.equal(result.results[4].nameMatch.kind, "finding");
  assert.equal(result.results[4].nameMatch.id, result.results[2].findingId);
  assert.equal(result.results[5].status, "error");
  assert.match(result.results[6].error, /folder/i);
  assert.match(result.results[7].error, /placeholder/i);
  assert.equal(result.results[8].status, "created");
  const filed = db.tables.agent_findings.find((row) => row.id === result.results[8].findingId);
  assert.equal(filed.status, "pending");
  assert.equal(filed.finding_type, "worker");
  assert.equal(filed.payload.proposal, "candidate");
  assert.equal(filed.payload.batch_id, result.batchId);
  assert.equal(filed.payload.availability_status, "available");
  assert.equal(filed.payload.original_cv_drive_file_id, "1AbCdEfGhIjK");
  assert.equal(db.tables.workers.length, 2);
  const tooMany = await api.fileCandidateBatch({
    orgId,
    agentInstanceId: null,
    badgeName: "triangle_hr",
    candidates: Array.from({ length: 51 }, (_, i) => ({ full_name: `Person ${i} Novak` })),
  });
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.status, 400);
});

test("accepting a candidate writes the new fields and does not merge on the name", async () => {
  const db = database();
  db.tables.workers = [{
    id: workerId,
    organization_id: orgId,
    full_name: "Ada Novak",
    email: "ada@example.com",
    country: "HR",
    status: "active",
    skills: ["PCS7"],
    certificates: [],
    languages: [],
    notes: "",
  }];
  db.tables.agent_findings = [{
    id: "finding-new",
    org_id: orgId,
    finding_type: "worker",
    status: "pending",
    payload: {
      full_name: "Mila Horvat",
      role: "Cable puller",
      years_experience: 8,
      initials: "M. H.",
      cv_drive_file: "1AbCdEfGhIjK",
      triangle_cv_drive_file_id: "https://drive.google.com/file/d/2BcDeFgHiJkL/view",
      visa: "Posted worker, until 2027.",
      nationality: "Croatian",
      work_authorisation: ["DE"],
      linkedin_url: "https://www.linkedin.com/in/MilaHorvat/",
      open_to_work: true,
      summary: "Shutdowns and cable.",
      email: "mila@example.com",
      country: "HR",
      skills: ["MV"],
    },
  }, {
    id: "finding-name",
    org_id: orgId,
    finding_type: "worker",
    status: "pending",
    payload: {
      full_name: "Ada Novak",
      country: "AT",
      email: "other@example.com",
      role: "Supervisor",
    },
  }, {
    id: "finding-email",
    org_id: orgId,
    finding_type: "worker",
    status: "pending",
    payload: {
      full_name: "Ada N.",
      email: "ADA@example.com",
      years_experience: 12,
      initials: "A. N.",
      skills: ["SCC"],
    },
  }];
  const findings = load(db)("src/lib/data/findings.ts");
  await findings.acceptFinding({ findingId: "finding-new", orgId, userId: "human-a" });
  const created = db.tables.workers.find((row) => row.full_name === "Mila Horvat");
  assert.ok(created);
  assert.equal(created.status, "candidate");
  assert.equal(created.availability_status, "available");
  assert.equal(created.years_experience, 8);
  assert.equal(created.initials, "M. H.");
  assert.equal(created.linkedin_url, "https://linkedin.com/in/milahorvat");
  assert.equal(created.original_cv_drive_file_id, "1AbCdEfGhIjK");
  assert.equal(created.triangle_cv_drive_file_id, "2BcDeFgHiJkL");
  assert.equal(created.visa_notes, "Posted worker, until 2027.");
  assert.equal(created.notes, "Shutdowns and cable.");
  assert.equal(created.nationality, "Croatian");
  assert.deepEqual(created.work_authorisation, ["DE"]);
  await findings.acceptFinding({ findingId: "finding-name", orgId, userId: "human-a" });
  const adas = db.tables.workers.filter((row) => row.full_name === "Ada Novak");
  assert.equal(adas.length, 2);
  assert.equal(adas[0].email, "ada@example.com");
  assert.equal(adas[0].role, undefined);
  await findings.acceptFinding({ findingId: "finding-email", orgId, userId: "human-a" });
  assert.equal(adas[0].years_experience, 12);
  assert.equal(adas[0].initials, "A. N.");
  assert.equal(adas[0].status, "active");
  assert.deepEqual(adas[0].skills, ["PCS7", "SCC"]);
  assert.equal(db.tables.agent_findings.every((row) => row.status === "accepted"), true);
});

test("the generated bio uses years of experience", async () => {
  const db = database();
  db.tables.organizations = [{ id: orgId, name: "Example Staffing" }];
  db.tables.workers = [{
    id: workerId,
    organization_id: orgId,
    full_name: "Ada Novak",
    role: "Fitter",
    years_experience: 12,
    skills: [],
    certificates: [],
    languages: [],
    industries: [],
    work_history: [],
  }];
  const cv = load(db)("src/lib/data/worker-cv.ts");
  const doc = await cv.buildWorkerCv({ workerId, orgId });
  assert.equal(doc.yearsNote, "12 years");
  db.tables.workers[0].years_experience = 1;
  assert.equal((await cv.buildWorkerCv({ workerId, orgId })).yearsNote, "1 year");
  db.tables.workers[0].years_experience = null;
  assert.equal((await cv.buildWorkerCv({ workerId, orgId })).yearsNote, null);
});

test("the route requires the worker.propose badge and refuses a huge batch", async () => {
  const route = moduleLoader({
    "@/lib/auth/machine": { verifyMachineToken: async () => null },
    "@/lib/data/candidate-import": { fileCandidateBatch: async () => { throw new Error("must not file"); } },
  })("src/app/api/agent/candidates/route.ts");
  const missing = await route.POST(new Request("http://localhost/api/agent/candidates", {
    method: "POST",
    body: "{}",
  }));
  assert.equal(missing.status, 401);
  const forbidden = moduleLoader({
    "@/lib/auth/machine": {
      verifyMachineToken: async () => ({
        orgId,
        name: "triangle_scout",
        scopes: ["research.suggestion.create"],
        agentInstanceId: "agent-1",
      }),
    },
    "@/lib/data/candidate-import": { fileCandidateBatch: async () => { throw new Error("must not file"); } },
  })("src/app/api/agent/candidates/route.ts");
  const denied = await forbidden.POST(new Request("http://localhost/api/agent/candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidates: [{ full_name: "Ada Novak" }] }),
  }));
  assert.equal(denied.status, 403);
});

test("mission proposals still refuse availability, and the page shows the new links", () => {
  const pool = load(database())("src/lib/data/mission-pool.ts");
  const refused = pool.pickCandidateFields({ full_name: "Petra Novak", availability_status: "available" });
  assert.match(refused.refused, /availability/);
  const kept = pool.pickCandidateFields({
    full_name: "Petra Novak",
    years_experience: 4,
    linkedin_url: "https://www.linkedin.com/in/Petra/",
    skills: ["MV"],
  });
  assert.equal(kept.refused, null);
  assert.equal(kept.fields.years_experience, 4);
  assert.equal(kept.fields.linkedin_url, "https://linkedin.com/in/petra");
  assert.deepEqual(kept.fields.skills, ["MV"]);
  const profile = fs.readFileSync(path.resolve(root, "src/components/modules/worker-profile.tsx"), "utf8");
  assert.match(profile, /Original CV \(Drive\)/);
  assert.match(profile, /Triangle CV \(Drive\)/);
  assert.match(profile, /Initials /);
  assert.match(profile, /Triangle bio/);
  const page = fs.readFileSync(path.resolve(root, "src/app/(app)/workers/[id]/page.tsx"), "utf8");
  assert.match(page, /yearsExperience: row\.years_experience/);
  const queue = fs.readFileSync(path.resolve(root, "src/components/modules/approvals-queue.tsx"), "utf8");
  assert.match(queue, /Accept all/);
  const sql = fs.readFileSync(path.resolve(root, "supabase/migrations/058_worker_cv_links.sql"), "utf8");
  assert.match(sql, /add column if not exists initials text/);
  assert.match(sql, /add column if not exists years_experience integer/);
  assert.match(sql, /add column if not exists linkedin_url text/);
  assert.match(sql, /add column if not exists original_cv_drive_file_id text/);
  assert.match(sql, /add column if not exists triangle_cv_drive_file_id text/);
  assert.match(sql, /workers_org_linkedin_lower_uidx/);
  assert.match(sql, /workers_org_email_lower_uidx/);
  assert.match(sql, /pg_constraint/);
  assert.match(sql, /notify pgrst, 'reload schema'/);
  assert.match(sql, /DO NOT APPLY THIS FROM A CODING AGENT/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log("PASS " + name);
  } catch (error) {
    failed++;
    console.error("FAIL " + name);
    console.error(error);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} candidate checks passed. No live database used.`);
if (failed) process.exitCode = 1;
