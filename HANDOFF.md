# Handoff — 30 Aug 2026

## Sellable-product update — 30 Aug 2026

- Adopted a sellable vertical product strategy: contract-to-crew OS for
  boutique technical staffing, crew-supply, and labor-subcontracting agencies.
- Triangle Services remains tenant zero; customer discovery starts now in
  parallel with first-contract work.
- Added `docs/strategy/SELLABLE_PRODUCT_STRATEGY_2026-08-30.md` and
  `AUTONOMOUS_WORK_QUEUE.md`.
- Implemented the repository side of PZ-001: organization operating profile,
  Settings API/UI, and tenant-aware Job Intake classification/reply drafting.
- Added migration `027_organization_operating_profile.sql`; it is **not applied
  to production** by this work.
- Next queue item after verification is PZ-002, the commercial identity leakage
  audit. Do not start billing, broad integrations, or self-serve onboarding
  without their evidence gates.

## Strategy/current-state update — 29 Aug 2026

The operational diagnosis below remains correct: the system works internally
but has not recorded a real commercial send or packet delivery.

The long-term product direction has now been researched and adopted in:

- `ROADMAP.md` — gate-based 24–36 month contract-to-crew roadmap;
- `ROADMAP_EXECUTION.md` — current commercial-activation cycle;
- `SOFTWARE_AGENT_INSTRUCTIONS.md` — mandatory product/development-agent
  protocol;
- `CURRENT_STATE.md` — refreshed implementation and live-data audit.

Important additions since this handoff:

- migrations now run through `026_agent_replies.sql`;
- assignment conversations, worker memory, CV proposal intake, packet-send
  tracking, and one Approvals queue exist;
- Bob, Scout, and Hanna are active database identities and all three now have
  canonical role files; Hanna's `worker.propose` scope must not be expanded
  without a management decision;
- the generic hybrid work OS and Collaboration Field remain deferred;
- the adopted long-term category is a vertical contract-to-crew OS, not a
  generic agent platform.

Read the newer documents before using any older “next feature” note in this
handoff.

Continuing agent: read this first, then `JOB_INTAKE.md` (self-contained module
doc), then `CURRENT_STATE.md` (whole-repo status).

## Read this before touching anything

**Branch:** `wip-jules-2026-05-03T18-13-13-596Z` — NOT `master`. Master is the
old MVP with sample data. All real work is on this branch and pushed.

**Directory:** `C:\Users\nikol\Projects\triangle-services-os`. A duplicate at
`OneDrive\Documents\New project\` caused three separate incidents (wrong dev
server, wrong Vercel deploy, wrong code) and has been emptied. If you see a
"Local demo mode" banner, or no Job Intake in the sidebar, you are in the wrong
place. Every shell command needs an explicit `cd` — the shell resets between
calls.

**Deployed:** https://triangle-services-os.vercel.app (Vercel project
`triangle-services-os`, Hobby plan). Supabase project `mpyxxqcwmrrrwsvjcsvx`.
Env vars are set in all three Vercel environments.

## STATE AS OF 28 Aug — read this first

**The system works end to end. Nothing has been sent to a customer yet.**

    18 leads found           15 never opened
    3  replies drafted        0 actually sent
    53 suggestions accepted   0 became outreach
    3  worker matches         0 packets sent to a client

That gap — not any missing feature — is why progress feels stalled. The
highest-value action available is a human sending one reply, not more code.

### Live and working

- **Bob** (Inbox Coordinator, Grok) — weekday 08:00 routine posts raw inbox
  mail to `/api/job-intake/ingest`. Airtable retired. Refused a research
  assignment as out-of-role and recorded why: the constitution holds.
- **Scout** (Project Researcher, Grok) — connected to the research MCP with a
  scoped badge. First run filed 5 sourced suggestions on the Salzgitter
  hydrogen plant, including the valuable negative "no electrical sub under
  ANDRITZ", which identifies the EPC as the crew buyer.
- **Workforce model** (migration 023) — employee (`agent_instances`) is
  durable; credential is only a badge; provider binding swappable.
  `agent_assignments` can attach workers as context, so "find work for THESE
  people" carries the people.
- **Findings + Approvals** — `/api/agent/findings` lets an agent report
  something Triangle has never heard of; accepting promotes it to a real
  project. Agents cannot approve their own work (session-only endpoint).
- **Scoped MCP** — read + propose for research badges; accept/reject refused
  to all machines.

### Agreed plan (28 Aug), in order

1. **Human sends one reply** from Job Intake. Nothing blocks this.
2. **Triage the backlog** — 15 untouched leads, 48 unreviewed suggestions.
   The accept/reject decisions are the training signal.
3. **One crew packet to a real buyer** — exercises matching + certificates +
   PDF, all currently untested in anger.

Only then improve the interface, informed by what actually slowed the user
down.

### Explicitly deferred (advisor proposals reviewed and declined for now)

- **Collaboration Field / spatial org canvas** — a map for orgs that have
  lost track of who does what. At 2 humans + 2 agents it is designing for an
  imagined company. Revisit at 5+ agents doing concurrent work.
- **"Generic hybrid work OS"** — a business pivot, not a design decision. The
  staffing vertical earns the money. Keep clean module boundaries so the
  option stays open; pay no refactoring cost for genericism until a second
  real use case exists.
- Employee detail pages, performance/cost analytics, outcome attribution,
  agent catalog + "Hire" flow. All good, all cheaper once real usage exists.

### Small, agreed next builds (~2 days, not 2 weeks)

1. Bulk reject on suggestions (makes triage minutes, not an hour)
2. Task-first assignment — describe the work, Triangle recommends who can do
   it. The one structural fix every advisor agreed on, and Bob proved it.
3. Sidebar hierarchy: Today · Work · Team · Decisions · Agency

### Note for advisors and future agents

Three separate reviews have now audited `master` and concluded this work does
not exist. It does — on `wip-jules-2026-05-03T18-13-13-596Z`, 70+ commits,
migrations 001-023. `master` is the original MVP and has zero migration
files. Set the default branch or merge before asking anyone to review.

## Where we stopped — the one open task

**Bob (a Grok bot) has now reached the ingest endpoint manually. Do not turn on
his routine yet.**

Current database evidence, not from what Bob says:

```
select name, scopes, status, created_at, last_used_at
  from machine_credentials
 where name = 'triangle_bob_nikola';

