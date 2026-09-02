# Autonomous Product Work Queue

**Adopted:** 30 August 2026  
**Purpose:** give Codex and other software/product agents an ordered,
evidence-gated queue that can be executed without re-planning the product on
every turn.

This file controls software/product-agent work. It does not authorize sending
messages, applying production migrations, deploying, purchasing services,
accepting legal terms, or disclosing worker/customer data.

## Execution rule

When the user says “continue,” “build the product,” or asks an agent to work
independently:

1. complete the mandatory start protocol in `SOFTWARE_AGENT_INSTRUCTIONS.md`;
2. inspect the current branch, diff, live/local evidence, and this queue;
3. select the first `READY` item whose entry gate is already proven;
4. mark only that item `IN_PROGRESS` before editing;
5. implement the smallest coherent slice and run its verification;
6. update the item, `CURRENT_STATE.md`, and any affected source-of-truth doc;
7. continue to the next `READY` item only when the previous item is complete
   and the remaining work is inside the same authorized request;
8. stop at a human/external gate and report the exact evidence or decision
   needed.

Agents must not mark commercial evidence complete based on sample data,
generated artifacts, or statuses without real-world proof.

## Status vocabulary

- `READY`: gate satisfied; may be selected now.
- `IN_PROGRESS`: active coherent slice; only one per agent/branch.
- `BLOCKED_EXTERNAL`: needs a human conversation, real data, legal decision,
  secret, production action, or other external evidence.
- `GATED`: valuable only after its named evidence gate.
- `DONE`: acceptance criteria and verification completed in the repository.

## Active tracks

Commercial Track A is operated by Triangle's humans with AI assistance.
Product Track B is executable by software/product agents. Customer Track C
requires founder/customer interaction; agents may prepare assets and research.

## Product Track B — ordered queue

### PZ-001 — Tenant operating profile

**Status:** DONE (repository 30 August 2026; migration 027 applied 31 August 2026)  
**Gate:** user explicitly requires a sellable multi-tenant product.  
**Problem:** intake and reply prompts contain Triangle/Nikola identity, making
external use unsafe.

**Scope:**

- organization operating model, offer mode, factual company profile, sign-off,
  currency, and timezone;
- admin/partner settings API and UI;
- tenant profile injected into intake classification and reply drafting;
- refuse commercial drafting when required identity fields are incomplete;
- preserve manual approval and no-send behavior.

**Acceptance:** no other tenant can draft as Triangle merely because of a code
constant; migration is idempotent and reloads PostgREST schema; TypeScript,
lint, and relevant route checks pass.

**Verification:** `npx tsc --noEmit`, focused ESLint, `npm run build`, and
`git diff --check` pass. Unauthenticated GET on
`/api/settings/organization-profile` returns `401`. Migration `027` was later
applied and the signed-in organization readiness flow was verified on 31
August.

### PZ-002 — Commercial identity leakage audit

**Status:** DONE (repository 31 August 2026; migrations 028-031 applied 31 August 2026)
**Gate:** PZ-001 `DONE`.

**Problem:** research, general AI generation, imports, packets, metadata, and
visible UI still contain hardcoded Triangle identity.

**Scope:** inventory every hardcoded occurrence; classify each as product
brand, tenant data, demo/seed content, operator documentation, or unsafe
commercial output; replace only unsafe tenant-facing runtime identity with the
organization profile; add regression checks for commercial outputs.

**Acceptance:** a documented inventory exists; no generated email, packet,
research instruction, or customer-visible operational record uses another
tenant's identity; demo and repository history are clearly separated.

**Verification:** inventory recorded in
`docs/product/COMMERCIAL_IDENTITY_AUDIT_2026-08-31.md`; static sample-data
runtime module removed; `npm run check:tenant-identity`, `npx tsc --noEmit`,
and focused ESLint pass.

### PZ-003 — Tenant readiness and onboarding specification

**Status:** DONE (repository 31 August 2026; verified signed-in after migrations — /onboarding reports 8 of 9 gates)  
**Gate:** PZ-002 `DONE`.

