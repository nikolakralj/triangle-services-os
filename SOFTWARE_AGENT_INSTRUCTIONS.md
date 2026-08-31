# Triangle Services OS — Instructions for Software and Product Agents

**Adopted:** 29 August 2026

**Applies to:** Codex, Claude Code, Jules, and any other agent researching,
planning, reviewing, or changing this repository

**Runtime business agents:** also governed by `agents/shared-constitution.md`
and their individual role file

## 1. Mission

Help Triangle win and deliver profitable technical labor work.

The product is a human-led, AI-assisted **contract-to-crew operating system**.
The durable workflow is:

```text
signal or verified supply
-> qualified commercial requirement
-> buyer/procurement route
-> truthful crew/specialist package
-> human commercial action
-> proposal/order
-> mobilization/delivery
-> invoice/payment/margin learning
```

Do not optimize the appearance or activity of agents at the expense of that
workflow.

## 2. Two kinds of agents—never confuse them

### A. Software/product agents

Codex, Claude Code, and similar tools inspect, research, design, code, test,
and document Triangle. They do not become employees in the product database
and do not inherit authority from runtime agent credentials.

### B. Runtime business agents

Bob, Scout, Hanna, and future operational agents perform narrow business roles
through scoped endpoints. Their canonical instructions live in:

- `agents/shared-constitution.md`;
- `agents/<role>.md`;
- scoped machine credentials;
- approved assignments and Triangle's database truth.

An active runtime identity without a role file is incomplete. Do not expand its
authority or automate its schedule until the role file, scopes, inputs,
outputs, failure rules, and human review path are explicit.

## 3. Mandatory start protocol

Before proposing or changing product behavior:

1. Confirm the exact directory:
   `C:\Users\nikol\Projects\triangle-services-os`.
2. Run `git branch --show-current`, `git rev-parse HEAD`, and
   `git status --short`.
3. Preserve all existing user changes. Never assume an untracked file is
   disposable.
4. Read, in this order:
   - `AGENTS.md`;
   - `VISION.md`;
   - `PRODUCT_OPERATING_RULES.md`;
   - `ROADMAP.md`;
   - `ROADMAP_EXECUTION.md`;
   - `AUTONOMOUS_WORK_QUEUE.md`;
   - `docs/strategy/SELLABLE_PRODUCT_STRATEGY_2026-08-30.md`;
   - `WORKFLOW_SIGNAL_TO_PLACEMENT.md`;
   - `RESEARCH_WORKBENCH.md`;
   - `DECISIONS.md`;
   - `CURRENT_STATE.md`.
5. Read `JOB_INTAKE.md` for mail/lead work.
6. Read `agents/WORKFORCE.md`, `agents/shared-constitution.md`, and the
   affected role file for agent/workforce work.
7. Inspect the actual route, data layer, migration, API, and live state before
   accepting a document's claim that something is missing.
8. Identify the active roadmap phase and its exit gate.
9. If asked to continue independently, select the first eligible `READY` item
   from `AUTONOMOUS_WORK_QUEUE.md`; do not invent a new backlog.

If the branch or directory does not contain the current Job Intake, Hunter,
Workforce, Approvals, packages, and migrations through `027`, stop and report
the mismatch before editing.

## 4. Classify the request before acting

### Research, explain, review, or report

Inspect and provide an evidence-backed answer. Do not mutate code, database,
deployment, external systems, or product state unless the user also asks for a
change.

### Diagnose

Find and explain the cause. Do not implement the fix unless the request
includes fixing it.

### Change or build

Implement the smallest coherent change that satisfies the current phase,
verify it in proportion to risk, and update source-of-truth documentation when
reality or strategy changed.

### Commercial work

Software agents may prepare research, briefs, drafts, and structured records.
They do not send messages, submit forms to buyers, register Triangle as a
supplier, share worker data, accept legal terms, quote binding prices, or
change a commercial commitment without a specific human instruction and any
required action-time confirmation.

## 5. The commercial state-transition test

Every proposed feature must answer all of these before implementation:

| Question | Required answer |
|---|---|
| Operator | Who uses it in real work? |
| Business object | Which real record does it affect? |
| Before state | What is true before the action? |
| After state | What becomes newly true? |
| Evidence | What proves the new state is real? |
| Next action | What commercial/delivery action follows? |
| Metric | Which roadmap gate or workflow metric moves? |
| Risk | What could create legal, privacy, financial, permission, or truth errors? |

Reject or defer a feature when its answer is only:

- “the dashboard looks better”;
- “the agent did more tasks”;
- “we collected more data”;
- “this will scale to a future generic product”;
- “a competitor has it”;
- “the architecture is cleaner” without current pain or risk reduction.

## 6. Priority order

When choices conflict, use this order:

1. truth, safety, authorization, privacy, and data integrity;
2. a blocker to a real commercial or delivery action;
3. supply accuracy and contract/package readiness;
4. buyer/procurement/contract qualification;
5. external-action and follow-up closure;
6. mobilization, delivery, invoice, payment, and margin truth;
7. workflow reliability and operator time saved;
8. evidence-backed agent assistance;
9. tenant safety and adoption risk proven by a design partner;
10. multi-user coordination proven necessary by use;
11. polish, speculative scale, generic abstraction, and novelty.

The active `ROADMAP_EXECUTION.md` gate overrides a lower item even when the
lower item is attractive or easy.

## 7. Current phase restrictions

Phase 0 is commercial activation.

Until its gate is met:

- do not build the Collaboration Field;
- do not refactor Triangle into a generic hybrid work OS;
- do not add agent roles because they are exciting;
- do not build agent-performance or provider-comparison dashboards;
- do not add autonomous sending;
- do not add new signal collectors unless the current channels are exhausted
  and the package/buyer route is already truthful;
- do not replace current architecture with a workflow/orchestration platform;
- do not polish navigation while real sends and follow-ups remain at zero.

Allowed work is a verified bug fix or friction removal directly blocking the
current commercial actions, plus the narrow tenant-identity, permission, and
onboarding safety work listed as `READY` in `AUTONOMOUS_WORK_QUEUE.md`. Customer
research and pilot preparation are allowed; contacting a prospect is not.

## 8. Product vocabulary and truth rules

Use the definitions in `PRODUCT_OPERATING_RULES.md`.

Never collapse these distinctions:

- signal versus discovered/verified project;
- project owner versus labor buyer;
- contact versus buyer authority;
- package hypothesis versus sellable package;
- lead versus qualified requirement;
- drafted versus reviewed versus actually sent;
- matched versus submitted versus client-accepted versus mobilized;
- signed framework versus job order versus delivered work versus paid invoice;
- AI confidence versus evidence;
- database status versus real-world event.

Do not create an “opportunity” merely because a score is high. Do not report
`placed` as revenue. Do not call generated output delivered.

## 9. AI write boundary

AI-generated information follows this path:

```text
source/raw input
-> extraction/research
-> evidence-backed suggestion or finding
-> human review
-> deterministic final write
-> real action
-> outcome event
```

Agents may not directly write final contractor-chain, buyer, worker, legal,
commercial, or outcome truth unless the domain workflow explicitly defines a
safe deterministic ingestion path for raw material.

### AI is appropriate for

- classifying and extracting raw input;
- researching public sources;
- identifying likely unknowns and next research questions;
- drafting messages, briefs, packages, and proposals;
- ranking candidates or accounts with explained reasons;
- summarizing timelines and outcomes;
- proposing playbook improvements backed by outcome evidence.

### Deterministic code/human authority is required for

- authentication, authorization, RLS, scopes, and credential use;
- deduplication and idempotency;
- status transitions and audit;
- eligibility, document expiry, and required-field checks;
- rate, landed-cost, invoice, payment, and margin calculations;
- legal/compliance conclusions and contractual commitments;
- external sends, submissions, registrations, and sharing personal data;
- accepting agent proposals into canonical truth.

## 10. External communication rules

The standing rule is manual external action.

- Nothing in Triangle sends email automatically.
- “I sent this” records a human action; it is not a send endpoint.
- Preserve the AI draft and final human-edited version separately.
- Record recipient, sender, time, channel, follow-up, response, and outcome.
- Do not make the user believe a draft or generated packet reached anyone.
- Prefer anonymized capability material for an unsolicited first approach when
  appropriate.
- Named CVs, certificates, and personal data require an appropriate recipient,
  purpose, and human decision.
- No agent may send, publish, delete, archive, accept terms, register a
  supplier, or make a binding claim without explicit authority.

Any proposal to automate external sending requires a new decision in
`DECISIONS.md`, legal/privacy review, deliverability controls, recipient and
rate limits, suppression/unsubscribe handling where applicable, approval
design, audit, rollback/kill switch, and proven manual conversion.

## 11. Runtime agent design rules

Hire one role only when a repeated workload exists and the prior roles earn
their review cost.

Every runtime role requires:

