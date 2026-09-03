# Current State

## Purpose

This file is the honest status report for the repo.
It should tell a future agent what is real, what is partial, and what still needs cleanup.

## Verified state — 2 September 2026

Checked against the running app and the database, not from memory.

**Schema:** repository migrations run through `031`. The remote migration
history uses timestamped versions rather than the repository's short names;
the 31 August state records the corresponding hardening changes as applied and
verified. This company-case/runtime slice adds no migration. The first signed-in
smoke used the externally operated Bilfinger E&M assignment. On 2 September,
Triangle's own executor accepted, researched, and completed the Köster and
GOLDBECK qualification cases against live data.

### Repository implementation — living company cases

- accepting a company finding now preserves the source assignment and queues
  an idempotent, research-only continuation for the same AI employee;
- the continuation requires a named relevant project, actual buyer path,
  sourced buyer contacts, Triangle-supported crew package, blockers, and exact
  next commercial action; it explicitly forbids contact;
- company records are hydrated into the agent inbox, so the employee receives
  the case context rather than only an opaque UUID;
- `/companies/[id]` is now a manager-report workspace: one recommendation,
  named work, actual buyer, supported offer, next commercial action, and
  material unknowns; worker hand-ins, conversations, evidence, and older jobs
  remain available under `Manager audit`;
- completed legacy sectioned Scout reports are converted into the same compact
  manager view, so useful existing work is not discarded;
- future company continuations carry `execution_mode: in_app`; an authenticated
  workforce pulse safely claims one queued Scout job and runs a structured,
  web-research-capable in-app employee without requiring provider chat;
- old generic AI-action buttons and empty CRM side panels are no longer the
  primary company experience;
- the pulse is a verified early runtime bridge that operates while an
  authenticated Triangle session is open; an always-on cloud worker remains a
  later runtime hardening step;
- structured hand-ins are stored atomically (never truncated mid-JSON), and
  `agent_runs` links the assignment, employee, provider, model, timestamps,
  token usage, status, and compact decision metadata;
- no generic case table, vector database, second CRM, autonomous outbound,
  deployment, or production schema write was introduced.

**Verification:** `npx tsc --noEmit`, full `npm run lint`,
`npm run check:tenant-identity`, `npm run build`, and `git diff --check` pass.
The signed-in Bilfinger flow verifies continuity for an external Scout. The
Köster and GOLDBECK flows additionally verify Triangle's in-app executor:
accept finding -> durable company -> queued no-outreach assignment -> OpenAI
web research -> valid structured manager report -> linked run audit -> pending
project evidence. The GOLDBECK page renders a four-part strategy and a verified
supplier-portal URL while worker detail remains collapsed. No framework
overlay or application console error was present. No outreach, supplier
registration, or external action was performed.

### Pipeline audit — 2 September 2026

Counted against the live database, stage by stage:

| Stage | Count |
|---|---|
| discovered projects | 18 |
| contractor chain nodes | 12 |
| buyer contacts | 4 — **0 reachable** |
| crew packages | 3 |
| workers | 3 (all available) |
| commercial requirements | 1 (draft) |
| buyer routes | **0** |
| outreach drafts | 7 (one already replied) |
| commercial actions — recorded sends | **0** |
| orders | 0 |

Two things stop everything, and only one of them is code.

**The wall (human, not code):** Triangle knows four buyers by name and can
reach none of them — Paul Boxer (Tata Steel), Stefan Mitterecker and Walther
Hartl (ANDRITZ), Peter Östlund (JSM Utility Services). Research names the right
person; it cannot produce an unpublished address. Explorium returned zero
matches for all six lookups tried, so an enrichment API is not the answer for
German industrial managers. The route is the Impressum or the switchboard, and
it is Nikola/Ralph's to walk.