**Scope:** produce and implement the smallest onboarding readiness check:
organization profile, admin/member, worker import, commercial rules, mailbox
or external source, approval policy, and first package/requirement. Show
incomplete items without inventing completion.

**Acceptance:** a new test tenant can see exactly what prevents its first safe
intake, qualification, draft, and package workflow; no billing or broad
white-label work.

**Verification:** `/onboarding` computes nine tenant-scoped evidence gates and
three workflow outcomes; navigation links to it; settings anchors lead to real
configuration panels; specification is recorded in
`docs/product/TENANT_ONBOARDING_READINESS.md`; TypeScript and focused ESLint
pass. The signed-in readiness page was verified after the migrations.

### CASE-001 — Company case continuity

**Status:** DONE (repository and signed-in Bilfinger smoke 1 September 2026)
**Gate:** management explicitly identified approval-to-company page hopping as
blocking the AI-employee operating model.

**State transition:** accepted company finding -> durable company case with
source evidence, responsible employee, continued safe research, and one CEO
brief.

**Implemented:**

- accepted company findings preserve and link the source assignment;
- the same employee receives an idempotent, research-only continuation toward
  named project, buyer path/contact, crew package, blockers, and next action;
- the agent inbox receives hydrated company records and expected output;
- the company page is manager-first: recommendation, named work, actual buyer,
  supported offer, next commercial action, and material unknowns;
- worker hand-ins, conversation, evidence, and background jobs remain visible
  under `Manager audit` instead of occupying the CEO view;
- future company continuations use in-app execution and can be claimed without
  the CEO opening Scout's provider chat;
- generic one-shot AI buttons and empty CRM panels are no longer the primary
  company experience.

**Verification:** TypeScript, full ESLint, tenant-identity check, and diff check
pass. Signed-in live smoke on Bilfinger verifies acceptance -> qualification ->
completed Scout report -> concise manager page with no overlay or application
console error. No outreach or supplier registration was performed.

### CASE-002 — CEO decision inbox

**Status:** DONE (repository and signed-in live smoke complete)
**Gate:** CASE-001 repository implementation complete.

**Problem:** Approvals still asks the CEO to evaluate individual raw findings.
The CEO should see grouped case outcomes and only exceptions or consequential
decisions.

**Scope:**

- group research by project/company case and show one decision brief;
- distinguish `no_action_needed`, `agent_blocked`, `evidence_conflict`,
  `pursue`, `hold`, `reject`, and `approve_commercial_action`;
- show recommended decision, business impact, unknowns, evidence quality,
  responsible employee, next safe AI step, and next human step;
- allow batch acceptance only for safe internal facts; never batch external
  actions or personal-data sharing;
- measure decisions requested per qualified case and CEO review time.

**Acceptance:** a manager can understand what matters and decide without
opening Workforce, Companies, and Signal Inbox in sequence. Every decision
links to its living case and the agent continues any pre-authorized internal
work automatically.

**Implemented:**

- `/decisions` is the default application landing page and the primary AI
  Workforce navigation item;
- pending research is grouped by project/company case and converted into a
  recommendation, impact, unknowns, evidence quality, responsible employee,
  next safe AI step, and next human step;
- recent failed/waiting-review assignments and unsent outreach drafts are
  surfaced as exceptions or consequential commercial decisions;
- queued/active assignments are counted as `AI handling now` and do not ask
  the CEO for attention;
- raw evidence and accept/reject controls remain behind progressive
  disclosure, with `/approvals` retained as evidence history;
- no new truth table, outbound automation, database migration, deployment, or
  production write was introduced.

**Verification:** TypeScript, full ESLint, production build, tenant-identity
check, and diff check pass. Signed-in browser smoke confirms the Decision Inbox
renders with case grouping and disclosure controls. Accepting Köster and
GOLDBECK exercised the real write-side continuation flow: each created a
durable company and no-outreach assignment, ran through Triangle's executor,
returned valid structured strategy, logged a linked run, and filed project
evidence for human review. No external action occurred.

