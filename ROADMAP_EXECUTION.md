# Roadmap execution — what happens next

Updated 16 September 2026. The one place for next steps, for people and for
coding agents. What exists is in [CURRENT_STATE](CURRENT_STATE.md), why it was
decided is in [DECISIONS](DECISIONS.md), and the long-term phases are in
[ROADMAP](ROADMAP.md). The earlier, longer version of this file, the old work
queue and the evidence log up to 4 September are in
[the archive](docs/archive/2026-09-15/ROADMAP_EXECUTION.md).

**Management focus (4 September):** product and app development. External
target research, customer interviews and pilot preparation stay paused unless
management asks for them. A general "continue" authorizes only the development
work below.

**Test for every piece of work (8 September):** can an AI employee take over
this human job and its follow-through? If not, name the exact capability,
evidence or authority that is missing. Approval boundaries do not change.

## How work is picked

1. Take the first `READY` item under *Development — now*.
2. Mark it `IN_PROGRESS` here before editing. One item in progress at a time.
3. Build the smallest coherent slice and verify it: type check, lint, build, the
   checks the change needs, and a signed-in check wherever it shows on screen.
4. When it is done, mark it `DONE` here and record it in CURRENT_STATE.
5. Stop at a human or external gate and say exactly what is needed.
6. Never mark commercial evidence complete from sample data, generated
   documents or statuses. Do not rebuild a feature that already exists.

`READY` may start now · `IN_PROGRESS` being built · `BLOCKED_EXTERNAL` needs a
person, real data, a secret, a decision or a production action · `GATED` waits
for named evidence · `DONE` built and verified.

Change this file when an item is done, when real use exposes a blocker, when
management changes the order, or when the gate is met or fails.

## Development — now

These unblock the Phase 0 exit gate below; none of them counts toward it.

**Operating shell (16 September; locked when Nikola merges its pull request):**
build in this order — **DEV-016** refusal ledger off Today → **DEV-017** Today
as one inbox → **DEV-012** Team in Settings → **DEV-011** menu Today · Missions
· Talent → **DEV-010** context-aware Ask → mailbox observed (Next) →
**DEV-013** Send from Triangle. **DEV-018** is Nikola's, in parallel. DEV-009
and DEV-015 are `DONE`. Do not invent Work Items. Do not implement the Send
button unless you are on DEV-013. Decision: "The operating shell" in
`DECISIONS.md`. Design: `docs/design/PRODUCT_SHELL_2026-09-16.html`.

### DEV-001 — Sent-message record · `DONE`

**Why now:** the gate needs five human sends recorded with final content and a
follow-up date, and nothing surfaces follow-ups.

**Acceptance:** from any Triangle draft a person records a send — final text,
recipient, channel, time — in one action; a follow-up date is always set, by
default so recording stays one action; due and overdue follow-ups appear on
Today; the AI draft and the final sent text are both kept; the reply and outcome
can be added later; Triangle sends nothing itself.

**Done 15 September** (`f9e9685`, migration 048), checked signed in 9/9. Limits:
a follow-up message is recorded without its words until Bob drafts chasers
(DEV-004), and each send is its own follow-up, so one recruiter answered about
four roles shows four rows.

### DEV-002 — Source check at filing · `DONE`

**Why:** two of ten Austrian doors cited pages that do not show their channel.

**Acceptance:** a reachable finding is accepted only when its phone or email
appears on a cited page Triangle can read; a finding whose page cannot be read
is filed as unchecked and shown that way; every refusal gives the employee its
reason.

**Done 15 September** (`2024155`; started by Codex, finished here). Checked:
31/31 offline checks; on the 38 doors already on file, reading the real pages,
34 matched, 3 unchecked, 1 refused; signed in, Approvals shows Source unchecked
and refuses to accept it, 3/3. Limits: it checks at filing, so doors already on
file are not re-checked; pages that need a browser or rate-limit Triangle file
as unchecked; a LinkedIn profile or contact form alone is no longer reachable;
not yet exercised by a real bot filing.

### DEV-003 — Hanna writes to the pool from her bot · `DONE`

**Why:** the gate needs one package backed by people confirmed available, and
Hanna's bot cannot yet write to the pool.

**Acceptance:** Hanna's badge can propose candidates and availability updates in
a mission through the mission API, counted by the recruiting finish line;
availability checks are drafts a person sends; her privacy rules hold.

**Done 15 September** (`b678056`). `POST /api/agent/missions/{id}/pool` with `worker.propose`
names people already in the pool, attaches a pending CV, or files a pending
worker finding; availability updates stay pending until a person accepts;
`check` words become an outreach draft (never sent). Recruiting finish line
counts from those findings. Company targets still need `research.suggestion.create`.
No migration. Checked: 13/13 offline DEV-003; lint, production build,
tenant-identity 0. Could not signed-in check here.

### DEV-004 — Bob takes follow-through · `DONE` (code; live SQL + wake still Nikola)

**Why now:** Today Ask Bob already creates a real assignment, then fails
honestly without `mission.work` on Bob's badge or a bot runtime. The CEO
unlocked the scope decision.

**Acceptance:** Bob works mission steps and requests on his bot: lead triage with
reasons, missing-fact chaser drafts, packet-send and supplier-registration
records. Bob sends nothing.

**Done 16 September (code).** `mission.work` is in the scope catalog. Bob's hire
preset is `job_intake.ingest` + `mission.work`. Ask Bob / Workforce assignments
force `execution_mode: bot` and wake like Scout. Data-fix SQL prepared, **not
applied** — Nikola must preview then run
`supabase/data-fixes/2026-09-16-bob-mission-work-scope.sql` (local and
production share one database). Wake env, if the Grok routine exists:
`BOT_WAKE_URL_INBOX_COORDINATOR` and `BOT_WAKE_KEY_INBOX_COORDINATOR`. Do not
invent a URL.

