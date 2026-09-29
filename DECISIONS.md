# Decisions

## Purpose

This file records major product and implementation decisions so future agents do not need to reconstruct them from chat history.

## Decision Log

### 2026-09-18: Employees, not buttons — the core of Triangle

Locked by Nikola on 18 September, looking at the Oliver Hall card: three radio
buttons for the three people in Talent, a "Bob prepared" box full of Drive and
thread ids, and Ask Bob, Ask Hanna and Dismiss side by side. In his words:

> "I don't care what the agent is called, Bob or Hanna. When they get an email
> they need to work and come back to me: boss, we decided to propose these
> people, and we decided to use the bio because it's an agency and we don't
> want to expose our candidate's name. This is the intelligence I need."
>
> "It's like new human employees — with time they gain trust. This needs to be
> in the core of this app."

Every other product decision is read against this one. It sits above the
surface decisions below and amends them where they disagree.

Law:

1. **Employees work without being pushed.** When something arrives — a
   requirement, a reply, a follow-up that falls due — the employee who owns
   that kind of work starts on it. A person does not press a button for
   routine work to begin.
2. **They come back with decisions and reasons, not options.** "We propose
   Matej and Igor. We used anonymised bios, initials only, because g2 is an
   agency and we don't expose our candidates' names to agencies. The reply is
   drafted." Who fits, which form, which thread and which wording are the
   employee's decisions, each stated with its reason.
3. **A person judges, in words.** A case has one Ask. A person approves,
   changes something by saying it ("not Igor — use Matej, full CV"), or says
   no. Triangle routes the words to whichever employees the work needs. A
   person never chooses between Bob, Hanna and Scout, never picks a document
   form from a control, and never picks a candidate from a list. An
   employee's name shows who did the work; it is never a choice a person has
   to make.
4. **Trust is earned, like a new hire's.** For each kind of action, each
   employee has a level of freedom, and moves up only on its record:
   - **Proposes** — says what should happen;
   - **Prepares** — does the whole job up to the step that cannot be undone;
     a person approves and presses Send. **Every external message is here
     today, for every employee: Hanna and Bob prepare drafts, a person
     sends;**
   - **Acts and reports** — does it within a named kind and limit, and a
     person sees it afterwards.

   A kind of action moves up only when the CEO grants it on the record, for
   one employee, on evidence: how often their prepared work was approved
   unchanged, what had to be corrected, what went wrong. It comes down in one
   step. An employee never promotes itself, and no code change or
   configuration raises a level as a side effect. Commitments (price, rate,
   date, headcount, contract), payment, signing and deletion never move up:
   they stay a person's. This is the path through the existing
   `communicationPolicy` — Prepares is APPROVAL, Acts and reports is AUTO,
   FORBIDDEN stays forbidden — and enforcement stays where the action happens.
5. **A person sees a decision, not machinery.** What we decided, why, what is
   prepared (open it to read it), the one thing needed now, and what happens
   after approval. Ids, file ids, thread ids, JSON and transcripts stay behind
   the evidence link.
6. **Design for ten thousand.** Talent will hold ten thousand people and
   Today a hundred cases a day. A control that works only because there are
   three candidates is wrong today too. The employee searches the pool; a
   person sees the two or three it chose, and why.

The test a design must pass is "Employees, not buttons" in
`PRODUCT_OPERATING_RULES.md`. A design that adds more primary buttons than it
removes is rejected.

Amends:

- **Two employees on one case (18 September).** Bob chasing and Hanna putting
  forward stay as the internal division of work; they stop being two
  controls. The form is the employee's decision under the same rules — a bio
  by default and always for an agency, a full CV only when a person releases
  the name — and a person's words override it. Releasing a name still takes a
  person.
- **The operating shell (16 September), law 5.** "Ask the employee" means the
  one Ask on the case, not an Ask button per employee.

Building it: one Ask on the case, routed inside Triangle, is the first slice
(briefed 18 September). Each employee's track record and the CEO's step to
grant or withdraw a level come after, as their own item in
`ROADMAP_EXECUTION.md`.

Why:

- the Oliver Hall card asked the CEO to pick a candidate from radio buttons,
  to choose between Ask Bob and Ask Hanna, and to read Drive ids — work a
  competent colleague does without being asked;
- a list of controls grows with every feature, and a person operating it is
  rebuilding a CRM by hand. A colleague who decides, explains and earns more
  freedom is the product.

### 2026-09-16: The operating shell — three menu items, one inbox, tasks on cases

Proposed by Claude on 16 September at Nikola's request ("Workforce is useless";
"I need to understand where the project is going"). Locked when Nikola merges
the pull request that adds it. Visual design:
`docs/design/PRODUCT_SHELL_2026-09-16.html`.

This **amends** the 16 September IA lock in one place: Team leaves the primary
menu and lives in Settings. Everything else in that lock stands — Today as the
exception inbox, context-aware Ask (DEV-010), send-from-Triangle (DEV-013), and
the refusal ledger as diagnostics (DEV-016).

Law:

1. **Four layers.** People decide on Today; Triangle holds the record (cases,
   tasks, evidence, the send ledger, standing rules, permissions); employees
   (Scout demand, Hanna people, Bob commercial operations) work on their bots;
   the world is observed through mailboxes and the web. A Grok chat, a mailbox
   or a webhook is a way in or out, never where work lives.
2. **All delegated work is a task on a case.** Case, owner (the accountable
   human), employee, state, thread, result. The result lands on the case, never
   on a separate list. This generalises DEV-015 to every surface.
