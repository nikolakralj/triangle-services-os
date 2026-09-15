# Current state

Updated 14 September 2026. This week's development comes first; the 10 September
source review follows it. Earlier sessions are preserved in the
[history archive](docs/archive/2026-09-08/CURRENT_STATE.md).

## Evidence boundary

| Evidence | Observed state |
| --- | --- |
| Checkout | `C:\Users\nikol\Projects\triangle-services-os` |
| Branch | `wip-jules-2026-05-03T18-13-13-596Z` |
| Last code commit | `ad72085`, 14 September; the 10 September review read `c7b4174` |
| Initial GitHub snapshot | `f63afb51e3f48d3384e5c8047bea49e89d0d7da6`; September 8 review reached c8795b9; September 10 inspected five subsequent commits |
| Existing product work | Earlier uncommitted report protection is now in committed history; this pass changes documentation only |
| Repository schema | Migrations through `047_assignment_delegation.sql`; 044–047 applied to the live database 11–14 September |
| Production version | `ad72085`, confirmed through `/api/version` on 14 September |
| Live commercial counts | Not freshly queried; earlier snapshots are dated evidence only |
| Verification | Per change, listed with each change below; the 10 September review itself reran no signed-in business test |

Do not infer deployment or applied migrations from committed source. Earlier
claims of passing builds or live smoke tests describe their original snapshots.

## This week — 10 to 14 September

Delegated work is now a **mission**: one objective, every instruction a step
inside it. Employees can work missions on their own Grok bots, with Triangle as
the record they read from and write to.

| Change | Commit | Checked | Limit |
| --- | --- | --- | --- |
| Missions: one objective, instructions as steps, state derived from steps | `db76c88` | Signed-in checks, 10 September | — |
| Finish line and plan per mission, counted from records (migration 044) | `745e903` | Austria mission reached its finish line from one instruction, 12 September | Counts companies and doors, not deals |
| Mission memory: the CEO's decisions kept with exact quotes (045) | `32b53c6` | Decision checks 18/18 | A decision binds one mission |
| Missions on an employee's own bot, woken by webhook; badge-only mission API | `d5c679b` | Scout's Austria mission, 12 September; Hanna switched 14 September | A wake-up starts a background run, not the chat |
| House rules per employee, versioned, carried into every run (046) | `3c3ebe2` | A worker obeyed a standing rule unprompted, 9/9 | Bot payload not yet checked with a test badge |
| Requests between employees through Triangle; the answer wakes the asker (047) | `6aa4968` | First real hand-off, 14 September: Hanna asked Scout for buyers and Scout answered her | Full chain check needs two test badges |
| Messaging policy per employee: approval or forbidden for every kind of message | `6aa4968` | Carried in every payload | No sending path, so "auto" cannot take effect yet |
| Fixes: finish-line under-count; reply authors, Ask pool label, placeholder refusal | `0a9ee6c`, `ad72085` | Checked on production, 14 September | Placeholder refusal not yet triggered by a real filing |

Scout (demand) and Hanna (access to people) work missions on their Grok bots.
Bob still runs the mail routine and takes mission work only once his badge has a
mission scope. The Today recommended card can pair one person's advice with
another person's action button, and two Austrian doors (STRABAG, ANDRITZ) cite
pages that do not show their channel.

Phase 0 commercial proof is still not established: no human sends, buyer
conversations, packets or supplier routes are recorded.

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
See the [source update](docs/reviews/REVIEW_UPDATE_2026-09-10.md) for remaining
and new defects. Commit-reported signed-in checks were not rerun here.

## Remaining priorities

The ordered development list lives in
[ROADMAP_EXECUTION](ROADMAP_EXECUTION.md#development--now). The [critical review](docs/reviews/CRITICAL_REVIEW_2026-09-08.md) provides
source evidence and acceptance criteria. Highest priorities are actor/role
permissions, truthful availability and final-content recording, binding Run Now
to its assignment, real cost enforcement, CV provenance and meaningful tests.
Review recommendations do not change phase gates or authorize implementation.

## Last documented commercial snapshot

The 8 September block in the
[archived execution plan](docs/archive/2026-09-15/ROADMAP_EXECUTION.md) recorded 34 leads, 18 projects,
174 companies, two candidate workers, and zero buyer routes, commercial actions,
orders and invoices. It predates the latest partner-firm change and was not
requeried here. Candidate skill overlap is not confirmed deployable capacity;
zero app records do not establish that Triangle has no offline business.

Phase 0 commercial proof has not been established by this review. Do not label
it complete because a cockpit, migration, report or partner form was built.
