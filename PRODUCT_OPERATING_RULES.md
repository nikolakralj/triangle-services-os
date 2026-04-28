# Product Operating Rules

## Prime Directive

Triangle Services is building a project-to-placement operating system.

The goal is to help Triangle move from early industrial project signals to real crew placements.

The core workflow is:

`signal -> qualified project -> contractor chain -> buyer contacts -> crew package -> outreach -> opportunity -> placement`

The app is not a generic CRM.
The CRM is supporting infrastructure.

The central commercial question is:

Can Triangle place 10-20+ workers on this project, through the right buyer, at the right phase?

## Success Object

Do not treat these as wins:

- project discovered
- news article summarized
- company record created
- generic lead added
- AI summary generated

The real success object is a qualified project package opportunity.

A qualified project package opportunity has:

- real project
- relevant sector
- relevant country
- suitable timing
- likely electrical / MEP / industrial labor demand
- contractor-chain visibility
- likely buyer or buyer role
- specific crew package
- next commercial action

## Vocabulary

### Signal

A signal is a clue.

Examples:

- news article
- planning permit
- tender
- financing announcement
- construction start
- contractor announcement
- hiring spike

A signal is not a sales opportunity.

### Discovered Project

A discovered project is a verified or semi-verified project record.

It should answer:

- what is being built?
- where?
- by whom?
- what sector?
- what phase?
- what sources support it?

It is still not enough for outreach.

### Contractor Chain

The contractor chain is the missing middle between project news and labor sales.

It should map:

- owner / operator
- developer
- owner's representative
- EPC
- general contractor
- MEP contractor
- electrical contractor
- specialist subcontractor
- labor intermediary

The project owner is usually not the labor buyer.

### Buyer Candidate

A buyer candidate is a person or role who could influence labor buying.

Examples:

- project director
- construction manager
- MEP manager
- electrical package manager
- site manager
- subcontract manager
- procurement manager
- workforce / mobilization lead

### Crew Package

A crew package is the commercial offer.

Examples:

- 20 cable pullers + 2 supervisors
- 12 electricians for fit-out
- 10 tray installers + 1 foreman
- 8 commissioning technicians
- 15 workers for night shift cable pulling

Bad:

`We can provide manpower.`

Good:

`20 cable pullers + 2 supervisors for 8-12 weeks during electrical fit-out.`

### Opportunity

Only create or promote a real opportunity when there is enough commercial shape:

- project is real
- phase is relevant
- contractor chain has at least one attack point
- buyer or buyer role is identified
- crew package is plausible
- next action is clear

This protects the pipeline from filling with low-quality project headlines.

## Commercial Operating Rules

1. News is only a signal.
2. A project owner is not automatically the labor buyer.
3. Do not create outreach from a project headline alone.
4. Every serious project needs a contractor-chain map.
5. Every serious project needs a package hypothesis.
6. AI must separate facts from inferences.
7. Every important claim needs source provenance.
8. Unknown contractor-chain fields should remain visibly unknown.
9. Do not hide uncertainty behind fake confidence.
10. The app should always recommend the next commercial action.

## Facts, Inferences, Unknowns

AI output must separate:

- facts
- inferences
- unknowns

Example:

Fact:

- The project was announced by source X.

Inference:

- Electrical fit-out demand is likely because this is a large data center project.

Unknown:

- The MEP contractor has not been identified yet.

Unknown means unknown.
Do not rewrite unknowns as confident claims.

## Attack Point

Every project should have an attack point.

The attack point is the best current company or role to approach next.

Examples:

- owner
- developer
- GC
- EPC
- MEP contractor
- electrical subcontractor
- labor agency
- site manager
- procurement contact

Most projects start with:

`attack point unknown`

The app should move them toward:

`attack point identified`

This is more useful than generic CRM status.

Suggested project commercial statuses:

- signal found
- project verified
- too early
- too late
- contractor chain needed
- attack point found
- buyer candidate found
- package ready
- outreach ready
- outreach sent
- in conversation
- opportunity created
- workers submitted
- mobilization
- won
- lost
- monitor

## Do Not Build

Do not build generic CRM features unless they support project-to-placement.

Do not make dashboards that summarize fake or sample data as if it were real.

Do not treat AI-generated project summaries as verified facts.

Do not create outreach from project headlines alone.

Do not rank projects only by size, investment value, or media attention.

Do not hide missing contractor-chain data.

Do not prioritize owner contacts when the likely buyer is downstream.

Do not call something an opportunity until there is a plausible buyer and package.

## Hunter Definition Of Done

Hunter is not done when it finds projects.

Hunter is useful when it can produce a small number of project records that include:

- source-backed project summary
- sector
- country
- project phase
- timing estimate
- labor relevance
- reason for keeping or rejecting
- confidence score
- missing contractor-chain fields
- recommended next action

A Hunter result without a next commercial action is incomplete.

## Contractor Chain Definition Of Done

Contractor-chain mapping is useful when a project can show:

- owner / operator
- developer
- EPC or GC if known
- MEP contractor if known
- electrical contractor if known
- labor intermediary if known
- confidence per relationship
- source per relationship
- unknown roles clearly marked
- best current attack point

The chain does not need to be complete to be useful.
But the system must clearly show what is known, what is inferred, and what is unknown.

## Crew Package Engine Definition Of Done

The crew package engine should translate project intelligence into a concrete labor offer.

It should consider:

- sector
- project phase
- likely work package
- country
- duration estimate
- headcount estimate
- supervision requirement
- worker availability
- compliance risk
- revenue potential

The output should be specific enough for outreach.

## Next Product Module

The next serious module should be:

Project Detail: Contractor Chain + Package Hypothesis

For every discovered project, the page should show:

- project facts
- sources
- phase
- commercial score
- labor relevance
- contractor chain
- known unknowns
- likely attack point
- recommended crew package
- next action

Once this page exists, outreach becomes grounded.
Without this page, outreach is guessing.

## Product Philosophy

News finds the project.
Contractor-chain mapping finds the buyer.
Crew-package logic creates the offer.
Outreach starts the deal.
Worker delivery makes the money.
