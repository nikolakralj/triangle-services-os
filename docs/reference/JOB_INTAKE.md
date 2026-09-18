# Job Intake

> Current scope comes from ROADMAP_EXECUTION. Counts below are historical; extraction uses a model and `team_potential` is the numeric opportunity score. Reliability work is not blocked on sending old leads. Model extraction is neither free nor a human qualification decision. The list is off primary navigation (diagnostics at `/job-intake`); mail ingest, scoring, leads, and reply drafts stay.

Reads agency/recruiter email, turns it into scored opportunities, and drafts replies.
Added 2026-08-25. Productization boundary added 2026-08-30. Read the
repository operating rules before changing behavior.

## Historical operating snapshot — 29 August 2026

The module works, but the commercial loop has not been activated:

- 24 leads exist;
- 21 remain `new`;
- 4 score 70+;
- 3 reply drafts exist;
- 0 replies are marked sent.

The immediate requirement is human review, send, follow-up, and outcome
recording. Do not expand ingestion or redesign the interface before the current
high-priority leads are worked. See `ROADMAP_EXECUTION.md`.

## Why it exists

The original Triangle workflow receives recruiter emails aimed at **one
freelance engineer**, while Triangle's business is supplying specialists and
crews. External tenants may offer teams, individuals, or both; their factual
positioning comes from the organization operating profile.

So the module answers a different question from the one the email asks:

> Not "is this a good job for Nikola?" but "can Triangle staff a crew here?"

Those two questions rank the same inbox almost in reverse. A 12-month single
commissioning role in Ireland outranks a 2-month single role in Berlin, and an
email saying *"lots of projects available"* outranks both.

**Observed in real data:** rate was "competitive" or absent in 5 of 6 emails, and
**headcount was never stated once**. That gap is the product — the reply asks for it.

## Flow

```
IMAP mailbox
  → fetch envelopes (14 days, or explicit backfill)
  → cheap sender/subject noise filter        ← no download, no LLM cost
  → download body for survivors only
  → clean HTML → text, strip signatures      ← ~95% size reduction
  → LLM: classify + extract + score
  → store (bodies kept ONLY for opportunities)
  → dedupe (same agency + role within 14 days)
  → observe INBOX + Sent (envelopes only, no LLM): record sent/replied
  → user reads, drafts reply, shares into the common space, or Send from Triangle
```

## Data model

| Table | Purpose |
|---|---|
| `mail_accounts` | One row per connected mailbox. Password is AES-256-GCM encrypted in `credential_encrypted`. `credential_ref` is a legacy env-var name, still honoured. |
| `inbound_emails` | One row per ingested message. Unique on `(org_id, provider_message_id)` — this is what makes ingestion idempotent. `body_text` is **NULL** for anything not classified `job_opportunity`. |
| `job_leads` | The structured opportunity. `team_potential` 0–100, `missing_fields[]` drives the reply, `duplicate_of_id` links repeats. `shared_at` / `shared_by` (migration 051): null = still personal to the mailbox owner; set when a person puts it in the common space. Existing rows are backfilled on first apply. |
| `lead_reply_drafts` | AI-drafted replies. `status` draft/sent/archived — "sent" only records that a human sent it. `ai_subject`/`ai_body` keep the draft as Triangle wrote it; edits change `subject`/`body` only (migration 048). |
| `job_intake_rules` | One editable text block per org, injected into the classification prompt. |
| `organizations` profile columns | Tenant business/offer model, approved positioning, sign-off, currency, and timezone used by commercial AI. |

Migrations: `013_job_intake.sql`, `014_mail_account_credentials.sql`,
`015_lead_reply_drafts.sql`, `016_job_intake_rules.sql`,
`020_job_intake_reply_style.sql`,
`027_organization_operating_profile.sql`, `049_send_from_triangle.sql`,
`050_mailbox_observe.sql`, and `051_mailbox_space.sql`. Migrations through
`020` are known applied to the live Supabase project. 049 is applied
(17 September). 050 and 051 are applied (18 September, `NOTIFY` after
confirm). First-apply of 051 stamped 38/38 existing `job_leads` into the
shared space (0 left personal). Re-applying does not stamp new personal
leads. Code for personal vs shared is PR #29, not on Production.

## Files

```
src/lib/job-intake/
  mail-source.ts    IMAP via imapflow. MailSource interface so Gmail API can slot in later. fetchForObserve reads INBOX + Sent without bodies.
  clean-email.ts    HTML→text + signature stripping. Pure, no server imports.
  extract.ts        Classify + extract + score. Holds the prompt and the score bands.
  contact-email.ts  Recruiter address: never the receiving mailbox or a forwarder.
  draft-reply.ts    Writes the reply using the active organization profile.
  credentials.ts    AES-256-GCM encrypt/decrypt, resolveMailboxPassword, safeEqual.
  ingest.ts         Orchestrates a run. Idempotent, never throws.

src/lib/mail/mailbox-space.ts     Personal vs shared (pure).
src/lib/mail/send-policy.ts       Who may press Send (owner + can_send).
src/lib/data/job-intake.ts        Data layer (leads, visibility, share, counts, drafts, rules).
src/lib/data/organization-profile.ts Tenant operating profile data boundary.
src/app/(app)/job-intake/page.tsx The list, stat tiles, filters, sorting.
src/app/api/job-intake/
  sync/             POST — run ingestion. Session or CRON_SECRET.
  accounts/         GET/POST/DELETE — connect mailboxes.
  rules/            GET/PUT — the org's own scoring rules.
  export/           GET — CSV, honours current filter + sort.
  leads/[id]/reply/ GET/POST/PATCH — draft, edit, mark sent.
  leads/[id]/share/ POST — put a personal lead in the common space (human).
  ../settings/organization-profile/ GET/PUT — tenant identity and positioning.
```

