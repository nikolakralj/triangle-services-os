# Current State

## Purpose

This file is the honest status report for the repo.
It should tell a future agent what is real, what is partial, and what still needs cleanup.

## Product Direction

Current direction:

- the app started as a private internal CRM / agency OS
- it is now evolving toward a project-to-placement operating system
- the Hunter module is the first visible expression of that pivot

## What Is Real Today

- Next.js app shell exists
- Supabase schema, auth, and RLS foundation exist
- companies module is partially wired to real Supabase data
- Hunter feature exists in code
- Hunter can discover projects and write them to the database
- OpenAI is now the active Hunter provider
- contractor-chain final tables and project UI exist
- Option C research-workbench foundation exists:
  - authenticated `/api/mcp` route
  - read-only MCP context tools
  - suggestion-only MCP proposal tools
  - `research_suggestions` review panel on project detail
  - audit table support through `ai_tool_calls`
- conversational research agent is live:
  - `/api/research/chat`
  - project-level memory via `research_conversations` + `research_messages`
  - tool-driven suggestions from chat into `research_suggestions`
- one-shot advanced research run is live:
  - `/api/research/run`
  - `research_runs` + `research_sources` + `research_suggestions` writes
  - run trigger UI on Hunter project detail page

## What Is Still Partial

- many non-Hunter pages still rely partly or heavily on sample data
- the pipeline is visually improved but not fully backed by real opportunity data
- company detail still lacks fully wired related data
- AI and dashboard areas still need stronger grounding in real database state
- multi-agent research orchestrator (specialist-agent fan-out) is not implemented yet
- public-records, web-source, auditor, people, and strategy agents are not implemented yet
- accepted package suggestions do not yet become rich final package records
- buyer mapping exists only as early data structures and suggestions
- crew package recommendation exists as project-detail hypotheses, not a full matching engine
- migrations `004_research_workbench.sql` and `005_research_conversations.sql` must be applied to Supabase before full live testing

## Repo Reality Check

At the time this file was created, the working tree includes substantial uncommitted work beyond the original MVP.

That includes:

- Hunter pages and APIs
- Hunter data layer
- sector and discovered project components
- changes in several core pages and shared modules

This means:

- the repo contains real progress
- but the current working tree is not yet a clean, fully stabilized slice

## Known Important Truths

- finding a project is not enough
- the real buyer is often not the owner or headline brand
- contractor-chain mapping is the next strategic module
- generic CRM polish is not the highest-value work right now

## Current Development Priorities

1. stabilize current Hunter work and make it trustworthy
2. clean and commit the current product pivot in coherent slices
3. apply and verify research-workbench migration in Supabase
4. stabilize research chat + advanced run reliability
5. connect project intelligence to concrete crew packages

## Things To Be Careful About

- do not assume a discovered project is automatically commercially useful
- do not confuse project owner visibility with labor buyer visibility
- do not let the app drift back into generic CRM priorities
- do not overclaim AI confidence where the contractor chain is still inferred

## If Another Agent Picks This Up

Start here:

0. if the work is about email intake / job leads, read `JOB_INTAKE.md` — it is self-contained
1. read `VISION.md`
2. read `PRODUCT_OPERATING_RULES.md`
3. read `WORKFLOW_SIGNAL_TO_PLACEMENT.md`
4. read `ROADMAP_EXECUTION.md`
5. read `DECISIONS.md`
6. read `RESEARCH_WORKBENCH.md`
7. read this file

Then inspect the current git status before making assumptions about what is already committed.

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

### Known remaining bug (flagged, not yet fixed)

- **Nested `<button>` hydration error** in `worker-match-panel.tsx`: the collapsible header `<button>` (~line 444) wraps the "Find workers" `<Button>`. Invalid HTML → React hydration error on `/hunter/[id]`. Pre-existing; spawned as a separate task. Fix: make header a div-with-onClick or move the button out as a sibling.

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