**Limit:** until that SQL runs, Ask Bob still says the badge needs a mission
scope. Until the wake env is set, a created assignment records
`constraints.wake.status = not_configured` and waits for the next inbox check.
Bob still sends nothing. Not Scout's or Hanna's boss.

Checked: 13/13 offline (`npm run check:dev-004`); lint 0; production build 0;
tenant-identity 0. Could not signed-in check here.

### DEV-005 — Known defects · `DONE`

**Acceptance:** the Today recommended card's action carries the person the
recommendation names; the KÃ¶ster door, whose number the source check found on
none of its three cited pages on 15 September, is re-sourced or ruled out (the
newest STRABAG and ANDRITZ doors pass that check); a requisition that arrived
forwarded does not take Triangle's own address as the recruiter's — on
15 September the Today card offered to email Computer Futures' Austria
requisition to `nikola.kralj@triangle-services.com`.

**Done 15 September.** Code: forwarded intake stores the recruiter from
From:/Von:/mailto headers and never `@triangle-services.com` or the receiving
mailbox; the mission recommended card matches the named person/company, and
falls back to the first untried reachable only when none is named; own-domain
contacts no longer drive Open mail. Data: SQL prepared, **not applied** —
Nikola must run
`supabase/data-fixes/2026-09-15-computer-futures-contact-email.sql` and
`supabase/data-fixes/2026-09-15-koster-door-rule-out.sql` after previewing.
Checked: 11/11 offline DEV-005 checks; DEV-002 31/31 unchanged.

### DEV-006 — Tenant identity leaks · `DONE`

**Why:** `npm run check:tenant-identity` fails with eight hardcoded operator
identities (CV reader, CV PDF, next-move). The freeze allows tenant-identity
work.

**Acceptance:** the check passes; commercial drafting reads the approved
organization profile instead of hardcoded names.

**Done 15 September.** Letterhead and CV defaults come from
`organization-profile.ts` (tenant-zero seed); next-move signs as the org name
or "The team"; comments that tripped the scanner were rewritten. Checked:
`npm run check:tenant-identity` exits 0.

### Learning from the CEO's edits ? a changed draft offers a rule in the CEO's words — `DONE`

**Why:** when a human edits an AI-generated draft before sending, that correction
is the clearest signal of how the employee should behave. Without learning,
the user re-edits the same phrases repeatedly.

**Acceptance:**
1. Editing an AI draft in `LeadReplyPanel` (recruiter reply) or `OutreachDraftsPanel`
   (project outreach) prompts the user with `LearnRulePrompt` to capture a standing
   instruction in their own words.
2. Saving the instruction calls `POST /api/agents/house-rules` with the rule text
   and the owning employee (Bob for recruiter replies, Scout for project outreach).
3. The rule is appended cleanly to the employee's existing versioned `agent_house_rules`.
4. The employee immediately receives the updated rules in their next mission payload,
   inbox response, and prompt context (`HOW THE CEO WANTS YOU TO WORK`).
5. Offline tests `scripts/check-ceo-learning.mjs` verify `appendHouseRule` combining
   and panel integration. Lint 0, build 0, tenant identity 0. No migration.

**Done 15 September.** Checked: 3/3 offline checks pass (`scripts/check-ceo-learning.mjs`);
`npm run lint` 0 errors/warnings; `npm run build` succeeds; `npm run check:tenant-identity` exits 0.

### Minimal event outbox ? client reply, follow-up due, availability stale — `DONE`

**Why:** when a client or recruiter replied on outreach or inbound email, a
scheduled follow-up date arrived without an answer, or a worker/partner's
availability confirmation passed the 14-day shelf life, Triangle recorded facts
in the database but never woke the owning employee. Assignment thread follow-up
was DEV-007; this item builds the minimal event outbox for the domain events.

**Acceptance:**
1. `WakeEvent` supports `client_reply`, `follow_up_due`, and `availability_stale`.
2. Events are stored canonically in `agent_assignments` with idempotency keys and
   `case_type: event_outbox`; identical events within a window do not duplicate
   assignments or send duplicate wakes.
3. Event routing:
   - `client_reply` -> commercial ops / Bob (`inbox_coordinator`)
   - `follow_up_due` -> commercial ops / Bob (`inbox_coordinator`)
   - `availability_stale` -> HR / Hanna (`hr`)
4. Immediate webhook wake (`wakeEmployee`) is attempted with ids only; result
   (`sent`, `failed`, `not_configured`) is recorded in `constraints.wake`.
   Missed wakes are collected at the employee's next scheduled inbox check.
5. Integrations:
   - Outreach reply (`markOutreachReplied`) and live contact (`outcome: reached`)
     dispatch `client_reply`.
   - Inbound job opportunities with leads dispatch `client_reply`.
   - Morning cron `/api/agents/cron` sweeps due follow-ups and stale availability
     (>14 days shelf life).
   - `/api/agents/outbox` provides GET audit and POST on-demand sweep.
6. Offline test suite `scripts/check-event-outbox.mjs` verifies dispatch,
   idempotency, and both sweeps. Lint, build, and tenant identity exit 0.
   No migration.

**Done 15 September.** Checked: 4/4 offline checks pass (`scripts/check-event-outbox.mjs`);
`npm run lint` 0 warnings/errors; `npm run build` succeeds with dynamic route
`/api/agents/outbox`; `npm run check:tenant-identity` exits 0.

### DEV-007 — Wake on assignment follow-up · `DONE`

**Why:** the CEO posted in Hanna's assignment thread and the UI said the
message was sent; Hanna never woke. Mission steps and colleague requests
already call `wakeEmployee`; a human follow-up on the thread did not. This is
the assignment-follow-up slice of the deferred event outbox, not the outbox
itself.

