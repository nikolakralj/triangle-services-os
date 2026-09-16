# Deploy and release

Updated 15 September 2026. Steps marked **CEO** need a person with the accounts
or the secrets. An AI assistant never does them and never sees the values.

Production: https://triangle-services-os.vercel.app · branch `main` (the
one long-lived branch; Vercel → Settings → Git → Production Branch must say
`main`) · one Supabase database shared by local development, previews and
production.

## How a change reaches production

A push builds a Vercel **preview**. Production changes only when a preview is
promoted (since early September).

1. Run the checks the change needs: `npm run lint`, `npm run check:tenant-identity`,
   `npm run build`, and a signed-in check of what changed.
2. Commit explicit paths — never `git add -A`, other agents keep uncommitted work
   in this checkout — and push.
3. Find the preview built from the commit:
   ```bash
   npx vercel ls -m githubCommitSha=<commit sha>
   ```
4. Check the preview signed in. It reads and writes the live database.
5. Promote it. This changes what everyone sees, so the CEO says yes first:
   ```bash
   npx vercel promote <preview url> --yes
   ```
6. Confirm that https://triangle-services-os.vercel.app/api/version reports the
   commit, then run the checks under *After a release*.

`npm run ship` was written when a push was a release. It waits for production to
report the pushed commit, which does not happen until a promote, so it is not
the release path.

## One-time setup — CEO

```bash
npx vercel login
npx vercel link
```

## Environment variables — CEO

Set them in the **Vercel dashboard** (Project → Settings → Environment
Variables), not on Triangle's own Settings page, for both Production and Preview.
A change takes effect only after a redeploy. `node scripts/push-env-to-vercel.mjs`
copies them from `.env.local` without printing them. Never paste a value into a
chat with any AI.

| Variable | What it does |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Database. Without them production answers 503 rather than falling back to demo data. |
| `DEFAULT_ORGANIZATION_ID` | Triangle's organization. |
| `ENCRYPTION_KEY` | Decrypts connected mailbox passwords. Copy the same value everywhere; a new value means every mailbox must reconnect. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Default AI. Optional overrides: `OPENAI_RESEARCH_MODEL`, `OPENAI_OUTREACH_MODEL`, `OPENAI_SCOUT_MODEL`, `OPENAI_SUMMARY_MODEL`. |
| `XAI_API_KEY`, `XAI_MISSION_MODEL` | When the key is set, mission steps run inside Triangle use Grok (default `grok-4.6`) instead of OpenAI. Employees on their own bots do not use it. |
| `CRON_SECRET`, `CRON_ORGANIZATION_ID` | The scheduled jobs in `vercel.json`: mailbox sync at 06:00 UTC and the employee runner at 07:00 UTC. Optional tuning: `AGENT_CRON_BATCH` (default 3), `AGENT_STALL_HOURS` (default 6). |
| `BOT_WAKE_URL_<ROLE>`, `BOT_WAKE_KEY_<ROLE>` | An employee's wake-up routine: its webhook URL and key. `<ROLE>` is the employee's role key in capitals — `PROJECT_RESEARCHER` for Scout, `HR` for Hanna, `INBOX_COORDINATOR` for Bob. Live Bob: `BOT_WAKE_URL_INBOX_COORDINATOR` / `BOT_WAKE_KEY_INBOX_COORDINATOR`. |
| `MCP_API_KEY`, `MCP_ORGANIZATION_ID`, `MCP_USER_ID` | Legacy static key for the MCP route. It borrows a user id, so it must never count as a person. |
| `IMPORT_API_SECRET`, `EMAIL_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `SCOUT_SEARCH_COUNTRY`, `SCOUT_SEARCH_TIMEZONE` | Legacy or optional. |

Never set `ENABLE_DEMO_MODE` in production: it turns a missing database
configuration into a signed-in demo session.

## Database migrations — CEO approves each one

Migrations live in `supabase/migrations/` and run through
`048_drafts_keep_what_triangle_wrote.sql`. Because every environment shares one database,
a migration is applied only after the CEO approves that migration. After any
column or enum change run `NOTIFY pgrst, 'reload schema';`. Never run seed files
against the live organization.

## Badges — the CEO mints them

An employee's bot calls Triangle with a badge (`tri_mc_…`). Mint it in your own
terminal, not through an AI and not with a button whose output an AI can read:

```bash
node scripts/create-machine-credential.mjs <name> <scope>[,scope...] [display name] [job title] [emoji]
```

The token is shown once; paste it only into the bot's own configuration. Minting
under a name that already had a badge re-badges the same employee and keeps its
history.

| Scope | Allows |
| --- | --- |
| `mission.work` | Reading and working mission steps, asking colleagues, reporting back |
| `research.read`, `research.suggestion.create` | Reading research context and filing findings |
| `worker.propose` | The CV queue and candidate / availability proposals on a mission |
| `job_intake.ingest` | Sending mailbox messages into Job Intake |

Revoking takes effect immediately, with no redeploy:

```bash
node scripts/create-machine-credential.mjs --revoke <name>
```

A sign-in link for a person is a credential too. Run it yourself and send it over
a channel you trust:

```bash
node scripts/login-link.mjs <email> magiclink
```

Login email setup is in [SMTP_SETUP](SMTP_SETUP.md).

## Putting an employee on its own bot

Scout, Hanna and Bob run on their Grok bots. Bob's code path is bot-owned
(DEV-004); live badges still need the data-fix SQL and these wake env vars.

1. On the bot platform, create the bot's webhook routine and copy its URL and key.
2. **CEO:** add `BOT_WAKE_URL_<ROLE>` and `BOT_WAKE_KEY_<ROLE>` in Vercel for
   Production and Preview, then redeploy. For live Bob (`inbox_coordinator`)
   that is `BOT_WAKE_URL_INBOX_COORDINATOR` and `BOT_WAKE_KEY_INBOX_COORDINATOR`.
   Do not invent a URL — only set what the Grok routine actually issued.
3. **CEO:** mint the badge with `mission.work` plus the role's own scopes, and put
   it in the bot. Give the bot its role file from `agents/`; Triangle sends the
   [mission protocol](../../agents/missions.md), house rules and messaging policy
   with every job. Existing Bob badges: run
   `supabase/data-fixes/2026-09-16-bob-mission-work-scope.sql` after previewing
   (local and production share one database).
4. Scout and Bob are always bot-owned in code. Hanna still needs
   `mission_runtime` set to `bot` in `agent_instances.config`.
5. Assign a mission step (or Ask Bob on Today) and check the step's wake record
   (`constraints.wake`): status `sent`, and the bot starts a run. Bob sends
   nothing.

How mission work flows is in the [workforce model](../../agents/WORKFORCE.md).

## After a release

- `/api/version` reports the promoted commit.
- Sign in; Today shows real data, not demo data.
- Settings shows each connected mailbox as Connected, which proves
  `ENCRYPTION_KEY`.
- The changed screen or route works signed in.
- After a bot change, a new mission step wakes its bot.

## Mail from a bot into Job Intake

A bot can send mailbox messages to `POST /api/job-intake/ingest` with a
`job_intake.ingest` badge; the route runs the same pipeline as the IMAP sync
([Job Intake](../reference/JOB_INTAKE.md)). Before trusting a new mail source,
run it and IMAP over the same window and compare:

```sql
select e.provider_message_id, a.provider, l.role_title, l.team_potential
from inbound_emails e
join mail_accounts a on a.id = e.mail_account_id
left join job_leads l on l.inbound_email_id = e.id
order by e.sent_at desc limit 40;
```

Expect no duplicate `provider_message_id` and the same scores for the same
message.