**The gap (code, now closed):** marking an outreach draft "sent" flipped
`outreach_drafts.status` and wrote nothing to `commercial_actions`. Seven
drafts were marked sent, one of them replied to, and the ledger the Phase 0
exit gate counts said zero sends had ever happened — two records of the same
event, disagreeing. `markOutreachSent` now writes the commercial action in the
same call, under the database's own rules: a recipient, the final content, an
occurrence time, and a named human who confirms it. `userId` is required, so a
machine key cannot record that a human sent something. Verified signed-in with
a scratch draft: the action was created with recipient, content, follow-up date
and confirmer, and a draft with no recipient on record was refused with the
reason shown on the card and its status left as Draft.

Zero buyer routes is why the one requirement cannot qualify — the database
refuses, correctly. That unblocks itself as soon as a route is recorded.

### Repository implementation — cases on every record (CASE-003)

The company case proved a record is more useful when it carries its own
history. Extending that to the other entities turned out not to be a UI job:
Triangle records proposals in **two** places, and the loader only knew one.
`agent_findings` stamps `promoted_entity_id` on accept; `research_suggestions`
stamps `final_record_id`. All four buyer contacts and all three crew packages
in the live database came through the second path, so every one of them
reported an empty case.

- `getEntityCase` now reads both, and `CASE_ENTITIES` covers company, project,
  worker, buyer contact, package and requirement. One loader, six entities,
  no duplicate truth tables.
- Buyer contacts on `/hunter/[id]` show the quoted evidence, the employee who
  found them, the confidence, and the source. Peter Östlund now displays
  Scout's Impressum line and a 90%-sure badge instead of a bare name — which
  is what made it possible to silently overwrite his sourced note before.
- Package cards show the same, so an accepted package states what it was
  accepted on.
- A requirement inherits its case. Nobody proposes a requirement — a human
  writes it down — so `getRequirementResearchCase` falls back to the project it
  came from plus that project's buyer contacts and packages, and returns
  `inherited: true` so the page can say so rather than implying the work was
  done on the requirement itself.
- `src/lib/data/agent-identity.ts` resolves an instance id and a credential
  name to the same employee. Approvals and cases now share it, so Scout is
  "Scout" on both screens and legacy `mcp_*` rows read as words.

Verified signed-in against the running app on the maincubes project, its
requirement, and the Bilfinger company page. No migration; no schema change.

### Repository implementation — CEO Decision Inbox

- `/decisions` is now the default signed-in landing page and the primary AI
  Workforce navigation destination;
- pending research is grouped into case briefs with recommendation, business
  impact, unknowns, evidence quality, responsible employee, next safe AI step,
  and the exact human step;
- recent blocked/waiting-review assignments and unsent outreach drafts appear
  as exceptions or consequential commercial decisions;
- queued/active internal work is counted as `AI handling now` and stays out of
  the CEO attention queue;
- raw evidence and the existing accept/reject controls remain behind
  progressive disclosure; `/approvals` remains evidence history;
- no migration, autonomous outbound action, deployment, or production write
  was introduced.

**Decision Inbox verification:** `npx tsc --noEmit`, full `npm run lint`,
`npm run check:tenant-identity`, `npm run build`, and `git diff --check` pass.
Signed-in browser smoke confirms `/decisions` renders grouped case decisions,
combines related external drafts into project-level decisions, opens evidence
controls, and shows no framework overlay or application console error. The
write-side acceptance -> automatic continuation flow is now verified on
Köster and GOLDBECK.

**Live counts:** 3 available workers · 18 discovered projects · 172 companies ·
4 buyer contacts, none with an email, phone or LinkedIn · 3 packages · 1 outreach draft
waiting to send · 0 sends · 0 packets · 0 orders · 0 placements.

**Working end to end:** job intake and reply drafting, Scout research through
the MCP with approvals, contractor chain, packages, worker matching, CV import,
CSV roster import, worker profiles and notes, assignment threads, hiring an AI
employee, compliance documents with expiry, and — as of today — drafting a
first approach to a named buyer from a project.

**Enforced in Postgres, not in the UI:** a requirement cannot reach qualified
without eleven facts and a confirmed buyer route; a commercial action cannot be
completed without a recipient, the final content and a named human; a worker
cannot hold two overlapping reservations. Verified by attempting each and being
refused.

