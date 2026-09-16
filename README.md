# Triangle Services OS

Triangle is a human-led, AI-assisted contract-to-crew operating system for
cross-border technical staffing and subcontracting. It connects verified demand
with confirmed individual and partner-firm capacity, then supports
qualification, human-approved action, orders, delivery and payment.

The target operating model is broader than the verified implementation.
Research output, completed assignments and generated documents are not commercial
outcomes. External communication and consequential decisions remain human-controlled.

## Where to find what

One file answers each question. Update that file and link to it from others.

| Question | File |
| --- | --- |
| What happens next? | [ROADMAP_EXECUTION](ROADMAP_EXECUTION.md) — the one ordered list |
| What exists and is live? | [CURRENT_STATE](CURRENT_STATE.md) |
| Why was a direction chosen? | [DECISIONS](DECISIONS.md) |
| What are we building? | [VISION](VISION.md) |
| What will the product look like? | [Operating shell design](docs/design/PRODUCT_SHELL_2026-09-16.html) — menu, Today, Team, how people and employees communicate |
| What counts as truth, success or an authorized action? | [PRODUCT_OPERATING_RULES](PRODUCT_OPERATING_RULES.md) |
| What is the long-term sequence? | [ROADMAP](ROADMAP.md) |
| How should a coding agent work? | [AGENTS](AGENTS.md), [SOFTWARE_AGENT_INSTRUCTIONS](SOFTWARE_AGENT_INSTRUCTIONS.md), [CLAUDE](CLAUDE.md) |
| How do the AI employees work? | [Workforce model](agents/WORKFORCE.md), [mission protocol](agents/missions.md), [constitution](agents/shared-constitution.md), and the roles of [Scout](agents/scout.md), [Hanna](agents/hanna.md) and [Bob](agents/bob.md) |

The files under `agents/` keep their paths: Triangle serves them to the
employees' bots at runtime.

### Design — where the product is going

- [Operating shell, 16 September](docs/design/PRODUCT_SHELL_2026-09-16.html): three menu items, Today as one inbox, Team in Settings, all delegated work as a task on a case. The decision is "The operating shell" in DECISIONS.

### Reference — how a module works

- [Signal to placement](docs/reference/WORKFLOW_SIGNAL_TO_PLACEMENT.md): how a case reaches paid delivery.
- [Job Intake](docs/reference/JOB_INTAKE.md): mail ingestion, extraction and replies.
- [Research Workbench](docs/reference/RESEARCH_WORKBENCH.md): sourced proposals and human acceptance.
- [Tenant onboarding readiness](docs/reference/TENANT_ONBOARDING_READINESS.md): record-presence checks, not commercial clearance.

### Operations — how to run it

- [Deploy and release](docs/operations/DEPLOY.md): push, check the preview, promote; environment variables, migrations, badges, bots.
- [Login email](docs/operations/SMTP_SETUP.md): SMTP for sign-in links.
- [Development automation](docs/operations/DEVELOPMENT_AUTOMATION.md): limits of the legacy named-agent shell scripts.

### Reviews — dated evidence

- [Critical review, 8 September](docs/reviews/CRITICAL_REVIEW_2026-09-08.md) and its [10 September update](docs/reviews/REVIEW_UPDATE_2026-09-10.md): source findings and acceptance criteria; recommendations, not authorization to implement.
- [Workforce architecture study, 13 September](docs/reviews/WORKFORCE_ARCHITECTURE_2026-09-13.html): what the Grok Bot platform supports and the chosen architecture.

### Archive — history, not instructions

[docs/archive](docs/archive/README.md) keeps earlier versions of these files, the
old work queue, the paused customer-research strategy and older audits.

## When documents disagree

The latest explicit management direction governs intent and authority. Use
ROADMAP_EXECUTION for active scope, PRODUCT_OPERATING_RULES for truth and
approval boundaries, and CURRENT_STATE for implementation evidence. A historical
audit or commit message cannot prove present live state; code that contradicts
policy is a defect, not a permission change.

Source code, automated checks, signed-in checks, production deployment, applied
schema and commercial use are separate kinds of evidence. Give each a date and a
commit or environment, and never turn a dated count into an undated fact.

## Local development

Use this checkout: `C:\Users\nikol\Projects\triangle-services-os`, branch
`main` (one project, one branch — see `SOFTWARE_AGENT_INSTRUCTIONS.md` §18).
Inspect the branch and working tree before editing.

```sh
npm install
npm run dev
```

Configure local values from `.env.example` and the
[deploy guide](docs/operations/DEPLOY.md). Never paste or commit secrets, and do
not run old seed instructions against a live organization. Migrations run
through `048_drafts_keep_what_triangle_wrote.sql`; local development and
production share one database, so a migration is applied only with the CEO's
approval.

The stack is Next.js 16, React 19, TypeScript, Supabase and server-side AI. Read
the installed Next.js documentation before implementation.

## Checks

```sh
npm run lint
npm run check:tenant-identity
npm run build
npm run test:e2e
```

These have different purposes. The E2E suite skips authenticated flows, so a
green run is not end-to-end acceptance; see the critical review before relying on
it as a release gate.
