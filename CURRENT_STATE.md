# Current State

## Purpose

This file is the honest status report for the repo.
It should tell a future agent what is real, what is partial, and what still needs cleanup.

## Product Direction

Current direction:

- the app started as a private internal CRM / agency OS
- it is now evolving toward a project-to-placement operating system
- the Hunter module is the first visible expression of that pivot

## What Is Real Today

- Next.js app shell exists
- Supabase schema, auth, and RLS foundation exist
- companies module is partially wired to real Supabase data
- Hunter feature exists in code
- Hunter can discover projects and write them to the database
- OpenAI is now the active Hunter provider
- contractor-chain final tables and project UI exist
- Option C research-workbench foundation exists:
  - authenticated `/api/mcp` route
  - read-only MCP context tools
  - suggestion-only MCP proposal tools
  - `research_suggestions` review panel on project detail
  - audit table support through `ai_tool_calls`
- conversational research agent is live:
  - `/api/research/chat`
  - project-level memory via `research_conversations` + `research_messages`
  - tool-driven suggestions from chat into `research_suggestions`
- one-shot advanced research run is live:
  - `/api/research/run`
  - `research_runs` + `research_sources` + `research_suggestions` writes
  - run trigger UI on Hunter project detail page

## What Is Still Partial

- many non-Hunter pages still rely partly or heavily on sample data
- the pipeline is visually improved but not fully backed by real opportunity data
- company detail still lacks fully wired related data
- AI and dashboard areas still need stronger grounding in real database state
- multi-agent research orchestrator (specialist-agent fan-out) is not implemented yet
- public-records, web-source, auditor, people, and strategy agents are not implemented yet
- accepted package suggestions do not yet become rich final package records
- buyer mapping exists only as early data structures and suggestions
- crew package recommendation exists as project-detail hypotheses, not a full matching engine
- migrations `004_research_workbench.sql` and `005_research_conversations.sql` must be applied to Supabase before full live testing

## Repo Reality Check

At the time this file was created, the working tree includes substantial uncommitted work beyond the original MVP.

That includes:

- Hunter pages and APIs
- Hunter data layer
- sector and discovered project components
- changes in several core pages and shared modules

This means:

- the repo contains real progress
- but the current working tree is not yet a clean, fully stabilized slice

## Known Important Truths

- finding a project is not enough
- the real buyer is often not the owner or headline brand
- contractor-chain mapping is the next strategic module
- generic CRM polish is not the highest-value work right now

## Current Development Priorities

1. stabilize current Hunter work and make it trustworthy
2. clean and commit the current product pivot in coherent slices
3. apply and verify research-workbench migration in Supabase
4. stabilize research chat + advanced run reliability
5. connect project intelligence to concrete crew packages

## Things To Be Careful About

- do not assume a discovered project is automatically commercially useful
- do not confuse project owner visibility with labor buyer visibility
- do not let the app drift back into generic CRM priorities
- do not overclaim AI confidence where the contractor chain is still inferred

## If Another Agent Picks This Up

Start here:

1. read `VISION.md`
2. read `PRODUCT_OPERATING_RULES.md`
3. read `WORKFLOW_SIGNAL_TO_PLACEMENT.md`
4. read `ROADMAP_EXECUTION.md`
5. read `DECISIONS.md`
6. read `RESEARCH_WORKBENCH.md`
7. read this file

Then inspect the current git status before making assumptions about what is already committed.