**All four items previously listed here as false are now closed:**
- migration 031 applied 31 August 2026; cross-tenant links are refused —
  verified by linking a requirement to another tenant's project and being told
  "Discovered project belongs to another organization";
- the research panel now uses OPENAI_RESEARCH_MODEL (default gpt-4.1) instead
  of the cheap global default, and is instructed to reject business-directory
  and map-listing results rather than repeating them;
- the vendor checklist buttons WERE already wired — that note was wrong. The
  status control calls PATCH /api/documents/checklist/[id], which returns 401
  unauthenticated;
- the two hardcoded Metrics zeros are replaced by counts from
  commercial_requirements and commercial_actions. They still read zero, but
  now because nothing has been sent rather than because nothing was wired.

## Current product direction — updated 30 August 2026

Triangle is a human-led, AI-assisted contract-to-crew operating system for
cross-border technical staffing and subcontracting.

The software is intended to become a sellable vertical product for boutique
technical contract staffing and crew-supply businesses. Triangle Services is
tenant zero. External customer discovery now runs in parallel with Triangle's
commercial activation; generic HR/CRM/agent-platform productization remains
rejected.

The current phase is commercial activation, not another product redesign.
The software can ingest, research, draft, match, and generate packets. It has
not yet proven real sends, buyer response, contract conversion, mobilization,
payment, or margin.

The adopted long-term direction is in `ROADMAP.md`; the current ordered work
and freeze list are in `ROADMAP_EXECUTION.md`; autonomous product work is
ordered in `AUTONOMOUS_WORK_QUEUE.md`. The buyer/competition/pricing research
is in `docs/strategy/SELLABLE_PRODUCT_STRATEGY_2026-08-30.md`.

## Repository and branch reality

- Live local project:
  `C:\Users\nikol\Projects\triangle-services-os`.
- Active branch:
  `wip-jules-2026-05-03T18-13-13-596Z`, not `main`.
- Current committed HEAD at this audit: `81c8acd`; the 1 September company-case
  work is an uncommitted local change on top of it.
- The old OneDrive copy is not the project to edit.
- Repository migrations now run through
  `supabase/migrations/031_commercial_delivery_hardening.sql`. The 31 August
  implementation records migrations `027`-`031` as applied through timestamped
  remote migration entries.
- The worktree contains the strategy/roadmap reconciliation plus the first
  tenant productization slice. Preserve it; do not treat untracked files as
  disposable.

## What is implemented

### Demand and commercial intake

- IMAP and external/bot email ingestion;
- privacy-aware classification and body retention;
- team-potential scoring, house rules, deduplication, and CSV export;
- reply drafting, editing, copying, and manual “I sent this” recording;
- project discovery/Hunter with source and commercial scoring;
- opportunities and pipeline foundations.

### Project, buyer, and package intelligence

- contractor-chain final records and UI;
- buyer-contact suggestions/final records;
- research runs, sources, suggestions, chat memory, and tool audit;
- unified Approvals queue for research and agent findings;
- project packages and required-document inference;
- worker matching, submission states, markdown/PDF packet generation;
- packet-send tracking, recipient/channel/response status, and placement-fee
  field.

### Supply and worker truth

- worker list, filters, profile, notes, import, and CV upload/extraction;
- worker-document upload, expiry, certificate types, and document readiness;
- AI CV proposals through a human approval queue;
- matching against package roles and worker availability.

### Agent workforce

- provider-independent `agent_instances`;
- scoped/revocable machine credentials and provider bindings;
- quick tasks, durable assignments, worker/project context, and conversations;
- agent runs, findings, human approvals, delivery/seen state, and result
  reporting;
- Bob (Inbox Coordinator), Scout (Project Researcher), and Hanna (HR) are
  active identities in the live database;
- only Bob and Scout currently have canonical role files. Hanna has no
  `agents/hanna.md` file and should be treated as governance-incomplete.

### Trust/platform

- Next.js 16.2.4 / React 19.2.4 application;
- Supabase auth, service-client membership pattern, RLS, and org-scoped APIs;
- static machine API access with scoped tokens;
- version and ship utilities;
- authenticated application routes.

