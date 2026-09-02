# Roadmap Execution

**Current cycle:** Agent-operated commercial qualification and contract truth
**Cycle started:** 29 August 2026
**Long-term direction:** `ROADMAP.md`
**Operating playbook:** `docs/strategy/FIRST_CONTRACT_30_DAY_PLAYBOOK.md`

## How to use this file

`ROADMAP.md` defines the product horizon and evidence gates.

This file defines what happens now, in order. A software agent must not pull a
later roadmap feature into the current cycle merely because it is technically
interesting.

Update this file when:

- a current item is completed with evidence;
- real use exposes a blocker;
- management changes the ordered work;
- the phase exit gate is met or fails.

Record strategic changes in `DECISIONS.md`, and implemented/live truth in
`CURRENT_STATE.md`.

## Current truth

Read-only live data on 29 August 2026:

```text
24 job leads              21 still new
4 leads score 70+          3 drafts
0 replies marked sent     18 projects, all new
31 research suggestions   22 accepted / 8 pending / 1 rejected
11 chain nodes             3 buyer contacts
2 package hypotheses       3 worker matches marked placed
0 packet sends             1 opportunity
3 available workers        3 active agent identities
```

The strongest demand is PCS7/automation. The stored available roster is
electrical installation: electrician, cable puller, supervisor. The package
for 50 electricians is not supported by the database. No metric may hide this
supply-demand mismatch.

## Operator model — clarified 1 September 2026

The CEO is not the integration layer between pages or agents.

The default internal loop is now:

```text
CEO sets an outcome or accepts a promising finding
-> AI employee owns a durable domain case
-> AI researches and files sourced proposals
-> system continues pre-authorized, read-only qualification work
-> CEO sees a brief only when a decision, exception, or commercial action exists
```

For a company case, qualification means a named relevant project, the actual
labor-buyer path, sourced buyer contacts, a Triangle-supported crew package,
unknowns/blockers, and one exact next commercial action. A company logo,
generic summary, source list, or empty CRM record is not a finished case.

Current implementation deliberately reuses agent assignments and their
threads as case memory. Do not create a generic universal case platform until
the company and project flows show a concrete limitation.

### Ordered agent-first product slices

1. **Company case continuity — repository and live Bilfinger smoke complete.**
   Preserve approval provenance, link the originating assignment, queue the
   same employee for safe qualification, hydrate company context in its inbox,
   and promote the result into a compact commercial-manager report. Worker
   hand-ins and conversations remain available under audit.
2. **CEO decision inbox — repository and signed-in smoke complete.** Replace raw approval volume with grouped case briefs:
   no action needed, agent blocked, evidence conflict, pursue/hold/reject,
   approve commercial action. Do not hide evidence; put it behind progressive
   disclosure.
3. **In-app employee execution bridge — repository and local runtime smoke
   complete.** Köster and GOLDBECK verified the full chain from acceptance to
   queued no-outreach assignment, OpenAI web research, structured manager
   report, linked run audit, and new pending project evidence. The CEO does not
   need to wake Scout in provider chat. The remaining runtime step is replacing
   the session pulse with a durable cloud scheduler when always-on operation is
   commercially justified.
4. **Cross-entity case pattern.** Apply the proven pattern to project, buyer
   contact/person, requirement, and crew package. Each view must share case
   outcome, memory, evidence, open questions, responsible employee, and next
   action without creating duplicate truth tables.
5. **Safe continuation policies and handoffs.** Make the allowed read-only
   steps explicit, idempotent, budgeted, and observable. Agents may hand work
   to another scoped role; consequential actions remain human-approved.
6. **Outcome-backed learning.** Store corrections, accepted/rejected evidence,
   buyer responses, placements, delivery, and margin as evaluation history.
   Never let model-generated summaries silently overwrite canonical facts.

These slices reduce real operator friction but do not count as Phase 0
commercial evidence. Sends, buyer replies, orders, mobilization, payment, and
margin remain the business gates.

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

## Workstream A — First 72 hours: establish what Triangle can sell

**Owner:** Nikola/Ralph

**Software status:** no build required unless a real action is blocked

