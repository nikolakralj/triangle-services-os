# Decisions

## Purpose

This file records major product and implementation decisions so future agents do not need to reconstruct them from chat history.

## Decision Log

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

## Operating Rules

- prefer shipping modules that move from signal to placement
- do not over-invest in features that do not improve commercial conversion
- record major pivots here when they happen
- keep this file short and high-signal