### Sellability foundation — repository implementation 30 August 2026

- tenant operating profile fields and idempotent migration `027`;
- admin/partner organization settings API and UI;
- operating model, offer mode, factual positioning, exact sign-off, currency,
  and timezone;
- tenant profile injected into both IMAP/external intake classification and
  reply drafting;
- reply drafting returns `409` when required tenant identity is incomplete;
- Triangle's existing positioning is seeded only for the Triangle organization
  when migration `027` is applied;
- general AI, research, imports, submission packets, login metadata, top-bar,
  documents, and MCP runtime identity now use the product brand or active
  tenant profile as appropriate;
- static runtime sample records were removed;
- tenant-scoped document upload, role-filtered listing, signed access, vendor
  checklist linking, and approval are implemented;
- migration `028` seeds pipeline and readiness defaults for every new tenant;
- `npm run check:tenant-identity` prevents tenant-zero identity regressions.
- `/onboarding` exposes nine evidence-backed setup gates and the exact blocker
  for safe intake, a targeted draft, and a buyer-linked first package;
- Settings navigation now targets real configuration panels rather than inert
  section buttons.

Verification completed locally: `npx tsc --noEmit`, focused ESLint, and
`git diff --check` pass. Live migration/application behavior remains unverified
until an authorized production migration and signed-in smoke test.

## Live operating baseline — 29 August 2026

| Object | State |
|---|---|
| Job leads | 24; 21 new, 3 reviewing |
| Priority leads | 4 scoring 70+ |
| Reply drafts | 3 draft, 0 sent |
| Discovered projects | 18, all new |
| Contractor-chain nodes | 11 |
| Buyer contacts | 3 |
| Research suggestions | 31; 22 accepted, 8 pending, 1 rejected |
| Project packages | 2 |
| Worker matches | 3, all marked placed |
| Packet sends | 0 |
| Opportunities | 1 |
| Companies / contacts | 166 / 0 |
| Available workers | 3 |
| Agent identities | 3 |
| Assignments | 4; 2 cancelled, 1 failed, 1 completed |
| Assignment messages | 0 |

The three `placed` worker-match records have no corresponding packet send,
commercial progression, mobilization, or payment record. Do not report them as
proven placements.

### Supply-demand mismatch

The four high-priority leads are automation/PCS7/offline-programming demand.
The stored available supply is:

- electrician;
- cable puller;
- electrical supervisor.

The package “Electrical installation crew — 50 electricians, 8 months” claims
far more capacity than the database can prove. The “Commissioning — ANDRITZ”
package has no roles. Supply truth and package reconciliation are the first
operational requirement.

## What is still missing or unproven

### Commercial

- no external reply or packet send is recorded;
- no complete lead/project-to-qualified-requirement promotion;
- buyer/procurement/contract route is not a first-class completed workflow;
- supplier/prequalification is not tracked;
- no landed-cost, price-floor, payment-term, or contribution-margin model;
- no proposal/order/PO truth;
- no systematic next-action/due-date closure across active objects.

### Delivery

- no contract/job-order module;
- no crew reservation/conflict prevention;
- no mobilization, posting/A1/site-readiness workflow;
- no timesheets/client approval;
- no invoice/payment/receivables and realized-margin truth;
- existing placement states can be set without real-world evidence.

### Product/platform

- several foundations are proven only by compile/auth checks, not sustained use;
- automated tests and production observability are still shallow;
- backup/restore and incident-response evidence is not documented;
- the active Hanna identity lacks a repository role playbook;
- production deployment state should be checked before assuming the latest
  branch commit is on the public alias.

## Current priority

1. human-confirm supply and choose one truthful package;
2. work and triage the current high-priority demand;
3. record five real human sends and follow-ups;
4. send and record one appropriate capability/crew packet;
5. start real buyer/procurement/supplier conversations;
6. build only a verified blocker exposed by those actions.

The generic hybrid work OS, Collaboration Field, agent analytics/catalog,
additional agents, autonomous outbound, broad Hunter expansion, marketplace,
and speculative enterprise features are deferred.

## If another agent picks this up

