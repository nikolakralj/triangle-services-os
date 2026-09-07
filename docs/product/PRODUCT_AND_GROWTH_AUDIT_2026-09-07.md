# Triangle Services OS: product and growth audit

Review date: 7 September 2026. This is an assessment and proposed priority order, not a claim of production readiness or an amendment to approved product rules.

## Decision

Continue the product, but concentrate the next milestone on a reliable relationship-to-order workflow for Triangle itself. Do not expand agent roles, sectors, dashboards, or software-sales activity to other agencies before that workflow works.

The app can become a valuable operating advantage for two experienced industry founders. It has not yet demonstrated that it produces clients. Its strongest current capability is gathering and organizing intelligence; the weakest commercially important connection is from an actual relationship or reply to a dated next action, qualified requirement, and order.

The user's reported EUR 2 million of company revenue from Siemens Mobility Austria work through Hays is useful evidence of delivered services and existing market access. It is not evidence that this app generated revenue, proof of profit, or proof that a large recruiting operation can already be supplied. Establish the exact roles, contracting entity, number of people, duration, economics, repeat demand, and permitted references before choosing the initial offer.

## Scope and verification limits

Reviewed the governing product/roadmap documents, relevant operating and handoff documentation, recent commits, authentication and permissions, project filters, company/research workflows, agent assignments, contact logging and next-action selection, Job Intake, worker/CV processing and matching, commercial and delivery modules, and automated-test configuration. This is a broad targeted review, not a line-by-line audit of every file or penetration test.

Read-only database checks were scoped to the configured Triangle organization. No customer was contacted, no commercial record was created, no sign-in token was used, and no deployment was made. Browser inspection was unauthenticated; there was no fresh end-to-end signed-in business-workflow test.

Source and deployment are different states:

- Last observed committed checkout: `6c1d469` (`Ask Hanna about your own people`).
- Production `/api/version` reported `64fc1f9`, three commits behind that checkout, during this continuation.
- `.claude/orchestration/task-queue.json` and `src/lib/ai/scout-executor.ts` had changes not made by this audit. The runner was changing while the review was in progress; those edits were preserved.
- `npm run build` passed, including TypeScript. `npm run lint` passed. These are observations of the checked snapshot, not certification of subsequent edits.
- `npm run check:tenant-identity` failed. Some matches are comments, but the newer PDF renderer also hardcodes Triangle's legal letterhead. The worker-answer prompt separately hardcodes Triangle's business description.
- Existing Playwright tests include removed Contacts/Pipeline screens, skip substantive assertions when redirected to login, and lack an authenticated fixture. One unauthenticated test accepts either the protected page or login. A green run would not establish authorization or core-workflow correctness.

## What is actually present

This is more than a static prototype. It contains:

- Supabase authentication, organization membership, internal roles, and organization-scoped data access.
- Email Job Intake, lead classification, review and reply-drafting/recording workflows.
- Projects, companies, contractor-chain research, suggested facts, buyer-contact records, human acceptance, and source evidence.
- Persistent agent assignments, company-case threads, suggested work, a decision queue, and a next-move UI with contact channels and scripts.
- An authenticated scheduled runner and session-triggered work pulse. Recorded assignments demonstrate that some research execution has worked.
- Workers, CV import/extraction, candidate profiles, matching, generated CV/submission documents, and a new read-only talent question interface.
- Commercial requirements, buyer routes and action records.
- Orders, reservations, mobilization, timesheets, invoices, payments and financial-summary implementation, including substantive database guards.

The distinction is important: implementation exists; operational completeness and real business use are not established merely by its existence.

### Current database snapshot

