# The workforce model

Nikola's framing, adopted as the product vision: **agents are employees,
Triangle is the company, the humans are the board.** This file maps the
metaphor onto what the system actually does, so every future agent (and every
future AI working on this repo) builds toward the same picture.

## The metaphor is already the architecture

| Company concept | What it is in Triangle |
|---|---|
| Employee | `agent_instances` row — the durable identity, provider-independent |
| Security badge | `machine_credentials` — scoped, revocable, hashed. **The badge is NOT the employee**: rotating a leaked token must never split the employee's history (it nearly did on 27 Aug — that incident is why this distinction exists) |
| Brain / workstation | `agent_provider_bindings` — Grok today, anything tomorrow, swapped without touching identity |
| Job description | scopes on the credential (`job_intake.ingest` = "you do intake, nothing else") |
| Role handbook | `agents/<name>.md` in this repo |
| Company policy | `agents/shared-constitution.md` |
| Assignment / mission | `agent_assignments` — durable objective with priority, deadline, constraints, and attached business objects (workers, projects, jobs) as context |
| Quick note from the boss | `agent_tasks` — lightweight messages, fetched each run |
| Reporting back | `POST /api/agent/inbox` + the Instructions log |
| Timesheet / activity | `agent_runs` feed |
| Training and experience | house rules, reply style, accepted/rejected leads, notes — **in the database** |
| Manager sign-off | approval gates: suggestions queue, drafts that never auto-send |
| Hiring | create the `agent_instance` + provider binding + badge + role file |
| Firing | retire the instance + revoke its badge; history stays |
| Board members | `organization_members` roles (admin/partner) — Nikola and Ralph equal |

## The most important rule: the company remembers, not the worker

A human employee walks out with their experience. Here it is the opposite —
**all experience lives in Triangle**, never in the agent:

- what a good lead looks like → house rules
- how we write to recruiters → reply style
- what worked and what didn't → accepted/rejected leads, run history
- who our people are → workers, certificates, availability

So a "new hire" is senior on day one: point a fresh agent at the same
endpoints and it inherits everything. And when a better model appears (Grok →
Claude → local), the swap loses nothing, because the worker never owned the
memory. This is deliberate. Do not move learning into bot-side memory.

## The interface, in stages

**Now (live):** `/agents` — roster, instruction queue, activity feed.
`/job-intake` — the first employee's output, scored and reviewable.

**Next:** a personnel file per agent — its role file rendered from this repo,
its KPIs from `agent_runs` (leads found, acceptance rate, errors), its open
assignments. Plus a **Today** screen: what the workforce did overnight, what
awaits approval, what is blocked — the CEO's morning briefing.

**Later:** a unified approvals desk (one queue across research suggestions,
drafts, and any future consequential action), and per-agent cost tracking in
`agent_runs` so the "payroll" is visible.

## The central work object is the Assignment

Free-text instructions were the v0. The real unit of work is an assignment:
a title, an objective, a priority, a deadline, constraints, and — crucially —
**attached business objects as context**. "Find work for THESE four PCS7
engineers" attaches the four worker records; "find people for THIS package"
attaches the package. That one object carries both directions of the
business, demand-first and supply-first, with the same machinery.

## How an employee learns (four layers, all in Triangle)

1. **Company facts** — the domain tables (workers, jobs, projects, outcomes).
2. **Role playbook** — versioned instructions in `agents/*.md`.
3. **Outcome history** — accepted/rejected findings, replies, placements, runs.
4. **Lessons** — future: the system proposes a playbook change with evidence
   ("German system integrators converted 3.2x better for PCS7"), a human
   approves it, the playbook version bumps. An agent never silently rewrites
   its own instructions.

Swap the provider and all four layers survive. The company learned, not the model.

## The second employee is mostly hired already

The planned Scout ("find projects where our available electricians fit,
search Europe, flag tenders that need a crew of 10") is ~80% built
server-side: worker availability and certificates exist, the matching engine
exists, the research/suggestion queue exists. Hiring Scout = one credential +
`agents/scout.md` (already drafted) + a routine. No new architecture.

## Hire like a real company

One warning the metaphor carries well: every employee costs payroll (seats,
runs) and management attention (reviewing their output). Do not staff up
because it is exciting. Hire when the workload demands it, one role at a
time, and only after the previous hire is reliable. Bob first. Scout second.
Nothing third until both earn their keep.

## Selling it one day

Every table is `org_id`-scoped with RLS — multi-tenancy was built in from
day one, so "sell it to other agencies" is onboarding + billing work, not a
rewrite. But the discipline holds: Triangle must run its own agency on this
daily before it is a product. The playbook being lived is the product.
