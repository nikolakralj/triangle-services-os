# Triangle Services OS — Long-Term Product and Software Roadmap

**Adopted:** 29 August 2026; productization track updated 30 August 2026
**Horizon:** 24–36 months, controlled by evidence gates rather than calendar promises
**Owner:** Triangle Services management
**Execution companion:** `ROADMAP_EXECUTION.md`
**Agent operating rules:** `SOFTWARE_AGENT_INSTRUCTIONS.md`

## The decision

Triangle is building a **contract-to-crew operating system for cross-border
technical staffing and subcontracting**.

It is intended to become a sellable vertical product. Triangle Services is
tenant zero and the first proof environment. External customer discovery and
paid-design-partner work begin during commercial activation; speculative SaaS
features do not.

It is human-led and AI-assisted. Its purpose is to turn truthful worker
capacity and verified demand into buyer conversations, supplier approval,
commercial orders, mobilized crews, paid invoices, and positive contribution
margin.

It is not:

- a generic CRM;
- a generic AI-agent builder;
- a horizontal “hybrid work operating system”;
- an autonomous outbound-email product;
- a project-news database;
- a labor marketplace before Triangle has liquidity on both sides.

The AI-employee model remains useful inside the product. Provider-independent
identity, assignments, scoped access, approvals, and audit are durable
architecture. They are supporting capabilities, not Triangle's market wedge.

## Why this roadmap exists

The software is already capable of producing internal work. The commercial
loop is not yet proven.

Read-only live data on 29 August 2026 showed:

| Evidence | Live state | Meaning |
|---|---:|---|
| Job leads | 24 | Real demand input exists |
| Leads still `new` | 21 | The input is not being worked |
| Leads scoring 70+ | 4 | A small priority queue exists |
| Reply drafts | 3 | The system can prepare an action |
| Replies marked sent | 0 | No commercial send is recorded |
| Discovered projects | 18 | Discovery works |
| Projects beyond `new` | 0 | Project intelligence has not progressed commercially |
| Contractor-chain nodes | 11 | Some downstream mapping exists |
| Buyer contacts | 3 | Buyer coverage remains weak |
| Research suggestions | 31 | Agent research is active |
| Accepted / pending / rejected | 22 / 8 / 1 | Review works, but learning signal is thin |
| Project packages | 2 | Package hypotheses exist |
| Worker matches | 3 | Matching runs |
| Packet sends | 0 | No crew package has reached a buyer |
| Opportunities | 1 | Pipeline conversion is minimal |
| Available workers | 3 | Stored supply is too small for the 50-person package |
| Active agent identities | 3 | Bob, Scout, and Hanna exist in the database |

The highest-priority demand is PCS7/automation work. Stored available supply is
one electrician, one cable puller, and one electrical supervisor. That mismatch
is more important than any missing dashboard.

The current product has passed a partial technical test. It has not passed a
business test or a delivery-economics test. This roadmap makes those tests the
gates for further software investment.

## Product north star

The final outcome is not an AI run, accepted suggestion, sent message, packet,
or even a signed framework agreement.

The north-star outcome is:

> A buyer accepts a legally deliverable Triangle crew or specialist team, the
> people mobilize, Triangle is paid, and the work produces known positive
> contribution margin.

The product must support two equally important entry lanes.

```text
SUPPLY-FIRST
verified available people
  -> sellable crew/specialist package
  -> target accounts and procurement routes
  -> qualified requirement
  -> order
  -> mobilization

DEMAND-FIRST
inbound job / project / tender / workload signal
  -> real buyer and contracting route
  -> qualified commercial requirement
  -> matched crew/specialists
  -> order
  -> mobilization
```

Both converge here:

```text
verified capacity <-> qualified demand
  -> buyer/procurement route
  -> compliant commercial offer
  -> vendor approval / MSA / job order / PO
  -> mobilization and delivery
  -> invoice, payment, margin, outcome learning
```

## The commercial success object