3. **One set of task states everywhere:** Queued (`queued`), Working (`active`),
   Needs you (`waiting_review`, or a step's question for the CEO), Done
   (`completed`), Failed (`failed`), Stale (not stored yet). Modelled on the A2A
   task lifecycle and Linear agent sessions.
4. **Menu: Today · Missions · Talent**, and Settings. Settings holds Team,
   Members, Mailboxes, Organization, Imports, Setup and Diagnostics. Company,
   person, project, requirement and lead pages open from a card and are never
   patrolled. Diagnostics hold the refusal log, the work log, Signal Inbox, Job
   Intake and the companies list. Nothing is deleted.
5. **Today is one inbox:** Needs you, then In progress as one quiet line per
   employee, then Done since you looked. Every Needs you card has one shape —
   kind, case, the situation in one line, why now, evidence, one primary
   action, Ask the employee, Dismiss — and cards are grouped by person or case.
   Today carries no system errors, no mission grid, no second Ask box and no
   history backlog.
6. **Team is admin, not a console.** One screen: each employee's ownership,
   health (on duty, last seen, wake-up), load by state, permissions, standing
   rules, activity and refusals. No hand-out suggestions, no handed-out list, no
   chat, no global work log. Work is handed out from the case (Ask, Ask Bob, a
   mission instruction), as in Linear and GitHub, and managed in admin, as in
   Microsoft Agent 365.
7. **Employees talk inside the case.** A request between employees (14
   September) is a child task in that case's thread and reaches a person only
   as Needs you.
8. **Engineering stays out of the company.** The programming bot runs in its
   own account, test data never lives in the live organization, and only merged
   commits are promoted.

Why:

- Workforce on Preview 76c42d4 was 7,777 pixels: ten "Hand it out" suggestions
  from old research gaps, about forty handed-out rows that Today already shows,
  a chat box that duplicates Ask, and a raw log of mission and assignment ids.
  Only the three employee cards were useful;
- Today put a system-refusal panel first, a deploy question inside a business
  mission in Needs you, a smoke-test task in In progress, four card designs and
  the same recruiter several times;
- Scout's HVAC EPC EU step asked the CEO to promote an engineering preview —
  engineering context crossed into the workforce, most likely through the Grok
  account the programming bot shares with Scout;
- the live site runs `ed9d3a6` from `cursor/event-outbox-wake-14fb`, a commit
  that was never merged.

Nikola's answers, 16 September:

- **Mailbox.** Signed in as Nikola, he replies from `nikola.kralj86@gmail.com`,
  the mailbox already connected. Ralph connects his own in Settings. Mailbox
  observation starts from each person's connected mailbox.
- **Programming bot.** Moved out of the workforce account.
- **Ralph's Today.** He may get his own: Needs you filtered to what he owns.
  Later, once work carries a human owner consistently; not in DEV-017.
- **Talent.** Nikola stays in Talent as a candidate, so Today may put him
  forward.

### 2026-09-16: Refusal ledger is diagnostics, not CEO work (DEV-016)

Locked by Nikola. Today / Workforce showing "The system refused N attempts…"
with Postgres finding-contract prose is engineer noise, not CEO work. If an
employee gave a CEO this panel, the process is wrong.

Law:

1. The CEO manages business situations on Today (**Needs you | In progress |
   Missions**). Context-preserving handoff (DEV-015) remains the CEO path.
2. System refusals, tenant walls, and finding-contract sentences are
   **diagnostics**. Hide them from the Workforce primary UI and from primary
   nav — same class as the 15 September Job Intake hide: keep the data,
   demote the surface.
3. Do **not** put the refusal ledger under Needs you.
4. Do **not** invent research landings for commercial follow-through. The Ask
   Bob noise was a missing `case_type` (new creates already set
   `commercial_follow_through`; backfill SQL is prepared at
   `supabase/data-fixes/2026-09-16-ask-bob-commercial-follow-through.sql` —
   Nikola applies). Migration 041 still defaults a missing case_type to
   `open_research`.
5. Next **code** after this docs lock is DEV-016 (hide/demote the panel),
   **before** beautifying Team (DEV-012).

Current surface: `src/app/(app)/decisions/page.tsx` renders `RefusalLedger`
above Today. Component: `src/components/modules/refusal-ledger.tsx`. Data:
`src/lib/data/refusals.ts`. Keep those records.

This change is **docs only**. No panel move, no nav code, no .env.

Why: a finding-contract 409 is a system check, not a business situation. The
CEO's job is the case (company / person / requirement), not Postgres prose.

### 2026-09-16: Handoff changes the owner of the work, not where it lives (DEV-015)

Locked by Nikola. Ask Bob / Hand to Bob from a Today mail card (e.g. Veronika ·
Computer Futures) does **not** dismiss the card into Workforce / "What you
handed out".

Rule:

1. Handoff changes the **owner**. The work stays on the same case.
2. The same Today card becomes **With Bob** (Open thread + Take back). Toast:
   "Handed to Bob · Open thread".
3. After confirmation the item belongs in quiet **In progress** on Today.
   **Needs you** stays sacred for human decisions only.
4. Open thread is a **right-side drawer on Today** (the durable assignment
   conversation). It does not navigate to `/agents`.
5. When Bob needs a human or finishes with a draft/decision, the **business
   situation** returns to Needs you (company / person / requirement), not
   "assignment #abc completed".
6. Assignments carry structured context ids (`leadId`, `contactId`, `personId`,
   `companyId`, `missionId`, …) so any surface can show "Bob working" on that
   case.
7. Do not beautify Workforce in this slice. "What you handed out" will be
   demoted when Team shrinks (DEV-012). DEV-015 is ahead of that redesign.
8. Ask Bob `createAssignment` sets `constraints.case_type` to
   `commercial_follow_through`. Migration 041 defaults a missing case_type to
   `open_research`, which 409s a plain `{assignmentId, result}` complete.
   Message-only and `failed: true` already skipped the finding contract;
   successful commercial complete must too.

Today's structure: **Needs you | In progress | Missions…**

Why: handing Veronika to Bob and then hunting her under Workforce made the
CEO the transport layer between the case and the employee.

### 2026-09-18: Bob's work is the Triangle thread on the same Today card; Send may attach the anonymised profile

Locked against the Oliver Hall / anonymised-profile miss. Grok chat is not
Triangle truth. After Ask Bob:

1. The **same Today card** stays. Needs you does not count it while Bob has
   it; In progress stays quiet. The card shows the last thing Bob wrote in
   the Triangle thread, or that nothing is in the thread yet.
2. When Bob finishes, the **business situation** returns to Needs you with
   that write-up still on the card — not "assignment completed" as the object.
3. **Send from Triangle** may attach the anonymised Triangle profile for the
   person the human picked. Filename is the Triangle reference, never their
   name. Named CVs stay in Talent.
4. Bob still **sends nothing**. `SENT_MESSAGES_RECORDED` stays false. Human
   Send now.

This is the Phase 0 packet-send defect list, not a new DEV ticket and not
DEV-014.

### 2026-09-18: Two employees on one case — Bob chases the thread; Hanna says who we put forward

Locked against the Oliver Hall follow-up on Production, 18 September. Saying
"ask Hanna" or "prepare draft with matej cv" in Bob's drawer produced a queued
message on Bob's thread, no Hanna job, and a Send button that read as email.
The CEO said, correctly, that Grok chat is easier until this loop works.

Law:

1. **The case has two halves and one place.** Bob chases: digs the mail
   threads, drafts A/B, lists the decisions only a person can make. Hanna says
   **who we put forward** and in which form. Asking one is not taking it off
   the other, and neither handoff moves the work: both answers return on the
   same Today case, under Open thread and on the card.
2. **Bio is the default; a full CV is a deliberate release of identity.**
   `pack_intent` is `bio_anonymised` or `full_cv`, set from the human's own
   words — "bio", "initials", "anonymised", "M.P." mean the packet; "full CV"
   or "named CV" mean identity released. **A bio marker anywhere wins**, so
   "Matej as M.P., not a full named CV" prepares the packet. Silence means the
   packet. Being wrong towards anonymous costs a re-ask; being wrong the other
   way puts a candidate's name in a stranger's inbox.
3. **A bio never carries the name.** Initials on the card, initials in the
   document, and a filename that is the Triangle reference. No contact
   details. No rate, in either form.
4. **Nobody is invented.** The person is bound to a `workers` row Triangle
   already holds, matched from the words. Two people matching binds nobody and
   Hanna names the candidates instead.
5. **The case is never empty while she thinks.** Triangle renders the packet
   from the worker record and shows it immediately, marked as Triangle's own
   record — not as something Hanna said. Attributing a generated summary to an
   employee who has not answered is the same lie as a queued row nobody picks
   up. Her check lands on the same card.
6. **A put-forward job is not an owner of the whole case.** It does not hide
   Ask Bob and does not take a follow-up out of Needs you. Only the chase half
   decides who holds the card.
7. **Send is a person, still.** `who_we_put_forward` is a proposal; the thread
   composer messages the employee and says so; the only Send is the human one
   on the case. `SENT_MESSAGES_RECORDED` stays false and no agent gets SMTP.

Deliberately not in this: autonomous send, and the dual From picker (gmail vs
triangle-services.com), which stays a follow-up.

### 2026-09-18: A person opens it and approves it, or it does not go

Locked the same day, reading the loop above back. The law is Nikola's: he must
open Hanna's Triangle version on the case and **approve** it before it can be
attached on Send. No silent auto-attach.

What was actually there: picking who to put forward in the Send review switched
the attach checkbox on for you, and that checkbox was the whole gate.
`/api/mail/send` took the boolean, built a profile for whatever `workerId` the
browser sent, and attached it. Nothing checked that anybody had opened the
document, nothing tied the file to the case it was being sent on, and the
builder passed `includeIdentity: false` unconditionally — so a case asked for
as a full CV attached the anonymised one, under a checkbox that promised either
depending on which you read.

Law:

1. **Approval is a recorded human act, not a tick.** A person opens the exact
   document on the case and approves it. It goes in migration 042's review
   columns with who and when — "acknowledged" there already means a person read
   it and agrees — beside the employee's claim, never over it. Ruling one out
   costs a reason, like every other discard on Today.
2. **The server is the gate, not the browser.** `sendFromTriangle` re-reads the
   approval from the record at the moment of sending. Unapproved, or approved
   on another case, and nothing is sent — not the attachment and not the words.
   The refusal goes in the ledger with its reason.
3. **The tick is the last step of that decision.** It starts off, it exists
   only once an approval stands, and it names the file. Choosing who the reply
   is about is a separate control and attaches nothing.
4. **What was approved is what goes.** The version is read from the case, so a
   full CV approved as a full CV arrives named, and a bio arrives as a bio.
5. **An approval lapses when the employee answers after it.** What was approved
   is not what the case now says. The card asks for it again rather than
   carrying an attachment nobody re-read.
6. **Approving does not wait for Hanna.** The document is Triangle's own record
   and is ready immediately, so a person may approve before her check lands —
   but the card says which it was, and so does the recorded approval.
7. **Three versions, not two.** `bio_anonymised`, `short_bio` and `full_cv`.
   "Short bio" contains "bio", so short is read first; both are anonymised, so
   getting that pair wrong costs a length, not an identity.
8. **Which address it leaves from is a decision.** A person who owns a personal
   mailbox and a company one is telling a recruiter something different with
   each. Triangle offers both and picks neither; with one address there is
   nothing to choose. The owner-only rule is unchanged, and no agent gets SMTP.
9. **The drawer is a case, not a chat window.** It opens on the status read
   from the record — queued and not picked up, working, answered and back with
   you, or stopped — then the last word, with everything before it folded and
   a long reply folded to its opening. The history stays complete and
   reachable; it is just not the first thing in the way. Renaming the Send
   button was half of this; a person still had to read a Grok write-up to the
   end to learn whose move it was.

### 2026-09-16: Refined product IA — four primary surfaces, context-aware Ask, send-from-Triangle

CEO accepted the external expert amendment on 16 September 2026. Direction is
locked here. **Docs and roadmap only in this change** — no nav code, no
AskLauncher behaviour change, no send button.

This **amends** the 15 September surface-law **A destination list**. The A / B
/ C classification itself stays: A is daily operating surfaces, B is
contextual truth, C is infrastructure. Do not treat this as permission to
invent Opportunity / Email / Search as peer nav, or a Work Items product.

#### Shell — four primary destinations (A)

Only four human primary surfaces:

1. **Today**
2. **Missions**
3. **Talent** (today's Talent Pool)
4. **Team** — rename Workforce later; shrink what the page is for (DEV-012)

Amended the same day by "The operating shell": Team leaves the menu and lives
in Settings, so the primary surfaces are **Today, Missions, Talent**.

**Settings** is admin (C), not a fifth patrol queue.

Everything else is contextual (B) or infrastructure (C) — not a place the CEO
patrols.

Already hidden, stay hidden: Companies list, Job Intake (diagnostics).
The refusal ledger is the same class (DEV-016): keep the records, demote the
surface from Today / Workforce primary and from primary nav. Do not put it
under Needs you.

**Signal Inbox / Hunter** — withdraw the earlier “keep it thin in the shell”
idea. Plan: **leave primary nav**. Scout consumes signals; tables, routes, and
project detail stay as C diagnostics and as B when a case opens them. Cert
Alerts leave primary nav; certificate exceptions surface on Today.

Commercial requirements, company detail, and project detail are **contextual
truth records** (B), not sidebar CRM.

Withdraw the earlier brainstorm of Opportunity, Email, and Search as peer nav
items.

#### Ask Triangle (critical — current code is the wrong law)

`AskLauncher` and `POST /api/ask` today treat anything that is not a talent-pool
question as a **new Mission**. That is wrong for the product.

Correct behaviour:

- Looking at an email, requirement, company, project, or person and asking
  “Scout, investigate…” → a **missionless assignment** (`mission_id = null`)
  bound to that context (`agent_assignment_entities`). The result returns
  **on that situation** (`EntityCase` / the record the human was looking at),
  not a new Mission and not a Scout chat.
- Inside an existing mission → add the instruction to **that** mission (already
  true).
- No page context and a substantial objective → a new Mission.
- A simple database question (talent availability) → answer inline, no
  assignment.

Do **not** invent a Work Items product. The assignment protocol already
supports non-mission work (`event: assignment`, omitted `mission_id`, entity
refs). Ask Bob on Today cards (DEV-009) is a special case of this pattern;
generalize it, do not add a parallel object.

Implement as DEV-010 **before** inventing new UI concepts.

#### Today

Today is the **exception inbox**, structured as:

- **Needs you** — human decisions only (the one action, due follow-ups, a
  mission that asked, a reachable person nobody has contacted).
- **In progress** — quiet waits with Bob, Scout, or Hanna. Open thread is a
  drawer on this page.
- **Missions** — large objectives.

Handoff changes the owner of the work; it does not change where the work lives
(DEV-015). It is not Sent / They replied administration (DEV-009 already
started that cut). It is not an agent activity map as the main job.

#### Missions

Missions are **large objectives** only — not every Scout poke from an email.
A poke on a situation is a missionless assignment on that record.

#### Team

Workforce shrinks to Scout / Hanna / Bob: roles, standing rules, permissions,
health, and load. It is not a hand-out-jobs console. Rename and shrink after
Ask context exists (DEV-012 after DEV-010).

#### Sending policy — reconcile the contradiction

The 29 August rule “Triangle never sends; a human sends outside and records”
is **outdated** against CEO intent. Human control remains; the channel does
not have to be an external mailbox.

**New standing law:**

- **Human-approved Send from Triangle is allowed** — review, edit, then press
  Send in the product.
- **Agent-autonomous sending** stays policy-controlled per
  `communicationPolicy`: AUTO / APPROVAL / FORBIDDEN by message class. A
  commitment (price, rate, date, headcount, contract) is never an employee's
  to make. AUTO still takes effect only once Triangle records what was sent.
- Do **not** implement the Send button in this docs lock (DEV-013 when ready).

DEV-009's “Triangle still sends nothing” describes **that slice's
implementation**, not the standing product law. Do not use it to revert
human-approved in-app send.

Living operating-rules files updated in the same lock so agents do not “fix”
direct-send back out:

- `PRODUCT_OPERATING_RULES.md` — External-action rules
- `SOFTWARE_AGENT_INSTRUCTIONS.md` — §10 External communication
- `ROADMAP.md` — External action workflow

These still describe **current code**, not the standing law — leave them until
DEV-013; do not treat them as a reason to remove in-app Send:

- DEV-001 / DEV-003 / DEV-009 acceptance text (“Triangle sends nothing”)
- `src/lib/data/communication-policy.ts` (`SENT_MESSAGES_RECORDED = false`)
- Today / Job Intake “Open mail sends nothing” copy
- `agents/hanna.md` / `agents/bob.md` (“today a person sends”)

The 14 September AUTO / APPROVAL / FORBIDDEN graph is unchanged. This decision
only says the human approval path may complete **inside Triangle**.

Why:

- the CEO was touring Signal Inbox, Workforce, and mail administration as if
  they were the job; they are not;
- creating a Mission for every Scout poke from an email fills Missions with
  work that belongs on the situation;
- “never send from Triangle” fought the 14 September communication policy and
  the intent that a reviewed draft can leave from the same screen.

### 2026-09-16: Bob takes commercial follow-through (DEV-004)

CEO unlocked DEV-004 (was BLOCKED_EXTERNAL). Bob's product role is Commercial
Operations: turn intelligence into action, keep work moving, draft next moves,
surface decisions. Peer under Triangle; may ask Scout or Hanna through
Triangle; not their boss. Sends nothing until policy/human allow.

Decision:

- `mission.work` is a first-class badge scope: work the employee's own
  mission/assignment steps. It does not grant sending external mail.
- Bob's normal hire preset is `job_intake.ingest` + `mission.work`.
- Ask Bob and other Bob assignments are bot-owned (`execution_mode: bot`) and
  wake like Scout/Hanna. Callers cannot force `in_app` onto Bob.
- Live badges are updated with a previewable data-fix SQL, not a migration
  that rewrites every org. Nikola applies it; local and production share one
  database. This agent does not apply it.
- Wake URLs are not invented. Live Bob (`inbox_coordinator`) uses
  `BOT_WAKE_URL_INBOX_COORDINATOR` / `BOT_WAKE_KEY_INBOX_COORDINATOR` when the
  Grok routine exists.

### 2026-09-16: Machines observe; humans judge — Today cards slim

Agreed 15–16 September 2026 (CEO + external expert + Triangle Engineer).
Direction is locked here. This slice only slims Today email cards; most of
the direction is still NEXT.

Decision:

- **Machines observe; humans judge.** Email sent, replied, and follow-up due
  should eventually come from the connected mailbox and the outbox, not from
  CEO buttons that report observable state.
- **Today cards for commercial mail** converge on three human actions:
  **Open mail** (existing provider/thread deep link), **Ask Bob** (short
  contextual instruction with person / thread / lead / mission ids — Bob is
  Commercial Ops), and **Dismiss** (scoped judgment: not now / not this
  opportunity / wrong person / don’t contact). Dismiss is not a forever
  blacklist and is not silent ML.
- **Remove from the primary rail:** Sent, They replied, Sent a follow-up, and
  similar “report what the mailbox can see” buttons. Keep a thin escape under
  Dismiss or advanced: **Recorded outside Triangle**, so Today does not lie
  until mailbox sync proves outcomes.
- **Follow-ups are Bob-owned work.** Today should shrink toward exceptions
  (“Bob handling N; 1 needs you”). This slice stops encouraging manual
  Sent-a-follow-up as the main path; a full rewrite of the overdue list can
  follow.
- **Phone cards stay** (Dial / Got through / No answer / Dead end) until
  phone is in the mailbox.
- Ask Bob creates a real assignment for Bob with the card’s entity ids. If
  Bob’s mission scope (DEV-004) is not on his badge, or his wake-up routine
  is not on, the UI fails honestly and does not pretend the work was taken.
- Do not widen `communicationPolicy` in this slice. The card chrome still
  sends nothing (Open mail / Ask Bob / Dismiss). Standing product law for
  human-approved Send **from Triangle** is the 16 September IA lock, not this
  slice.

NEXT (not this slice — do not fake the buttons):

- provider `createDraft` in Gmail / Outlook;
- mailbox-derived sent / replied, so the ledger is observed rather than
  clicked;
- typed / voice **Ask Triangle** that routes Scout / Hanna / Bob by intent
  (e.g. “investigate the end client from this email” → Scout). No Scout
  buttons on the Today mail card until that router exists. Context-aware
  Ask (missionless assignment + EntityCase return) is **DEV-010 first**;
  card/voice intent routing is later. Do not invent a Work Items product.

Why:

- reporting “Sent” and “They replied” on Today taught the operating system
  to wait for the CEO to type the weather;
- Bob already owns commercial follow-through once DEV-004 lands; Today
  should hand him the thread, not duplicate his job as three outcome buttons.

### 2026-09-15: Project Research Agent chat is retired

Decision:

- hide and disable the project Research Agent chat on Signal Inbox / project
  detail; `/api/research/chat` is not an operating path;
- research a signal through a Scout mission or Workforce hand-off, not by
  chatting on the project page;
- keep Signal Inbox as the project/signal **data** (list, suggestions,
  Approvals, contractor-chain accept). From 16 September it is not a primary
  nav destination — see that day's IA lock;
- do not add a migration for this cut; ask Nikola before any migration.

This supersedes the project-conversation half of the 1 September case-memory
decision. Mission and assignment threads remain the memory mechanism.

Why:

- chatting on a project was a parallel research path beside Scout missions;
- suggestions and human accept are the workbench; conversational OpenAI on
  the project page is not.

### 2026-09-15: Scout is bot-owned â no in-app OpenAI stand-in

CEO decision: Scout, Hanna and Bob work the same way. Triangle stores the work
and wakes the Grok bot. Scout's special in-app OpenAI executor
(`scout-executor` claiming `execution_mode: in_app`, plus stalled-bot
takeover) is retired so there is no second brain and no extra OpenAI bill
when Next would otherwise run Scout itself.

Scout (`project_researcher`) is always bot-owned in code, even if
`mission_runtime` is unset. New Scout assignments are `execution_mode: bot`
and wake the bot (`event: assignment`). The claim loop is hard-off.


### 2026-09-08: Test every human job for end-to-end agent ownership

Management clarified that Triangle combines agents and humans, with agents
intended to do all work they can reliably perform within delegated authority.
Ask of every human job: can an agent take it over end to end? If not, why not?

- Agents own jobs, verification and follow-through, not only drafts.
- Each human handoff names the decision, evidence or authority missing, or the
  actual human/physical responsibility. Missing integrations and reliability
  gaps are engineering work, not permanent assignments to the founders.
- Use deterministic software when sufficient; do not add agent activity for
  its own sake. Measure human effort including review, rework and manual rescue.
- Current approval/privacy rules remain. This is not authorization for
  outreach, data sharing, commitments, money movement or dormant SaaS prospecting.

Recorded in the product/growth audit and reconciled with the vision,
operating rules, roadmap, execution guidance and software-agent instructions.
This is a direction clarification, not completed implementation.

### 2026-04-28: The product is not a generic CRM

Decision:

- treat the app as a project-to-placement operating system, not a traditional CRM

Why:

- the commercial value comes from early project detection and turning that into labor placements
- companies / contacts / pipeline remain necessary, but they are not the strategic center

### 2026-04-28: Data centers are the first sector

Decision:

- use Data Centers as the first live sector for Hunter and commercial testing

Why:

- high-value projects
- cleaner public signals than some other sectors
- strong labor packages for electrical / MEP / commissioning

### 2026-04-28: Contractor-chain mapping is the missing middle

Decision:

- prioritize contractor-chain mapping after project discovery

Why:

- finding the project owner is not enough
- the real buyer is usually EPC / GC / MEP / electrical contractor side
- this is the bridge from "interesting project" to "real sales opportunity"

### 2026-04-28: OpenAI is the active Hunter provider

Decision:

- use OpenAI for Hunter right now instead of Anthropic

Why:

- Anthropic API access was blocked by insufficient API credits
- OpenAI integration is already part of the app stack
- the product should not stall on provider billing friction

### 2026-04-28: Shared repo memory is mandatory

Decision:

- keep core strategy and roadmap in repo files, not only in chat

Why:

- multiple agents are being used
- context loss between sessions is real
- opinions differ across agents, so a written source of truth is necessary

### 2026-04-28: A discovered project is not a win

Decision:

- define the central success object as a qualified project package opportunity

Why:

- project news alone does not create revenue
- the product must push from signal to contractor chain, buyer, crew package, next action, and placement
- this protects the app from becoming a vanity lead counter

### 2026-04-28: Add hard product operating rules for agents

Decision:

- add `PRODUCT_OPERATING_RULES.md` and point `AGENTS.md` to the product memory files

Why:

- future agents need explicit boundaries, not just strategy
- the rules clarify what not to build and what counts as done
- contractor-chain mapping and package hypotheses must stay central

### 2026-08-29: Contract-to-crew is the product category

Decision:

- define Triangle as a human-led, AI-assisted contract-to-crew operating
  system for cross-border technical staffing and subcontracting

Why:

- the software already discovers, researches, drafts, matches, and produces
  packets, but no commercial send or packet delivery is recorded
- value is created by a buyer route, order, mobilization, delivery, payment,
  and marginânot by agent activity
- this category keeps project-to-placement while adding contract, delivery,
  and economics that the old roadmap omitted

### 2026-08-29: AI employees are a capability, not the market wedge

Decision:

- keep provider-independent identity, scopes, assignments, approvals, memory,
  and audit
- do not position generic AI-workforce management as Triangle's primary
  product

Why:

- OpenAI, Microsoft, Google, LangChain, Relevance, Taskade, Sintra, and other
  horizontal platforms compete at that layer
- Triangle's potential moat is staffing/subcontracting domain truth and real
  outcome data

### 2026-08-29: Defer generic hybrid work OS and Collaboration Field

Decision:

- do not build the generic shell or spatial organization canvas now
- reconsider the Collaboration Field only after at least five agents and
  several humans create demonstrated ownership/coordination pain
- reconsider a horizontal product only after two paying non-staffing
  verticals prove a valuable common core

Why:

- the proposals contain useful UX patterns but solve an imagined scale problem
- Triangle currently needs commercial activation and delivery proof

### 2026-08-29: Use commercial evidence gates

Decision:

- roadmap phases advance only through real external and delivery evidence
- code, screens, AI output, accepted suggestions, and internal statuses do not
  advance a phase by themselves

Why:

- the product has passed a partial technical test but not a business test
- evidence gates prevent architecture/design work from substituting for buyer
  exposure

### 2026-08-29: The success object is contract-qualified

Decision:

- upgrade the âqualified project package opportunityâ to a
  **contract-qualified crew opportunity**

Why:

- a plausible project, buyer, and package still omit engagement model,
  economics, country/legal feasibility, supplier approval, real supply, and
  mobilization

### 2026-08-29: Supply-first and demand-first are equal lanes

Decision:

- support available people -> package -> find demand and
  signal/demand -> requirement -> find people as one converging workflow

Why:

- current high-scoring demand is PCS7/automation while stored supply is
  electrical installation
- Triangle must choose work from deliverable capacity, not AI-inferred demand
  alone

### 2026-08-29: External actions remain human

Decision:

- keep email, packet submission, supplier registration, commercial
  commitments, and personal-data sharing human-controlled
- preserve AI draft and final sent content separately

**Amended 16 September:** human control remains. Human-approved Send **from
Triangle** is allowed; “send outside and record” is no longer the only legal
channel. Agent-autonomous sending stays AUTO / APPROVAL / FORBIDDEN. See the
16 September IA lock. Do not read this entry as “Triangle must never send.”

Why:

- manual action is not the current bottleneck
- legal, privacy, deliverability, duplicate-action, and trust risks outweigh
  premature automation

### 2026-08-29: Durable orchestration is gated

Decision:

- keep current Next.js/Supabase/API patterns while they work
- evaluate a durable workflow runtime only after a proven process outlives a
  request, requires independent retries, pauses for approval, or must resume
  after crash/deploy

Why:

- current architecture is sufficient for commercial activation
- durable execution is useful infrastructure, not a product direction or
  justification for a rewrite

### 2026-08-29: External productization follows internal proof

Decision:

- sell/pilot the software only after Triangle uses it weekly for real revenue,
  proves repeatability, and finds a paying design partner with the same
  vertical problem

Why:

- multi-tenant foundations exist, but onboarding, security, support, data
  rights, integrations, and billing should be driven by an actual customer
- the likely external product is a vertical contract-to-crew OS, not a generic
  agent platform

**Superseded in timing, not category, by the 30 August 2026 design-partner
decision below.** Internal revenue proof and external problem/pilot validation
now run in parallel; generic SaaS build remains gated.

### 2026-08-30: Build a sellable vertical product with Triangle as tenant zero

Decision:

- the software is intended to be sold, but as a vertical contract-to-crew OS
  rather than generic HR, CRM, agent, or marketplace software
- the first external ICP is a 2â25 person European technical contract
  staffing, crew-supply, or labor-subcontracting business
- solo recruiters are a later starter tier; corporate HR, job seekers, generic
  freelancers, and large enterprises are not the first buyer

Why:

- established vendors already crowd generic ATS/CRM, sourcing, outreach, and
  agent features
- Triangle's differentiated workflow connects project/buyer intelligence,
  truthful crew packaging, governed commercial action, cross-border delivery,
  and margin

### 2026-08-30: External customer discovery begins during Phase 0

Decision:

- interview comparable agencies and crew suppliers now
- require repeated pain, a concrete commitment, and a paid scoped pilot before
  building external-customer features beyond tenant safety
- Triangle commercial proof remains a parallel gate rather than a reason to
  delay all market learning for 12 months

Why:

- early interviews prevent Nikola's tacit workflow from becoming hardcoded
- a paid pilot is stronger evidence than feature enthusiasm
- dual-track validation keeps product work connected to contract revenue

### 2026-08-30: Tenant identity is the first productization boundary

Decision:

- commercial AI must read a human-approved organization profile and sign-off
- no tenant may inherit Triangle/Nikola identity from code constants
- new tenants must complete required identity fields before AI commercial
  drafting

Why:

- organization isolation is incomplete if prompts or outputs leak another
  tenant's commercial identity even when database rows are correctly scoped

### 2026-08-30: Recruitment AI governance is a product requirement

Decision:

- preserve human oversight, provenance, evaluation, logs, correction paths,
  and purpose limits from the first external pilot
- do not infer sensitive traits, use emotion recognition, or automate final
  employment decisions
- obtain qualified legal review before marketing EU AI Act compliance

Why:

- AI used to filter or evaluate candidates can fall within the EU AI Act's
  high-risk employment category
- trust work added late is expensive and does not repair missing historical
  evidence

### 2026-09-01: Approved research becomes a living case, not an empty record

Decision:

- an accepted company finding must preserve its source evidence, responsible
  AI employee, assignment history, and conversation;
- accepting a company authorizes the same employee to continue safe,
  research-only qualification toward a named project, actual buyer path,
  Triangle-supported crew package, and exact next commercial action;
- the CEO view is a decision brief and exception queue, not a sequence of
  Workforce, Approvals, Companies, and Signal Inbox pages;
- project conversations and assignment conversations remain the initial
  memory stores; do not introduce a generic parallel CRM or vector-memory
  system until this vertical pattern proves insufficient.

Why:

- the prior workflow discarded the useful context at approval and produced a
  sparse company record with generic AI buttons;
- the human was acting as the integration layer between AI employees and
  domain records;
- read-only research continuation is reversible and low-risk, while outreach,
  personal-data sharing, supplier registration, and commercial commitments
  still require a human decision;
- a case is useful only when it moves toward the product's existing success
  object: a qualified project package opportunity and ultimately a
  contract-qualified crew opportunity.

### 2026-09-01: The CEO lands on decisions and exceptions, not dashboards

Decision:

- `/decisions` is the default application landing page;
- group pending research by case and state the recommendation, impact,
  unknowns, evidence quality, owner, next AI step, and next human step;
- show recent failed/waiting-review assignments and unsent external drafts as
  attention items;
- keep queued/active safe internal work visible only as an operating count;
- preserve raw evidence and existing accept/reject controls behind progressive
  disclosure rather than deleting the audit trail.

Why:

- the CEO must manage outcomes and exceptions rather than transport data
  between Workforce, Approvals, Companies, and Signal Inbox;
- an unsent message is more consequential than another database row and must
  remain a human boundary;
- grouping reduces review volume without giving AI authority to approve its
  own facts or external actions.

### 2026-09-04: Active goals focus on app development, not client search

Decision:

- make product/app development the active agent goal;
- pause external target research, client searching, problem-interview work,
  and design-partner preparation unless management requests them explicitly;
- interpret a generic request to âcontinueâ as eligible Product Track B work
  only;
- retain already prepared target/interview artifacts as dormant reference,
  not an active pipeline or required next action.

Why:

- management wants engineering attention spent on the application;
- research activity must not displace app functionality, reliability,
  testing, or completion of contract-to-crew workflows;
- the long-term sellable-product direction can remain without making client
  search a current operating goal.

This supersedes the execution timing of the 30 August decision that external
customer discovery begins during Phase 0. It does not authorize speculative
generic software or autonomous external action.

### 2026-09-10: Missions are the unit of delegated work

Decision:

- a mission is one objective delegated to one employee; every instruction about
  that objective is a step inside it, not a new job and not a new tab;
- a step works from the mission's state â the objective, the conversation, and
  everything the mission already holds, including what the CEO ruled out and
  who was already contacted;
- inside a mission an employee records the companies and people it finds, with
  their sources, marked agent-found and unverified; a person verifies them or
  rules them out, with a reason;
- humans approve actions: contacting anyone, sending, changing commercial
  status, deleting, committing money. The ledger still refuses a contact that
  no person confirmed;
- Today carries only what needs a person: people a mission made reachable, and
  missions that ask something or stopped;
- a mission's state (queued, working, needs you, ready, done, blocked) is
  derived from its steps every time it is shown, never stored.

Why:

- the Ask box answered each question from scratch, so a follow-up re-ran the
  original question and the queue filled with near-identical research jobs;
- pressing "Add to Companies" for every sourced fact is transport work, and it
  was the only way research ever reached the Companies page;
- one shell â tabs, worker, activity, conversation â serves market research
  and recruiting through the existing employees, instead of separate AI
  features.

Built on agent assignments, their threads and agent_runs; no new agent roles.
Outside missions, research proposals still need human acceptance, and a named
project enters the pipeline only when a person decides it is one.

### 2026-09-11: Missions finish on facts, with as few instructions as possible

Decision:

- mission work is measured by how few instructions the CEO gives before a
  mission comes back ready for a decision. The Germany EPC mission needed five;
  the target is one;
- every mission has a plan (how it gets there) and success criteria (when it
  is finished). Progress is counted from the records, never from what a worker
  reports about itself;
- one worker runs passes â discover, research, verify, qualify, rank, prepare â
  before any new named agent. A pass may later be delegated without changing
  the mission the CEO sees;
- continuation is a durable run engine: bounded, resumable, idempotent and
  retryable runs, with run and spend limits enforced in the database. A
  scheduler only wakes it; it is not the intelligence;
- a long mission is read as condensed state â objective, criteria, CEO
  decisions, known facts, open questions, next work â plus its records and the
  latest conversation, not its whole history;
- evidence-based verification and entity resolution (company, person, role,
  contact route: n of 4) come before unattended continuation. A record below
  the threshold is never presented as ready to contact;
- autonomy has three classes, enforced where the action happens â tool
  permissions and database guards â never by a prompt alone. The AI decides,
  logs, and can be undone: what to search next, research depth, ranking,
  rejecting poor fits, retries, stopping when the criteria are met. The AI
  prepares and a person approves: outreach, call recommendations, proposals,
  candidate recommendations, follow-ups. Only a person acts: sending anything
  externally, price, rate or headcount commitments, spending, contracts,
  important deletion;
- monitoring is company-, project- and opportunity-first. A person's record
  changes only for business-relevant professional changes found in public
  sources; nobody is tracked for their own sake.

Why:

- a worker told only the next instruction stops after it, and the CEO becomes
  the scheduler;
- the first mission runs already filed a lookalike company and two people under
  one name; unattended hours would multiply that;
- an instruction that says "never send email" is not a boundary.

This meets the 29 August gate for durable orchestration â mission work outlives
a request, needs independent retries, pauses for the CEO, and must resume after
a crash or a deploy â and lifts the Phase 0 freeze on new orchestration for
mission runs only: built in Postgres and Next.js, with no new workflow runtime.

### 2026-09-11: A mission can run on its employee's own bot

Decision:

- Triangle keeps the record, the permissions, the rules and the audit; the
  model or bot doing the work is replaceable. Moving an employee to another
  model is a setting, not a rewrite;
- an employee can be switched to run its missions on its own bot (Scout on
  Grok first). Its steps then reach it only through Triangle: the step waits in
  its inbox and Triangle calls the bot's wake-up webhook the moment the step is
  assigned or retried. The scheduled inbox check stays as the backup;
- the wake-up call carries only the event and the ids. The bot reads the
  mission from Triangle â condensed state, finish line, the CEO's decisions,
  what the mission holds, and supply by role without anyone's name â and
  writes back with its badge: activity, the finish line, quoted decisions, the
  companies and people it found, and the finished step;
- every write is checked where it lands: the badge's employee must own the
  step, the step must be the bot's and still open, a decision's quote must be
  in the CEO's instruction word for word, and what was filed is counted from
  the findings, never from the bot's report;
- Triangle's own runner never takes a bot's step, and the unattended pulse
  does not take one over when it stalls. A waiting step says what it waits
  for, and a retry wakes the bot again;
- employees not switched keep running in Triangle's own runner.

Why:

- Scout on Grok found its work only by polling, so an instruction waited for
  the next scheduled check â up to half an hour in working hours, overnight
  outside them â and Scout's inbox could also hand it steps Triangle was
  running itself;
- the CEO wants the Grok bot to do the mission work with its own tools and
  memory, with Triangle as the truth it reads from and writes to.

### 2026-09-12: How an employee works belongs to Triangle, not to the bot

Decision:

- the CEO's standing instructions for an employee â how it works, every day â
  live in Triangle, versioned, with who changed them and when. Every run reads
  them: the bot's wake-up payload, its inbox, and Triangle's own worker alike;
- a mission decision is narrower than a standing instruction and wins where the
  two overlap;
- an instruction is never a boundary. What an employee may do is still enforced
  by its badge scopes, the finding contract and the API;
- the role file in this repo is the protocol â endpoints, formats, refusals â
  and changes when the software changes. How the work is done changes when the
  CEO types.

Why:

- Scout's instructions lived in the file pasted into its own platform, so the
  copy here and the copy there drifted within an hour of an edit;
- the CEO re-explained the same preferences mission after mission, which is the
  cost the north star measures;
- "make it learn" cannot mean training a model. Triangle remembers and every
  run reads, which is also why replacing the model changes nothing.

Built on agent_house_rules (migration 046). No new agent roles, nothing
autonomous. First surface: the Workforce page, where each employee carries its
own rules.

### 2026-09-14: Work between employees is a graph Triangle holds

Decision:

- Triangle is the control plane; Scout, Hanna and Bob are peers, not a
  hierarchy. Scout owns demand, Hanna owns Triangle's access to people, Bob
  owns commercial operations â turning both into revenue and keeping work
  moving. None of them is the others' boss;
- any employee may ask any other for work. The request is an assignment under
  the work it came from, in the same mission, and the answer wakes the one who
  asked. Requests may run in parallel; nothing encodes an order such as Scout,
  then Hanna, then Bob;
- employees may talk freely on their own platform, but work with a result is
  recorded in Triangle, because a chat message cannot be retried, shown to the
  CEO, or answered with a wake-up;
- roles are outcomes, not task lists: new techniques need no migration, and a
  new employee is a new row with a badge and a wake-up, not new code;
- external communication is a per-employee policy â auto, approval or
  forbidden per kind of message. Today every kind is approval or forbidden, and
  a commitment is never an employee's to make. "Auto" takes effect only once
  Triangle records what was sent.

Why:

- the Grok Bot platform can wake a Bot but offers no way to assign it work and
  receive a structured result, so durable delegation has to live here;
- a mandatory manager in the middle would make one employee a serial bottleneck
  when demand and supply can be worked at the same time;
- the end goal is employees that actually work, not ones that ask the CEO to
  press send forever â the policy grows without a rebuild.

Built on agent_assignments (migration 047) and the architecture study of
13 September. No workforce registry, marketplace hiring or labour market yet.

### 2026-09-15: One map, one list of next steps

Decision:

- the root README is the only map of the documentation, and ROADMAP_EXECUTION
  is the only list of next steps, each item with its acceptance criteria. The
  separate work queue, HANDOFF and the docs/README map are retired;
- the living documents stay at the root. How a module works goes to
  docs/reference, how to run the app to docs/operations, dated reviews to
  docs/reviews, and everything superseded or paused to docs/archive;
- the role files under agents/ keep their paths, because Triangle serves them to
  the employees' bots.

Why:

- next steps were spread over four files â ROADMAP_EXECUTION, the work queue,
  HANDOFF and the docs map â that each had to be kept in step, next to a
  deployment guide that still described pushing straight to production;
- the CEO asked for total clarity about future work and for unnecessary
  documents to be deleted or grouped.

This replaces the 8 September choice to keep reference files at the root for
stable paths; the references in agent instructions, scripts and code comments
moved with them.

### 2026-09-15: Product surface law

Decision:

- agents live in complexity: missions, findings, mail, scoring, chains;
- Nikola lives in Today and Missions;
- classify every screen before putting it in the shell:
  - **A primary** — daily operating surfaces. Destinations amended
    16 September to **Today, Missions, Talent, Team** (Workforce renamed
    later), then the same day to **Today, Missions, Talent** with Team in
    Settings (the operating-shell decision); Settings stays admin/C;
  - **B contextual** — opens from a case, approval, holding, or next move;
  - **C infrastructure** — APIs, settings, diagnostics; reachable, not in
    primary nav;
- Job Intake is **C** for navigation. The mail pipeline stays. Bob waking on
  commercial mail is a later DEV, not this change.
- Signal Inbox / Hunter is **C** for navigation (16 September IA). The
  project/signal data stays; Scout consumes it. Not a CEO patrol queue.

Why:

- the 1 September decision already said the CEO view is Today and exceptions,
  not a tour of Workforce, Approvals, Companies, Signal Inbox, or Job Intake;
- browsing a lead list as a CEO queue duplicates Today;
- hiding a list is not deleting a module.

### 2026-09-15: Job Intake is off primary navigation

Decision:

- hide Job Intake from the app shell (sidebar). Quick add never offered it;
- keep every intake table, API, sync, scoring, reply draft, and lead row;
- keep `/job-intake` as a hidden diagnostics/admin page with a banner that it
  is not a daily operating surface and that commercial mail exceptions belong
  on Today;
- do not redirect `/job-intake` away (unlike `/companies`); bookmarks still
  render the list;
- do not build Bob mail-wake or mission creation in this change.

Why:

- Job Intake is no longer a CEO operating surface;
- the pipeline must stay until Bob mail → Today is proven;
- this is an operating-surface change, not a module deletion.

### 2026-09-15: The Companies directory is not an operating surface

Decision:

- hide Companies from the app shell (sidebar and Quick add);
- keep every company row; do not drop tables or wipe records;
- keep `/companies/[id]` so missions, Approvals and holdings can still open a
  company;
- `/companies` (the mega-list) is not a place the CEO browses — redirect it to
  Missions with a short notice.

Why:

- Triangle is not a generic CRM. A directory of names is inventory, not a
  contract-qualified crew opportunity;
- the 1 September decision already said the CEO view is Today and exceptions,
  not a tour of Workforce, Approvals, Companies and Signal Inbox;
- this is an operating-surface change, not a cosmetic navigation project.

## Operating Rules

- prefer shipping modules that move from signal to placement
- do not over-invest in features that do not improve commercial conversion
- record major pivots here when they happen
- keep this file short and high-signal