-- 2026-08-27 verification:
-- old exposed row: revoked, last_used_at 2026-08-27 07:52:45.763+00
-- replacement row: active, last_used_at 2026-08-27 08:02:48.919+00

select count(*) from inbound_emails;                            -- 79
select count(*) from inbound_emails
 where created_at > timestamptz '2026-08-25 10:08:10.689118+00'; -- 3
select count(*) from mail_accounts where provider='external';   -- 0
```

The original duplicate-name rotation failure was fixed by migration
`019_machine_credentials_rotation.sql`: revoked credential rows remain for
audit, but only active rows are unique by `(org_id, name)`. The exposed token is
dead. A fresh active credential exists, but its plaintext cannot be recovered;
if Bob loses it, revoke and create a new one again.

The three new messages did not blow up the total to ~86, so the Message-ID
mapping appears to be sane. They produced three low-priority g2 leads:

- PLC commissioning/programming engineer, Germany, score 35
- Commissioning Engineer, Prum, Germany, score 35
- Commissioning Engineer / Automation / Configuration, Belgium, score 35

The scores look directionally correct for Triangle: all three are single-role
contractor opportunities with no crew/package signal. One extractor blemish:
the PLC lead rationale mentions "6 or 12 months" while `duration_months` is
null and `duration` is still in `missing_fields`; fix that prompt/schema drift
before trusting automation.

Remaining gap: mailbox/source attribution. `resolveExternalAccount()` currently
reuses an existing `mail_accounts` row when Bob posts a mailbox address that is
already connected by IMAP, so `provider='external'` stays at 0 and the UI shows
the lead as arriving via the existing mailbox. That means `external` account
count is not a reliable proof of whether Bob posted when the mailbox overlaps.
Before enabling Bob's routine, add explicit source-path attribution or logging
for external ingests.

**Next step:** keep running Bob manually. For every run, ask him for the exact
URL, HTTP status code, and JSON response. Success should show high
`alreadySeen` on replays, total emails staying near 79, no duplicate spike, and
`machine_credentials.last_used_at` moving forward.

### Verify Bob independently — do not trust his self-reported counts

```
-- did anything actually arrive?
select count(*) from inbound_emails
 where created_at > timestamptz '2026-08-25 10:08:10.689118+00';

-- 79 after Bob's first successful manual ingest. If this jumps unexpectedly,
-- Message-IDs may not match and emails may be duplicating across paths.
select count(*) from inbound_emails;

-- was the token used at all?
select name, scopes, last_used_at from machine_credentials;
```

**Success looks like:** high `alreadySeen`, total emails staying near 79, no
unexpected duplicate spike, and `machine_credentials.last_used_at` moving
forward. High `alreadySeen` is the GOOD outcome — it proves both paths agree on
message identity. Do not rely on `mail_accounts.provider='external'` yet when
Bob posts a mailbox that already exists as an IMAP account.

## Architecture — do not redesign this

Decided over two days with the user and a second AI. Frozen.

```
Grok bots = labor        Triangle = truth         HTTP API = contract
(verified OAuth,         (scoring, house rules,   (scoped tokens,
 scheduling, research)    matching, certs,         idempotency keys)
                          approvals, audit)
