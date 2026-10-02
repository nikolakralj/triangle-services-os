# Current state

## WhatsApp routing — 2 October 2026

Nikola continued the 1 October WhatsApp exception (decision "WhatsApp pilot"
in [DECISIONS](DECISIONS.md); the same entry in
[ROADMAP_EXECUTION](ROADMAP_EXECUTION.md)). An allowlisted inbound is routed
to Scout for a contractor, company, or subcontractor list or a research
request, to Bob for a commercial or client follow-up, and to Hanna for
resourcing (people, CVs, availability, roles). Unsure goes to Hanna. The
choice and the reason are stored on the message. Only that employee is
woken, once, with the message id, sender, text, person, case, and
`POST /api/agent/whatsapp/drafts`. Scout's wake is
`BOT_WAKE_URL_PROJECT_RESEARCHER` / `BOT_WAKE_KEY_PROJECT_RESEARCHER`. Hanna's
stays `BOT_WAKE_URL_HR` / `BOT_WAKE_KEY_HR` when her role key is `hr`. Bob's
is `BOT_WAKE_URL_INBOX_COORDINATOR` / `BOT_WAKE_KEY_INBOX_COORDINATOR`.

Who may reach whom is two roles in `WHATSAPP_SENDERS`
(`src/lib/whatsapp/routing.ts`). The phone numbers are not in the repository.
`WHATSAPP_OWNER_NUMBERS` (Nikola) may talk to every bot.
`WHATSAPP_FIELD_NUMBERS` (Ralph) may talk only to Hanna, Bob, and Scout. A
number on neither list is stored and does not wake anyone, and a send to it
is refused. When both lists are empty, `WHATSAPP_ALLOWED_NUMBERS` is still
the allowlist and every number on it is the field role; an empty legacy list
still means no allowlist. A later bot is one more object on
`WHATSAPP_EMPLOYEES` and its key on the roles who may reach it. Ralph cannot
ask to change the software and cannot ask for an email to be sent: each is
stored as a polite draft, flagged for Nikola, with nobody woken and nothing
sent. When Ralph's message does reach Bob, the handoff says the requester
may not trigger outbound email.

Scout, Hanna, and Bob can draft. A draft may carry one list document,
including an Excel file (xlsx), stored in the `whatsapp-drafts` bucket or as
a path in `documents`. A person approves and Send uploads it through the
Graph media API as a document message, inside the 24-hour window. Outside
that window the template is still the only send, and it does not carry the
document. No CV or worker profile leaves by WhatsApp. If
`WHATSAPP_APP_SECRET` is unset the webhook logs and returns 503; the inbound
is not stored. On Production on 2 October only `WHATSAPP_VERIFY_TOKEN` was
set, so the 09:51 inbound was not stored.

| Change | Commit | Checked | Limit |
| --- | --- | --- | --- |
| Routing after an allowlisted inbound to Scout, Bob, or Hanna; one wake; roles in code and numbers in `WHATSAPP_OWNER_NUMBERS` / `WHATSAPP_FIELD_NUMBERS`; unlisted numbers stored with no wake; software and email refusals for the field role; Scout, Hanna, and Bob draft; one list document including xlsx; CV and worker-profile refusal; 503 when the app secret is missing. Migration `055_whatsapp_routing.sql` adds the route and attachment columns and the `whatsapp-drafts` bucket. Merged with the no-case report fix from main (`3288703`) | this branch | `check:whatsapp` 13/13; `check:case-page` 3/3; `check:tenant-identity` passed; `check:today-slim` 13/13; `check:dev-013` 32/32; `check:dev-015` 20/20; `check:dev-011` 9/9; `check:ask-hanna` 37/37; `check:one-ask` 30/30; `check:workspace` 29/29; `check:requirement-case` 7/7; `check:mail-sync` 9/9; `check:employee-reports` 17/17; `check:event-outbox` 5/5; lint 0; `tsc --noEmit` 0; production build 0. `check:dev-004` 12/13 and `check:dev-010` 13/14 still fail on roadmap wording that was already on main | Nikola applied migration 055 on 2 October 2026. Nothing was sent. No live webhook was called from this branch. The draft line, including a document name, was rendered in `check:whatsapp`. Phone numbers are environment variables, not in the repository |

## Employee reports with no case — 2 October 2026

Bob's `follow_up_due` wake for Tom Stocks (lead `0362e5f7`) filed an
`email_drafted` report and was refused with "That case is not in this
organisation". The assignment had no mission. A report now files on the
person, the company, and the lead when the case is absent. A follow-up
assignment takes the lead's open case when one exists, and stays without a
mission otherwise. No migration. Nothing sent.

