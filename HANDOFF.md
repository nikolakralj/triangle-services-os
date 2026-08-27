# Handoff — 27 Aug 2026

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

## Where we stopped — the one open task

**Bob (a Grok bot) has never successfully called the ingest endpoint.**

Evidence from the database, not from what Bob says:

```
select max(last_used_at) from machine_credentials;              -- NULL
select count(*) from inbound_emails;                            -- 76, unchanged
select count(*) from mail_accounts where provider='external';   -- 0
```

`last_used_at` is stamped on ANY authenticated request, including rejected
ones. NULL means no request ever arrived.

Bob claimed twice he was "posting now". He also caught, on his own, that he was
about to send Gmail internal hex ids instead of RFC822 Message-IDs — which
would have duplicated every email, one copy per path, with both sides
reporting success. He said he was remapping. Then nothing arrived.

**Next step: find out why.** Ask him for the exact URL and HTTP status code he
received. If he cannot answer concretely, he never made the request. Likely
causes in order: token truncated on copy (it wrapped across two lines in the
UI), wrong URL, or he silently fell back to Airtable.

### Verify Bob independently — do not trust his self-reported counts

```
-- did anything actually arrive?
select count(*) from inbound_emails
 where created_at > timestamptz '2026-08-25 10:08:10.689118+00';

-- 76 before. If this jumps to ~86, Message-IDs did NOT match and every
-- email is now duplicated across the IMAP and bot paths.
select count(*) from inbound_emails;

-- was the token used at all?
select name, scopes, last_used_at from machine_credentials;
```

**Success looks like:** high `alreadySeen`, total emails staying near 76, and a
new `mail_accounts` row with `provider='external'`. High `alreadySeen` is the
GOOD outcome — it proves both paths agree on message identity.

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