**Acceptance:** posting on `/api/assignments/[id]/messages` wakes a
bot-runtime owner with a `human_followup` event (ids only); a missing or
failed wake still stores the message and says the next scheduled check will
pick it up; the UI does not read as instant delivery; the amber badge stays
until the employee answers in-thread.

**Done 15 September** (`3058eb5` and docs follow). Checked: lint, production
build, tenant-identity still the eight known failures. Could not signed-in
check in this environment — Nikola: post a follow-up on Hanna's assignment,
read `constraints.wake`, and confirm the amber badge clears only after she
answers in-thread. Limits: her Grok routine must handle `human_followup`;
this does not send and does not widen `communicationPolicy`.

### Research Agent project chat retired · `DONE`

**Why:** chatting on a project was a parallel research path beside Scout
missions. The CEO cut it.

**Acceptance:** Signal Inbox stays a project/signal list; project detail has
no Research Agent chat; suggestions still accept onto the contractor chain
and Approvals; `/api/research/chat` is not an operating path.

**Done 15 September.** No migration — ask Nikola before adding one. Project
page points at a Scout mission / Workforce hand-off. `/api/research/chat`
returns 410. Suggestion accept and MCP propose tools are unchanged.
`/api/research/run` is unused in the product UI and was left in source.
Checked: lint, production build, tenant-identity 0; GET/POST `/api/research/chat`
return 410 in demo mode. Could not signed-in check here.
Nikola: Signal Inbox -> open a project -> no Research Agent chat; Inbox and
Approvals still accept suggestions.

### DEV-008 — Scout is bot-owned · `DONE`

**Why:** Scout still had a special in-app OpenAI executor (`scout-executor`)
that claimed `execution_mode: in_app` jobs and, after six hours, stalled bot
jobs. Hanna has no such stand-in. The CEO's rule is one way of working:
Triangle stores the work and wakes the Grok bot. A second brain bills OpenAI
for jobs the bot is already paid to do.

**Acceptance:** new Scout work is `execution_mode: bot` and wakes the Scout
bot; the in-app OpenAI claim loop does not take Scout jobs, including stalled
bot jobs and run-now/pulse/cron; Ask / assignment create / finding
continuation / suggested jobs / send-back / reachability do not force
`in_app` onto Scout.

**Done 15 September** (`1f9cacc`, `93895cd`). Checked: lint, production build,
tenant-identity still the eight known failures. Could not signed-in check in
this environment. DEV-003 (Hanna writes to the pool) was left `READY` for
Antigravity; this item does not change `worker.propose` or the CV queue.
Limits: Scout's Grok routine must handle `event: assignment`; a missing or
failed wake still queues for the next inbox check; older in_app Scout rows
are visible in Scout's inbox but are not rewritten in the database.


### Companies directory off the operating surface — `DONE`

**Why:** the CEO browses Today and Missions, not a phone book of company names.
Company rows stay; a case still opens from missions, Approvals and holdings.

**Acceptance:** sidebar and Quick add have no Companies; `/companies` redirects
to Missions with a short notice; `/companies/[id]` still works; no table drop.

**Done 15 September** (`5b913ed`). List route HTTP-redirects; detail deep links
unchanged. No migration. Checked: lint, production build, tenant-identity 0;
`curl -sI /companies` ? 307 to `/missions?notice=companies`. Could not
signed-in check here. Nikola: confirm the sidebar has no Companies, then open a
company from a mission's holdings.

### Job Intake off primary navigation — `DONE`

**Why:** Job Intake is no longer a CEO operating surface. Mail still has to
land, score, and keep reply history until Bob waking on commercial mail is
proven.

**Acceptance:** sidebar has no Job Intake; `/job-intake` still renders as
diagnostics with a banner that commercial mail exceptions belong on Today;
tables, APIs, sync, scoring, and drafts are untouched; Bob mail-wake is not
this item.

**Done 15 September** (`d4afc51`). No migration. No redirect ? bookmarks keep
the page. Checked: lint 0, production build 0, tenant-identity 0; sidebar
source has no Job Intake href; `GET /job-intake` 200; job-intake APIs still
in the route table. Could not signed-in check here. Nikola: confirm the
sidebar has no Job Intake, then open `/job-intake` from a bookmark and read
the diagnostics banner.

### DEV-009 — Today cards: machines observe, humans judge · `DONE`

**Why:** Today's email cards asked the CEO to report Sent / They replied /
Sent a follow-up — observable mailbox state. Agreed 15–16 September: machines
observe, humans judge. First slice is the card chrome, not Gmail sync.