| Change | Commit | Checked | Limit |
| --- | --- | --- | --- |
| `POST /api/agent/reports` skips the case check when `missionId` is absent. `follow_up_due` sets `mission_id` from the lead's open case | `3d6f9c4` | `check:employee-reports` 17/17; `check:event-outbox` 5/5; lint 0; `tsc --noEmit` 0; production build 0. The other `check:*` scripts passed. `check:dev-004` 12/13 and `check:dev-010` 13/14 still fail on roadmap wording that was already on main | No migration. Nothing sent |

## WhatsApp pilot — 1 October 2026

Nikola approved an explicit exception to the P0–P4 freeze (decision "WhatsApp
pilot" in [DECISIONS](DECISIONS.md); one entry in
[ROADMAP_EXECUTION](ROADMAP_EXECUTION.md)). Meta's free test number. Inbound
messages are stored once by wamid and filed on the person and their open case
when the number matches. A person approves and sends from the existing draft
line on the case and the person. Free text only inside 24 hours; outside
that, only the configured template. Nothing is sent automatically. The 2
October routing section above replaces the always-wake-Hanna behaviour.

| Change | Commit | Checked | Limit |
| --- | --- | --- | --- |
| Webhook `GET/POST /api/whatsapp/webhook`, badge `POST /api/agent/whatsapp/drafts`, human `POST /api/whatsapp/send`, migration `054_whatsapp_messages.sql` | this branch | `check:whatsapp` 9/9; `check:case-page` 3/3; `check:tenant-identity` passed; `check:today-slim` 13/13; `check:dev-013` 32/32; `check:dev-015` 20/20; `check:dev-011` 9/9; `check:ask-hanna` 37/37; `check:one-ask` 30/30; `check:workspace` 29/29; `check:requirement-case` 7/7; `check:mail-sync` 9/9; `check:employee-reports` 14/14; lint 0; `tsc --noEmit` 0; production build 0. `check:dev-004` 12/13 and `check:dev-010` 13/14 still fail on roadmap wording that was already on main | Migration 054 is written and not applied. Nothing was sent. No live webhook was registered from this agent. The draft line was rendered in `check:whatsapp`; a signed-in browser pass waits on Nikola applying 054 |

## P4 the case page — 29 September 2026 (Europe/Zagreb)

| Change | Commit | Checked | Limit |
| --- | --- | --- | --- |
| One screen per recruiting case, drawn from the workspace blocks: what was asked (client and a source-email link), a roles table (needed, proposed, missing), the drafts with the existing Send from Triangle control, the open questions, and activity folded (employee reports included). Today's line for that case is the link to `/missions/{id}`. The Autonomy picker is off the mission page. The named Cologne fixture moved out of product source so the tenant-identity check passes | this branch | `check:case-page` 3/3; `check:requirement-case` 7/7; `check:tenant-identity` 0; `check:workspace` 29/29; `check:one-ask` 30/30; `check:employee-reports` 14/14; `check:today-slim` 13/13; `check:mail-sync` 9/9; `check:dev-013` 32/32; `check:dev-015` 20/20; `check:dev-011` 9/9; `check:ask-hanna` 37/37; lint 0; `tsc --noEmit` 0; production build 0. No signed-in Preview check | No migration. Nothing sent. `check:dev-004` and `check:dev-010` still fail on roadmap wording that was already on main (the DEV-004 slice no longer names `2026-09-16-bob-mission-work-scope.sql`; the DEV-010 slice no longer says "signed-in check"). Those two were not part of this change |