### CASE-003 — Cross-entity living cases

**Status:** READY
**Gate:** CASE-002 is used on real company cases and confirms the common
information/interaction pattern.

**Gate evidence:** the live Bilfinger case confirmed the common pattern and
exposed the management-layer requirement: worker detail stays auditable while
the default business page remains a short decision report.

**Scope:** extend the proven case workspace to projects, buyer contacts,
qualified requirements, and crew packages using existing canonical tables and
conversation stores. Do not create a generic CRM entity or parallel truth
database.

### CASE-004 — Agent handoffs and safe continuation policy

**Status:** GATED
**Gate:** at least two runtime roles repeatedly collaborate on the same real
case and manual assignment handoff causes measurable delay or lost context.

**Scope:** explicit allowed-step policy, idempotent handoff, owner/state,
budget/time limits, retries, blocked reason, audit, and human escalation.
External contact remains outside automatic continuation.

### CASE-005 — Outcome-backed agent learning

**Status:** GATED
**Gate:** accepted/rejected research plus real buyer response, placement, or
delivery outcomes exist in enough volume to evaluate a playbook.

**Scope:** evidence corrections, decision history, outcome attribution,
playbook versions, evaluations, and rollback. Summaries help retrieval but
never replace sourced facts or deterministic domain state.

### CORE-001 — Truthful availability and package coverage

**Status:** BLOCKED_EXTERNAL  
**Gate:** humans confirm the real roster and one initial offer.

**Scope after gate:** availability source/date/expiry, mobilization constraints,
reservation/hold state, package membership from real people, and prevention of
unsupported capacity claims.

### CORE-002 — Common qualified requirement

**Status:** BUILT AHEAD OF GATE (schema and UI shipped 31 August 2026; commercial_requirements). The evidence gate below was never met — it was overridden by an explicit instruction to produce a working product first. Treat the implementation as untested against real commercial use until the gate evidence exists.

**Original status:** GATED  
**Gate:** one truthful package plus at least three real buyer/recruiter
conversations exposing qualification fields.

**Scope:** promote inbound lead or project signal into one requirement object
with buyer authority, scope, headcount, location, start, duration, shifts,
budget/rate, engagement model, supplier route, unknowns, owner, next action,
and qualification decision.

### CORE-003 — Buyer and supplier route

**Status:** BUILT AHEAD OF GATE (schema and UI shipped 31 August 2026; buyer_routes). The evidence gate below was never met — it was overridden by an explicit instruction to produce a working product first. Treat the implementation as untested against real commercial use until the gate evidence exists.

**Original status:** GATED  
**Gate:** one real supplier registration, framework, recruiter route, or direct
buyer conversation.

**Scope:** represent project owner, prime, delivery contractor, labor buyer,
contracting entity, procurement contact, supplier onboarding route, state,
evidence, next action, and deadline.

### CORE-004 — Commercial action ledger

**Status:** BUILT AHEAD OF GATE (schema and UI shipped 31 August 2026; commercial_actions, plus outreach drafting from a buyer contact). The evidence gate below was never met — it was overridden by an explicit instruction to produce a working product first. Treat the implementation as untested against real commercial use until the gate evidence exists.

**Original status:** GATED  
**Gate:** five real human-approved sends and one packet send are recorded.

**Scope:** one history for draft, final sent content, channel, sender,
recipient, time, follow-up, response, objection, next action, and outcome.

### CORE-005 — Contract, mobilization, and margin

**Status:** BUILT AHEAD OF GATE (schema and UI shipped 31 August 2026; commercial_orders, worker_reservations, mobilizations, mobilization_checklist_items, timesheets, invoices, invoice_timesheets, payments, delivery_costs, order_financial_summary). The evidence gate below was never met — it was overridden by an explicit instruction to produce a working product first. Treat the implementation as untested against real commercial use until the gate evidence exists.

**Original status:** GATED  
**Gate:** concrete job order, PO, signed supplier route, or equivalent.