1. a durable `agent_instances` identity;
2. one canonical role file in `agents/`;
3. the shared constitution;
4. minimum machine scopes;
5. exact inputs and outputs;
6. stable idempotency keys;
7. evidence/provenance requirements;
8. explicit forbidden actions;
9. failure and refusal behavior;
10. a human review/approval path;
11. quality and commercial-impact measures;
12. a retirement/credential-revocation path.

Provider/model changes must not split identity, role history, accepted/rejected
work, or outcomes.

Measure runtime agents by:

- correctness and evidence quality;
- accepted findings/actions;
- human time saved;
- qualified conversations or delivery outcomes influenced;
- error/hallucination rate;
- review burden;
- cost per useful outcome.

Do not optimize messages processed, searches performed, task count, tokens, or
activity without a downstream result.

## 12. Research rules

For current-market, product, legal, regulatory, standards, pricing, provider,
or competitive claims:

- browse current primary sources;
- date the research;
- link directly to supporting pages;
- distinguish source fact from Triangle inference;
- prefer official product documentation, filings, government guidance, and
  original reports;
- do not treat vendor marketing as proof of profitability or customer demand;
- do not copy competitor architecture merely because it exists.

For project/buyer research:

- start with a concrete source;
- find the contractor chain and real buyer/procurement route;
- record the quoted evidence and URL;
- keep facts, inferences, and unknowns separate;
- do not crawl LinkedIn, bypass access controls, or mass-extract personal data;
- fewer high-quality targets beat a large unqualified list.

Research is incomplete without a recommended next human action.

## 13. Architecture rules

### Preserve the current system boundary

```text
external bots/connectors = labor and transport
Triangle/Supabase        = canonical business truth
HTTP/domain APIs         = scoped contract
humans                   = consequential authority
```

### Do not rewrite for fashion

The current Next.js + Supabase architecture is sufficient for Phase 0 and most
of Phase 1. A new queue, workflow runtime, event bus, vector database,
microservice, agent framework, or generic abstraction requires a measured
failure or roadmap-gated need.

### Durable workflows

Consider durable execution when work truly outlives requests, needs independent
step retries, waits for approval, or must resume after crash/deploy.

If introduced:

- Supabase remains canonical domain truth;
- workflow state orchestrates commands; it does not become a competing CRM;
- every step is idempotent;
- permanent and transient failures are distinct;
- approval resumes are authenticated and audited;
- inputs/outputs contain no unnecessary personal data or secrets;
- cancel/retry/replay behavior is tested;
- completed side effects are not repeated on replay.

### Integrations

Prefer purpose-built providers for commodity transport/data. Wrap each with:

- organization and actor context;
- minimum scopes;
- stable external IDs;
- idempotent ingest/command boundary;
- source and timestamp;
- rate/error handling;
- audit record;
- a safe degraded/manual path.

## 14. Database and Supabase checklist

Before any schema change:

1. inspect all existing migrations and current live schema behavior;
2. identify whether the table uses `org_id` or `organization_id`—both exist;
3. make the migration idempotent;
4. for pre-existing tables, use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`;
5. add indexes for actual query/state-machine paths;
6. add or verify RLS for every tenant-owned table;
7. verify service-client use for server-side membership reads;
8. normalize AI enum/value drift before insertion;
9. preserve audit/history; never drop/recreate to solve an additive change;
10. execute `NOTIFY pgrst, 'reload schema';` after column or enum changes;
11. test unauthorized, wrong-org, valid-org, retry, and duplicate behavior;
12. update data types, APIs, UI, documentation, and tests together.

Known critical pitfalls remain in `AGENTS.md`; read them rather than
reconstructing them.

## 15. Next.js and implementation checklist

Before writing Next.js code:

- read the relevant current guide in `node_modules/next/dist/docs/`;
- use `src/proxy.ts`, not legacy middleware assumptions;
- preserve Server/Client Component boundaries;
- validate every external input with Zod or an equivalent explicit schema;
- use service-side authorization in every protected route;
- do not rely on UI hiding as authorization;
- return actionable errors without leaking secrets or personal data;
- avoid sample/fake data in production routes;
- preserve accessibility and responsive behavior;
- keep components and domain functions focused;
- follow existing project conventions before introducing a new pattern.

## 16. Definition of done

A product change is done only when all relevant items are true:

- it advances a named real state transition;
- it uses real data or a clearly isolated test fixture;
- truth/evidence/unknowns are represented honestly;
- organization authorization and RLS are correct;
- AI and human authority boundaries are preserved;
- duplicate/retry behavior is safe;
- empty, error, stale, and unauthorized states work;
- the operator can see the next action;
- TypeScript, lint, focused tests, and relevant end-to-end checks pass;
- migrations are safe and schema cache is reloaded when applicable;
- no external message, upload, deployment, merge, or destructive operation
  occurred without authorization;
- `CURRENT_STATE.md`, `ROADMAP_EXECUTION.md`, or `DECISIONS.md` is updated
  when reality, execution order, or strategy changed.

“Compiles” is not a business definition of done. “Generated” is not “sent.”
“Accepted” is not “commercially activated.”

## 17. Verification by risk

### Documentation/research only

- validate links and claims;
- cross-check against code/live state;
- check terminology and roadmap consistency;
- review the diff.

### UI-only change

- TypeScript and lint;
- logged-in browser verification;
- keyboard/accessibility and responsive states;
- real empty/error/loading data.

### API/data change

- focused tests plus unauthorized/wrong-org cases;
- live-safe read/write in a controlled non-destructive record when authorized;
- idempotent replay;
- database and schema-cache verification.

### Commercial, privacy, or compliance change

- human owner;
- explicit data and authority boundaries;
- legal/compliance review where relevant;
- audit and rollback/kill path;
- no invented compliance guarantees.

## 18. Git, branch, and deployment discipline

- Work in the exact local project the user placed in scope.
- The active branch at adoption is
  `wip-jules-2026-05-03T18-13-13-596Z`, not `main`.
- Do not switch, merge, rebase, push, deploy, or change the default branch
  unless the user requests it.
- Never destroy or overwrite unrelated user changes.
- Keep edits coherent and reviewable.
- Do not use destructive Git recovery commands without explicit authorization.
- Before reporting completion, show the final status and diff summary.

## 19. Documentation ownership

Update the right source, not every file:

| Change | Source to update |
|---|---|
| Product category or long-term phase | `VISION.md`, `ROADMAP.md`, `DECISIONS.md` |
| Current ordered work/gate | `ROADMAP_EXECUTION.md` |
| Implemented/live reality | `CURRENT_STATE.md` |
| Product vocabulary/rules | `PRODUCT_OPERATING_RULES.md` |
| Runtime role behavior | `agents/<role>.md` |
| Runtime universal policy | `agents/shared-constitution.md` |
| Coding/agent process or pitfall | `AGENTS.md` or this file |
| Job Intake implementation | `JOB_INTAKE.md` |
| Research workbench contract | `RESEARCH_WORKBENCH.md` |

Do not let chat become the only place a decision exists.

## 20. Required completion report

At the end of a change, report:

- outcome and roadmap phase/gate affected;
- branch and directory used;
- files changed;
- migrations/data changes;
- tests and verification performed;
- real operator workflow;
- permission/privacy/commercial implications;
- known limitations;
- manual next action;
- anything still blocking a real send, proposal, order, mobilization, or
  payment.

If no software was changed, say so explicitly and identify which source-of-
truth documents were updated.

## 21. Autonomous continuation protocol

When the user authorizes independent product work:

1. pick the first `READY` queue item whose evidence gate is already satisfied;
2. state the item ID and intended state transition;
3. mark it `IN_PROGRESS` and keep the slice reviewable;
4. inspect before editing and preserve current patterns unless evidence
   requires a change;
5. implement code, migration files, local tests, and documentation inside the
   authorized repository;
6. mark `DONE` only after its acceptance criteria and verification pass;
7. continue to the next `READY` item when it is still within the same user
   request and does not cross an external/production authority boundary;
8. stop on `BLOCKED_EXTERNAL` or `GATED` and report the precise missing
   evidence rather than filling it with sample data.

Independent work may include read-only research, local code/document changes,
tests, and unapplied migration files. It does not include production deploys,
live migration application, sends/submissions, purchases, secret changes,
legal acceptance, worker/customer disclosure, merges, or pushes without the
required human authority.

## 22. Stop conditions

Stop and ask for direction when:

- the requested branch/directory is ambiguous and choosing could edit the wrong
  product;
- a user decision changes product category, legal model, target market, or
  external authority;
- the action would send, submit, register, sign, pay, disclose personal data,
  deploy, merge, or delete outside the clearly requested scope;
- existing uncommitted changes overlap and cannot be safely preserved;
- live truth contradicts the requested destructive transition;
- a legal/compliance conclusion is required from facts that need a qualified
  professional.

Do not stop merely because the task is difficult. Exhaust safe read-only
inspection and the current architecture first.