Updated 29 September 2026 (Europe/Zagreb). This branch is `cursor/p4-case-page-f43d`, off main `4997ec9` (merge of PR #40). The queue is "The plan" in [ROADMAP_EXECUTION](ROADMAP_EXECUTION.md). P4 is `IN_PROGRESS`.

## P3 employees report everything — 29 September 2026 (Europe/Zagreb)

| Change | Commit | Checked | Limit |
| --- | --- | --- | --- |
| Employees report work done outside Triangle. Badge `POST /api/agent/reports` files a LinkedIn invitation, an email, a candidate, a reply, unavailability or an access need on the person, the company and the case, with a follow-up date. "Last reported unavailable, on this date" does not become unknown. "Hanna needs your LinkedIn login" is one line on Today. A later mailbox message on a requirement case thread is filed on that case and the owner is woken once | `3619560` | `check:employee-reports` 14/14; `check:requirement-case` 7/7; `check:mail-sync` 9/9; `check:one-ask` 30/30; `check:today-slim` 13/13; `check:workspace` 29/29; lint 0; `tsc --noEmit` 0; production build 0. Preview https://triangle-services-os-git-cu-9b5174-nikolakralj86-2532s-projects.vercel.app `/api/version` reports `3619560`, branch `cursor/p3-employee-reports-cca2`, env preview. `/` and `/decisions` return 307 to `/login`. Not signed in | Migration `053_employee_reports.sql` is written and not applied. No live report was posted. Nothing was sent. Ask, Approve and Send were not pressed. `check:tenant-identity` still fails on Ralph in `src/lib/job-intake/requirement-case.ts` (already on `main` at `fe201c3`). Full DEV-019 sent-folder observation is not in this branch. Draft PR #40 |

Updated 29 September 2026 (Europe/Zagreb). Main is `4997ec9` (merge of
PR #40). The queue is "The plan" in [ROADMAP_EXECUTION](ROADMAP_EXECUTION.md).

P0 shipped (PR #35, `656ccca`). Open PRs #27, #28, #29 and #31, and stale
branches, still fail P0's "no branch older than three days" test. P1 shipped
(PR #36, `84c5243`): `GET /api/job-intake/sync` with `Authorization: Bearer
CRON_SECRET`, a GitHub Actions mail-sync every 10 minutes, Production verified
200. No migration. P2 shipped (PR #38, `fe201c3`); migration 052 applied
29 September; the signed-in check on Ralph's Cologne email is still owed.
Ingestion does not store email attachments yet. P3 shipped (PR #40,
`4997ec9`). Nikola's brief for P4 says migration 053 is applied; this branch
did not apply it. P4 is in progress on `cursor/p4-case-page-f43d`.

Earlier sessions are preserved in the
[history archive](docs/archive/2026-09-08/CURRENT_STATE.md).

## Evidence boundary

| Evidence | Observed state |
| --- | --- |
| Checkout | `C:\Users\nikol\Projects\triangle-services-os` |
| Branch | `main` (one project, one branch; renamed from `wip-jules-2026-05-03T18-13-13-596Z` on 16 September) |
| Last code commit | `fe201c3` Merge PR #38, 29 September |
| Initial GitHub snapshot | `f63afb51e3f48d3384e5c8047bea49e89d0d7da6`; September 8 review reached c8795b9; September 10 inspected five subsequent commits |
| Existing product work | Committed; nothing from this week is left uncommitted |
| Repository schema | Files on `main` run through `052_requirement_roles.sql`. Applied, as known on 29 September: 044–048 on 11–15 September (`048_drafts_keep_what_triangle_wrote.sql` is on `main`; DEV-001, `f9e9685`). `049_send_from_triangle.sql` is on `main` and applied by 17 September — open PR #27 (not merged) records `can_send` on for the connected Gmail mailbox and the Oliver Hall send. `050_mailbox_observe` and `051_mailbox_space` are live (applied 17–18 September for open PRs #29 and #28); their files are not on `main`. PRs #28 and #29 both carry a `050_mailbox_observe.sql`; #29 also carries `051_mailbox_space.sql`. `052_requirement_roles.sql` applied 29 September |
| Production version | `fe201c3` (merge of PR #38), 29 September. P1's `GET /api/job-intake/sync` with Bearer `CRON_SECRET` verified 200 on Production |
| Live commercial counts | Commercial ledger queried 15 September (below); other snapshots are dated evidence only |
| Verification | Per change, listed with each change below; the 10 September review itself reran no signed-in business test |

Do not infer deployment or applied migrations from committed source. Earlier
claims of passing builds or live smoke tests describe their original snapshots.

## This week — 10 to 15 September

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
| Sent-message record: words editable before sending, Triangle's draft and the sent text both kept, a follow-up date on every send, due follow-ups on Today, Job Intake replies in the ledger (048) | `f9e9685` | Signed-in check 9/9 on a throwaway lead; on production 15 September, Today showing the eight overdue follow-ups | A follow-up message is recorded without its words |
| Source check at filing: a reachable phone or email must appear on a cited page Triangle reads itself; an unreadable page files as Source unchecked | `2024155` | 31/31 offline; the 38 doors on file read live: 34 matched, 3 unchecked, 1 refused (Köster); Approvals label and refusal signed in, 3/3 | Checks at filing only; not yet on production; not yet exercised by a bot filing |
| Wake on assignment follow-up: a human post on a bot-owned thread calls `wakeEmployee` with `human_followup` (ids only); UI says queued, not sent; amber badge stays until the employee answers in-thread | `3058eb5` | lint, build, tenant-identity still 8 known; no signed-in check here | Hanna's Grok routine must handle the event; missing/failed wake still queues for the next inbox check; does not send and does not widen `communicationPolicy` |
| Known defects (DEV-005): forwarded intake keeps the recruiter, not the mailbox; mission recommended card matches the named person; Köster door and Computer Futures lead data-fix SQL applied on live DB 15 September | `9929630` | 11/11 offline DEV-005; DEV-002 31/31; lint, production build, tenant-identity 0; no signed-in check here | Computer Futures contact and Koster rule-out applied on the shared DB |
| Tenant identity (DEV-006): CV letterhead and next-move sign-off read the approved organization profile; scanner comments cleaned | `9929630` | `check:tenant-identity` exits 0; lint and production build | Tenant-zero paper address still lives in the approved seed file |
| Research Agent project chat retired: Signal Inbox stays a list; project page has no chat; `/api/research/chat` returns 410; suggestions ? Approvals / contractor-chain accept remain | `eeb6086` | lint, production build, tenant-identity 0; GET/POST `/api/research/chat` 410 in demo mode; no signed-in check here | Nikola: open a project from Signal Inbox — no Research Agent chat; Inbox/Approvals still accept. `/api/research/run` unused in product UI. No migration |
| Scout is bot-owned: in-app OpenAI `scout-executor` claim loop hard-off; new Scout work is `execution_mode: bot` and wakes the bot (`assignment`); callers cannot force `in_app` onto Scout | `1f9cacc`, `93895cd` | lint, build, tenant-identity still 8 known; no signed-in check here | Scout's Grok routine must handle `assignment`; missed wake waits for the inbox check; older in_app Scout rows are visible in the inbox, not migrated; DEV-003 landed as Hanna /pool on WIP |
| Companies directory off the shell: sidebar and Quick add no longer offer it; `/companies` HTTP-redirects to Missions; `/companies/[id]` still opens from missions, Approvals and holdings; rows untouched | `5b913ed` | lint, production build, tenant-identity 0; `curl -sI /companies` ? 307 `/missions?notice=companies`; `/companies/[id]` still 200; no signed-in check here | The unused list workspace still exists in source; company create-from-directory is gone with the page |
| CASE-004 visibility slice: mission page chips for colleague requests, the source mission a door was first filed in, and holdings that deep-link to the record | `a843060` | 6/6 offline CASE-004 checks; lint, production build, tenant-identity 0; no signed-in check here | Still gated overall ? not budget/time limits, retries or a second inbox. Nikola: open Hanna's DACH mission and confirm Scout-sourced doors/requests show as chips |
| CASE-004 holding chips open Doors on recruiting missions: `?tab=companies#holding-{id}` switches the surface, opens the row and scrolls it; request chips scroll the worker step; source-mission chips still change page | `871a57c` | 8/8 offline CASE-004 checks; lint, production build, tenant-identity 0; no signed-in check here | Does not reopen CASE-004. Manual: Hanna DACH Elektromontage, stay on Overview, click a door chip ? Doors tab, row opens |
| Job Intake off primary nav: sidebar no longer offers it; `/job-intake` stays as a diagnostics page with a banner; mail ingest/scoring/leads/replies untouched; Bob mail-wake is not this change | `d4afc51` | lint 0, production build 0, tenant-identity 0; `GET /job-intake` 200 and still a compiled route; APIs listed in the build; no signed-in check here | Commercial mail exceptions should surface on Today once Bob wake is proven; Today next-move still deep-links here |
| Hanna writes to the pool from her bot (DEV-003): `POST /api/agent/missions/{id}/pool` proposes candidates and availability; recruiting finish line counts named pool people; availability checks are drafts; no CV/PII in the bot payload | `b678056` | 13/13 offline DEV-003; lint, production build, tenant-identity 0; no signed-in check here | Hanna's Grok routine must call `/pool`; a person still accepts new workers and availability; Triangle sends nothing; no migration |
| Minimal event outbox: `client_reply`, `follow_up_due`, and `availability_stale` wake Bob and Hanna; idempotent dispatch in `agent_assignments`; morning cron sweep; `/api/agents/outbox` | `c27187b` | 4/4 offline checks pass (`scripts/check-event-outbox.mjs`); lint, production build, tenant-identity 0; live on production 15 September | Grok routines must handle the event; missing/failed wake queues for next inbox check; no migration |
| Funnel strip removed from Today: 'Two ways to an order' removed from `/decisions`; page focuses on actionable next move and work in progress | pending | lint 0, production build 0, tenant-identity 0; no signed-in check here | Component left in source if needed later; `getFunnel` query removed from Today SSR |
| Learning from CEO edits: editing an AI draft in `LeadReplyPanel` or `OutreachDraftsPanel` offers `LearnRulePrompt` to append a standing house rule in the user's words; `POST /api/agents/house-rules` | pending | 3/3 offline checks pass (`scripts/check-ceo-learning.mjs`); lint 0, production build 0, tenant-identity 0; no signed-in check here | Appends to existing versioned `agent_house_rules`; travels with future work; no migration |
| Today email cards slim (DEV-009): Open mail · Ask Bob · scoped Dismiss; Sent / They replied / Sent a follow-up off the primary rail; Recorded outside Triangle under Dismiss; phone cards unchanged | this PR | 12/12 offline (`check:today-slim`); lint 0; production build 0; tenant-identity 0; no signed-in check here | Ask Bob is a real assignment + wake and fails honestly if DEV-004; no Gmail draft, no Scout/Hanna routing, no mailbox-derived sent/replied; overdue-list rewrite still NEXT |
| Bob takes follow-through (DEV-004): `mission.work` in the catalog; Bob hire preset is mail ingest + mission work; Ask Bob / assignments force `execution_mode: bot` and wake like Scout | on `main` | Live 17 September: `mission.work` on Bob's badge; wake URL/KEY on Production and Preview | Bob sends nothing |
| Context-preserving handoff (DEV-015): Hand to Bob stays on Today as With Bob; Open thread drawer; In progress strip; Ask Bob `case_type commercial_follow_through` | on `main` | Live 17 September: `commercial_follow_through` backfill, 0 rows missing | Workforce / What you handed out is not redesigned. `/today` redirects to `/decisions`. Nothing sends |
| Engineering out of the workforce (DEV-018): programming bot on its own account; smoke task not in In progress; HVAC EPC EU step has no eng-promote `questionForCeo` | live, by assignment id | 17 September: smoke already completed (cancel no-op); HVAC question gone | Official SQL file could not `::jsonb` every `result_summary` (`Draft…` rows). File now guards non-JSON. Promote only commits on `main` |
| Send from Triangle (DEV-013): on the Today reply card a person whose own mailbox has sending on sees Send from Triangle → review (To, From, Subject, text) → Send now; SMTP through their own mailbox; the DEV-001 record is written only after the server accepted (AI draft beside final text, recipient, time, channel, follow-up; `sent_via = triangle`, mailbox, Message-ID); a refusal is a ledger entry and "Not sent", never a Sent record; opt-in switch per mailbox under Settings → Mailboxes, owner only, default off | on `main` | `check:dev-013` 18/18; lint 0; type check 0; tenant-identity 0; production build 0 | Migration 049 applied by 17 September (open PR #27: `can_send` on, Oliver Hall send recorded). The mailbox switch is the opt-in. Gmail needs the app password already stored for ingest. No agent path reaches SMTP; `SENT_MESSAGES_RECORDED` stays false. They replied is still a human press until mailbox sync reads the Message-ID. Only the Today reply card has the button; mission follow-up cards keep Open mail |
| Packet send on the Today card: same card stays when Bob has it, with his last Triangle thread message (or "nothing in the thread yet"); Send from Triangle may attach the anonymised Triangle profile for the person the human picked (filename is the reference, never the name); first match is not locked | this PR (composed from #31) | `check:dev-013` 23/23; `check:dev-015` 18/18; `check:today-slim` 13/13; tenant-identity 0 | Human Send now. Bob still sends nothing. Migration 049 applied by 17 September (open PR #27). The first live packet is still a person |
| Ask Hanna on the same case (DEV-021): from the case or Bob's thread, Ask Hanna creates `who_we_put_forward` with `pack_intent` bio_anonymised (default: bio / initials / anonymised / "M.P.") or full_cv; binds a real worker; the packet appears on the same Today card; a put-forward job does not hide Ask Bob; drawer composer says Message {employee}, not Send | this PR | `check:ask-hanna` 26/26; `check:dev-015` 18/18; lint 0; type check 0; production build 0; tenant-identity 0 | Signed-in Preview smoke owed. Hanna's wake env (`BOT_WAKE_URL_<ROLE>`) owed for pickup without waiting for the next inbox check. Dual From picker and autonomous send are follow-ups. Triangle sends nothing |
| Approve before attach (DEV-022): a put-forward case carries an approval state (`not_checked` / `approved` / `superseded` / `not_used`); a person opens the exact document on the card and approves it, recorded in migration 042's review columns with who, when and what was approved; `sendFromTriangle` re-reads that approval and refuses an unapproved, superseded or other-case pack into the ledger without sending anything; the attach tick starts off, exists only once approved, and attaches the version that was approved; third version `short_bio` (anonymised, one screen, `-short-profile.pdf`); Send review offers a From picker when a person owns more than one sendable mailbox; the thread drawer opens on a status read from the record (queued / working / answered / stopped) with the last word open, earlier messages folded and a long reply folded to its opening | this PR | `check:ask-hanna` 37/37; `check:dev-013` 32/32; `check:dev-015` 20/20; `check:today-slim` 13/13; `check:dev-011` 9/9; lint 0; type check 0; production build 0; tenant-identity 0 | Signed-in Preview smoke owed, including one refused attach. No migration. Approving does not wait for Hanna — the document is Triangle's own record — but her answering afterwards lapses the approval. Triangle still sends nothing |
| One Ask on the case, slice A (DEV-023): each mail card has one Ask and Dismiss; the box is prefilled with a one-click default and posts to `POST /api/ask/case`, which routes the words to Bob (the conversation), Hanna (who we put forward) or both, puts them into the thread already on the case instead of opening a second job, and clears the approval when the words change the person or the form; words in Bob's thread about who we put forward reach Hanna by themselves; Ask Bob, Ask Hanna, Hand to X, the bio / CV radio and the drawer's Ask Hanna block are gone | merged (PR #34), live on Production `693be38` | `check:one-ask` 16/16; `check:ask-hanna` 37/37; `check:dev-015` 20/20; `check:today-slim` 13/13; `check:dev-011` 9/9; tenant-identity 0; lint 0; type check 0; signed in on localhost 10/10 without submitting an Ask (a real Ask would put work in front of the live bots) | Slices B (decision block instead of radios and the Bob wall) and C (Send without the radio list and From select) are next. Not merged; DEV-022 under it is not merged either. Pre-existing on Windows: `check:dev-013` path separators and `check:dev-004` CRLF; `check:dev-010` / `check:dev-004` roadmap wording drift |
| One Ask on the case, slices B and C (DEV-023): the team's decision on the card — who we propose and why, in which form and why (an agency gets the anonymised bio), what is not known yet, the document with one Approve, the others who fit named in words, and what Bob and Hanna wrote as opening lines without ids; Send replies from the mailbox the requisition arrived in, attaches the approved document by default and names it; no radio buttons, pool search, Copy pitch or "Not this one" left on Today | merged (PR #34), live on Production `693be38` | `check:one-ask` 23/23; `check:ask-hanna` 37/37; `check:dev-015` 20/20; `check:today-slim` 13/13; `check:dev-011` 9/9; `check:dev-013` 31/32 (the Windows path-separator case); tenant-identity 0; lint 0; type check 0; signed in on localhost 16/16 (Send review opened and cancelled, nothing approved, nothing asked, nothing sent) | Hero still shows a reply Bob says already went out of Gmail — needs mailbox observation (DEV-019, branch `cursor/mailbox-observed-d3bd`, not merged) or the send ledger to close it. Six call cards still carry five buttons each |
| Today card defects from Production, 29 September (DEV-023 follow-up): Hanna's finished job drawn once instead of twice (`chaseDone`); the draft no longer claims availability nobody confirmed (`offerSentence`); changing the proposed person rewrites the role sentence as well as the background line, including for a person only Hanna named (`redraftForPerson`); id labels and field names ("workerId ;", "leadId", "(pack_intent …)") no longer reach the card; each employee's prose is one line with Read all | merged (PR #35, `656ccca`) | `check:one-ask` 28/28 (Henry's and Oliver's real text as fixtures); `check:ask-hanna` 37/37; `check:dev-015` 20/20; `check:today-slim` 13/13; `check:dev-011` 9/9; tenant-identity 0; lint 0; type check 0. Signed in on localhost against the live Henry Hammond card, 7/7, read-only: Hanna ×1, the offer line names the proposed person's role and says availability is being confirmed, no ids, 59-character employee line, no sideways scroll at 390 px | Shipped in PR #35 (`656ccca`). `check:dev-013` keeps its one known Windows path-separator failure, unrelated. The one-line Today list shipped in the same PR |
| Today as a short list (DEV-023 follow-up, 29 September): every Needs you item is one line until opened — the hero, each person's follow-ups, the calls (one line for all), a stopped mission, and what came back — with who, what is ready, the one unconfirmed fact and one button; the full card unchanged underneath. "Back to the draft" returns to the corrected draft; an attached profile is said to be attached; the headline's grey line no longer names a candidate | merged (PR #35, `656ccca`) | `check:one-ask` 30/30; `check:ask-hanna` 37/37; `check:dev-015` 20/20; `check:today-slim` 13/13; `check:dev-011` 9/9; tenant-identity 0; lint 0; type check 0. Signed in on localhost against live data, 8/8, read-only: 985 px with everything closed (about 5,000 before), no draft, Send or call script until opened, Review opens the full card, the draft is not marked edited, no sideways scroll at 390 px | Shipped in PR #35 (`656ccca`). The sidebar badge (17) and the pulse (20 need you) count differently. `check:dev-013` keeps its known Windows path failure |
| The workspace is the answer, slice A (DEV-024): the schema and the law. A workspace is a declared shape (answer, comparison, shortlist, route, decision), a short answer, up to five blocks from a fixed vocabulary (table, list, route, calc, decision, gaps), its own done-tests and its sources; every fact carries a dated source, Triangle's own record or "not established"; caps and plain-text rules (no ids, no markup, five blocks, six columns) are refusals in the schema; progress is counted from the artifact; a calculation is data run through a tiny arithmetic evaluator, never employee code | merged (PR #35, `656ccca`) | `check:workspace` 16/16 — the same vocabulary validates the Germany rates question and "how do we employ Serbian citizens in the EU"; `check:one-ask` 23/23; tenant-identity 0; lint 0; type check 0 | Shipped in PR #35 (`656ccca`) with slices B and C. Slice D (the Serbian-citizens proof) is still the open proof. Slice E (pinned on Today) is deferred by the P0–P4 freeze |
| The workspace is the answer, slice B (DEV-024): drawn. The short answer first with how solid it is and how much is answered; a table whose sourced cells carry a numbered link, whose own records say "ours" and whose gaps read "not established"; a calculation the person's own numbers move live; "Still open"; "Finished when" from the workspace's own tests; sources folded and dated. A filed answer rides in the finished step's record (no migration), is validated again on the way out, and replaces the company counters and the company finish line on both mission overviews; the `/complete` badge endpoint takes one and refuses what Triangle cannot draw, naming the line that broke | merged (PR #35, `656ccca`) | `check:workspace` 25/25 (including a static render of the drawing); `check:one-ask` 23/23; `check:ask-hanna` 37/37; `check:dev-015` 20/20; `check:today-slim` 13/13; `check:dev-011` 9/9; tenant-identity 0; lint 0; type check 0. Signed in on localhost 12/12 against a throwaway local page (deleted, never committed): the answer reads first, five cells say "not established", changing accommodation moved the margin 2184 → 1884 and the rate moved it to 2580, sources open dated, no sideways scroll at 390 px | No employee has filed a workspace yet, so live mission pages are unchanged until Scout files one (slice C: role-file instructions and worked examples). A refused workspace is not yet written to the refusal log. Shipped in PR #35 (`656ccca`). Slice C shipped in the same PR. Slice E (pinned on Today) is deferred by the P0–P4 freeze |
| The workspace is the answer, slice C (DEV-024): the employees are told how to answer in one. `agents/missions.md` — the protocol handed over on every check-in — carries the shapes, blocks, caps, the three bases, the done-tests, the sensitive rule and a worked `complete` body; `agents/scout.md` works the rates question and the Serbian-citizens question through in prose. A workspace Triangle cannot draw is refused with the line that broke and recorded in the refusal ledger | merged (PR #35, `656ccca`) | `check:workspace` 29/29 — including parsing the protocol's own example and checking it does not pretend to be finished; lint 0; type check 0 | Shipped in PR #35 (`656ccca`). Whether Scout produces a good workspace is unknown until she tries on a check-in after this deploy. Slice D is the proof. Slice E (pinned on Today) is deferred by the P0–P4 freeze |
| Context-aware Ask (DEV-010): on a project, company, requirement or person page the Ask box opens on "On {record}"; a substantial Ask is one missionless assignment bound to the record (Scout, or Hanna for people), the person stays on the page, and the job and its findings show under the record's Case history; inside a mission the box defaults to that mission; no record in view still starts a Mission; a pool question still answers inline | on `main` | Production 17 September: mission-scoped Ask. `check:dev-010` 14/14 | Project-page "On {record}" path not the check reported that morning. Requirement linked as `other` + its project |
| Refusal ledger off Today (DEV-016): Today no longer renders `RefusalLedger`; Settings → Diagnostics shows it to admins and partners; records, component and `summarizeRefusals` unchanged | branch `claude/today-one-inbox` | Signed in on localhost, 3/3: Today has no ledger and still renders Needs you; Settings shows Diagnostics with the ledger; the section list links to it. Type check and lint pass | Not merged or on production yet; Workforce never rendered the ledger |
| Today as one inbox, slice A (DEV-017): pulse line; Needs you; In progress collapsed per employee; Done since you looked (finished missions and the last day's missionless work); old reports folded under Done; mission grid, its Ask box and the "on file" counts off Today | branch `claude/today-one-inbox` | Signed in on localhost, 8/8; `check:dev-015` 15/15; `check:today-slim` 12/12; type check and lint | Needs you cards are not yet grouped by person (slice B) or given one shape (slice C); missionless "done" has no seen marker, so it shows the last 24 hours |
| Today as one inbox, slice B (DEV-017): follow-ups for the same person are one card with one Open mail or Dial and a line per role | branch `claude/today-one-inbox` | Signed in on localhost, 4/4 (Nicolas Preckler's two roles); type check and lint | Ask Bob / Dismiss were still per role; person-level handoff is the follow-up fix below |
| Today follow-up Ask Bob (Nikola, 18 September): one Ask Bob / Dismiss per person card; after Hand to Bob the same card is With Bob + Open thread, the TodayHandoffProvider mounts the right-hand drawer (portaled to body, with a card-level fallback); toast says the answer returns on this case; extra role ids travel with the assignment | this PR | `check:today-slim` 13/13; `check:dev-015` 16/16; lint 0 on touched files; `tsc --noEmit` 0 | Send from Triangle stays on the hero reply card; agents still cannot send mail; In progress stays quiet. Production smoke of Ask Bob-only (composer) is expected; Hand to Bob is the confirm. Signed-in Preview smoke is for Nikola |
| Today as one inbox, slice C (DEV-017): kind labels in the same place on every Needs you card; the grouped card's note once; Take back moved from In progress rows into the thread drawer for open work | branch `claude/today-one-inbox` | Signed in on localhost, 6/6, without pressing Take back; `check:dev-015` 15/15; `check:today-slim` 12/12; type check and lint | Phone cards keep their three outcomes and mission questions are answered on the mission page, so card internals still differ |
| Team in Settings, slice A (DEV-012): Settings opens on Team — each AI employee's health, runtime and wake-up, load (working, queued, stale, needs you, failed this week), badge permissions in words, refusals this week, standing rules, and Activity (open work first, then the last twelve finished, each opening the thread drawer). Stale = open work with no sign of life for 24 hours, derived from pickup, thread messages and run activity | branch `claude/team-in-settings` | Signed in on localhost, 23/23 (drawer opened, no rules edited, nothing taken back; no sideways scroll at 390 px); type check and lint | Workforce is still in the menu with its console until slice B. On localhost no wake-up URL is set, so every bot reads "wake-up not set"; the line reflects the server the page runs on. Live data shows Hanna holding two stale mission steps that ask her to dial PMS — calls are human work |
| Team in Settings, slice B (DEV-012): Workforce left the menu; `/agents` redirects to Settings → Team with "Workforce moved here. Work is handed out from the case."; Settings → Members lists the humans; Hire stays under Team for admins; the Work log sits under Diagnostics; `agent-console.tsx` deleted (hand-out console, What you handed out, Quick notes gone); every remaining `/agents` link points at `/settings#team` | on `main` | Production 17 September: `/agents` → Settings → Team with the notice; Workforce not in primary nav | API routes untouched; no migration; no data deleted |
| Menu Today · Missions · Talent (DEV-011): sidebar is four entries; Quick add follows it; `/hunter` kept under a diagnostics banner and linked from Settings → Diagnostics → Hidden pages; certificate exceptions are a Renew card in Needs you and a `certs=attention` filter in Talent; Compliance is a tab in Talent sharing `ComplianceOverview` with `/documents`; Setup readiness and Data imports open from Settings → Setup & data | on `main` | Production 17 September: Today · Missions · Talent · Settings; Signal Inbox not in primary nav | Duplicate CV rows on Compliance still a follow-up |
| P2 one email, one case: a confident multi-role people request becomes one recruiting mission, one `requirement_roles` row per role, and one mission step each for Hanna and Bob, woken once. The same message, thread or forward does not open a second case. A single role keeps its reply card. An unsure read wakes nobody. Today shows one line; the role rows are on that line and on the mission. A second pickup of one step keeps the earlier run | merged (PR #38, `fe201c3`) | `check:requirement-case` offline. No mailbox read and nothing sent in that check | Migration `052_requirement_roles.sql` applied 29 September. 050 and 051 were already live (applied 17–18 September for open PRs #29 and #28); their files are not on `main`. The signed-in check on Ralph's Cologne email is still owed. Ingestion does not store email attachments; the email is linked through `inbound_email_id` |

Scout (demand) and Hanna (access to people) work missions on their Grok bots. Hanna files people on a recruiting mission through `POST /api/agent/missions/{id}/pool` — she proposes candidates and availability; a person accepts new workers and availability, and sends availability-check drafts; no CV data leaves Triangle in the bot payload.
Bob is bot-owned for commercial follow-through (`mission.work` plus mail
ingest). Live 17 September: badge has `mission.work`, Ask Bob case types
backfilled (0 missing), wake URL/KEY on Production and Preview. Bob sends
nothing. A mission now shows chips for colleague requests, the source
mission a door came from, and holdings that open the record, so a recruiting
mission that cites Scout's doors is not a scavenger hunt. Forwarded requisitions
no longer take the receiving mailbox as the recruiter once new mail is ingested;
the one live Computer Futures lead still needs the prepared SQL. The mission
recommended card follows the named person. The Köster door stays on file as
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
| Today screen | Needs you, In progress (Bob/Scout/Hanna waits + Open thread drawer), missions, older reports. Hand to Bob stays on the case | Ask with a record in view binds work to the record (DEV-010, branch `cursor/dev-010-context-ask-d3bd`, not yet on the Preview); with nothing in view it still starts a Mission. Live Ask Bob rows need the commercial_follow_through data-fix SQL. The refusal ledger moved to Settings → Diagnostics (DEV-016, branch `claude/today-one-inbox`) |
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