| Area | Observed state | Meaning |
| --- | --- | --- |
| Companies | 174 | Research inventory, not 174 prospects with verified buying intent |
| Discovered projects | 18; all `new` | No recorded project-status progression in this snapshot |
| Project sectors | 7 data centers, 6 automotive, 4 steel/heavy industry, 1 unclassified | The original all-in-one-sector problem has been materially addressed |
| Project country codes | All 18 null | Country-code filters have nothing to match |
| Job Intake | 30 leads: 27 new, 3 reviewing | Existing inbound/channel opportunities deserve attention alongside research |
| Buyer contacts | 4; none with email/LinkedIn fields; 2 with phone information in notes | Reachability is thin; a phone entry is not proof of a buyer conversation |
| Agent work | 16 assignments: 13 completed, 2 cancelled, 1 failed | Some automation works; completed research is not a commercial outcome |
| Pending proposals | 17 findings plus 7 research suggestions | 24 items awaiting decisions; avoid rewarding more queue volume |
| Workers | 4: 3 active/available, 1 candidate/unknown | This is the recorded pool, not necessarily Triangle's entire real network |
| Commercial requirements | 1 draft; no next-action text; dated action overdue | The conversion process is not meaningfully populated |
| Buyer routes / commercial actions / orders | 0 / 0 / 0 | No recorded proof of the app's conversation-to-order loop |
| Reservations / invoices / payments | 0 / 0 / 0 | Delivery features are not proven by recorded live use |

Earlier checks found two active internal memberships with confirmed emails and sign-in records. This supports that account access exists, not that Ralph has personally completed a current application acceptance test.

## Critical findings and missing work

### 1. CV integrity: existing data is damaged, and the repair is not fully delivered

Storage metadata independently confirmed one linked original CV contains **0 stored bytes**, while its document row records **670,035 bytes**. Do not trust the database file-size field as proof of an intact upload.

Commit `f742afb` repairs the extraction buffer handling and rejects an empty upload. It also protects nonempty scalar fields of active workers from later CV extraction. This commit was not in the production version observed above. The existing empty object cannot be repaired by deploying code; recover the original from an authorized source and re-upload it through the corrected flow.

Acceptance: upload a safe test PDF in an isolated test organization, download it, compare size/hash, verify authorized access and denied cross-organization access. Track damaged historical documents explicitly, without removing their records or inventing reconstructed originals.

Evidence: `src/lib/data/cv-extract.ts:216`, `src/app/api/workers/cv/route.ts`, production version, storage-object metadata.

### 2. Human approval and internal permissions need real enforcement

The legacy static MCP key is represented by `requireApiAccess` as an admin with `MCP_USER_ID`. The supposedly human-only contact-log endpoint checks for a user ID, which this machine credential supplies. A privileged machine credential can therefore pass the human-only check. This is not an unauthenticated public bypass; it is a failure to distinguish a human session from an automation actor.

Assignment create/cancel routes authenticate but do not reject `viewer`; their service-client data functions do not add the missing role check. The new worker-question endpoint also lacks a worker-visibility role check even though the declared researcher capability excludes worker access.

Acceptance: explicit actor type, one tested server-side permission matrix, read-only users cannot write, researchers cannot retrieve worker data through alternative APIs, and machine credentials cannot certify a human call/send/approval. Test across two organizations and every exposed route category before adding external users.

Evidence: `src/lib/supabase/server.ts:65`, `src/app/api/outreach/log/route.ts:33`, `src/app/api/agents/assignments/route.ts`, `src/lib/data/workforce.ts:175`, `src/app/api/workers/ask/route.ts`, `src/lib/auth/session.ts`.

### 3. Relationship-first business does not fit the main contact-log flow

`logContactAttempt` rejects a buyer contact without `discovered_project_id`, because it writes an `outreach_drafts` row that requires a project. That prevents a natural first conversation with an agency partner, known contact, referral source, or prospective account before a public project exists.

Do not manufacture a project to satisfy the schema. Use an account/contact-based action history, linking a requirement or project when one becomes real. Reuse existing commercial-action concepts rather than recreate a generic CRM.