## Two ways in: our IMAP, or someone else's bot

`POST /api/job-intake/ingest` is a source-agnostic front door. An external agent —
a Grok/Claude bot with verified Gmail OAuth, Zapier, an Airtable automation — posts
raw messages and this route runs **the same pipeline the IMAP sync runs**: classify →
score with the org's house rules → dedupe → store.

```
POST /api/job-intake/ingest
Authorization: Bearer $MCP_API_KEY
{
  "mailbox": "ralph.loesekamm@triangle-services.com",
  "messages": [
    { "messageId": "<...>", "from": "...", "fromName": "...",
      "subject": "...", "sentAt": "...", "body": "..." }
  ]
}
→ { received, stored, alreadySeen, opportunities, leadsCreated,
    noiseDiscarded, skipped[], errors[] }
```

**Callers send raw material, never conclusions.** If each bot did its own extraction,
scores would drift between sources and the house rules in Settings would do nothing.
One pipe, one set of rules, one set of numbers, regardless of who fed it.

**Why this exists:** bot platforms have verified Google/Microsoft OAuth, which we
cannot cheaply obtain (see the OAuth section below). Letting them own the connector
while we own the scoring keeps both advantages — and avoids our pipeline data living
in a vendor's silo.

**This is also the multi-user answer.** Bots are per-person assistants; two people
running two separate bots would otherwise have two disconnected views. Both post here
instead, `mailbox` records whose inbox each lead came through (a `mail_accounts` row
with `provider='external'` and no credentials). Each person sees mail from their
own inbox first. Share puts a lead in the common space. The "via <mailbox>" label
only renders once leads arrive from more than one mailbox.

Verified 2026-08-25: a bot-shaped payload with one real opportunity and one newsletter
returned `opportunities: 1, noiseDiscarded: 1`, scored the Austria rail depot lead
**90** ("ramping up resources… across two sites"), attributed it to the posting
mailbox, and flagged `missing_fields: [rate, location]`. Re-posting the same
`messageId` returned `alreadySeen: 1, stored: 0`. Unauthenticated → 401.

## Scoring

`team_potential` bands, in `extract.ts`:

- **85–100** — explicitly plural/ongoing ("a range of projects", "various projects", "ramping up")
- **60–84** — one role but the context scales (big-site commissioning, 12+ months, "possible extension")
- **35–59** — a normal single contractor request
- **0–34** — short single placement, under ~3 months

**House rules override these.** `job_intake_rules.body` is written by the user in
Settings → "What the agent looks for", and injected *after* the built-in guidance
via `withHouseRules()`. Verified working: adding *"Rail and rolling stock work
always scores at least 75"* moved a 4-month single rail role from **20 → 75**.

The organization's approved profile is injected before the scoring rules, so
relevance is evaluated against that tenant's real offer rather than a Triangle
constant. House rules can change priorities and scores. They **cannot** authorise inventing
facts — the anti-invention instruction is restated after them so it has the last word.

## Organization operating profile

Added 2026-08-30 as the first sellability boundary. Settings → Organization
stores:

- organization name;
- business model;
- whether it supplies teams, individuals, or both;
- factual company positioning;
- exact reply sign-off;
- default currency and timezone.

Both IMAP and external/bot ingestion load this profile once per run and pass it
to classification. Reply drafting requires a non-empty organization name,
company profile, and sign-off; otherwise the route returns `409` and directs an
admin/partner to Settings. This prevents a new tenant from speaking as Triangle
or Nikola because of a code constant.

Migration `027` seeds the existing Triangle row so current drafting behavior is
preserved after it is applied. New organizations start with an empty profile
and must configure it. This setting still cannot authorize auto-send, invented
claims, prices, commitments, or worker disclosure.

## Reply style memory

Added 2026-08-27. Settings → Reply style stores a plain-English memory block in
`job_intake_rules.reply_style`. It is injected only into `draftLeadReply()` so it
changes tone, structure and recurring asks in drafted replies, not classification
or scoring.

The Job Intake cards also have a collapsed **Original email** panel for stored
opportunity bodies. This keeps the list calm while letting Nikola/Ralph work a
lead from the dashboard without returning to Gmail or Grok.

This still does **not** send email. The current workflow remains: draft → edit →
copy/send manually → mark "I sent this". Since 15 September that press writes the
send to `commercial_actions` like every other send: the text as kept, Triangle's
version beside it, the recruiter, the time and a follow-up date four days out.
The follow-up appears on Today until something newer is recorded for that lead.

