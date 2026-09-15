# Tenant Onboarding Readiness

## Purpose

`/onboarding` is the smallest evidence-based setup path for a new contract
staffing, crew-supply, or specialist recruiting tenant. It does not mark setup
complete because a user clicked through a wizard. Each gate reads current
tenant-scoped records.

## Readiness gates

| Phase | Gate | Evidence |
|---|---|---|
| Workspace foundation | Approved organization identity | Name, factual profile, and exact reply sign-off |
| Workspace foundation | Accountable operator | Active admin or partner membership |
| Workspace foundation | Human approval boundary | Product invariant: pending AI suggestions, draft-only outreach, human sent recording |
| Demand intake | Connected source | Active IMAP or attributed external mail source |
| Demand intake | Qualification/reply rules | Non-empty tenant scoring rules and reply style |
| Supply truth | Usable worker | Active worker with role, country, and available/available-soon state |
| First commercial cycle | Qualified demand | Explicitly qualified job lead or project |
| First commercial cycle | Buyer route | Same project has a non-owner delivery-chain node and buyer contact |
| First commercial cycle | Sellable package | Active package with roles, crew size, and contractor-chain buyer |

The page separately reports whether the tenant can perform a safe intake, a
safe targeted draft, and a buyer-linked package workflow. The first incomplete
gate becomes the recommended action.

## Deliberate boundary

Readiness proves only that the software contains the minimum records. It does
not prove current worker availability, buyer intent, email delivery, contract
award, mobilization, invoice approval, payment, or margin. Those statuses need
dated human or external evidence in their respective workflow records.

## New-organization defaults

Migration `028_organization_defaults.sql` creates default pipeline stages and
vendor document checklist items for every new organization and backfills
existing organizations idempotently. It does not seed companies, workers,
projects, buyer contacts, packages, or completion states.