The application may use several operational records, but the main commercial
object is a **contract-qualified crew opportunity**.

It requires:

1. a real, current demand signal;
2. a named company able to buy, subcontract, or introduce the work;
3. a verified buyer, procurement, or supplier-onboarding route;
4. a defined scope or role package;
5. headcount or a credible range;
6. location, start window, duration, and shift pattern;
7. an accepted engagement model: service subcontract, labor supply, agency,
   or referral;
8. rate, budget, or price logic;
9. country and legal feasibility;
10. supplier-prequalification feasibility;
11. credible worker coverage and a mobilization date;
12. an owner, next human action, and due date.

Until these exist, the item is a signal, lead, research target, or package
hypothesis—not an opportunity.

## What can become defensible

Agents, prompts, chat, generic task routing, and project headlines are
commodities. Triangle's compounding asset can be the relationship among:

- human-confirmed worker availability;
- skills, references, rates, and documentary evidence;
- country readiness and mobilization constraints;
- real project phase and demand timing;
- contractor chain and buyer authority;
- supplier/prequalification route;
- engagement model and commercial terms;
- outreach, objections, and conversation outcomes;
- submissions, mobilization, attendance, quality, and safety;
- invoices, payment behavior, and contribution margin.

That graph becomes valuable only through real transactions. Synthetic records,
AI scores, and statuses manually set to `placed` do not create the moat.

## Permanent product and architecture rules

These apply in every phase.

1. **Triangle is the source of truth.** Agent memory and chat are context.
2. **Agents propose; humans authorize consequences.** Research lands in
   suggestions/findings. External communication, legal claims, commercial
   commitments, submissions, and mobilization require a person.
3. **A domain state transition is more valuable than a generated artifact.**
   “Packet sent to buyer” matters more than “PDF generated.”
4. **Evidence and provenance travel with important claims.** Facts,
   inferences, and unknowns remain separate.
5. **Use deterministic code for permissions, deduplication, eligibility,
   compliance checks, money, and status transitions.** Use AI for extraction,
   research, drafting, ranking, and explanation.
6. **Every external ingest and integration is idempotent.** Stable source IDs,
   safe retries, and audit records are mandatory.
7. **Provider is not employee identity.** Model/provider bindings can change
   without splitting role, history, outcomes, or permissions.
8. **Organization isolation is non-negotiable.** RLS, scoped machine
   credentials, and explicit authorization survive every new module.
9. **Personal data is minimized.** Share anonymized capability first when
   appropriate; named CVs and certificates only for a justified recipient and
   purpose.
10. **No generic abstraction without a second proven use.** Clean boundaries
    are good. Paying refactoring cost for imaginary customers is not.
11. **No autonomous external sending in the current horizon.** A future change
    would require a separate management decision, legal review, safeguards,
    deliverability controls, and proven manual conversion.
12. **The database state must describe reality.** A status is not a simulation
    control. `placed`, `sent`, `mobilized`, and `paid` require evidence.

## Product layers

The product should evolve in five stable layers. This is an architectural
boundary, not a request to rewrite the repository.

### 1. Domain truth

Workers, availability, skills, documents, companies, contacts, projects,
contractor chains, buyer routes, requirements, packages, submissions,
contracts, mobilization, timesheets, invoices, and outcomes.

### 2. Commercial workflow

Explicit state machines, owners, next actions, dates, approvals, reminders,
and outcome events. The workflow connects the domain records; it must not be a
generic kanban laid over disconnected data.

### 3. Intelligence

Ingestion, extraction, research, matching, drafting, recommendations, and
evaluations. Intelligence reads approved truth and creates evidence-backed
proposals.

### 4. Integrations

Mail, public procurement data, supplier portals, calendars, document storage,
accounting/timesheets, and selected data providers. Triangle owns canonical
state even when another system owns the connector.

### 5. Trust and operations

Authentication, RLS, scoped credentials, audit, privacy, retention,
observability, backups, incident response, tenant controls, and cost limits.

## Current capability map