## Hard rules — do not weaken these

1. **Nothing in this codebase sends email.** There is no send function. "I sent this"
   records that the user sent it from their own client.
2. **Classify before storing.** Non-opportunity mail keeps its verdict only; the body
   is discarded. Enforced in `ingest.ts` via `shouldKeepBody()`.
3. **Never invent.** No made-up headcounts, rates, names, availability, or "CV attached".
4. **Secrets never reach an agent.** Passwords are entered by the mailbox owner in the
   Settings form, encrypted server-side, never returned by any endpoint.

## Gotchas (learned the hard way)

- **Never call `client.download()` inside a `client.fetch()` loop.** IMAP cannot run a
  command while a FETCH is streaming. It deadlocks until the socket times out. Fetch
  envelopes to completion first, then download bodies. This cost an afternoon.
- **imapflow emits socket errors as events.** Without `client.on("error", ...)` Node
  turns them into an `uncaughtException` that can kill the server.
- **Set explicit timeouts.** imapflow defaults are 90s connect / 5min socket. Currently
  15s / 10s / 180s.
- **imapflow hides the useful error.** `err.message` is `"Command failed"`; the real
  reason is on `err.responseText` / `err.authenticationFailed` / `err.serverResponseCode`.
- **A forwarded requisition is not from the mailbox that received it.** Envelope
  From on a forward is someone already inside the company. `contactEmail` is the
  original recruiter from From:/Von:/mailto headers; `@triangle-services.com` and
  the receiving mailbox are never stored as the person to reply to.
- **Never write `.env.local` from PowerShell `>>` or `Out-File`** without
  `-Encoding utf8`. It writes UTF-16, Node reads gibberish, and the variable silently
  becomes undefined. This had broken `EMAIL_WEBHOOK_SECRET` (repaired 2026-08-25).
- **There are two copies of this repo.** `C:\Users\nikol\Projects\triangle-services-os`
  is live. `C:\Users\nikol\OneDrive\Documents\New project\triangle-services-os` is an
  old copy with no `.env.local`. If you see "Local demo mode", you are running
  the wrong one. Job Intake is intentionally absent from the sidebar; open
  `/job-intake` directly for the diagnostics list.

## Setup

1. `ENCRYPTION_KEY` in `.env.local` — 32 random bytes, base64:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
2. Settings → Job Intake mailboxes → Connect a mailbox. Gmail needs a Google **app
   password** (Account → Security → 2-Step Verification → App passwords), not the
   normal password. Company domains use the ordinary mailbox password.
3. Job Intake → **Sync now** (reads *your* mailbox), or "Read older mail…" for a backfill.
   The scheduled job still reads every connected inbox.
4. Scheduled: `vercel.json` currently schedules sync daily at 06:00 UTC. Needs
   `CRON_SECRET` and `CRON_ORGANIZATION_ID`.

## Why IMAP and not "Sign in with Google"

Settled 2026-08-25 with a DNS check:

```
triangle-services.com  MX → its own server
SPF → ip4:185.199.38.8, ip4:195.189.82.66   (no Google)
```

The company domain is **not** Google Workspace, so an "Internal" OAuth app — the one
route that skips Google's verification — is unavailable. And the company mailboxes
aren't Gmail at all; they speak plain IMAP.

For the personal Gmail accounts, `gmail.readonly` is a **restricted** scope: a
production external app needs an annual third-party security assessment (CASA), and
"Testing" mode expires refresh tokens every 7 days. Neither works for an always-on
agent. Encrypted IMAP passwords are the only workable option for this setup.

If the company ever moves to Google Workspace, an Internal app becomes free and easy.
`MailSource` is an interface precisely so that becomes a second implementation, not a
rewrite.

## Live state (2026-08-25)

First real run: 42 emails from `nikola.kralj86@gmail.com`, 91 seconds.

| Verdict | Count |
|---|---|
| job_opportunity | 17 |
| other | 17 |
| finance | 8 |
| personal | 5 |
| newsletter | 4 |
| job_board | 1 |
| application_receipt | 1 |

11 active leads, 1 duplicate correctly merged, 3 scoring 70+. Best: Talos Automation
USA (90), g2 "Offline Programming — Conveyer lines" (85), g2 PCS7 Germany (85).

Notable correct call: *"A reminder to review g2 Recruitment"* arrived the same day as
three real opportunities from the same domain and was classified `other`.

## Not built yet

- **Rescore button** — house rules only apply to future syncs; existing leads keep old scores.
- **Promote a qualified lead** into the common contract-qualified requirement
  workflow, then connect the appropriate project/package and worker readiness.
  `job_leads.discovered_project_id` exists and is unused. This is a Phase 1
  product item after current high-priority leads are worked and real
  qualification conversations reveal the required fields.
- **Parallel classification** — currently sequential, ~2s per email.
- **A second person's mailbox** — they connect it themselves; nobody sees their password.
  New mail stays on their Today until they share it. Sending from Triangle is optional
  and off until they tick it on their mailbox.