**Acceptance:** email follow-up and ready-to-contact cards keep Open mail;
primary outcome buttons Sent / They replied / Sent a follow-up / Later are
gone; Ask Bob creates a real assignment with the card's entity ids, or fails
honestly when DEV-004 blocks Bob; Dismiss is scoped (not now / not this
opportunity / wrong person / don't contact) and is not a forever blacklist;
Recorded outside Triangle remains so the ledger can stay true; phone cards
stay; no Gmail draft API, no Scout/Hanna routing UI, no migration, no send
path. Offline check for "primary email outcome buttons removed / Ask Bob
present". Lint, production build, tenant-identity.

**Done 16 September.** Card chrome is Open mail · Ask Bob · Dismiss. Ask Bob
posts `/api/ask/bob` (instruction + person/lead/contact/mission ids), creates
a Bob assignment, wakes him, and takes the card off the human rail. If his
badge lacks `mission.work` or he is not on a bot, the UI shows that and
creates nothing. Dismiss maps onto Later / not-for-us / dead_end / a deferred
look-again — never `do_not_contact`. Recorded outside Triangle still writes
the ledger as sent. Phone cards unchanged.

Checked: 12/12 offline (`npm run check:today-slim`); lint 0; production
build 0; tenant-identity 0. Could not signed-in check here. Nikola: on Today,
an email follow-up should show Open mail · Ask Bob · Dismiss, not Sent.

**What this already did vs what is next (16 September IA lock):** DEV-009
slims Today email cards (no Sent / They replied on the primary rail). It did
**not** change AskLauncher, hide Signal Inbox, rename Workforce, or add a
Send button. Those are DEV-010 onwards, ordered below. "Triangle still sends
nothing" here is this slice, not the standing send-from-Triangle law.

**NEXT (not this item):** provider createDraft; mailbox-derived sent/replied.
DEV-015 (context-preserving handoff) is the Today destination for Hand to Bob.
Ask context and intent routing are DEV-010 and DEV-014.

### DEV-015 — Context-preserving handoff — `DONE` (code; live Ask Bob SQL still Nikola)

**Why now:** Hand to Bob dismissed the Today card into Workforce / "What you
handed out". Bob then 409ed completing `{assignmentId, result}` because
migration 041 treated a missing `case_type` as `open_research`.

**Acceptance:**
1. Docs lock the handoff rule: owner changes, place does not.
2. Ask Bob sets `constraints.case_type = commercial_follow_through` so a
   commercial complete is not a research finding. Data-fix SQL prepared, not
   applied.
3. After Hand to Bob the same Today card is With Bob (Open thread + Take
   back); toast "Handed to Bob · Open thread"; no Workforce navigation.
4. Open thread is a right-side drawer on Today (AssignmentThread).
5. Quiet In progress lists active Bob / Scout / Hanna waits. Needs you stays
   for human decisions.
6. No .env, no production promote, no Scout research credentials, nothing
   sends email. Workforce is not redesigned.

**Done 16 September (code).** `/today` aliases `/decisions`. Existing open
Ask Bob rows still lack `case_type` until Nikola runs
`supabase/data-fixes/2026-09-16-ask-bob-commercial-follow-through.sql`.

Checked: `npm run check:dev-015`; lint; production build; tenant-identity.
Could not signed-in check here. Nikola: Hand to Bob on Preview Today ? With
Bob ? Open thread drawer ? the card is in In progress, not Workforce.

### DEV-016 - Hide refusal ledger from Workforce primary (diagnostics only) - `DONE` (branch `claude/today-one-inbox`)

**Why now:** Today / Workforce shows "The system refused N attempts..." with
Postgres finding-contract sentences (Ask Bob completes mis-classified as
`open_research`). That is engineer diagnostics, not CEO work. Nikola: if an
employee gave a CEO this panel, the process is wrong.

**Do before DEV-012.** Context-preserving handoff (DEV-015) remains the CEO
path. Do not put the ledger under Needs you. Do not invent research
landings for commercial follow-through.

**Acceptance:**
1. `RefusalLedger` is not on Today primary
   (`src/app/(app)/decisions/page.tsx`) and not on Workforce primary or in
   primary nav.
2. The data stays: `src/lib/data/refusals.ts`, the component
   `src/components/modules/refusal-ledger.tsx`, and the refusal records.
   Same class as Job Intake hide (`/job-intake` kept as diagnostics).
3. Do not relocate the panel under Needs you, In progress, or Missions.
4. No .env, no production promote, no Team rename, no Send button, nothing
   sends email. Ask Bob `case_type` law is DEV-015, already locked; new
   creates are fixed; Nikola applies
   `supabase/data-fixes/2026-09-16-ask-bob-commercial-follow-through.sql`.

This item is **docs-locked** in this change. Code is the next slice.

**Done 16 September** on branch `claude/today-one-inbox`. Today no longer
renders `RefusalLedger`; Settings has a Diagnostics section, shown to admins and
partners, with the same ledger. Records, component and `summarizeRefusals` are
unchanged; Workforce never rendered the ledger. Checked signed in on localhost,
3/3; type check and lint pass. Not merged or on production yet.

### DEV-017 - Today: one inbox - `DONE` (branch `claude/today-one-inbox`; one limit below)

**Slices, so another agent can continue:** A — structure: pulse line, In
progress grouped per employee, Done since you looked, Missions zone and "on
file" counts off Today, old reports folded under Done. B — group Needs you
cards by person or case. C — one card shape for every Needs you card; Take back
moves into the thread drawer. Status per slice is recorded below as each lands.

**Slice A done 16 September** (branch `claude/today-one-inbox`). Today opens
with a pulse line ("11 need you · Bob on 8 · Hanna on 2" on the day it
landed), then Needs you (unchanged cards), In progress as one collapsed line
per employee whose rows keep Open thread and Take back, and Done since you
looked: missions finished since last opened (state `ready`) plus missionless
work completed in the last 24 hours (`listDoneSince`), each opening its
mission or thread. Old reports sit folded under Done. The mission grid, its Ask
box, the "on file" counts and their three count queries are gone from Today.
Checked signed in on localhost, 8/8; `check:dev-015` 15/15 and
`check:today-slim` 12/12 still pass; type check and lint pass.
**Next: slice B**, then C.

**Slice B done 16 September** (branch `claude/today-one-inbox`). Follow-ups for
the same person are one card, grouped by the address the follow-up goes to (or
name and company without one): the person, the oldest overdue date, the address
and one Open mail or Dial on the card, then one line per role with its own Ask
Bob or thread and Dismiss. A single follow-up still renders as before. Checked
signed in on localhost, 4/4: Nicolas Preckler's two roles are one card with one
Open mail and two Ask Bob actions, and his name appears once in Needs you.
**Next: slice C.** Known: the "Open mail sends nothing" note repeats on each role
line; one card shape should say it once.

**Slice C done 16 September** (branch `claude/today-one-inbox`). Every Needs you
card now leads with its kind in the same place — Reply or Call on the hero card,
Decide or Stopped on a mission that asked, Follow up, and Call or Write on a
person a mission made reachable. A grouped card says "Open mail sends nothing"
once. Take back left the In progress rows and sits in the thread drawer's header
for open work, next to what the employee has done; the With Bob state on a card
keeps its own Take back (DEV-015). Checked signed in on localhost, 6/6, without
pressing Take back; `check:dev-015` 15/15 and `check:today-slim` 12/12 still
pass; type check and lint pass.

**Limit:** card internals are not yet identical. Phone cards keep Got through,
No answer and Dead end (DEV-009 keeps phone outcomes), and a mission's question
is answered on the mission page, not on Today. Answering a mission's question on
Today is listed under Next.

**Why:** on Preview 76c42d4 Today mixed four card designs, listed the same
recruiter once per role, kept a mission grid and a second Ask box under the
inbox, and carried 11 old reports and 19 older items under "Back from the
team". The operating-shell decision makes Today one inbox.

**Acceptance:**
1. Zones in this order: **Needs you**, **In progress**, **Done since you
   looked**, under a one-line pulse: how many need you, and each employee's
   working count.
2. Every Needs you card has one shape: kind (Reply, Decide, Call, Approve,
   Exception), a case line, the situation in one sentence, why now, an evidence
   link, one primary action, Ask the employee, Dismiss. Existing behaviour is
   kept: Open mail, Ask Bob, the Dismiss scopes, phone outcomes, mission
   answers, Recorded outside Triangle.
3. Cards are grouped by person or case: several requisitions from one recruiter
   are one card that lists the roles.
4. In progress is one collapsed row per employee (count and cases), expanding
   to rows that open the existing thread drawer; Take back moves into the
   drawer.
5. Done since you looked lists work completed since the viewer's last visit,
   using the seen markers that exist (a mission's `last_seen_at`; for other
   work, the last 24 hours), each opening its case or mission.
6. Leave Today: the Missions zone (mission cards and its Ask box; Ask stays in
   the header and Ctrl K), the "on file" counts, and "Back from the team" as a
   zone (its reports stay reachable from a collapsed "Older reports" link under
   Done). Nothing is deleted.
7. No new table, no navigation change, no send path, no change to what any
   button records. Signed-in check on the Preview.

### DEV-010 - Context-aware AskLauncher / `/api/ask` - `READY`

**Why now (smallest Ask slice):** the 16 September IA. Current Ask treats
anything that is not a talent-pool question as a new Mission. That fills
Missions with Scout pokes that belong on the email / requirement / company /
project / person the human was looking at. Do this **before inventing new UI
concepts**. Do not invent a Work Items product.

**Depends on:** assignment protocol already allows `mission_id` omitted and
entity refs (`createAssignment`, `event: assignment`). Ask Bob (DEV-009) is
the special case to generalize. EntityCase already loads assignments linked
to a record.

**Acceptance:**
1. With page context (email, requirement, company, project, person) a
   substantial Ask ("Scout, investigate...") creates a **missionless**
   assignment (`mission_id = null`) bound to that record; the CEO stays on
   the situation; the result returns on **EntityCase**, not `/missions/{id}`
   and not a Scout chat.
2. Inside an existing mission, Ask still adds an instruction to **that**
   mission.
3. No page context and a substantial objective still starts a new Mission.
4. A simple pool/availability question still answers inline with no
   assignment.
5. No new table, no Work Items IA, no nav change, no send path.

**Not this item:** Scout / Hanna / Bob intent routing on cards or voice
(DEV-014). Team in Settings (DEV-012). The menu (DEV-011). Today as one inbox
(DEV-017). Refusal-ledger hide is DEV-016, not this Ask rewrite.

### DEV-011 - Menu: Today · Missions · Talent - `DONE` (code on branch `cursor/dev-011-menu-d3bd`; signed-in check on the Preview still owed)

**Why:** the 16 September IA withdrew "keep Signal Inbox thin in the shell",
and the operating-shell decision leaves three primary surfaces. Scout consumes
signals; the CEO does not patrol Hunter. Same pattern as Job Intake /
Companies: hide the list, keep the data.

**Acceptance:** the sidebar shows Today, Missions, Talent and Settings only,
and Quick add follows the same list. Signal Inbox → Settings → Diagnostics,
keeping `/hunter` with a Job Intake-style banner; `/hunter/[id]` still opens
from missions, Today and EntityCase. Cert Alerts → certificate exceptions on
Today plus a filter in Talent. Compliance → a tab in Talent. Setup Readiness
and Data Imports → Settings. Tables, APIs, suggestions and contractor-chain
accept stay; no migration; no page deleted; Talent is not hidden.

**Done 16 September (code).** The sidebar is Today · Missions · Talent ·
Settings, one list, no groups; Quick add offers Missions, Talent pool and
Upload document (the Compliance tab). Signal Inbox: `/hunter` keeps its list
under a Job Intake-style diagnostics banner and opens from Settings →
Diagnostics → Hidden pages; `/hunter/[id]` is unchanged. Cert Alerts: expired
and expiring-within-30-days worker certificates are a **Renew** card in Needs
you on Today (`src/components/modules/today-certs.tsx`, counted in the pulse,
five shown, the rest behind the full list) and a **Certs need attention**
filter in Talent (`?certs=attention`). Compliance: a **Compliance** tab in
Talent (`?tab=compliance`) rendering `ComplianceOverview`, which `/documents`
also renders, so the two cannot drift. Setup Readiness and Data Imports:
Settings → Setup & data. Job Intake and the certificate expiry list are also
listed under Hidden pages. No table, API, suggestion or contractor-chain path
changed; no migration; no page deleted; Talent is not hidden.

Checked: `check:dev-011` 9/9 offline; lint 0; type check 0; tenant-identity 0;
production build 0; `check:dev-015` 15/15, `check:today-slim` 12/12,
`check:dev-004` 13/13. **Not yet:** the signed-in check on the Vercel preview.
To test: menu has four entries; `/hunter` shows the banner and still lists
projects; Talent shows the two tabs and the certificate filter; Today shows a
Renew card only if a worker certificate is expired or within 30 days; Settings
→ Setup & data opens readiness and imports; Diagnostics lists the hidden pages.

### DEV-012 - Team in Settings (Workforce leaves the menu) - `DONE` (code on branches; slice B awaits signed-in check on the Preview)

**Slices, so another agent can continue:** A — a Team section in Settings with
each employee's ownership, health, runtime and wake-up, load by state,
permissions, standing rules, refusals this week, and Activity (recent tasks with
results, opening the thread drawer). B — Workforce leaves the sidebar, `/agents`
redirects to Settings → Team, the humans board becomes Settings → Members, the
work log moves to Diagnostics, and the hand-out console, handed-out list and
quick notes are removed.

**Slice A — DONE on the branch (not merged).** Settings opens on Team: per
employee, health (on duty / off duty / never started, last seen), what it runs
on and whether this server can wake it ("wake-up not set — waits for its
scheduled check" otherwise), load (working, queued, stale, needs you, failed
this week), permissions from its active badge in words, refusals this week
(linking Diagnostics), standing rules (the existing editor, admin and partner
only), and Activity — all open work first, then the latest twelve finished
tasks, each with its result line and a Thread button that opens the existing
drawer. **Stale** is derived, not stored: queued or active work whose newest
sign of life (created, picked up, a thread message, or run activity) is older
than 24 hours. Waiting on a person is Needs you, never stale. Data:
`src/lib/data/team.ts` (`listTeam`); UI: `src/components/modules/team-settings.tsx`.

**Slice B — DONE 16 September (branch `cursor/dev-012-slice-b-d3bd`, stacked
on `claude/team-in-settings`).** Workforce left the sidebar; `/agents` redirects
to `/settings?notice=workforce#team` with the notice "Workforce moved here. Work
is handed out from the case." Settings now has **Members** (the humans board,
`listHumans`, read-only) under Team; **Hire an AI employee** sits at the bottom
of Team for admins only, unchanged; the **Work log** (`listAgentRuns` +
`describeRun`, now `src/components/modules/work-log.tsx`) sits under Diagnostics
beside the refusal ledger, admins and partners. `agent-console.tsx` is deleted,
which removes the hand-out console ("Work that needs doing", "New assignment"),
"What you handed out" and Quick notes. Every remaining `/agents` link points at
`/settings#team` (Ask "All of it", Today footer "Team", Decision Inbox fallback
case, next-move "Nothing needs you", the retired research-chat 410 body) and
Workforce copy is gone from the project page, Today email actions, reachability
and the research pointer. API routes (`/api/agents/*`, `/api/workforce/*`) are
untouched; no migration, no data deleted.

