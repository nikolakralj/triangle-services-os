# Current state

Updated 16 September 2026. This week's development comes first; the 10 September
source review follows it. Earlier sessions are preserved in the
[history archive](docs/archive/2026-09-08/CURRENT_STATE.md).

## Evidence boundary

| Evidence | Observed state |
| --- | --- |
| Checkout | `C:\Users\nikol\Projects\triangle-services-os` |
| Branch | `wip-jules-2026-05-03T18-13-13-596Z` |
| Last code commit | WIP merge 15 September: #8 DEV-003 + #9 Job Intake hide + #10 holding-chip Doors fix |
| Initial GitHub snapshot | `f63afb51e3f48d3384e5c8047bea49e89d0d7da6`; September 8 review reached c8795b9; September 10 inspected five subsequent commits |
| Existing product work | Committed; nothing from this week is left uncommitted |
| Repository schema | Migrations through `048_drafts_keep_what_triangle_wrote.sql`; 044ÃÂ¢Ãâ¬Ãâ048 applied to the live database 11ÃÂ¢Ãâ¬Ãâ15 September |
| Production version | `11397dc` (includes `f9e9685`), promoted and confirmed through `/api/version` on 15 September |
| Live commercial counts | Commercial ledger queried 15 September (below); other snapshots are dated evidence only |
| Verification | Per change, listed with each change below; the 10 September review itself reran no signed-in business test |

Do not infer deployment or applied migrations from committed source. Earlier
claims of passing builds or live smoke tests describe their original snapshots.

## This week ÃÂ¢Ãâ¬Ãâ 10 to 15 September

Delegated work is now a **mission**: one objective, every instruction a step
inside it. Employees can work missions on their own Grok bots, with Triangle as
the record they read from and write to.

