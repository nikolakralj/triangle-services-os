# Triangle workforce model

**Updated:** 2 September 2026

This file explains how runtime business agents fit the actual product. Product
and coding agents must also follow `SOFTWARE_AGENT_INSTRUCTIONS.md`.

## The model

Humans manage Triangle. Agents perform narrow, reviewable jobs. Triangle owns
the truth, permissions, playbooks, assignments, evidence, approvals, outcomes,
and learning.

The AI-employee metaphor is useful for operating the company. It is not the
company's external product category and is never permission to imitate human
authority.

| Company concept | Triangle implementation |
|---|---|
| Employee identity | `agent_instances` — durable and provider-independent |
| Security badge | `machine_credentials` — scoped, revocable, hashed; never the employee identity |
| Brain/workstation | `agent_provider_bindings` — swappable provider/model |
| Job description | role key, machine scopes, and `agents/<role>.md` |
| Company policy | `agents/shared-constitution.md` |
| Assignment | `agent_assignments` with objective, constraints, priority, deadline, and attached domain context |
| Assignment conversation | `assignment_messages` |
| Living domain case | canonical domain record + linked assignments/findings/conversation |
| Quick note | `agent_tasks` |
| Work report | agent inbox result/message and `agent_runs` |
| Manager report | compact domain-case recommendation derived from the work report; worker detail remains auditable |
| Proposal | `agent_findings` or `research_suggestions` |
| Manager sign-off | human-only Approvals and domain transition |
| Experience | accepted/rejected work plus real commercial/delivery outcomes |
| Hiring | instance + role file + minimum scopes + provider binding + review path |
| Firing | retire instance + revoke credentials; preserve history |

## The one memory rule

**The company learns; the provider does not own the learning.**

Canonical knowledge remains in Triangle:

- people, skills, availability, rates, and documents;
- jobs, projects, requirements, buyers, and packages;
- house rules and role playbooks;
- messages actually sent and replies received;
- submissions, mobilization, quality, payment, and margin;
- accepted/rejected proposals and approved lessons.

Agent-side memory and chat history may help continuity, but must be rechecked
against Triangle before any important statement or action.

## Live workforce state

The database currently has three active identities:

### Bob — Inbox Coordinator

- canonical file: `agents/bob.md`;
- moves raw inbox messages into Triangle;
- does not classify, score, reply, archive, or contact anyone;
- value: reliable, idempotent transport into the shared pipeline.

### Scout — Project Researcher

- canonical file: `agents/scout.md`;
- researches public sources, contractor chains, buyer routes, and work suited
  to attached workers/packages;
- reports evidence-backed findings;
- does not contact anyone or approve its own work.

### Hanna — HR

- active `agent_instances` record exists;
- no canonical `agents/hanna.md` file exists as of this update;
- therefore the role is governance-incomplete.

Do not schedule, expand scopes, or treat Hanna as production-ready until a
management-approved role file defines inputs, outputs, evidence, forbidden
actions, privacy rules, approval path, and quality measures.

## Assignment is the work object

An assignment expresses an outcome:

- title and objective;
- priority and deadline;
- constraints;
- attached workers, project, or job;
- assigned agent;
- conversation;
- result and state.

Task-first delegation is the long-term UX direction: define the outcome and
context first, then recommend an eligible employee. Do not route a project
research task to Bob or a mailbox-ingest task to Scout.

An assignment result is not automatically a final business record. Results
and findings must enter the relevant domain review/action workflow.

When a human accepts a promising company finding, Triangle may automatically
queue the same employee to continue read-only qualification. That continuation
must be idempotent, carry the company record and expected outcome, and stop at
the human external-action boundary. The purpose is to remove page-to-page
human coordination, not to remove consequential approval.

Company qualification can run through Triangle's in-app executor when the
assignment declares `execution_mode: in_app`. The early implementation claims
work while an authenticated manager session is open. External provider polling
remains supported for older assignments, but provider chat is never the
canonical conversation or report store.

Köster and GOLDBECK are the first verified in-app cases. Their structured
reports, project proposals, assignment conversation, and provider/model/token
audit all remain in Triangle. No contact was performed.

The CEO-facing domain page is the management layer. It shows the recommendation,
commercial path, unknowns, and requested decision. Detailed worker conversation
and evidence stay under audit. A CEO question entered on the case is routed to
the current qualification assignment with its history; it must not attach to a
random older source assignment.

## Agent work lifecycle

```text
human defines outcome and attaches Triangle context
-> Triangle checks role/scopes
-> agent fetches assignment
-> agent researches/processes within role
-> agent reports evidence/result
-> human reviews consequential proposal
-> deterministic domain transition
-> human external action
-> commercial/delivery outcome
-> approved learning
```

Agents may answer follow-up messages without closing the assignment. A
completed/failed assignment can be reopened by a human follow-up and must
retain its conversation.

## Adding another AI employee