### Built and useful now

- IMAP/external job-intake ingestion, privacy filtering, scoring, deduplication;
- editable house rules and reply-style memory;
- reply drafting with manual send confirmation;
- project discovery and source-backed research;
- contractor-chain and buyer suggestions;
- one human approvals queue;
- project packages, worker matching, document readiness, and PDF packets;
- packet-send records and response statuses;
- worker import, profiles, notes, CV extraction, and human approval;
- provider-independent agent identities, credentials, bindings, assignments,
  threads, runs, findings, and result reporting;
- multi-tenant schema/RLS foundations.

### Built but not yet proven through real use

- lead qualification quality after real conversations;
- outreach usefulness and draft-to-final learning;
- buyer mapping accuracy;
- worker matching for a real requirement;
- packet delivery and response tracking;
- agent assignment conversations at meaningful volume;
- the approvals queue under daily operating load;
- actual placement statuses and outcome attribution.

### Material gaps

- truthful, recently confirmed supply and reserve status;
- lead-to-qualified-requirement promotion;
- a complete buyer/procurement/contract route;
- package commercial readiness and landed-cost model;
- vendor/prequalification tracking;
- contract, job order, and purchase-order truth;
- mobilization and cross-border compliance workflow;
- timesheet, invoice, payment, and realized margin;
- a unified event/outcome ledger;
- production observability, stronger automated tests, backup/restore drills;
- document pages still backed by sample data;
- an adopted role playbook for every active agent identity — done as of
  3 September 2026: Bob, Scout and Hanna each have one.

## Phase 0 — Commercial activation and truth reset

**Expected window:** now through 30 days

**Status:** active

### Goal

Use the existing system to start real commercial conversations and expose the
first genuine workflow friction, while verifying that similar technical
staffing and crew-supply businesses will pay to solve the same problem.

### Required work

- human-confirm and reconcile the real available roster;
- choose one truthful package: electrical crew or PCS7/automation team;
- work all four current high-priority inbound leads;
- triage the current leads and pending suggestions with reasons;
- send at least five relevant, human-approved messages;
- send one real, appropriate crew/capability packet;
- record final sent content, recipient, send date, follow-up date, and outcome;
- start supplier/prequalification routes relevant to the chosen package;
- record every next action and due date;
- interview at least 12 qualified owners/operators from technical crew
  suppliers and boutique contract staffing agencies;
- obtain three concrete design-partner commitments: a real-data workshop,
  pilot LOI, or paid pilot—not compliments or wait-list signups.

### Software allowed

Fix verified blockers to those actions. A narrow productization safety slice
is also allowed when it prevents tenant identity leakage, permission failure,
or unsafe onboarding for a real design-partner conversation. Do not build
speculative workflow, analytics, billing, or design work during the revenue
block.

### Exit gate

- one truthful, contract-ready package;
- five relevant messages recorded as actually sent;
- one real package/capability packet recorded as sent;
- all high-priority leads triaged;
- follow-ups scheduled;
- at least three buyer/procurement conversations requested;
- 12 qualified external problem interviews completed;
- five interviewees independently confirm the same costly workflow problem;
- three concrete pilot commitments requested or received;
- no duplicate or unauthorized external action.

### Do not build

- Collaboration Field;
- new generic navigation shell;
- more agent roles;
- agent performance dashboards;
- new project-signal collectors;
- automated outbound;
- marketplace or billing.

## Phase 1 — Contract-readiness OS

**Expected window:** months 1–3

**Entry:** Phase 0 evidence exists

### Goal

Turn a lead, project, supplier route, or conversation into a contractable
commercial requirement and proposal.

### Product outcomes

1. **Supply truth**
   - availability confirmation with source/person/date and expiry;
   - country, travel, language, rate, engagement, and mobilization constraints;
   - reserve/hold status so the same person is not promised twice;
   - team/crew package based on real members rather than desired headcount.

