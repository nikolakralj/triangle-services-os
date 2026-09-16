# Roadmap execution â what happens next

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

1. Take the first `READY` item under *Development â now*.
2. Mark it `IN_PROGRESS` here before editing. One item in progress at a time.
3. Build the smallest coherent slice and verify it: type check, lint, build, the
   checks the change needs, and a signed-in check wherever it shows on screen.
4. When it is done, mark it `DONE` here and record it in CURRENT_STATE.
5. Stop at a human or external gate and say exactly what is needed.
6. Never mark commercial evidence complete from sample data, generated
   documents or statuses. Do not rebuild a feature that already exists.

`READY` may start now Â· `IN_PROGRESS` being built Â· `BLOCKED_EXTERNAL` needs a
person, real data, a secret, a decision or a production action Â· `GATED` waits
for named evidence Â· `DONE` built and verified.

Change this file when an item is done, when real use exposes a blocker, when
management changes the order, or when the gate is met or fails.

## Development â now

These unblock the Phase 0 exit gate below; none of them counts toward it.

**16 September IA (docs lock):** first `READY` item is **DEV-010** (context-aware
Ask). DEV-009 (Today slim: Open mail / Ask Bob / Dismiss) is `DONE` and did
not change Ask, Signal Inbox, Team, or Send. Do not invent Work Items. Do not
implement the Send button unless you are on DEV-013.

### DEV-001 â Sent-message record Â· `DONE`

**Why now:** the gate needs five human sends recorded with final content and a
follow-up date, and nothing surfaces follow-ups.

**Acceptance:** from any Triangle draft a person records a send â final text,
recipient, channel, time â in one action; a follow-up date is always set, by
default so recording stays one action; due and overdue follow-ups appear on
Today; the AI draft and the final sent text are both kept; the reply and outcome
can be added later; Triangle sends nothing itself.

**Done 15 September** (`f9e9685`, migration 048), checked signed in 9/9. Limits:
a follow-up message is recorded without its words until Bob drafts chasers
(DEV-004), and each send is its own follow-up, so one recruiter answered about
four roles shows four rows.

### DEV-002 â Source check at filing Â· `DONE`

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

### DEV-003 â Hanna writes to the pool from her bot Â· `DONE`

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

### DEV-004 â Bob takes follow-through Â· `BLOCKED_EXTERNAL`

**Needs:** the CEO's decision on a mission scope for Bob's badge, and Bob's
wake-up routine.

**Acceptance:** Bob works mission steps and requests on his bot: lead triage with
reasons, missing-fact chaser drafts, packet-send and supplier-registration
records. Bob sends nothing.

### DEV-005 â Known defects Â· `DONE`

**Acceptance:** the Today recommended card's action carries the person the
recommendation names; the KÃ¶ster door, whose number the source check found on
none of its three cited pages on 15 September, is re-sourced or ruled out (the
newest STRABAG and ANDRITZ doors pass that check); a requisition that arrived
forwarded does not take Triangle's own address as the recruiter's â on
15 September the Today card offered to email Computer Futures' Austria
requisition to `nikola.kralj@triangle-services.com`.

**Done 15 September.** Code: forwarded intake stores the recruiter from
From:/Von:/mailto headers and never `@triangle-services.com` or the receiving
mailbox; the mission recommended card matches the named person/company, and
falls back to the first untried reachable only when none is named; own-domain
contacts no longer drive Open mail. Data: SQL prepared, **not applied** â
Nikola must run
`supabase/data-fixes/2026-09-15-computer-futures-contact-email.sql` and
`supabase/data-fixes/2026-09-15-koster-door-rule-out.sql` after previewing.
Checked: 11/11 offline DEV-005 checks; DEV-002 31/31 unchanged.

### DEV-006 â Tenant identity leaks Â· `DONE`

**Why:** `npm run check:tenant-identity` fails with eight hardcoded operator
identities (CV reader, CV PDF, next-move). The freeze allows tenant-identity
work.

**Acceptance:** the check passes; commercial drafting reads the approved
organization profile instead of hardcoded names.

**Done 15 September.** Letterhead and CV defaults come from
`organization-profile.ts` (tenant-zero seed); next-move signs as the org name
or "The team"; comments that tripped the scanner were rewritten. Checked:
`npm run check:tenant-identity` exits 0.

### Learning from the CEO's edits ? a changed draft offers a rule in the CEO's words � `DONE`

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

### Minimal event outbox ? client reply, follow-up due, availability stale � `DONE`

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

### DEV-007 â Wake on assignment follow-up Â· `DONE`

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
check in this environment â Nikola: post a follow-up on Hanna's assignment,
read `constraints.wake`, and confirm the amber badge clears only after she
answers in-thread. Limits: her Grok routine must handle `human_followup`;
this does not send and does not widen `communicationPolicy`.

### Research Agent project chat retired Â· `DONE`

**Why:** chatting on a project was a parallel research path beside Scout
missions. The CEO cut it.

**Acceptance:** Signal Inbox stays a project/signal list; project detail has
no Research Agent chat; suggestions still accept onto the contractor chain
and Approvals; `/api/research/chat` is not an operating path.