Checked: lint 0; tenant-identity 0; production build 0; `check:dev-015` 15/15
(its Workforce test now asserts the console is gone), `check:dev-004` 13/13,
`check:today-slim` 12/12. **Not yet:** the signed-in check on the Vercel
preview — this agent has no browser session there. To test: sign in, open
`/agents` and confirm it lands on Settings → Team with the notice; confirm the
menu has no Workforce; confirm Members lists the humans, Hire shows for the
admin only, and Diagnostics shows the Work log; Ask and Ask Bob still work from
Today and cases.

**Why:** amended by the operating-shell decision. On Preview 76c42d4 only the
three employee cards on Workforce were useful; the rest was a hand-out console
built on old research gaps, a handed-out list that Today already shows, a chat
box that duplicates Ask, and a raw log of ids. Handing out work already happens
from the case (Ask, Ask Bob, mission instructions), so this no longer waits for
DEV-010.

**Acceptance:**
1. Settings has a Team section: one row per employee with what they own,
   health (on duty, last seen, wake-up configured), load by task state
   (Queued, Working, Needs you, Failed), permissions in plain words, standing
   rules (the existing editor), and links to that employee's Activity and
   refusals.
2. Each employee's Activity lists their tasks with results, so work handed out
   before today keeps a home.
3. `/agents` redirects to Settings → Team with a short notice; Workforce leaves
   the sidebar.