Do not add a second generic chat window. Add a narrow employee behind the same
company operating model:

1. define the repeated business outcome and manager who owns it;
2. write `agents/<role>.md` with inputs, outputs, evidence standard, tools,
   forbidden actions, refusal behavior, and quality measures;
3. create one durable `agent_instances` identity;
4. attach a swappable `agent_provider_bindings` brain and minimum-scope badge;
5. register one execution handler for the role: assignment eligibility,
   context loader, agent/tools, structured result schema, proposal writer, and
   manager-report projection;
6. run a testing/probation period on real internal-only assignments;
7. activate only after the manager can measure useful outcomes and safely
   review consequential work;
8. pause or retire the employee and revoke its badge when quality or value
   falls below the role threshold. Preserve its history.

The next runtime refactor, when a second in-app role is actually approved, is
an `AgentRuntimeRegistry` keyed by `role_key` or an explicit execution handler.
Scout's current executor is the first adapter, not a universal agent. The
registry must dispatch role-specific context and structured outputs; it must
not allow arbitrary agents to browse every table or write canonical facts.

Likely future roles, added only at their evidence gate:

- Buyer Route Specialist — maps procurement doors and sourced contacts;
- Crew Packager — matches truthful available supply to one requirement;
- Compliance Coordinator — checks document readiness and expiry, without
  making legal judgments;
- Outreach Drafting Employee — drafts from verified case facts; a human sends;
- Delivery Coordinator — monitors milestones, timesheets, exceptions, and
  margin without making commitments.

The CEO continues to use Decision Inbox and short domain manager reports. Role
queues, conversations, and technical traces belong in Workforce and Manager
audit, not on the default CEO surface.

## Hiring gate

Do not hire because a role sounds useful.

A new runtime employee is justified only when:

1. a repeated, measured workload exists;
2. the work has stable inputs and outputs;
3. a current human/agent bottleneck is identified;
4. the role can operate with narrow scopes;
5. a person can review its consequential output;
6. expected time/value exceeds provider cost and management attention;
7. Bob/Scout/current roles are reliable enough that a new role will not hide
   unresolved failures;
8. the active roadmap phase allows it.

Every hire requires:

- one role file in `agents/`;
- constitution reference;
- role key and durable identity;
- provider binding;
- minimum credential scopes;
- stable idempotency behavior;
- inputs, outputs, sources, and evidence;
- forbidden actions and refusal behavior;
- quality/commercial metrics;
- budget/schedule;
- retirement and credential-revocation plan.

No role file means no production role.

## Performance hierarchy

### Business impact

- qualified buyer/procurement conversations influenced;
- concrete requirements/RFQs originated;
- proposals/orders influenced;
- placements/mobilizations influenced;
- paid margin influenced.

### Work quality

- source and evidence accuracy;
- accepted/rejected finding rate;
- buyer-route accuracy;
- useful action rate;
- hallucination/error rate;
- human edit and review burden;
- time saved.

### Technical diagnostics

- runs, duration, retries, failures;
- provider/model and cost;
- tool usage;
- credential/scope errors.

Do not display or optimize technical activity as if it were business impact.
Outcome attribution becomes meaningful only after real outcomes exist.

## Interface progression

### Now

- Workforce roster and assignments;
- assignment conversations and result visibility;
- one Approvals queue;
- company pages as living cases with evidence, responsible AI work, outcome
  gaps, and one persistent follow-up thread;
- Job Intake, Hunter, talent, packages, and delivery records remain domain
  workspaces.

The immediate management view should emphasize real work needing action:
unreviewed demand, drafts ready for human send, follow-ups, packet delivery,
supplier routes, and blockers.

### After commercial proof

- task-first assignment and capability warnings;
- clear ownership/next action/due date;
- role/work queues;
- outcome-linked employee profiles;
- cost/quality evaluation with enough comparable work;
- approved playbook-learning loop.

### After multi-user coordination pain

Consider richer Team/Work/Decisions views or a Collaboration Field only at the
gate in `ROADMAP.md`. A spatial map is not a current need and must never
replace the contract/crew/delivery workflow.

## External product boundary

Triangle must first run its own business on this system and produce repeatable
paid outcomes. If sold externally, the likely product is a vertical
contract-to-crew OS for similar agencies.

Provider-independent workforce foundations are useful optionality. They do not
justify a generic hybrid work OS before paying non-staffing customers prove a
common problem.

## Non-negotiable runtime boundaries

- Triangle is canonical truth.
- Each credential is narrow, revocable, and tied to one role.
- Agents cannot approve their own proposals.
- Agents do not send external communication.
- Agents do not make legal, compliance, worker-status, or price commitments.
- Agents do not share personal data outside Triangle.
- Agents do not silently rewrite playbooks.
- Agents include stable source/idempotency identifiers.
- Failures and out-of-role requests are reported honestly.
- Human approval and real external action remain visible.