**Scope:** agreement/order truth, reservation conflicts, document/site/country
readiness, submission/client decision, mobilization, timesheet, invoice,
payment, and realized margin.

### SaaS-001 — External pilot hardening

**Status:** GATED  
**Gate:** signed paid design-partner scope.

**Scope:** only requirements named by the pilot plus tenant isolation tests,
invite/roles, import/export, retention/deletion, audit, backup/restore,
cost/service limits, support, incident path, and pilot telemetry.

### SaaS-002 — Billing and entitlements

**Status:** GATED  
**Gate:** at least one paid pilot has a validated package/price and manual
billing is creating material friction.

### SaaS-003 — Repeatable self-serve onboarding

**Status:** GATED  
**Gate:** three external customers complete the same core workflow and the
configuration no longer depends on developer judgment.

### NET-001 — Portals or marketplace

**Status:** GATED  
**Gate:** recurring narrow-market demand and supply liquidity, repeat
transactions, legal review, and a proven portal job-to-be-done.

## Customer Track C — agents prepare, humans execute

### GTM-001 — Design-partner target list

**Status:** READY  
**Agent work:** define search criteria and prepare a research table for 30
European technical crew suppliers/contract staffing agencies with public
evidence and likely buyer role.  
**Human gate:** approve targets and any contact method.  
**No authority:** do not scrape prohibited data or send outreach.

### GTM-002 — Problem interview kit

**Status:** READY  
**Agent work:** prepare the interview guide, current-workflow map, pain/cost
worksheet, pilot qualification score, and evidence log.  
**Human work:** invite and conduct interviews.

### GTM-003 — Paid pilot offer

**Status:** GATED  
**Gate:** at least five interviews repeat the core pain and one target requests
a concrete next step.  
**Agent work:** draft scope, success metrics, implementation boundary, pricing
hypothesis, data responsibilities, support, and exit/export terms.  
**Human/legal work:** approve, negotiate, and sign.

## Product evidence board

Verified against the database on 31 August 2026, not from memory.

| Evidence | Current | Needed next | Owner |
|---|---:|---:|---|
| Truthful initial packages | 2 recorded, neither confirmed against a real roster | 1 confirmed | Triangle human |
| Workers in the pool | 3 | enough to staff one package | Triangle human |
| Buyer contacts with a reachable address | 0 of 4 | 1 | Triangle human |
| Outreach drafted and waiting to send | 1 (Peter Östlund, JSM, Nauen cable route) | — | — |
| Recorded relevant sends | 0 | 5 | Triangle human |
| Recorded packet sends | 0 | 1 | Triangle human |
| Buyer/procurement conversations requested | 0 proven | 3 | Triangle human |
| Qualified customer interviews | 0 | 12 | Founder |
| Repeated external pain confirmations | 0 | 5 | Founder |
| Concrete pilot commitments | 0 | 3 | Founder |
| Paid external pilots | 0 | 1 | Founder |
| External customers reaching qualified requirement/submission | 0 | 1 | Product + customer |

Update only from evidence. Link the source/date in the relevant strategy or
commercial record; do not change counts from memory.

## Where Product Track B stands — 2 September 2026

CASE-002 is repository- and live-smoke-complete after management clarified the
agent-operated CEO workflow. CASE-003 is READY: Bilfinger verified the manager
layer, while Köster and GOLDBECK verified Triangle's own no-outreach Scout
executor and structured case hand-in. Extend this proven pattern one domain at
a time; do not invent a generic agent platform.

The commercial evidence bottlenecks remain unchanged:

- **3 workers** in the pool, so no package can be honestly staffed (CORE-001);
- **0 of 4 buyer contacts have an email, phone or LinkedIn**, so the drafted
  approach to Peter Östlund cannot be sent;
- **0 recorded sends**, so no gate downstream of Phase 0 can open.

Customer Track C still has GTM-001 and GTM-002 ready for research/preparation,
but no agent has authority to contact targets.