4. Removed: "Work that needs doing" (Hand it out), "What you handed out", Quick
   notes, and the global Work log (moved to Settings → Diagnostics); the humans
   board moves to Settings → Members. Hire an AI employee stays admin-only and
   frozen.
5. Nothing is handed out from Team. The thread drawer, Ask and Ask Bob keep
   working from Today and cases. No data deleted, no new table, no new agent
   roles. Signed-in check on the Preview.

### DEV-013 - Human-approved Send from Triangle - `READY`

**Why:** 16 September sending policy. Review / edit / press Send in Triangle
is allowed. Agent-autonomous sending remains AUTO / APPROVAL / FORBIDDEN.
Policy is decided; the button is not built yet.

**When ready:** after Ask context is honest, and preferably once a real draft
is waiting on a situation. Not a drive-by. Legal/privacy, deliverability,
audit, and `SENT_MESSAGES_RECORDED` must move together so AUTO can stay
honest.

**Acceptance:** from a reviewed draft a human can press Send in Triangle;
AI draft and final sent text are both kept; recipient, time, channel,
follow-up are recorded; Open mail / record-outside remain until mailbox sync;
no agent-autonomous send; `communicationPolicy` unchanged except that a
human Send is a first-class recorded action. Freeze on **autonomous**
outbound still holds.

### DEV-014 - Scout / Hanna / Bob intent routing on cards and voice - later