| Change | Commit | Checked | Limit |
| --- | --- | --- | --- |
| Missions: one objective, instructions as steps, state derived from steps | `db76c88` | Signed-in checks, 10 September | ÃÂ¢Ãâ¬Ãâ |
| Finish line and plan per mission, counted from records (migration 044) | `745e903` | Austria mission reached its finish line from one instruction, 12 September | Counts companies and doors, not deals |
| Mission memory: the CEO's decisions kept with exact quotes (045) | `32b53c6` | Decision checks 18/18 | A decision binds one mission |
| Missions on an employee's own bot, woken by webhook; badge-only mission API | `d5c679b` | Scout's Austria mission, 12 September; Hanna switched 14 September | A wake-up starts a background run, not the chat |
| House rules per employee, versioned, carried into every run (046) | `3c3ebe2` | A worker obeyed a standing rule unprompted, 9/9 | Bot payload not yet checked with a test badge |
| Requests between employees through Triangle; the answer wakes the asker (047) | `6aa4968` | First real hand-off, 14 September: Hanna asked Scout for buyers and Scout answered her | Full chain check needs two test badges |
| Messaging policy per employee: approval or forbidden for every kind of message | `6aa4968` | Carried in every payload | No sending path, so "auto" cannot take effect yet |
| Fixes: finish-line under-count; reply authors, Ask pool label, placeholder refusal | `0a9ee6c`, `ad72085` | Checked on production, 14 September | Placeholder refusal not yet triggered by a real filing |
| Sent-message record: words editable before sending, Triangle's draft and the sent text both kept, a follow-up date on every send, due follow-ups on Today, Job Intake replies in the ledger (048) | `f9e9685` | Signed-in check 9/9 on a throwaway lead; on production 15 September, Today showing the eight overdue follow-ups | A follow-up message is recorded without its words |
| Source check at filing: a reachable phone or email must appear on a cited page Triangle reads itself; an unreadable page files as Source unchecked | `2024155` | 31/31 offline; the 38 doors on file read live: 34 matched, 3 unchecked, 1 refused (KÃÆÃÂ¶ster); Approvals label and refusal signed in, 3/3 | Checks at filing only; not yet on production; not yet exercised by a bot filing |
| Wake on assignment follow-up: a human post on a bot-owned thread calls `wakeEmployee` with `human_followup` (ids only); UI says queued, not sent; amber badge stays until the employee answers in-thread | `3058eb5` | lint, build, tenant-identity still 8 known; no signed-in check here | Hanna's Grok routine must handle the event; missing/failed wake still queues for the next inbox check; does not send and does not widen `communicationPolicy` |
| Known defects (DEV-005): forwarded intake keeps the recruiter, not the mailbox; mission recommended card matches the named person; KÃÆÃÂ¶ster door and Computer Futures lead data-fix SQL applied on live DB 15 September | `9929630` | 11/11 offline DEV-005; DEV-002 31/31; lint, production build, tenant-identity 0; no signed-in check here | Computer Futures contact and Koster rule-out applied on the shared DB |
| Tenant identity (DEV-006): CV letterhead and next-move sign-off read the approved organization profile; scanner comments cleaned | `9929630` | `check:tenant-identity` exits 0; lint and production build | Tenant-zero paper address still lives in the approved seed file |
| Research Agent project chat retired: Signal Inbox stays a list; project page has no chat; `/api/research/chat` returns 410; suggestions ? Approvals / contractor-chain accept remain | `eeb6086` | lint, production build, tenant-identity 0; GET/POST `/api/research/chat` 410 in demo mode; no signed-in check here | Nikola: open a project from Signal Inbox â no Research Agent chat; Inbox/Approvals still accept. `/api/research/run` unused in product UI. No migration |
| Scout is bot-owned: in-app OpenAI `scout-executor` claim loop hard-off; new Scout work is `execution_mode: bot` and wakes the bot (`assignment`); callers cannot force `in_app` onto Scout | `1f9cacc`, `93895cd` | lint, build, tenant-identity still 8 known; no signed-in check here | Scout's Grok routine must handle `assignment`; missed wake waits for the inbox check; older in_app Scout rows are visible in the inbox, not migrated; DEV-003 landed as Hanna /pool on WIP |
| Research Agent project chat retired: Signal Inbox stays a list; project page has no chat; `/api/research/chat` returns 410; suggestions ? Approvals / contractor-chain accept remain | `eeb6086` | lint, production build, tenant-identity 0; GET/POST `/api/research/chat` 410 in demo mode; no signed-in check here | Nikola: open a project from Signal Inbox  no Research Agent chat; Inbox/Approvals still accept. `/api/research/run` unused in product UI. No migration |
| Scout is bot-owned: in-app OpenAI `scout-executor` claim loop hard-off; new Scout work is `execution_mode: bot` and wakes the bot (`assignment`); callers cannot force `in_app` onto Scout | `1f9cacc`, `93895cd` | lint, build, tenant-identity still 8 known; no signed-in check here | Scout's Grok routine must handle `assignment`; missed wake waits for the inbox check; older in_app Scout rows are visible in the inbox, not migrated; DEV-003 left for Antigravity |
| Companies directory off the shell: sidebar and Quick add no longer offer it; `/companies` HTTP-redirects to Missions; `/companies/[id]` still opens from missions, Approvals and holdings; rows untouched | `5b913ed` | lint, production build, tenant-identity 0; `curl -sI /companies` ? 307 `/missions?notice=companies`; `/companies/[id]` still 200; no signed-in check here | The unused list workspace still exists in source; company create-from-directory is gone with the page |
| CASE-004 visibility slice: mission page chips for colleague requests, the source mission a door was first filed in, and holdings that deep-link to the record | `a843060` | 6/6 offline CASE-004 checks; lint, production build, tenant-identity 0; no signed-in check here | Still gated overall ? not budget/time limits, retries or a second inbox. Nikola: open Hanna's DACH mission and confirm Scout-sourced doors/requests show as chips |
| CASE-004 holding chips open Doors on recruiting missions: `?tab=companies#holding-{id}` switches the surface, opens the row and scrolls it; request chips scroll the worker step; source-mission chips still change page | `871a57c` | 8/8 offline CASE-004 checks; lint, production build, tenant-identity 0; no signed-in check here | Does not reopen CASE-004. Manual: Hanna DACH Elektromontage, stay on Overview, click a door chip ? Doors tab, row opens |