Acceptance: record a Hays/account conversation without a project; retain what was said, who owns the next step, its promised date, and its eventual link to a requirement. Show the same event once across account, contact and requirement views.

Evidence: `src/lib/data/contact-log.ts:108`.

### 4. The next-move logic is not a reliable commercial priority system

The next-move selector uses fixed four-day retry and five-day follow-up intervals. It queries findings, buyer contacts and outreach drafts, not the actual Job Intake queue and dated commercial requirements. It cannot reliably put a promised response or overdue real requirement ahead of fresh research.

Several reads substitute empty arrays on query errors. This can turn a database problem into an apparently reassuring empty queue. Failure must be distinguishable from nothing to do.

Acceptance: explicit owner and promised next-action date; overrides for urgent inbound demand; refusal/suppression rules; one view of overdue actions across intake, accounts and requirements. Agents may suggest priorities with evidence, but must not invent buyer commitments.

Evidence: `src/lib/data/next-move.ts:64`, `src/lib/data/next-move.ts:94`.

### 5. Contact-history accuracy has improved, but writes remain fragile

The latest committed code now reads contact outcomes from `commercial_actions`, fixing the prior error where a `dead_end` plus a free-text note could be reconstructed as a successful conversation. Credit this as fixed in source, not as an outstanding identical defect. The observed deployment predates that correction.

The contact-log operation still writes an outreach row followed by an action row, with best-effort deletion on failure rather than an atomic transaction. Request retries have no stable idempotency key. This can leave inconsistent or duplicate proof records.

Acceptance: one logical action written atomically and safely retried; round-trip tests for reached/no-answer/dead-end with and without notes; clear handling of historical rows without ledger outcomes.

Evidence: `src/lib/data/contact-log.ts:125`, `src/lib/data/contact-log.ts:178`.

### 6. Agent autonomy has incomplete execution coverage and recovery

The unattended Scout executor has dedicated handlers for company qualification and contact reachability. Suggested work also includes chain, project facts, requirement and supply tasks. Some are queued without a matching case type or company context. The ongoing local edit adds explicit refusal of unsupported kinds/play work, which is safer, but does not implement those missing jobs or fully resolve untyped suggested jobs.

Queued work is claimed atomically, which is good. A process that dies after moving a job to `active` still needs a tested recovery/lease policy; merely reclaiming old queued bot jobs is not crash recovery. `vercel.json` schedules agent work daily, and the runner targets one configured organization. This is not a continuously staffed, generally capable workforce.

Acceptance: each visible job either has a supported executor or clearly requires a human/external runtime before queuing; typed dispatch; bounded retries and budgets; interrupted-job recovery; failure shown on the owning case; completion checked against the requested output. Verify the new local refusal behavior separately before shipping it.

Evidence: `src/lib/ai/scout-executor.ts`, `src/lib/data/job-suggestions.ts`, `src/app/api/agents/cron/route.ts`, `vercel.json`.

### 7. Filters need complete data semantics and regression tests

The sector backfill is applied, and current source allows populated inactive sectors such as Automotive and Steel to be opened. The screenshot's situation should not be reported as wholly unchanged. An inactive sector with zero records remains disabled, and lock icons still communicate an ambiguous state.

Country filtering uses exact `country_code`, while every project currently lacks that field. Switching sector clears status/country. There is no dedicated unclassified sector view, and the inbox requests only 50 records before in-memory progress sorting, without an equivalent paging path in that view.

Acceptance: country normalization without guessing ambiguous regions, explicit unclassified/unknown handling, working combinations of filters, understandable empty states, consistent counts, and pagination. Test data must contain multiple sectors, countries and statuses so broken filters cannot pass on a homogeneous dataset.

Evidence: `src/components/modules/sector-switcher.tsx`, `src/lib/data/discovered-projects.ts:148`, `src/app/(app)/hunter/page.tsx:64`, migration `035_backfill_project_sectors`.

### 8. Worker identity, evidence and readiness are not equivalent to CV extraction