1. Read `AGENTS.md`.
2. Follow the mandatory order in `SOFTWARE_AGENT_INSTRUCTIONS.md`.
3. Read `ROADMAP.md` and the active gate in `ROADMAP_EXECUTION.md`.
4. For Job Intake, read `JOB_INTAKE.md`.
5. For runtime agents, read `agents/WORKFORCE.md`,
   `agents/shared-constitution.md`, and the affected role file.
6. Inspect branch, status, routes, migrations, and live state before building.

Do not re-plan already implemented features from stale session logs below.
The dated logs remain useful history, but this audited section is current.

---

## Session Log — 2026-06-02 (Claude)

### Verified working (manual, against live app on localhost:3000)

- **Status filter pills on Hunter / Signal Inbox** (`src/app/(app)/hunter/page.tsx`): PASS. Pills (All/New/Reviewing/Qualified/Pursuing/Won/Lost/Archived) read `searchParams.status`, link to filtered views, active pill highlighted. Confirmed via user screenshots.
- **Submission packet generator** in Worker Matching panel (`src/components/modules/worker-match-panel.tsx`): PASS. Markdown packet + PDF download both work; PDF includes worker certificate data. Gated to Submitted/Placed tabs with ≥1 worker.

### Bugs fixed this session (Phase 0)

1. **`accept_research_suggestion` crashed on undefined UUID.** The chat agent sometimes emits the literal string `"undefined"` (or a placeholder) as `suggestion_id` — e.g. when accepting in the same turn it proposed — producing Postgres `invalid input syntax for type uuid: "undefined"`. Fixed in:
   - `src/app/api/research/chat/route.ts`: added `UUID_RE` + `isUuid()` helper; the accept-tool handler now validates `suggestion_id` is a real UUID and returns an actionable error telling the model to look up the real `ID:` from the "Pending review" list, instead of crashing.
   - `src/lib/data/research.ts`: `acceptResearchSuggestion()` now throws "Invalid suggestion id" before hitting the DB if the id isn't a UUID.
2. **Empty-roles "Find workers" silent failure.** The matcher (`src/lib/data/worker-matching.ts`) scores workers against `package.roles`; a package with `roles: []` (e.g. auto-created "Discovered Package") makes every worker score 0, so the result was an empty list that looked broken. Fixed in `worker-match-panel.tsx`:
   - If `pkg.roles.length === 0`, clicking "Find workers" now shows an amber notice ("This package has no roles defined…") instead of running a doomed match.
   - After a real match returning `count === 0`, shows a notice naming the roles searched and suggesting roster checks.

### Known remaining bug — FIXED since this log

- **Nested `<button>` hydration error** in `worker-match-panel.tsx`. Fixed: the
  header is now a `<div>` with the title button, "Find workers", and the
  chevron as siblings. Re-checked signed-in on 2 September 2026 —
  `/hunter/[id]` loads with zero console errors.

### Approved roadmap (do these in order)

- **Phase 1 — Project memory. ✅ DONE (2026-06-03).** Implemented:
  - Migration `supabase/migrations/011_project_notes.sql` — `project_notes` table (one row per project, unique `project_id`; org-scoped RLS for active members). Applied to live Supabase (`mpyxxqcwmrrrwsvjcsvx`).
  - Data layer `src/lib/data/project-notes.ts` — `getProjectNote()` + `upsertProjectNote()` (20k char cap).
  - API `src/app/api/projects/[id]/notes/route.ts` — GET + PUT, `requireApiAccess`-gated, demo-safe.
  - UI `src/components/modules/project-notes-panel.tsx` — editable textarea + Save (dirty-tracking), rendered as a "Project Memory" collapsible above "Project Facts" in `src/app/(app)/hunter/[id]/page.tsx`.
  - Agent wiring: `ProjectMemorySnapshot.note` added; `buildProjectMemory` reads `project_notes`; `buildSystemPrompt` injects a "## Project memory" section so the agent reads it every run.
  - Verified: migration applied OK; all files compile clean; notes route returns 401 unauth (gate works). Full UI smoke test (type/save/reload/agent-reads) still needs a logged-in browser pass.