2. **Qualified requirement**
   - promote inbound lead or project demand into one common requirement;
   - capture buyer authority, scope, headcount, timing, duration, shifts,
     location, budget, engagement model, onboarding route, and unknowns;
   - explicit qualification/disqualification reason.

3. **Buyer and procurement route**
   - distinguish end client, prime, delivery contractor, labor buyer, recruiter,
     and contracting entity;
   - track invited supplier portal, vendor registration, framework, MSA, or
     recruiter route;
   - require a human-owned next action.

4. **Commercial package readiness**
   - package scope and exclusions;
   - confirmed coverage and readiness;
   - landed-cost assumptions, target/minimum price, payment-term limit, and
     contribution-margin range;
   - legal/compliance review state, not automated legal conclusions;
   - supplier-readiness pack checklist.

5. **Commercial action loop**
   - draft versus final human-edited sent content;
   - message/packet version, recipient, sender, send time, follow-up, response,
     objection, and outcome;
   - one action history across inbound replies, direct outreach, calls,
     supplier submissions, and packets.

### Exit gate

- five qualified buyer conversations;
- at least two concrete requirements, RFQs, or vendor processes;
- one written commercial proposal generated from truthful records;
- one signed commercial route, job order, or documented reason the package
  failed;
- margin and legal feasibility reviewed by humans.

### Architecture limit

Keep existing Next.js route handlers, Supabase state, and current agent/API
contracts unless real usage proves request-bound execution is unreliable. Do
not introduce a general orchestration platform in anticipation.

### Parallel design-partner rule

Customer discovery does not wait for Phase 4 or Phase 5. When five qualified
interviews repeat the same problem and one target agrees to a paid, scoped
pilot, build only the tenant onboarding, import/export, trust, and integration
work required for that pilot. Triangle revenue work remains the product truth
test; external feedback prevents the internal workflow becoming dependent on
Nikola's tacit knowledge.

## Phase 2 — Delivery, mobilization, and margin OS

**Expected window:** months 3–6

**Entry:** one contractable job or approved supplier route

### Goal

Prove Triangle can deliver work safely and profitably, not only originate it.

### Product outcomes

- customers, contracting entities, agreements, job orders, POs, rate cards,
  payment terms, and document versions;
- assignment/crew reservation and conflict prevention;
- country/site-specific document checklist with human/legal ownership;
- A1/posting/work-permit/insurance/site-access states and expiry alerts;
- travel, accommodation, PPE, tools, inductions, and mobilization milestones;
- named worker submission, client decision, replacement, and withdrawal;
- attendance/timesheet capture and client approval;
- safety/quality/issue log and worker/client feedback;
- invoice milestones, payment status, receivables exposure, and actual margin;
- real placement completion and redeployment history.

### State evidence

`placed` must mean an accepted commercial placement linked to a requirement or
order. `mobilized` must have a start/site record. `paid` must have an invoice
and payment record. Existing test-like `placed` statuses should be reconciled
before they appear in performance metrics.

### Exit gate

- three unrelated paying clients or equivalent strong evidence;
- five delivered/mobilized assignments or crew packages;
- known forecast versus realized contribution margin;
- no untracked compliance, payroll-funding, or duplicate-allocation failures;
- one repeatable supplier-readiness and mobilization process.

## Phase 3 — Repeatable revenue intelligence

**Expected window:** months 6–9

**Entry:** delivery and margin data exists

### Goal

Make the proven commercial process faster and more reliable without removing
human authority.

### Product outcomes

- channel/source attribution from signal to paid result;
- account and buyer prioritization trained on real outcomes;
- saved target-account and supplier-route playbooks;
- structured follow-up cadence and overdue-action queue;
- read-only monitors for selected public/project/procurement sources;
- TED award/prime-contractor intelligence where relevant;
- outcome-based matching and package recommendations;
- agent evaluation on accuracy, accepted action, conversation, placement, time
  saved, and commercial impact—not tokens or task count;
- approved playbook-change proposals based on evidence.

### Durable execution threshold

