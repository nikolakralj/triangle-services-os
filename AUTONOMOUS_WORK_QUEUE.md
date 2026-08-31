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

**Status:** DONE (repository, 30 August 2026; production migration pending)  
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
`/api/settings/organization-profile` returns `401`. Migration `027` was not
applied to production, and the signed-in Settings/save/draft flow still needs
an authorized post-migration smoke test.

### PZ-002 — Commercial identity leakage audit

**Status:** DONE (repository, 31 August 2026; production migrations pending)  
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

**Status:** DONE (repository, 31 August 2026; signed-in smoke test pending migrations)  
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
pass. Production smoke testing remains pending migrations `027` and `028`.

### CORE-001 — Truthful availability and package coverage

**Status:** BLOCKED_EXTERNAL  
**Gate:** humans confirm the real roster and one initial offer.

**Scope after gate:** availability source/date/expiry, mobilization constraints,
reservation/hold state, package membership from real people, and prevention of
unsupported capacity claims.

### CORE-002 — Common qualified requirement

**Status:** GATED  
**Gate:** one truthful package plus at least three real buyer/recruiter
conversations exposing qualification fields.

**Scope:** promote inbound lead or project signal into one requirement object
with buyer authority, scope, headcount, location, start, duration, shifts,
budget/rate, engagement model, supplier route, unknowns, owner, next action,
and qualification decision.

### CORE-003 — Buyer and supplier route

**Status:** GATED  
**Gate:** one real supplier registration, framework, recruiter route, or direct
buyer conversation.

**Scope:** represent project owner, prime, delivery contractor, labor buyer,
contracting entity, procurement contact, supplier onboarding route, state,
evidence, next action, and deadline.

### CORE-004 — Commercial action ledger

**Status:** GATED  
**Gate:** five real human-approved sends and one packet send are recorded.

**Scope:** one history for draft, final sent content, channel, sender,
recipient, time, follow-up, response, objection, next action, and outcome.

### CORE-005 — Contract, mobilization, and margin

**Status:** GATED  
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

| Evidence | Current | Needed next | Owner |
|---|---:|---:|---|
| Truthful initial packages | unconfirmed | 1 | Triangle human |
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