Active workers' nonempty scalar fields now survive re-upload, a useful improvement. However, duplicate matching can merge people on normalized name and matching OR missing country; this is not unique identity. Skill/certificate lists are still automatically unioned, and the generated finding is filed as accepted/reviewed during upload. This blurs extracted claims, human verification, and current validity.

Availability labels are used to describe people as confirmed available without the suggested-job path checking a dated confirmation. Worker matching can still include an active worker marked busy/do-not-use because availability reduces score rather than necessarily excluding the worker. Matching is not a deployment eligibility check.

Acceptance: ambiguous duplicates require review; preserve field provenance; distinguish extracted/verified/expired evidence; dated availability and permission to share; hard exclusions for do-not-use and incompatible commitments; requirement-specific readiness. Show specialist individuals as well as crews, since both may fit Triangle's actual offer.

Evidence: `src/app/api/workers/cv/route.ts:226`, `:304`, `:444`; `src/lib/data/job-suggestions.ts:281`; `src/lib/data/worker-matching.ts`.

### 9. New logins are not the same as a safe client portal

Internal authentication exists. A complete invite/change-role/revoke-access lifecycle was not found in the application surfaces reviewed. The internal viewer role can see worker and financial information; it is not a client-specific access model.

Do not give clients an internal viewer account. A future client login must be limited to that client's approved requirements, explicitly released profiles, submissions and documents. Personal-data release and audit history need dedicated controls. Build this only when a real client workflow justifies it.

The new PDF's legal letterhead is hardcoded, so external-tenant readiness has regressed. The read-only talent assistant validates referenced worker IDs but still relies on model instructions for prose correctness, treats database read failure like an empty pool, and silently limits its roster to 300. These are hardening tasks, not evidence that AI search replaces permission checks or structured filters.

Evidence: `src/lib/auth/session.ts`, `src/app/(app)/settings/page.tsx`, `src/lib/pdf/worker-cv-pdf.tsx:44`, `src/lib/ai/talent-answer.ts`.

### 10. Documentation and verification are not a dependable handoff yet

`CURRENT_STATE.md` claims migrations through 031, names an older HEAD, and includes a missing-features list saying order/reservation/invoice functions do not exist. They do exist. Other passages correctly describe their implementation. Old software-customer-discovery instructions also coexist with the later app-development focus.

The approved roadmap correctly values real outcomes and forbids invented wins. Its evidence gates should not be interpreted as prohibiting tests, permissions fixes, filter correctness or reliable action tracking until a buyer replies.

Acceptance: one concise current-state section with commit/deployment/schema/date and explicit built/tested/live-used states; archive historical claims as history; an actionable engineering queue; authenticated tests that fail rather than skip essential checks. Do not reopen dormant SaaS prospecting under the label of finding staffing clients.

## What Hays and g2 actually teach us

Hays' own recruiter role describes proactive calls, meetings with decision-makers, sustained relationships, candidate sourcing, and measurable sales activity. This is evidence of a human sales process supported by systems, not an autonomous lead-list business. [Hays recruiter role](https://m.hays.co.uk/careers/Job/Detail/JOB_37515).

