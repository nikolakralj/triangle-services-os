# Decisions

## Purpose

This file records major product and implementation decisions so future agents do not need to reconstruct them from chat history.

## Decision Log

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
  and margin—not by agent activity
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

- upgrade the “qualified project package opportunity” to a
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
- the first external ICP is a 2–25 person European technical contract
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
- interpret a generic request to “continue” as eligible Product Track B work
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
- a step works from the mission's state — the objective, the conversation, and
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
- one shell — tabs, worker, activity, conversation — serves market research
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
- one worker runs passes — discover, research, verify, qualify, rank, prepare —
  before any new named agent. A pass may later be delegated without changing
  the mission the CEO sees;
- continuation is a durable run engine: bounded, resumable, idempotent and
  retryable runs, with run and spend limits enforced in the database. A
  scheduler only wakes it; it is not the intelligence;
- a long mission is read as condensed state — objective, criteria, CEO
  decisions, known facts, open questions, next work — plus its records and the
  latest conversation, not its whole history;
- evidence-based verification and entity resolution (company, person, role,
  contact route: n of 4) come before unattended continuation. A record below
  the threshold is never presented as ready to contact;
- autonomy has three classes, enforced where the action happens — tool
  permissions and database guards — never by a prompt alone. The AI decides,
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

This meets the 29 August gate for durable orchestration — mission work outlives
a request, needs independent retries, pauses for the CEO, and must resume after
a crash or a deploy — and lifts the Phase 0 freeze on new orchestration for
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
  mission from Triangle — condensed state, finish line, the CEO's decisions,
  what the mission holds, and supply by role without anyone's name — and
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
  the next scheduled check — up to half an hour in working hours, overnight
  outside them — and Scout's inbox could also hand it steps Triangle was
  running itself;
- the CEO wants the Grok bot to do the mission work with its own tools and
  memory, with Triangle as the truth it reads from and writes to.

## Operating Rules

- prefer shipping modules that move from signal to placement
- do not over-invest in features that do not improve commercial conversion
- record major pivots here when they happen
- keep this file short and high-signal