**Not READY.** After DEV-010. Typed / voice Ask Triangle routes by intent
("investigate the end client" -> Scout) without fake Scout buttons on the
Today mail card. Do not start this to avoid doing DEV-010.

### DEV-018 - Engineering out of the workforce - `BLOCKED_EXTERNAL` (Nikola)

**Why:** on 16 September Scout's HVAC EPC EU step asked the CEO "Promote Eng
Preview c57ec57 to Production, or hold on live outbox c27187b?", a smoke-test
task ("DEV-004 smoke…") sat in Bob's In progress, and production ran
`ed9d3a6` from an unmerged bot branch.

**Needs Nikola:**
1. ~~Move the programming bot to its own Grok / Cursor account, so it shares
   no computer or context with Scout, Hanna and Bob.~~ Done by Nikola,
   16 September.
2. Apply `supabase/data-fixes/2026-09-16-engineering-out-of-the-workforce.sql`
   after reading its preview.
3. Promote only commits merged into the working branch.

**Acceptance:** Today shows no engineering question and no test task; Scout's
HVAC EPC EU step keeps its 12-buyer result without the deploy question; the
smoke task is cancelled; production's `/api/version` reports a merged commit.

### Only if live work stalls on it

- **Triage in bulk:** bulk decisions with structured reasons, once the queues
  make one-by-one review materially slow.
- **Packet-send record:** check that the existing send record works on the first
  real packet send; fix only the defects that send shows.

## Next, once the gate is moving

- A minimal event outbox ? client reply received, follow-up due, availability
  stale ? **DONE 15 September** (see above).
- Learning from the CEO's edits: a changed draft offers a rule in the CEO's words ? **DONE 15 September** (see below).
- Budget and cost per mission.
- Separate research and communications computers for bots (see the
  [architecture study](docs/reviews/WORKFORCE_ARCHITECTURE_2026-09-13.html)).
- Provider createDraft in Gmail / Outlook (Today Open mail stays a mailto until then).
- Mailbox-derived sent / replied so Today does not wait for CEO outcome buttons.
  Start from each person's connected mailbox: Nikola replies from
  `nikola.kralj86@gmail.com` (connected); Ralph connects his own in Settings.
  On 16 September no stored message in the last 14 days was a reply, so check
  first that replies and the Sent folder reach Triangle.
- A Today per person: Needs you filtered to the cases each person owns (Ralph
  may get his own), once work carries a human owner consistently.
- Answer a mission's question on Today, in the card, instead of opening the
  mission (the remaining step to one card shape from DEV-017).
- Typed / voice Ask Triangle that routes Scout / Hanna / Bob by intent
  (DEV-014, after DEV-010). Do not fake Scout buttons on the mail card before
  that router exists.

Not now: a workforce registry, marketplace hiring, quality scores,
**agent-autonomous** sending. Human-approved Send from Triangle is policy
(DEV-013), not a freeze violation.

## Gated — each waits for its evidence

| Item | Status | Gate |
| --- | --- | --- |
| Agent handoffs: budget and time limits, retries, escalation (CASE-004) | Still `GATED`. Visibility slice **DONE 15 September**: mission page chips for linked colleague requests, the source mission a door was first filed in, and holding chips that deep-link to the record (not a second chat inbox). **Fix 15 September:** on a recruiting mission those holding chips now switch to the Doors tab (`?tab=companies#holding-{id}`) instead of setting a hash with no mounted row. Remaining gate: two employees repeatedly collaborate on the same real case and handoffs cause delay or lost context. | Two employees repeatedly collaborate on the same real case and handoffs cause delay or lost context |

| Outcome-backed learning (CASE-005) | `GATED` | Enough real buyer responses, placements or delivery outcomes to evaluate a playbook |
| Truthful availability and package coverage (CORE-001) | `BLOCKED_EXTERNAL` | People confirm the real roster and one initial offer |
| Qualified requirement, buyer and supplier routes, action ledger, orders to margin (CORE-002 to 005) | Built ahead of their gates on 31 August; untested against real use | Three real buyer or recruiter conversations; one real supplier route; five human sends and one packet; a concrete order |
| External pilot, billing, self-serve onboarding, portals (SaaS-001 to 003, NET-001) | `GATED` | A signed paid design-partner scope; a paid pilot; three external customers; recurring market liquidity |
| Customer discovery: target list, interviews, paid pilot offer (GTM-001 to 003) | Paused; materials in [strategy-paused](docs/archive/strategy-paused/) | Management explicitly reactivates it |

## Phase 0 exit gate

Phase 0 is complete only when all are true:

- one truthful package is backed by human-confirmed available people;
- all current high-priority leads are triaged;
- at least five relevant messages are actually sent by humans and recorded;
- every sent message has a follow-up date and final sent content;
- one real, appropriate crew/capability packet is sent and recorded;
- at least three buyer/procurement conversations are requested;
- one supplier/prequalification route is actively progressing;
- no duplicate, unauthorized, or misleading external action occurs.

Code compilation, new screens, accepted suggestions, generated PDFs, agent
activity, or manually set `placed` statuses do not satisfy this gate.

## Business actions toward the gate

Triangle's people do these, using the employees' drafts.

**Establish what Triangle can sell.** Contact everyone who could be in the first
package and confirm their exact role and competence, availability date and
confidence, countries, language, rate expectation, engagement relationship,
A1/right-to-work feasibility, certificates and expiry, travel, accommodation and
tools, and supervisor capability and references. Reconcile the real roster with
the database. Choose one package — a supervised electrical installation or
fit-out crew, or a PCS7/automation/commissioning team — and define its scope,
exclusions, headcount, supervisor, mobilization date, countries, documents,
commercial model and client inputs. Label or correct the old 50-person and
empty-role package records; they are not evidence of supply.