- **Phase 2 — Required documents. ✅ DONE (2026-06-03).** Implemented:
  - `cv` + `reference` added to `CERT_TYPES` in `src/lib/data/worker-documents-types.ts`.
  - Migration `supabase/migrations/012_package_required_documents.sql` — adds `required_documents text[] default '{}'` to `project_packages`. Applied live.
  - New pure helper `src/lib/required-documents.ts` (no server imports): `CERT_TYPE_LABEL`/`certLabel`, `defaultRequiredDocuments({countryCode, roles})` (EU/EEA → a1+work_permit+id; GB/UK → cscs; work-at-height roles → ipaf+pasma; id_passport always), `resolveRequiredDocuments` (explicit if set, else template), and `computeDocumentReadiness()`.
  - `src/lib/data/submission-packet.ts`: both `buildSubmissionPacket` (markdown) and `buildPdfPacketData` resolve required docs and compute per-document readiness across the submitted crew (a worker "satisfies" a doc if it's uploaded in `documents` and not expired). Markdown gains a "## Document readiness" section; `PdfPacketData` gains `requiredDocuments`/`requiredDocsSource`/`documentReadiness`. Local cert-label map replaced with shared `certLabel`.
  - `src/lib/pdf/submission-packet-pdf.tsx`: new "DOCUMENT READINESS" section after the crew with colour-coded chips (complete/partial/missing).
  - Verified: migration applied OK; markdown + PDF routes compile and return 401 unauth. Full readiness output needs a logged-in browser pass on a package with submitted workers.
  - NOTE: no UI yet to *set* `required_documents` per package — readiness falls back to the country/role template. Setting them is covered by Phase 3's `set_required_documents` agent tool (or add a small editor later).
- **Phase 3 — Agent tools.** Give the Project Agent real, approval-gated tools wired to existing endpoints: `update_project_notes`, `set_required_documents`, `generate_submission_packet`, `draft_outreach`. Side-effectful actions must be approval-gated.

## Job Intake module — **see [JOB_INTAKE.md](JOB_INTAKE.md) for the full picture**

`JOB_INTAKE.md` is the authoritative, self-contained doc for this module: flow, data
model, files, scoring, hard rules, gotchas, setup, and live state. Read it first if you
are picking up Job Intake work. The notes below are the build log.

### Later additions (2026-08-25)

- **House rules** — `job_intake_rules` table (migration 016) + Settings → "What the agent
  looks for". Plain-English rules written by the user, injected into the classification
  prompt via `withHouseRules()` in `extract.ts`, placed after the built-in guidance so they
  override the score bands but cannot unlock inventing facts. Verified: *"Rail and rolling
  stock work always scores at least 75"* moved a 4-month single rail role 20 → 75.
- **Backfill** — `sinceDays` on `POST /api/job-intake/sync` ignores the watermark; "Read
  older mail…" dropdown offers 30 / 90 / 180 days. Needed because a normal sync only
  covers new mail, and 33 recruiter threads existed beyond the first 14-day window.
- **Sorting** — `LeadSort` = score | newest | oldest on `listJobLeads`. Date ordering is
  done in JS on the *email's* `sent_at`, not the lead's `created_at`, because after a
  backfill every lead shares an import time. CSV export honours the current filter + sort.
- **Fetch bug fixes** — see the Gotchas section of JOB_INTAKE.md. The important one: never
  call `download()` inside a `fetch()` iterator.

### Original build notes — 2026-06-03

New front door: agency/recruiter email → classified → structured scored leads. Lives beside Hunter, does not depend on it.

- **Migration** `supabase/migrations/013_job_intake.sql` (applied live): `mail_accounts`, `inbound_emails`, `job_leads`. Org-scoped RLS for active members, same policy shape as `project_packages`.
- **`src/lib/job-intake/clean-email.ts`** — pure HTML→text + signature stripping. Exists because live agency mail measured **53,259 chars for a ~600-char job spec**; cleaning must happen before the LLM or token cost explodes ~80×.
- **`src/lib/job-intake/extract.ts`** — `classifyAndExtract()`. Classifies (job_opportunity / job_board / newsletter / finance / application_receipt / personal / other) and, only for real opportunities, extracts the lead. Scores **team potential** (can Triangle supply a crew?) not job fit — that reordering is the point. `shouldKeepBody()` enforces the privacy rule: non-opportunity bodies are discarded, only the verdict is kept.
- **`src/lib/data/job-intake.ts`** — `listJobLeads`, `getIntakeCounts`, `recordInboundEmail` (idempotent on `provider_message_id`), `createJobLead` (auto-links duplicates: same agency + normalised role within 14 days), `updateLeadStatus`.
- **`src/app/(app)/job-intake/page.tsx`** — stat tiles, status filter pills, lead cards showing missing commercial fields as "Ask for:". Empty state explains the app-password setup.
- **`src/app/api/job-intake/export/route.ts`** — CSV export (UTF-8 BOM for Excel, formula-injection guard).
- **Sidebar**: "Job Intake" added at the top of Core Workflow.
- **Seeded with real data** from a read-only Gmail extraction run (2026-08-22): 6 active leads, 1 duplicate, 2 crew opportunities (Talos USA 90, PCS7 Germany 85), 11 emails, 4 noise. Bodies were deliberately not stored.

**Verified:** migration applied; `tsc --noEmit` clean project-wide; `/job-intake` 307→login and `/api/job-intake/export` 401 (both compile, auth gates work). **Not verified:** the rendered page — it sits behind login and no session was available. First login should confirm it.

### Ingestion — added 2026-06-03 (same day)

- **`src/lib/job-intake/mail-source.ts`** — `MailSource` interface + `ImapMailSource`. Uses **imapflow only**; `mailparser` was installed then removed because both its versions pull high-severity transitive advisories, and imapflow already gives parsed envelopes and decodes MIME parts (our own `htmlToText` covers the rest). Net new advisories from this work: **zero**. `pickBodyPart()` walks the body structure preferring text/html, skipping attachments.
- **`src/lib/job-intake/ingest.ts`** — `ingestAccount` / `ingestAllAccounts`. Idempotent (keyed on `provider_message_id`), sequential per account to keep IMAP + OpenAI spend predictable, 30-day first run then incremental with a 10-min overlap. Never throws — failures land in the summary and on `mail_accounts.last_error`.
- **`src/app/api/job-intake/sync/route.ts`** — POST, `runtime = "nodejs"`. Accepts either a signed-in member or `Authorization: Bearer $CRON_SECRET` (with `CRON_ORGANIZATION_ID`). Read-only against the mailbox.
- **`src/app/api/job-intake/accounts/route.ts`** — GET/POST. **Rejects anything that isn't an UPPER_SNAKE_CASE env-var name**, so a pasted password is refused, and verifies the var resolves before saving. Admin/partner only.
- **`src/components/modules/job-intake-sync-button.tsx`** — "Sync now" on the page; surfaces the first real error rather than hiding it behind totals.
- **`vercel.json`** — cron every 15 min, 08:00–19:00, Mon–Fri.

### Encrypted credentials + self-service — added 2026-06-03 (supersedes the env-var approach)

The env-var-per-user design didn't scale past two people and, worse, forced one person's password through whoever managed the deployment environment. Replaced with encrypted-at-rest self-service.

- **Migration** `supabase/migrations/014_mail_account_credentials.sql` (applied live): adds `credential_encrypted`, `imap_host`, `imap_port`, `credential_set_at`, `credential_set_by`. `credential_ref` kept so legacy env-var accounts keep working.
- **`src/lib/job-intake/credentials.ts`** — AES-256-GCM via Node's built-in `crypto`, no new dependency. Format `v1:<iv>:<tag>:<ciphertext>`, key only in `ENCRYPTION_KEY`, never in the DB. `resolveMailboxPassword()` prefers the encrypted column, falls back to the env var. Also exports `safeEqual()` (constant-time), now used for the cron token.
- **`ImapMailSource`** now takes an already-resolved `password` plus optional `host`/`port` — it never touches storage. `defaultImapHost()` covers Gmail, Outlook, and `mail.<domain>` for company servers.
- **`src/app/api/job-intake/accounts/route.ts`** — GET/POST/DELETE. POST **signs in to the mailbox once to prove the credentials work before storing them**, then encrypts. Admin/partner only. Gmail app passwords are accepted with or without spaces. The password is never returned by any endpoint; clients see only `connected: true/false`.
- **`src/components/modules/mailbox-settings-panel.tsx`** — self-service form, wired into `/settings`. Adapts its wording for Gmail (app password) vs company mailbox (normal password), warns when `ENCRYPTION_KEY` is missing, and flags accounts still on the legacy env var.

**Verified:** AES-256-GCM round-trips; ciphertext contains no plaintext; tampering rejected; wrong key rejected. `tsc --noEmit` clean. All three account routes → 401 unauth; `/settings` → 307 to login.

**Setup:** `ENCRYPTION_KEY` must be in `.env.local` — 32 random bytes base64 (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). Without it the Settings panel shows a warning and refuses to store passwords.

**Why passwords and not OAuth (settled 2026-06-03):** DNS shows `triangle-services.com` MX → its own server, SPF `ip4:185.199.38.8`/`195.189.82.66` — **not Google Workspace**. So no Internal OAuth app is possible, and the company mailboxes aren't Gmail at all (plain IMAP). For the personal Gmail accounts, `gmail.readonly` is a *restricted* scope: a production external app needs an annual third-party security assessment, and testing mode expires refresh tokens every 7 days. Encrypted IMAP passwords are the only workable option for this setup.

**Verified:** `tsc --noEmit` clean project-wide; `/api/job-intake/{accounts,sync}` → 401, `/export` → 405 on POST (all compile, gates correct, imapflow module graph loads). **Not verified:** an actual IMAP fetch — needs a real app password.

### Reply drafting — added 2026-06-03

- **Migration** `supabase/migrations/015_lead_reply_drafts.sql` (applied live): `lead_reply_drafts` (subject, body, `asks[]`, language, status draft/sent/archived). Deliberately separate from `outreach_drafts`, which requires a `project_id` and is cold outbound — a lead reply goes into an existing thread and has no project behind it.
- **`src/lib/job-intake/draft-reply.ts`** — `draftLeadReply()`. Prompt repositions Triangle from "one freelance engineer" to "supplier of crews", asks only the fields `missing_fields` flagged, and always includes the key question: would the client take a supplier team instead of individual freelancers. Guards against invention (no made-up headcounts, rates, names, or "CV attached"). `COMPANY_PROFILE` constant holds Triangle's positioning in one editable place. Language hint from country (DE/AT→German, FR→French, else English).
- **`src/app/api/job-intake/leads/[id]/reply/route.ts`** — GET/POST/PATCH. Drafting moves a `new` lead to `reviewing`; marking sent moves it to `replied`.
- **`src/components/modules/lead-reply-panel.tsx`** — draft / show / edit / copy / "I sent this" / rewrite, inline on each lead card.

**NOTHING IN THIS CODEBASE SENDS EMAIL.** "I sent this" only records that the user sent it from their own client. The panel says so explicitly.

**Verified with a real API call** against the live Ireland lead — output referenced the specific role, repositioned Triangle as a team supplier, asked exactly the three missing fields as bullets, included the supplier-team question, acknowledged the CV request without claiming attachment, invented nothing, 134 words, 716 tokens (~$0.0003/draft). `tsc --noEmit` clean; all three reply routes → 401 unauth.

**Not built yet:** promoting a qualified lead into a `discovered_project` + `project_package` (the `discovered_project_id` column exists and is unused), and worker-matching against a lead.

### Notes for the next agent

- Live codebase is `C:\Users\nikol\Projects\triangle-services-os` on **port 3000** (PID was 36396). The OneDrive copy (`C:\Users\nikol\OneDrive\Documents\New project\triangle-services-os`) is a *different* project — do not edit it for this work.
- Next.js blocks a second `next dev`; reuse the running server, it hot-reloads.