| Companies directory off the shell: sidebar and Quick add no longer offer it; `/companies` HTTP-redirects to Missions; `/companies/[id]` still opens from missions, Approvals and holdings; rows untouched | `5b913ed` | lint, production build, tenant-identity 0; `curl -sI /companies` ? 307 `/missions?notice=companies`; `/companies/[id]` still 200; no signed-in check here | The unused list workspace still exists in source; company create-from-directory is gone with the page |
| Job Intake off primary nav: sidebar no longer offers it; `/job-intake` stays as a diagnostics page with a banner; mail ingest/scoring/leads/replies untouched; Bob mail-wake is not this change | `d4afc51` | lint 0, production build 0, tenant-identity 0; `GET /job-intake` 200 and still a compiled route; APIs listed in the build; no signed-in check here | Commercial mail exceptions should surface on Today once Bob wake is proven; Today next-move still deep-links here |
| Hanna writes to the pool from her bot (DEV-003): `POST /api/agent/missions/{id}/pool` proposes candidates and availability; recruiting finish line counts named pool people; availability checks are drafts; no CV/PII in the bot payload | `b678056` | 13/13 offline DEV-003; lint, production build, tenant-identity 0; no signed-in check here | Hanna's Grok routine must call `/pool`; a person still accepts new workers and availability; Triangle sends nothing; no migration |
| Minimal event outbox: `client_reply`, `follow_up_due`, and `availability_stale` wake Bob and Hanna; idempotent dispatch in `agent_assignments`; morning cron sweep; `/api/agents/outbox` | `c27187b` | 4/4 offline checks pass (`scripts/check-event-outbox.mjs`); lint, production build, tenant-identity 0; live on production 15 September | Grok routines must handle the event; missing/failed wake queues for next inbox check; no migration |
| Funnel strip removed from Today: 'Two ways to an order' removed from `/decisions`; page focuses on actionable next move and work in progress | pending | lint 0, production build 0, tenant-identity 0; no signed-in check here | Component left in source if needed later; `getFunnel` query removed from Today SSR |
| Learning from CEO edits: editing an AI draft in `LeadReplyPanel` or `OutreachDraftsPanel` offers `LearnRulePrompt` to append a standing house rule in the user's words; `POST /api/agents/house-rules` | pending | 3/3 offline checks pass (`scripts/check-ceo-learning.mjs`); lint 0, production build 0, tenant-identity 0; no signed-in check here | Appends to existing versioned `agent_house_rules`; travels with future work; no migration |
| Today email cards slim (DEV-009): Open mail · Ask Bob · scoped Dismiss; Sent / They replied / Sent a follow-up off the primary rail; Recorded outside Triangle under Dismiss; phone cards unchanged | this PR | 12/12 offline (`check:today-slim`); lint 0; production build 0; tenant-identity 0; no signed-in check here | Ask Bob is a real assignment + wake and fails honestly if DEV-004; no Gmail draft, no Scout/Hanna routing, no mailbox-derived sent/replied; overdue-list rewrite still NEXT |
| Bob takes follow-through (DEV-004): `mission.work` in the catalog; Bob hire preset is mail ingest + mission work; Ask Bob / assignments force `execution_mode: bot` and wake like Scout | this PR | 13/13 offline (`check:dev-004`); lint 0; production build 0; tenant-identity 0; no signed-in check here | SQL not applied — Nikola must preview then run `supabase/data-fixes/2026-09-16-bob-mission-work-scope.sql` (shared live DB). Wake env `BOT_WAKE_URL_INBOX_COORDINATOR` / `BOT_WAKE_KEY_INBOX_COORDINATOR` must be set if the Grok routine exists. Bob sends nothing |
| Context-preserving handoff (DEV-015): Hand to Bob stays on Today as With Bob; Open thread drawer; In progress strip; Ask Bob `case_type commercial_follow_through` | this PR | offline `check:dev-015`; lint; production build; tenant-identity; no signed-in check here | Existing open Ask Bob rows need unapplied data-fix SQL. Workforce / What you handed out is not redesigned. `/today` redirects to `/decisions`. Nothing sends |
| Refusal ledger off Today (DEV-016): Today no longer renders `RefusalLedger`; Settings → Diagnostics shows it to admins and partners; records, component and `summarizeRefusals` unchanged | branch `claude/today-one-inbox` | Signed in on localhost, 3/3: Today has no ledger and still renders Needs you; Settings shows Diagnostics with the ledger; the section list links to it. Type check and lint pass | Not merged or on production yet; Workforce never rendered the ledger |