Evaluate a durable workflow runtime only when one or more real workflows:

- outlive a request/function timeout;
- require independent step retries;
- pause for human approval for hours or days;
- must resume after deployment or crash;
- fan out across multiple external systems with observable state.

As of this roadmap, Vercel's current Workflow tooling supports persisted,
retryable steps and long approval pauses. If adopted, it should orchestrate
domain commands while Supabase remains canonical truth. It must not become a
second business database or a reason to bypass suggestion/approval rules.

### Exit gate

- one acquisition channel repeatedly creates qualified conversations;
- at least 80% of active commercial records have a dated next action;
- agents demonstrably reduce time/cost per qualified outcome;
- retry/resume reliability is measured if durable execution is introduced.

## Phase 4 — Multi-user agency operating system

**Expected window:** months 9–12

**Entry:** multiple humans regularly operate the proven workflow

### Goal

Scale Triangle's internal team without losing accountability or truth.

### Product outcomes

- role/department work queues and fine-grained access;
- task-first delegation: describe outcome, attach context, then recommend an
  eligible human/agent/team;
- workload, ownership, service-level, escalation, and handoff rules;
- one Today/Needs Action view grounded in live commercial states;
- unified decisions/approvals across research, communication, talent,
  compliance, commercial, and delivery actions;
- member/agent profiles only where they help assign work or understand impact;
- searchable organization memory with source/date/owner;
- mobile workflows for calls, approvals, worker updates, and site events;
- operational audit, cost controls, alerts, backups, and recovery testing.

### UX gate for the rejected proposal

Reconsider a Collaboration Field or spatial organization view only when:

- at least five agents and several humans do concurrent work;
- users actually struggle to understand ownership/relationships;
- a list/task view has been tested and is insufficient;
- the design uses live data and passes an operator usability test;
- it does not displace the commercial action queue.

The generic “humans + agents + missions” vocabulary must not erase staffing,
contract, crew, compliance, delivery, and margin objects.

### Exit gate

- at least five regular internal users;
- clear ownership for all active work;
- no hidden approvals or orphaned active records;
- management can trace every important outcome to people, evidence, and action.

## Phase 5 — Repeatable vertical SaaS

**Expected window:** months 12–18

**Entry:** Triangle uses the system for real revenue and at least one paid
external pilot has completed the core workflow

### Goal

Turn successful design-partner evidence into a repeatable vertical product for
similar agencies.

### Entry evidence

- at least three external customers share the same core workflow;
- at least one paid pilot reaches a measurable commercial outcome;
- value survives outside Nikola's tacit knowledge and bespoke developer work;
- onboarding and support economics are measured.

### Product outcomes

- tenant onboarding, invitations, role templates, and safe default policies;
- configurable terminology, package taxonomies, countries, house rules, and
  approval thresholds without forking code;
- tenant-safe imports, exports, deletion/retention, audit, and support tools;
- model/provider configuration that does not expose secrets;
- integration framework for the few systems design partners actually use;
- DPA, privacy/DSAR operations, security documentation, incident process,
  backup/restore, service limits, and billing;
- usage and outcome telemetry with clear tenant ownership.

### Enterprise features remain gated

SSO/SAML/SCIM, extensive ATS integrations, SOC 2, advanced billing, and
regional AI infrastructure are driven by signed design-partner requirements,
not copied from enterprise competitors speculatively.

### Exit gate

- at least three paying external customers with weekly use;
- repeatable activation reaches a qualified requirement and submission;
- retention, onboarding/support cost, and data responsibilities are known;
- no cross-tenant or permission failure.

## Phase 6 — Vertical platform and network

**Expected window:** months 18–36+

**Entry:** repeatable internal revenue plus successful external pilots

### Goal

Productize the contract-to-crew network effects that have actually appeared.

Possible outcomes, only when supported by evidence:

- verified supplier and crew capability profiles;
- buyer/vendor portals for requirements, submissions, onboarding, and
  timesheet approvals;
