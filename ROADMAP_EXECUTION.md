# Roadmap execution — what happens next

Updated 15 September 2026. The one place for next steps, for people and for
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

### DEV-003 — Hanna writes to the pool from her bot · `READY`

**Why:** the gate needs one package backed by people confirmed available, and
Hanna's bot cannot yet write to the pool.

**Acceptance:** Hanna's badge can propose candidates and availability updates in
a mission through the mission API, counted by the recruiting finish line;
availability checks are drafts a person sends; her privacy rules hold.

### DEV-004 — Bob takes follow-through · `BLOCKED_EXTERNAL`

**Needs:** the CEO's decision on a mission scope for Bob's badge, and Bob's
wake-up routine.

**Acceptance:** Bob works mission steps and requests on his bot: lead triage with
reasons, missing-fact chaser drafts, packet-send and supplier-registration
records. Bob sends nothing.

### DEV-005 — Known defects · `READY`

**Acceptance:** the Today recommended card's action carries the person the
recommendation names; the Köster door, whose number the source check found on
none of its three cited pages on 15 September, is re-sourced or ruled out (the
newest STRABAG and ANDRITZ doors pass that check); a requisition that arrived
forwarded does not take Triangle's own address as the recruiter's — on
15 September the Today card offered to email Computer Futures' Austria
requisition to `nikola.kralj@triangle-services.com`.

### DEV-006 — Tenant identity leaks · `READY`

**Why:** `npm run check:tenant-identity` fails with eight hardcoded operator
identities (CV reader, CV PDF, next-move). The freeze allows tenant-identity
work.

**Acceptance:** the check passes; commercial drafting reads the approved
organization profile instead of hardcoded names.

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

### Only if live work stalls on it

- **Triage in bulk:** bulk decisions with structured reasons, once the queues
  make one-by-one review materially slow.
- **Packet-send record:** check that the existing send record works on the first
  real packet send; fix only the defects that send shows.

## Next, once the gate is moving

- A minimal event outbox — client reply received, follow-up due, availability
  stale — that wakes the owning employee. Assignment-thread follow-up wake is
  already DEV-007; this remaining item is the other events.
- Learning from the CEO's edits: a changed draft offers a rule in the CEO's words.
- Budget and cost per mission.
- Separate research and communications computers for bots (see the
  [architecture study](docs/reviews/WORKFORCE_ARCHITECTURE_2026-09-13.html)).

Not now: a workforce registry, marketplace hiring, quality scores, autonomous
sending.

## Gated — each waits for its evidence

| Item | Status | Gate |
| --- | --- | --- |
| Agent handoffs: budget and time limits, retries, escalation (CASE-004) | Partly built 14 September: requests between employees, wake-up on the answer, messaging policy | Two employees repeatedly collaborate on the same real case and handoffs cause delay or lost context |
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
- autonomous email or LinkedIn sending;
- broad Hunter expansion;
- more sectors/countries;
- generic marketplace;
- SSO, billing, or speculative ATS integrations;
- new orchestration/event infrastructure;
- cosmetic dashboard/navigation projects.

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
