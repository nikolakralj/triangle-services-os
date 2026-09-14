# Current state

Updated 10 September 2026 by a documentation and targeted source review. This is the
current summary; detailed earlier sessions are preserved in the
[history archive](docs/archive/2026-09-08/CURRENT_STATE.md).

## Evidence boundary

| Evidence | Observed state |
| --- | --- |
| Checkout | `C:\Users\nikol\Projects\triangle-services-os` |
| Branch | `wip-jules-2026-05-03T18-13-13-596Z` |
| Reviewed local HEAD | `c7b4174a2ad9d0e7435d967ac32b0bf752234dbb` |
| Initial GitHub snapshot | `f63afb51e3f48d3384e5c8047bea49e89d0d7da6`; September 8 review reached c8795b9; September 10 inspected five subsequent commits |
| Existing product work | Earlier uncommitted report protection is now in committed history; this pass changes documentation only |
| Repository schema | Migrations through `041_finding_contract.sql` |
| Production version/schema | Not freshly verified in this review |
| Live commercial counts | Not freshly queried; earlier snapshots are dated evidence only |
| Verification in this pass | Source/history review and documentation checks; no new signed-in business acceptance test |

Do not infer deployment or applied migrations from committed source. Earlier
claims of passing builds or live smoke tests describe their original snapshots.

## Management direction

Triangle is a human-led, AI-assisted contract-to-crew operating system, as specified by the latest supplied AGENTS instructions.
Agents should own permitted jobs and continuation; humans decide consequences,
resolve genuine exceptions and provide real-world evidence. The 8 September
clarification changes ambition, not external-action or final-record authority.
External software-customer discovery remains paused under the 4 September decision.

Supply includes individual people and partner firms with recently human-confirmed
capacity. A partner firm is not evidence of each worker's certificates, right to
work, consent, availability for a specific order or mobilization clearance.

## Implementation present

| Area | Source implementation | Limit of the evidence |
| --- | --- | --- |
| Intake | Mail ingestion, classification/scoring, leads, draft replies and contact logging | Extraction uses a model; paid/business conversion is not established by ingestion |
| Research | Project/company evidence, two proposal stores, human review, case history | Accepted research is not a buyer-confirmed requirement |
| Today screen | Next move, Ask, returned findings, funnel and refusal ledger; former cockpit and Overview removed | Ask still claims the next Scout job; action-content and acknowledgment persistence defects remain |
| Scout | Company qualification, contact reachability, open research; assignment constraints default to in-app | Specific-job execution, crash recovery, measured cost and uniform instructions are not fully proven |
| Talent | CV storage/extraction, candidate profiles, history, generated CVs, talent questions | Upload auto-acceptance, identity merging, readiness and access boundaries need correction |
| Partner firms | `supply_partners`, create/confirm/status UI/API, capacity age checks, Scout/Hanna context | Source exists; role/actor and precise capacity-readiness checks remain incomplete |
| Commercial | Requirements, buyer routes and commercial actions | Source exists; historic zero counts are not proof of today's live state |
| Delivery | Orders, reservations, mobilization, timesheets, invoices, payments and cost summaries | Implementation is not verified real delivery or margin |
| Governance | Organization scoping, scoped badges, proposal review, run/refusal logs and budget settings | Legacy actor confusion, role gaps and incomplete cost enforcement remain |

## Changes credited since the 7 September audit

- CV buffer-copy repair and rejection of empty uploads exist in source.
  Damaged originals still need recovery from an authorized source; code cannot
  reconstruct missing bytes.
- CV history and split extraction address lost projects and oversized responses.
- Inbound lead matching now feeds the next-move selector.
- Migration `038` and contact logging support a lead/contact without a project.
- Unknown Scout work receives an explicit refusal; open research gained a handler.
- Commit `7b77157` fixes discarded assignment constraints in the cockpit path.
- Commit `803a4d2` adds supply/reachability rules to the in-app Scout prompt.
- Commit `c8795b9` adds partner-firm capacity; the individual bench alone is no
  longer the intended ceiling on Triangle's supply.

These are source observations. Commit descriptions also report smoke tests;
this review did not independently rerun those production/database tests.

## Changes checked on 10 September

Five commits after the original review replace the cockpit with Today, add the
three-state finding contract in migration 041, repair report parsing, route
Hanna questions directly, and consolidate Overview into Today. The old hardcoded
count fallbacks and missing note input are gone. Count errors still become zero.
See the [source update](docs/product/REVIEW_UPDATE_2026-09-10.md) for remaining
and new defects. Commit-reported signed-in checks were not rerun here.

## Remaining priorities

The [critical review](docs/product/CRITICAL_REVIEW_2026-09-08.md) provides
source evidence and acceptance criteria. Highest priorities are actor/role
permissions, truthful availability and final-content recording, binding Run Now
to its assignment, real cost enforcement, CV provenance and meaningful tests.
Review recommendations do not change phase gates or authorize implementation.

## Last documented commercial snapshot

The 8 September block in ROADMAP_EXECUTION recorded 34 leads, 18 projects,
174 companies, two candidate workers, and zero buyer routes, commercial actions,
orders and invoices. It predates the latest partner-firm change and was not
requeried here. Candidate skill overlap is not confirmed deployable capacity;
zero app records do not establish that Triangle has no offline business.

Phase 0 commercial proof has not been established by this review. Do not label
it complete because a cockpit, migration, report or partner form was built.