**Work the demand already inside Triangle.** For each strong lead: read the
original email, compare it with the truthful package, decide pursue, later,
needs information or reject with a reason, review the draft, send from the
normal mailbox, and record the final sent version, follow-up and response.
Qualifying asks whether the buyer or recruiter accepts a supplier team, which
entity signs, headcount, scope, timing, duration, location, engagement model,
budget or rate, payment terms, onboarding, and the next decision date.

**Triage** every lead and pending finding with a structured reason, not an
essay: duplicate, stale, wrong skill or package, wrong geography, direct
employment only, individual role only, no credible buyer, no team potential,
insufficient evidence, needs more research, pursue now, follow up later.

**Send one real capability or crew packet** to an appropriate buyer or recruiter.
Read it as the recipient would. Prefer anonymised capability information; named
CVs and certificates go only to a justified recipient with approval. Record
recipient, company, version, named or anonymised, sent time, follow-up and
response.

**Start one supplier or prequalification route** tied to the package — existing
recruiter relationships, Mercury, Exyte, SPIE, Bilfinger — recording the
contracting entity, route, requirements, owner and next date. No mass
registration and no automatic form submission.

### What counts

A **target account** is valid only when it has a current reason it may need the
package, the actual contracting entity, a buyer or procurement route, a
country/legal feasibility hypothesis, and a named human owner with a next action.

A **requirement** is qualified only when the buyer or recruiter confirms real
demand; Triangle's engagement model is acceptable; scope, headcount, timing,
location and duration are known well enough; rate or budget logic exists;
onboarding is feasible; Triangle has credible coverage; and a dated next step
exists.

## After the gate

### First-contract sprint targets

Management targets, not sales forecasts:

| Outcome | Target |
| --- | ---: |
| Truthful contract-ready packages | 1 |
| Named target accounts with evidence and route | 25 |
| Inbound or warm qualification conversations requested | 10 |
| Supplier or prequalification routes started | 8 |
| Highly relevant human commercial actions | 15 |
| Qualified buyer conversations | 5 |
| RFQs, vendor processes or concrete requirements | 2 |
| Written commercial proposals | 1 |
| Autonomous external sends | 0 |

### Close, mobilize, learn

Only once a concrete requirement or vendor process exists: concentrate on the
channel and buyer segment that responded; complete human and legal review of the
delivery model and agreement; confirm scope, supervision, rate, expenses, payment
terms, timesheets, liability, replacement, termination and dispute rules; reserve
the real crew and update availability; prepare site and client documents; issue
the approved named submission or proposal; secure an MSA, approved-supplier
status, PO or job order; mobilize; track timesheets, quality, safety, invoice,
payment and actual margin; then review the win or loss and the workflow friction.

Success is paid work with known economics. A signed agreement without
mobilization is progress, not proof.

### Software after Phase 0

#### P1 — After one truthful package and buyer conversations

1. human-confirmed availability and expiry;
2. crew membership/readiness/reservation;
3. promote lead/project into a common qualified requirement;
4. buyer/procurement/contract route;
5. supplier/prequalification tracker;
6. package commercial fields, landed cost, and margin range;
7. proposal record linked to requirement/package/terms;
8. unified commercial action and follow-up history.

#### P2 — After a concrete order or approved supplier route

1. agreements, job orders, POs, and rate/payment terms;
2. worker reservation and conflict prevention;
3. mobilization checklist and country/site requirements;
4. client submission decisions;
5. timesheets and approvals;
6. invoices, payments, funding exposure, and realized margin;
7. worker/client outcome feedback.

#### P3 — After repeated delivery

1. outcome attribution;
2. channel and buyer-route performance;
3. durable workflows for proven long-running processes;
4. agent evaluations and approved playbook learning;
5. task-first delegation and role queues at real multi-user volume;
6. external design-partner hardening only for a scoped paying pilot.

## Explicit freeze

Until Phase 0 exits, do not build:

- generic hybrid-work core;
- Collaboration Field or spatial org canvas;
- Figma/design lab for a generic shell;
- agent marketplace/catalog expansion;
- new agent roles;
- elaborate Hire Employee flows;
- agent/provider cost dashboard;
- autonomous email or LinkedIn sending (agent AUTO without the 16 September
  policy, audit, and recorded-send path). Human-approved Send from Triangle
  is DEV-013, not this freeze;
- cosmetic dashboard/navigation projects (IA-authorized surface hides in
  DEV-011 / DEV-016 / Cert Alerts are operating-surface work, like Job
  Intake, not polish);
- broad Hunter expansion;
- more sectors/countries;
- generic marketplace;
- SSO, billing, or speculative ATS integrations;
- new orchestration/event infrastructure.

Keep existing workforce architecture; do not delete useful foundations.

The freeze does not prohibit tenant-identity and trust work inside the app.
Customer interviews, target research, and pilot definition are separately
paused by the 4 September management decision.

## Weekly management review

Review in this order:

1. truthful package and fresh worker availability;
2. target accounts with verified route;
3. human actions and overdue follow-ups;
4. replies and conversations;
5. qualified requirements and supplier processes;
6. proposals/orders;
7. submissions/mobilizations;
8. invoices/payments/margin;
9. workflow blockers;
10. agent/technical metrics last.

For every failed target, decide:

- package problem;
- supply problem;
- buyer-route problem;
- market/channel problem;
- legal/commercial-model problem;
- price/economics problem;
- execution/follow-up problem;
- software blocker.

Do not default to “build more software.”

## When a gate is claimed

Add a dated entry below with the database counts or record IDs, the
human-confirmed external actions, the buyer or procurement outcome, the package
and supply evidence, the commercial and legal owner, the remaining risk, and the
decision recorded in DECISIONS.

No gate has been claimed. Phase 0 started on 29 August 2026; the entries up to
4 September are in the archived version.