- reusable country/compliance and supplier-readiness templates reviewed by
  qualified experts;
- outcome benchmarks for buyers, packages, channels, and workers;
- partner APIs and selected procurement/ATS/accounting integrations;
- managed network/referral workflows;
- marketplace functionality only after recurring demand and supply liquidity
  exist in a narrow segment.

### Gate for a generic hybrid work OS

Do not reconsider a horizontal product until Triangle has at least two proven,
paying non-staffing verticals whose common workflow is more valuable than the
domain-specific layers. One staffing customer and a generic UI are not proof.

## Cross-cutting workstreams

| Workstream | Now | Next | Later |
|---|---|---|---|
| Supply | Confirm real availability and package | reservations, readiness, country fit | utilization and outcome learning |
| Demand | Work current leads/projects | common qualified requirement | repeatable signal/channel intelligence |
| Buyer route | Human verify contacts/procurement | supplier registration and contract route | buyer/vendor portal |
| Commercial | Record sends/follow-ups | landed cost, proposal, terms | forecast and portfolio economics |
| Delivery | Reconcile false/test placement states | mobilization, timesheets, issues | client/worker quality benchmarks |
| Agents | Bob/Scout/Hanna within scoped roles | evidence-based role playbooks/evals | task routing and durable execution if needed |
| UX | Action queues and current workflow | commercial/delivery workspaces | multi-user coordination after evidence |
| Integrations | Existing mail + manual portals | targeted public/procurement and accounting links | design-partner ATS/ERP needs |
| Trust | RLS, scoped credentials, approvals | audit/retention/backups/incident controls | external-customer security program |
| Customers | 12 interviews and 3 pilot commitments | paid design partner using real workflow | repeatable acquisition, onboarding, retention |
| Productization | tenant identity safety only | pilot-required onboarding/import/export | billing and self-serve only after repeatability |

## Canonical state machines

Names may evolve, but the distinctions must remain.

### Demand

```text
signal
-> reviewed
-> qualified / disqualified / monitor
-> requirement confirmed
-> proposal
-> commercial order
-> delivery
-> invoiced
-> paid / lost
```

### Supply

```text
known person
-> human-confirmed availability
-> package-ready
-> reserved
-> submitted
-> client accepted / rejected / withdrawn
-> mobilized
-> active
-> completed
-> available / unavailable
```

### Supplier route

```text
target account
-> route verified
-> introduction/registration started
-> prequalification requested
-> approved supplier / rejected / dormant
-> framework/MSA
-> job order/PO
```

### External action

```text
draft
-> human reviewed
-> sent outside Triangle by a human
-> response / no response
-> follow-up
-> qualified outcome / closed reason
```

### Agent contribution

```text
assignment
-> evidence-backed proposal/result
-> human review
-> accepted action
-> commercial/delivery event
-> attributed outcome
-> approved playbook learning
```

## Build-versus-buy rules

Build the domain workflow and outcome graph. Buy or integrate commodities.

### Build

- contract-qualified requirement and package logic;
- worker/crew truth, readiness, reservation, and mobilization;
- contractor-chain/buyer/procurement relationship to a package;
- human approvals and domain state transitions;
- outcome attribution and contribution-margin learning;
- Triangle-specific playbooks and operator experience.

### Prefer integration

- generic contact databases and enrichment;
- mail/calendar transport;
- public procurement feeds;
- e-signature;
- accounting, payroll, and payments;
- identity/SSO when customers require it;
- generic model routing, tracing, and durable execution.

No integration may silently replace Triangle's canonical state or bypass its
authorization and audit rules.

## Metrics hierarchy

### Level 1 — business proof

- mobilized workers/crews;
- paid invoices;
- realized contribution margin;
- repeat clients;
- worker utilization and redeployment;
- payment and funding exposure.

### Level 2 — commercial conversion

- contract-ready packages;
- verified target/buyer routes;
- human commercial actions;
- replies and conversations;
- qualified requirements;
- supplier approvals/RFQs;
- proposals and orders;
- submissions and mobilizations.