```

**Five invariants. Breaking any of these is a regression:**

1. **Triangle is the single source of truth.** Bot memory is context, never
   authoritative fact.
2. **Bots send raw material, never conclusions.** Classification and scoring
   happen server-side in `extract.ts` with the user's house rules. If a bot
   extracts fields itself, scores drift between sources and the rules the user
   wrote in Settings do nothing.
3. **Nothing sends email. Ever.** There is no send function in this codebase.
   "I sent this" only records that a human sent it from their own client.
4. **Idempotency everywhere.** Dedup is on RFC822 Message-ID. Re-posting must
   be harmless.
5. **Scoped credentials only.** Bots get `tri_mc_*` tokens with one scope.
   Never give a bot `MCP_API_KEY` — that authenticates as admin.

## What works, verified against real data

Real run: 42 emails from the user's Gmail, 91 seconds, 17 opportunities.

- Classification correctly rejected "A reminder to review g2 Recruitment" —
  same sender domain, same day, as three genuine opportunities.
- Scoring answers "can Triangle staff a CREW here?", not "is this a good job".
  Talos USA 90 ("lots of projects available"); 2-month Berlin role 35.
- Dedup caught the same Ireland role sent twice under different subjects.
- House rules verified: adding "rail always scores at least 75" moved a
  4-month single rail role from 20 to 75.
- Reply drafting asks for what recruiters never state — headcount was absent
  in 6 of 6 real emails.

15 active leads, 6 duplicates merged, in the live database.

## Known gaps, in priority order

1. **Supabase redirect allowlist** — add `https://triangle-services-os.vercel.app/**`
   and `http://localhost:3000/**` under Auth → URL Configuration. Without the
   `/**` wildcard, Supabase silently strips `/auth/callback` and every magic
   link fails. This cost the user an hour.
2. **No custom SMTP** — Supabase's built-in email allows a few per hour and is
   not for production. Ralph's invite will likely fail silently. Resend free
   tier (3,000/month) fixes it.
3. **Extraction miss** — a test email said "Rotterdam" but `country` came back
   null and `location` was flagged missing. Minor prompt issue.
4. **Rescore button** — house rules only apply to future syncs; existing leads
   keep old scores.
5. **Lead to project/package promotion** — `job_leads.discovered_project_id`
   exists and is unused. Highest-value next feature: it connects Job Intake to
   the worker matching, certificate tracking and submission packet PDF that
   already work.

## Secrets — the user's standing rule

The user pasted a Gmail app password into chat once and was told to revoke it.
Do not handle credentials.

- `.env.local` is gitignored. Never commit it. Never print its values.
- `scripts/create-machine-credential.mjs` prints a token once — the user runs
  it and pastes into the bot, never into a chat.
- `scripts/push-env-to-vercel.mjs` pipes values via stdin so they are never
  displayed.
- A `.mcp.json` containing a live token was committed previously; the token has
  been rotated and the file removed from version control.
- A temporary password was set via the admin API to unblock a lockout, and is
  in the chat log. A change-password panel now exists at Settings → Your
  account. Confirm the user changed it.

## Gotchas that cost real time

- **Never call `client.download()` inside a `client.fetch()` loop** in imapflow.
  IMAP cannot run a command while a FETCH streams. It deadlocks until socket
  timeout. Fetch envelopes fully, then download bodies.
- **imapflow emits socket errors as events.** Without `client.on("error")`, Node
  turns them into an uncaughtException that kills the server.
- **A failed sync must not advance `last_synced_at`** (it would skip unread
  mail) and must not set `status='error'` (that drops the mailbox from all
  future syncs, because `listActiveMailAccounts` filters on active).
- **Never write `.env.local` from PowerShell `>>` or `Out-File`** without
  `-Encoding utf8`. It writes UTF-16, Node reads gibberish, and the variable
  silently becomes undefined. This had broken `EMAIL_WEBHOOK_SECRET` invisibly.
- **`NEXT_PUBLIC_*` vars on Vercel need `--no-sensitive`**, or the CLI stores
  them as Secrets and the browser cannot read them.
- **Vercel bakes env vars at build time.** Setting them does nothing until you
  redeploy.
- **`node --check` validates syntax, not variable scope.** It passed a script
  that threw ReferenceError at runtime.

## Useful commands

```
cd "C:\Users\nikol\Projects\triangle-services-os"

npm run dev                      # localhost:3000
npx tsc --noEmit                 # must be 0 errors
npx vercel --prod                # deploy

node scripts/create-machine-credential.mjs <name> <scope>
node scripts/create-machine-credential.mjs --revoke <name>
node scripts/push-env-to-vercel.mjs all
```

Agent instructions live in `agents/` — `shared-constitution.md`, `bob.md`,
`scout.md`. Grok bot profiles are deployments of those files, not their home.
That is what makes the vendor swappable.
