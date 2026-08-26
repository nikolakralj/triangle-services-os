# Deploy + connect Grok

Phase 0 (deploy) and Phase 1 (Bob). Steps marked **YOU** need a human —
browser login or a secret — and are never done by an AI assistant.

## Phase 0 — Vercel preview

### 1. Log in — **YOU**
```bash
npx vercel login
```
Browser auth. Only you can do this.

### 2. Link the project — **YOU**
```bash
npx vercel link
```
Create a new project (suggested name `triangle-services-os`) or link an existing one.

### 3. Environment variables — **YOU**

Set these in the Vercel dashboard (Settings → Environment Variables), or with
`npx vercel env add <NAME> preview`. Copy values from your local `.env.local`.
**Never paste these values into a chat with any AI.**

Required:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_MODEL
ENCRYPTION_KEY            <- mailbox passwords are unreadable without the SAME value
DEFAULT_ORGANIZATION_ID
```

For the scheduled sync in `vercel.json`:
```
CRON_SECRET               <- new random value: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
CRON_ORGANIZATION_ID      <- same as DEFAULT_ORGANIZATION_ID
```

Optional / legacy: `MCP_API_KEY`, `MCP_ORGANIZATION_ID`, `MCP_USER_ID`,
`IMPORT_API_SECRET`, `EMAIL_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`.

> **ENCRYPTION_KEY must match local**, or connected mailboxes fail to decrypt
> and everyone has to reconnect. It is the one value that must be copied, not
> regenerated.

> **Cron note:** `*/15 8-19 * * 1-5` needs Vercel **Pro**. On Hobby, crons run
> once daily — either upgrade, or trigger sync from Bob's routine instead
> (which is the plan anyway).

### 4. Deploy a preview (not production)
```bash
npx vercel                # preview URL
```
Promote later with `npx vercel --prod` once verified.

### 5. Acceptance gate — **YOU**
- [ ] `/login` loads; you sign in
- [ ] `/job-intake` shows your real leads
- [ ] `/settings` shows the connected mailbox as **Connected** (proves ENCRYPTION_KEY copied correctly)
- [ ] `/hunter` loads a project
- [ ] Ralph signs in from his own device

## Phase 1 — Connect Bob

### 6. Create Bob's scoped token — **YOU**
```bash
node scripts/create-machine-credential.mjs triangle_bob_nikola job_intake.ingest
```
Prints the token **once**. Paste it into Bob's config. Nowhere else — not into
any chat, not into this repo.

### 7. Bob's instruction

Give Bob the contents of `agents/bob.md`, replacing:
- `{TRIANGLE_URL}` → your Vercel URL
- `{YOUR tri_mc_ TOKEN}` → the token from step 6
- `{YOUR MAILBOX ADDRESS}` → `nikola.kralj86@gmail.com`

### 8. Run manually first — **do not create the routine yet**

Ask Bob to process ~10 messages once. Expected response shape:
```json
{ "received": 10, "stored": 4, "alreadySeen": 0,
  "opportunities": 2, "noiseDiscarded": 6, "skipped": [...], "errors": [] }
```

### 9. A/B against IMAP — the migration proof

Both paths feed the same pipeline, so the same message must produce the same
lead. Run IMAP sync and Bob over the same window, then compare:

```sql
select e.provider_message_id, a.provider, l.role_title, l.team_potential
from inbound_emails e
join mail_accounts a on a.id = e.mail_account_id
left join job_leads l on l.inbound_email_id = e.id
order by e.sent_at desc limit 40;
```
Expect zero duplicate `provider_message_id` and identical scores per message.

### 10. Only then: save as a Grok Skill, then a weekday Routine.

## Phase 2 — Ralph

Ralph gets his own Grok seat, his own token
(`node scripts/create-machine-credential.mjs triangle_bob_ralph job_intake.ingest`),
and his own mailbox address in the instruction. Lead cards will start showing
"via ralph@…" automatically once a second mailbox feeds the pipeline.

## Revoking

```bash
node scripts/create-machine-credential.mjs --revoke triangle_bob_nikola
```
Takes effect immediately; no redeploy.