### Level 3 — workflow health

- active records with owner/next action/due date;
- time in state;
- overdue follow-ups;
- availability freshness;
- document readiness;
- duplicate/error rates;
- approval age.

### Level 4 — agent/technical efficiency

- accepted finding/action rate;
- accuracy and hallucination rate;
- time saved;
- cost per qualified conversation or delivered outcome;
- retry/failure rate;
- provider/model comparison only after enough comparable work.

Task count, token count, sources searched, generated emails, and accepted
suggestions are diagnostic metrics, never company success metrics.

## Stop/change rules

- If 25 well-selected accounts create no buyer conversations, revisit the
  package and buyer route before adding more signals.
- If conversations happen but buyers reject the engagement model, solve the
  commercial/legal structure before more outreach.
- If demand exists but coverage is weak, build truthful supply before selling
  larger crews.
- If proposals fail on price, calculate landed costs and segment economics;
  do not blindly reduce margin.
- If a channel yields only individual freelance roles, explicitly decide
  whether those placements fit the business rather than inflating crew metrics.
- If manual action does not convert, automation will scale failure.
- If users do not use a built feature in live work, investigate the workflow
  before polishing the interface.
- If a new agent creates more review burden than useful outcomes, retire or
  narrow it before hiring another.

## Research basis

The detailed competitive, commercial, procurement, and legal review is in
`docs/strategy/CONTRACT_FIRST_STRATEGY_REVIEW_2026-08-28.md`.

Key implications verified against current primary sources:

- Horizontal agent identity, execution, permissions, audit, and enterprise
  governance are already core products from [OpenAI Frontier](https://openai.com/business/frontier/),
  [Microsoft Copilot Studio / Agent 365](https://learn.microsoft.com/en-us/microsoft-copilot-studio/security-and-governance),
  and [LangSmith Fleet](https://www.langchain.com/blog/introducing-langsmith-fleet).
  Triangle should use these patterns, not compete with them as a category.
- Technical labor shortage is real: the [European Labour Authority](https://www.ela.europa.eu/en/publications/labour-shortages-and-surpluses-europe-2024)
  identifies widespread shortages including electricians, construction, and
  engineering roles; the [IEA World Energy Employment 2025 report](https://www.iea.org/reports/world-energy-employment-2025/executive-summary)
  reports critical hiring bottlenecks in applied technical roles.
- Project/procurement intelligence is accessible, including the openly
  available [TED Search API](https://docs.ted.europa.eu/api/latest/search.html),
  but intelligence creates value only when connected to the prime contractor,
  procurement route, deliverable package, and human action.
- Supplier access and readiness are commercial workflow: public routes such as
  [Mercury's supply-chain registration](https://www.mercuryeng.com/supply-chain/)
  explicitly address subcontractors and labor agencies.
- Long-running agent/workflow infrastructure is becoming a commodity. Current
  [Vercel Workflow guidance](https://vercel.com/kb/guide/what-is-workflowagent)
  supports durable steps, retries, approval pauses, and resumption. Adopt it
  only when proven workflows need those properties.
- Cross-border delivery remains country- and fact-specific. The roadmap does
  not replace qualified legal, tax, employment, immigration, insurance, or
  payroll advice.

## Roadmap governance

1. `ROADMAP.md` defines the long-term product direction and phase gates.
2. `ROADMAP_EXECUTION.md` defines the current cycle and ordered backlog.
3. `DECISIONS.md` records every strategic change.
4. `CURRENT_STATE.md` records implemented and live reality.
5. `SOFTWARE_AGENT_INSTRUCTIONS.md` controls how development agents work.
6. `agents/shared-constitution.md` and role files control runtime business agents.

No agent may silently reinterpret a failed target as success, advance a phase
because code exists, or change this roadmap without recording the decision and
evidence. Management may override any roadmap item; the override must be
written down so the next agent does not reconstruct strategy from chat.