**Done 15 September.** No migration â ask Nikola before adding one. Project
page points at a Scout mission / Workforce hand-off. `/api/research/chat`
returns 410. Suggestion accept and MCP propose tools are unchanged.
`/api/research/run` is unused in the product UI and was left in source.
Checked: lint, production build, tenant-identity 0; GET/POST `/api/research/chat`
return 410 in demo mode. Could not signed-in check here.
Nikola: Signal Inbox -> open a project -> no Research Agent chat; Inbox and
Approvals still accept suggestions.

### DEV-008 â Scout is bot-owned Â· `DONE`

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


### Companies directory off the operating surface � `DONE`

**Why:** the CEO browses Today and Missions, not a phone book of company names.
Company rows stay; a case still opens from missions, Approvals and holdings.

**Acceptance:** sidebar and Quick add have no Companies; `/companies` redirects
to Missions with a short notice; `/companies/[id]` still works; no table drop.

**Done 15 September** (`5b913ed`). List route HTTP-redirects; detail deep links
unchanged. No migration. Checked: lint, production build, tenant-identity 0;
`curl -sI /companies` ? 307 to `/missions?notice=companies`. Could not
signed-in check here. Nikola: confirm the sidebar has no Companies, then open a
company from a mission's holdings.

### Job Intake off primary navigation � `DONE`

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

**NEXT (not this item):** provider createDraft; mailbox-derived sent/replied;
Today copy "Bob handling N; 1 needs you" as a full overdue-list rewrite.
Ask context and intent routing are DEV-010 and DEV-014, not a second Today
chrome pass.

### DEV-010 - Context-aware AskLauncher / `/api/ask` - `READY`

**Why now (smallest, first):** the 16 September IA. Current Ask treats
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
(DEV-014). Workforce -> Team (DEV-012). Signal Inbox hide (DEV-011).

### DEV-011 - Hide Signal Inbox from primary nav - `READY`

**Why:** 16 September IA withdraws "keep Signal Inbox thin in the shell."
Scout consumes signals; the CEO does not patrol Hunter. Same pattern as Job
Intake / Companies: hide the list, keep the data.

**Do after or in parallel with DEV-010, not instead of it.** Ask context
matters more than the sidebar.

**Acceptance:** sidebar and Quick add have no Signal Inbox / Hunter; `/hunter`
may stay as diagnostics (bookmark) or redirect with a short notice - pick the
Job Intake pattern (keep page + banner) unless a redirect is clearly better;
`/hunter/[id]` still opens from missions, Today, and EntityCase; tables, APIs,
suggestions, and contractor-chain accept stay; no migration; no module
deletion. Cert Alerts also leave primary nav (exceptions -> Today) if they are
still in the same shell pass; do not hide Talent.

### DEV-012 - Workforce -> Team shrink - `READY`

**Why:** Team is Scout / Hanna / Bob roles, standing rules, permissions,
health, and load - not a hand-out-jobs console. Ask context (DEV-010) must
exist first so handing out work is not the Team page's job.

**Do after DEV-010.**

**Acceptance:** primary nav label is Team (or Workforce still, with Team copy
on the page if a rename is staged); the page shows the three employees,
rules, badges, health, load; it is not the place to file a new research job
(that is Ask, with or without a mission); no marketplace, no Hire Employee
expansion, no new agent roles.

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
- Typed / voice Ask Triangle that routes Scout / Hanna / Bob by intent
  (DEV-014, after DEV-010). Do not fake Scout buttons on the mail card before
  that router exists.

Not now: a workforce registry, marketplace hiring, quality scores,
**agent-autonomous** sending. Human-approved Send from Triangle is policy
(DEV-013), not a freeze violation.

## Gated â each waits for its evidence

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
the database. Choose one package â a supervised electrical installation or
fit-out crew, or a PCS7/automation/commissioning team â and define its scope,
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

**Start one supplier or prequalification route** tied to the package â existing
recruiter relationships, Mercury, Exyte, SPIE, Bilfinger â recording the
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

#### P1 â After one truthful package and buyer conversations

1. human-confirmed availability and expiry;
2. crew membership/readiness/reservation;
3. promote lead/project into a common qualified requirement;
4. buyer/procurement/contract route;
5. supplier/prequalification tracker;
6. package commercial fields, landed cost, and margin range;
7. proposal record linked to requirement/package/terms;
8. unified commercial action and follow-up history.

#### P2 â After a concrete order or approved supplier route

1. agreements, job orders, POs, and rate/payment terms;
2. worker reservation and conflict prevention;
3. mobilization checklist and country/site requirements;
4. client submission decisions;
5. timesheets and approvals;
6. invoices, payments, funding exposure, and realized margin;
7. worker/client outcome feedback.

#### P3 â After repeated delivery

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
  DEV-011 / Cert Alerts are operating-surface work, like Job Intake, not
  polish);
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

Do not default to âbuild more software.â

## When a gate is claimed

Add a dated entry below with the database counts or record IDs, the
human-confirmed external actions, the buyer or procurement outcome, the package
and supply evidence, the commercial and legal owner, the remaining risk, and the
decision recorded in DECISIONS.

No gate has been claimed. Phase 0 started on 29 August 2026; the entries up to
4 September are in the archived version.