1. Contact every person who could be in the first package.
2. Confirm:
   - exact role and current competence;
   - availability date and confidence;
   - countries accepted;
   - language;
   - rate expectation;
   - engagement relationship;
   - A1/right-to-work feasibility;
   - certificates and expiry;
   - travel/accommodation/tools;
   - supervisor capability and references.
3. Reconcile Triangle's real roster with the database.
4. Choose one package:
   - supervised electrical installation/fit-out crew; or
   - PCS7/automation/commissioning specialist team.
5. Define scope, exclusions, headcount, supervisor, mobilization date,
   countries, documents, commercial model, and client inputs.
6. Reconcile or label the existing 50-person and empty-role package records;
   do not use them as evidence of deliverable supply until corrected.

**Evidence produced:** one package card and recently confirmed worker set.

## Workstream B — Days 1–7: commercial activation

### 1. Work the demand already inside Triangle

For each of the four leads scoring 70+:

1. read the original email;
2. compare it with the truthful package;
3. decide pursue, later, needs information, or reject with reason;
4. human-review the draft;
5. send from the normal mailbox if relevant;
6. record the final sent version;
7. set follow-up and response state.

Qualification must ask whether the buyer/recruiter accepts a supplier team,
which entity signs, headcount, scope, timing, duration, location, engagement
model, budget/rate, payment term, onboarding, and next decision date.

### 2. Triage the current queues

Every lead and pending suggestion gets a decision or explicit deferral reason.
Use structured reasons; do not write essays.

Examples:

- duplicate;
- stale;
- wrong skill/package;
- wrong geography;
- direct employment only;
- individual role only;
- no credible buyer;
- no team potential;
- insufficient evidence;
- needs more research;
- pursue now;
- follow up later.

### 3. Send one real capability/crew packet

- Choose an appropriate buyer/recruiter and package.
- Review it as the recipient.
- Prefer anonymized capability information when appropriate.
- Share named CVs/certificates only with a justified recipient and human
  approval.
- Record recipient, company, version, named/anonymized state, sent time,
  follow-up, and response.

### 4. Start supplier access

Work a narrow set tied to the selected package:

- current recruiter/agency relationships;
- Mercury supply-chain/labor-agency route;
- Exyte supplier/prequalification route;
- SPIE relevant entity/MySourcing route;
- Bilfinger relevant entity supplier route.

Record the actual contracting entity, route, requirements, owner, and next
date. Do not mass-register or submit forms automatically.

## Workstream C — Days 8–30: first-contract sprint

### Activity targets

These are management targets, not sales forecasts:

| Outcome | Target |
|---|---:|
| Truthful contract-ready packages | 1 |
| Named target accounts with evidence and route | 25 |
| Inbound/warm qualification conversations requested | 10 |
| Supplier/prequalification routes started | 8 |
| Highly relevant human commercial actions | 15 |
| Qualified buyer conversations | 5 |
| RFQs, vendor processes, or concrete requirements | 2 |
| Written commercial proposals | 1 |
| Autonomous external sends | 0 |

### A target account is valid only when it has

- a current reason it may need the package;
- the actual contracting entity;
- a buyer/procurement route;
- a country/legal feasibility hypothesis;
- a specific human owner and next action.

### A requirement is qualified only when

- real demand is confirmed by the buyer/recruiter;
- Triangle's engagement model is acceptable;
- scope, headcount, timing, location, and duration are sufficiently known;
- rate/budget logic exists;
- onboarding is feasible;
- Triangle has credible coverage;
- a dated next step exists.

## Workstream D — Days 31–90: close, mobilize, learn

Only after a concrete requirement or vendor process exists:

1. concentrate on the channel and buyer segment that responded;
2. complete human/legal review of delivery model and agreement;
3. confirm scope, supervision, rate, expenses, payment terms, timesheets,
   liability, replacement, termination, and dispute rules;
4. reserve the real crew and update availability;
5. prepare the required site/client documents;
6. issue the approved named submission/proposal;
7. secure an MSA, approved-supplier state, PO, or job order;
8. mobilize;
9. track timesheet, quality, safety, invoice, payment, and actual margin;
10. run a win/loss and workflow-friction review.

