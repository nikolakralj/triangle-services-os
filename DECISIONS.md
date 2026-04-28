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

## Operating Rules

- prefer shipping modules that move from signal to placement
- do not over-invest in features that do not improve commercial conversion
- record major pivots here when they happen
- keep this file short and high-signal
