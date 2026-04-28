# Roadmap Execution

## How To Use This File

This is the working roadmap.
It is intentionally more operational than `ROADMAP.md`.

`ROADMAP.md` is the broad product horizon.
This file is the execution sequence for the current product strategy.

## Current Product Direction

The product has pivoted from "internal CRM MVP" toward "project-to-placement operating system."

The CRM remains necessary, but it is now the supporting system, not the main product idea.

## Phase 0: Stabilize Shared Memory

Goal:

- preserve cross-agent continuity
- prevent strategy drift

Deliverables:

- `VISION.md`
- `WORKFLOW_SIGNAL_TO_PLACEMENT.md`
- `ROADMAP_EXECUTION.md`
- `DECISIONS.md`
- `CURRENT_STATE.md`

Status:

- in progress now

## Phase 1: Make Hunter Trustworthy

Goal:

- produce useful discovered-project records, not demo theater

Deliverables:

- stabilize Hunter provider integration
- clean encoding issues in Hunter UI text
- validate discovered project quality
- improve source provenance
- improve prompt quality and scoring realism
- reduce obviously weak leads

Success criteria:

- Nikola can run a hunt and get a small set of plausible projects with usable source links

## Phase 2: Add Contractor Chain Layer

Goal:

- move from "project found" to "who actually buys labor"

Deliverables:

- contractor chain schema
- UI for owner / EPC / GC / MEP / electrical / intermediary mapping
- confidence scoring
- manual and AI-assisted relationship entry
- project detail view that shows chain clearly

Success criteria:

- for a discovered project, Triangle can record the likely labor-buying chain and identify the best attack point

## Phase 3: Add Buyer Mapping

Goal:

- identify people, not just companies

Deliverables:

- buyer role model
- contact enrichment workflow
- "likely buyer" ranking
- decision-maker notes and source provenance

Success criteria:

- each serious project can produce a short list of real buyer candidates

## Phase 4: Add Crew Package Engine

Goal:

- convert project intelligence into a concrete labor offer

Deliverables:

- package recommendation model
- phase-to-labor heuristics
- worker coverage estimate
- rough revenue estimate
- "recommended offer" block on project detail

Success criteria:

- for a target project, Nikola can see what exact crew package to offer

## Phase 5: Add Outreach Workflow

Goal:

- turn research into action

Deliverables:

- outreach draft generation tied to discovered projects
- outreach linked to contractor / buyer / package
- follow-up task generation
- activity logging

Success criteria:

- Nikola or Ralph can go from discovered project to first outreach without leaving the system

## Phase 6: Connect To Placement Workflow

Goal:

- bridge business development into real delivery

Deliverables:

- promote discovered project into opportunity
- connect worker shortlist to package
- track submission / review / mobilization
- document and compliance links

Success criteria:

- a serious lead can become a managed placement workflow

## Immediate Priorities

1. stabilize and commit current Hunter work
2. clean current repo state and separate unfinished work from proven work
3. improve Hunter result quality
4. design contractor chain schema and UI

## Explicit Non-Priorities Right Now

These are useful, but not the main thing at this moment:

- generic CRM polish
- cosmetic dashboard work
- perfect export flows
- full document center maturity
- advanced worker module depth

Those matter later, but the biggest commercial leverage is in project discovery plus contractor-chain mapping.