g2's current recruiter role likewise describes building a client portfolio through warm/cold outreach, developing subject expertise, LinkedIn networking, and managing recruitment through placement. Its website reports that more than 80% of its business comes from repeat clients; treat that percentage as the company's own claim, not independent audit evidence. [g2 recruiter role](https://www.g2recruitment.com/jobs/english-speaking-recruitment-consultant/), [g2 company website](https://www.g2recruitment.com/home/).

Most relevant to Triangle: Hays explicitly invites expert companies into a partner arrangement for individual specialists and teams. Its published process includes reviewing the partner portfolio, a cooperation agreement, project offers and maintaining detailed available-worker profiles. This is an existing channel to investigate using Triangle's history, not a guarantee of acceptance or a reason to bypass contractual relationships. [Hays partner-company program](https://www.hays.de/en/partners/partner-with-hays).

My inference: Triangle should operate two connected acquisition channels—repeatable agency/partner relationships and a narrow set of direct technical buyers. The founders' existing rail/industrial experience should inform the initial specialization. A large project's construction budget is not staffing revenue, a named owner is not necessarily the labor buyer, and a public announcement is not a confirmed requirement.

## Proposed development order

| Priority | Deliverable | Exit test |
| --- | --- | --- |
| 1. Trustworthy internal release | CV integrity/recovery path, actor and role enforcement, filter data, truthful outcomes, tested agent dispatch, synchronized release notes | Safe test users complete and fail the expected paths; no silent data loss or false success |
| 2. Relationship-to-requirement loop | Account/contact actions without projects; owner/promised date; unified inbound and follow-up queue; buyer route and next action | A conversation becomes a traceable qualified requirement, and a promised follow-up is never lost |
| 3. Credible offer and submission | Verified specialist/crew availability, reference evidence, permission-controlled profile packet, rate/cost assumptions, buyer response tracking | An approved proposal can be prepared from actual supply without inventing capacity, documents or commitments |
| 4. Order/delivery validation | Exercise existing order/reservation/mobilization/timesheet/payment modules against an approved real case | The team can reconcile what was delivered, invoiced, paid, and contributed after costs |
| 5. Additional access when needed | Managed internal invites; later narrowly scoped client portal | Tested least-privilege access and a real use case, not just another login form |

The immediate engineering work does not require founders to search for bugs or conduct software-customer interviews. Commercial facts—actual availability, buyer statements, contracts and payments—still require human evidence.

## Focused new ideas

1. **Reference-led account expansion.** Store an approved Siemens/Hays case with specific roles, outcomes, geography and permissible reference wording. Use it to explain fit to adjacent technical buyers, rather than generate generic agency messages. Keep the actual contracting chain explicit.
2. **Partner-channel workspace.** Track existing agency relationships, approved specialisms, agreement status, who receives availability updates, last meaningful conversation and next promised action. This should work without a public project.
3. **Candidate-led opportunity matching.** Start with a few genuinely available specialists and identify requirements they can credibly fill. Produce an approved anonymized capability summary, not an unsupported promise of a 50-person crew.
4. **Conversation-to-action assistance.** Turn a human's call note into proposed structured facts and a dated next step, asking for confirmation before recording buyer commitments. A plain note like “call next Thursday after budget review” should beat a fixed five-day timer.
5. **Evidence expiry and honest priorities.** Show when contact details, project timing, availability or certificates were last verified. Rank by buyer fit, reachable route, timing and credible supply; expose uncertainty instead of an unexplained score.

These are product directions, not authorization to send messages, scrape personal profiles, register partner accounts, share CVs or agree terms.

## How to know whether continued investment is justified

Run a small founder-led pilot after the reliable internal release. Begin with the existing network and incoming opportunities, plus a deliberately narrow target segment matched to actual delivery experience. Agents prepare evidence and next steps; founders handle discovery, trust, commitments and final approval.

Track qualified buyer conversations, confirmed requirements, proposals reaching a real decision-maker, accepted orders, repeat requirements, collected revenue and contribution margin. Also track preparation time saved and hours spent operating/repairing the app. Do not report companies, scraped contacts, AI calls or completed research as the business result.

Set the pilot's numeric targets after establishing the actual offer and capacity, not from invented conversion rates. At the review, distinguish whether a failure came from targeting, reachability, offer credibility, unavailable supply, economics, or product friction. More agents are not the automatic answer to any of those.

Bottom line: the app is worth pursuing as Triangle's internal acquisition and delivery assistant. It is not yet a proven growth engine or a finished client-facing product. Its next advance should be fewer broken handoffs between real people and commercial commitments—not a larger inventory of research.
