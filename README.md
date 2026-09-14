# Triangle Services OS

Triangle is an human-led, AI-assisted contract-to-crew operating
system for cross-border technical staffing and subcontracting. It connects
verified demand with confirmed individual and partner-firm capacity, then
supports qualification, human-approved action, orders, delivery and payment.

The target operating model is broader than the currently verified implementation.
Research output, completed assignments and generated documents are not commercial
outcomes. External communication and consequential decisions remain human-controlled.

## Start here

- [Documentation map](docs/README.md): which file answers which question.
- [Current state](CURRENT_STATE.md): source snapshot, implementation and known gaps.
- [Critical review, 8 September](docs/product/CRITICAL_REVIEW_2026-09-08.md): dated findings and acceptance criteria; read the [10 September update](docs/product/REVIEW_UPDATE_2026-09-10.md) first.
- [Vision](VISION.md) and [operating rules](PRODUCT_OPERATING_RULES.md): product direction and authority.
- [Execution plan](ROADMAP_EXECUTION.md) and [work queue](AUTONOMOUS_WORK_QUEUE.md): active work and evidence gates.
- [Agent instructions](AGENTS.md): mandatory starting point for development.

## Local development

Use this checkout: `C:\Users\nikol\Projects\triangle-services-os`.
Inspect the current branch and working tree before editing. The reviewed branch
is `wip-jules-2026-05-03T18-13-13-596Z`; do not substitute the old main/master snapshot.

```sh
npm install
npm run dev
```

Configure local environment values using `.env.example` and the
[deployment runbook](DEPLOY.md). Never paste or commit secrets. Do not run old
seed instructions against a live organization. Repository migrations extend
through `041_finding_contract.sql` in the reviewed snapshot; applied production
schema must be checked separately.

The stack is Next.js 16, React 19, TypeScript, Supabase and server-side AI.
Read relevant installed Next.js documentation before implementation.

## Checks

```sh
npm run lint
npm run check:tenant-identity
npm run build
npm run test:e2e
```

These commands have different purposes. Existing E2E tests can skip authenticated
flows and still target removed pages; a green run is not end-to-end acceptance.
See the critical review before relying on them as a release gate.

## Documentation history

The previous CRM-oriented README and old session handoffs are preserved in
[the archive](docs/archive/README.md). They are historical evidence, not setup
instructions or the current feature list.