**90-day success:** paid work and known economics. A signed agreement without
mobilization is progress, not final proof.

## Workstream E — Parallel sellability proof

This work begins now but cannot displace Workstreams A–D.

1. Build a qualified list of 30 European targets: technical crew suppliers,
   labor subcontractors, and boutique contract staffing agencies.
2. Conduct 12 problem interviews across owners, recruitment, operations, and
   delivery/compliance roles.
3. Record current tools, workflow, delay/error cost, decision authority,
   integration constraints, security concerns, and willingness to pay.
4. Require five independent confirmations of the same project-to-placement
   pain before expanding pilot software.
5. Request three concrete commitments: real-data workshop, pilot LOI, or paid
   90-day design-partner pilot.
6. Use `docs/strategy/SELLABLE_PRODUCT_STRATEGY_2026-08-30.md` for the ICP,
   interview questions, pricing hypothesis, and evidence gates.
7. Use `AUTONOMOUS_WORK_QUEUE.md` as the ordered software/product queue.

Agents may research targets and prepare interview/pilot material. Only a human
contacts prospects, agrees price/terms, supplies customer data, or authorizes
external account creation.

## Software backlog—strict order

Software begins only when the associated evidence exists.

### P0 — Verified blockers to Phase 0

Build/fix only if live work cannot proceed:

1. **Commercial next action**
   - owner, next action, due date on every pursued lead/package/opportunity;
   - overdue/action-today view using real records.
2. **Sent-message truth**
   - original draft, final sent version, recipient/sender, sent time,
     follow-up, response, outcome;
   - manual confirmation only.
3. **Triage efficiency**
   - bulk actions with structured reasons where current queues make manual
     review materially slow.
4. **Packet-send truth**
   - verify the existing send-record UI/API works for the first real send;
   - fix only demonstrated defects.
5. **Tenant safety for sellability**
   - remove hardcoded Triangle identity from tenant-facing commercial AI;
   - require a human-approved organization profile before commercial drafting;
   - inventory remaining identity leakage before any external pilot.

Do not reimplement a feature already present.

### P1 — After one truthful package and buyer conversations

1. human-confirmed availability and expiry;
2. crew membership/readiness/reservation;
3. promote lead/project into a common qualified requirement;
4. buyer/procurement/contract route;
5. supplier/prequalification tracker;
6. package commercial fields, landed cost, and margin range;
7. proposal record linked to requirement/package/terms;
8. unified commercial action and follow-up history.

### P2 — After a concrete order or approved supplier route

1. agreements, job orders, POs, and rate/payment terms;
2. worker reservation and conflict prevention;
3. mobilization checklist and country/site requirements;
4. client submission decisions;
5. timesheets and approvals;
6. invoices, payments, funding exposure, and realized margin;
7. worker/client outcome feedback.

### P3 — After repeated delivery

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

The freeze does not prohibit customer interviews, target research, pilot
definition, or the narrow tenant-identity safety boundary. Those are evidence
and trust work, not a generic SaaS build.

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

## Evidence log for advancing phases

When a gate is claimed complete, add a dated entry here with:

- database counts or record IDs where appropriate;
- human-confirmed external actions;
- buyer/procurement outcome;
- package and supply evidence;
- commercial/legal owner;
- remaining risk;
- decision recorded in `DECISIONS.md`.

### 29 August 2026

Phase 0 started. Gate not met. No reply or packet send is recorded. The
long-term roadmap and software-agent rules were reconciled with the actual
branch, migrations through `026`, live data, the shared ChatGPT discussion,
and current market/platform research. No product code was changed.

### 30 August 2026

The product is now explicitly intended to be sellable to boutique technical
staffing and crew-supply businesses. External problem interviews begin during
Phase 0, while speculative SaaS features remain gated. Repository task PZ-001
is complete: migration `027`, organization operating profile API/UI, and
tenant-aware Job Intake classification/reply drafting. TypeScript, focused
lint, production build, unauthenticated route gate, and diff checks pass.
Migration `027` is not applied to production; no external communication,
deployment, live data, or commercial record was changed.