Scout (demand) and Hanna (access to people) work missions on their Grok bots. Hanna files people on a recruiting mission through `POST /api/agent/missions/{id}/pool` Ã¢â¬â she proposes candidates and availability; a person accepts new workers and availability, and sends availability-check drafts; no CV data leaves Triangle in the bot payload.
Bob is bot-owned for commercial follow-through in code (`mission.work` plus
mail ingest). Live badges still need the data-fix SQL and wake env; until
then Ask Bob fails honestly. Bob sends nothing. A mission now shows chips for colleague requests, the source
mission a door came from, and holdings that open the record, so a recruiting
mission that cites Scout's doors is not a scavenger hunt. Forwarded requisitions
no longer take the receiving mailbox as the recruiter once new mail is ingested;
the one live Computer Futures lead still needs the prepared SQL. The mission
recommended card follows the named person. The KÃÂ¶ster door stays on file as
reachable until its data-fix SQL runs. Tenant-identity no longer fails on
CV/next-move hardcoding.


Phase 0 commercial proof is still not established. The commercial ledger on
15 September holds thirteen records, all on recruiter requisitions: eight
replies sent on 10 September, each with a follow-up date of 14 September and no
answer recorded since, and five outcomes recorded on 8 September while the
Today card still showed call words under emails, so those may not be real
replies. The text recorded for the eight is the prepared reply, because an edit
could not be recorded before 15 September. No buyer conversations, packets or
supplier routes are recorded.

## Management direction

Triangle is a human-led, AI-assisted contract-to-crew operating system, as specified by the latest supplied AGENTS instructions.
Agents should own permitted jobs and continuation; humans decide consequences,
resolve genuine exceptions and provide real-world evidence. The 8 September
clarification changes ambition, not external-action or final-record authority.
External software-customer discovery remains paused under the 4 September decision.

**16 September IA lock** (nav hide and AskLauncher rewrite still later):
primary surfaces are Today, Missions, Talent, Team. Today is Needs you |
In progress | Missions… Handoff changes the owner, not the place (DEV-015).
Refusal ledger on Today is diagnostics (DEV-016), not Needs you.
Signal Inbox leaves primary nav (DEV-011). Ask on a situation is a
missionless assignment, not a new Mission (DEV-010). Human-approved Send from
Triangle is allowed (DEV-013); the button is not built. See `DECISIONS.md`.

Supply includes individual people and partner firms with recently human-confirmed
capacity. A partner firm is not evidence of each worker's certificates, right to
work, consent, availability for a specific order or mobilization clearance.

## Implementation present

| Area | Source implementation | Limit of the evidence |
| --- | --- | --- |
| Intake | Mail ingestion, classification/scoring, leads, draft replies and contact logging. The list is off primary nav; `/job-intake` remains diagnostics until Bob mail ? Today is proven | Extraction uses a model; paid/business conversion is not established by ingestion; Bob waking on commercial mail is not built |
| Research | Project/company evidence, two proposal stores, human review, case history. Project Research Agent chat retired; Scout missions and suggestions remain. Company detail still opens from missions; the directory is not in the shell | Accepted research is not a buyer-confirmed requirement |
| Today screen | Needs you, In progress (Bob/Scout/Hanna waits + Open thread drawer), missions, older reports. Hand to Bob stays on the case | AskLauncher still starts Missions (DEV-010). Live Ask Bob rows need the commercial_follow_through data-fix SQL. The refusal ledger moved to Settings → Diagnostics (DEV-016, branch `claude/today-one-inbox`) |
| Scout | Bot-owned: Triangle stores work and wakes Grok; in-app OpenAI executor does not claim Scout jobs | Specific-job execution on the bot, crash recovery, and measured cost are not fully proven; older in_app rows are not rewritten |
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
