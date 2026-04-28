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

## What Is Still Partial

- many non-Hunter pages still rely partly or heavily on sample data
- the pipeline is visually improved but not fully backed by real opportunity data
- company detail still lacks fully wired related data
- AI and dashboard areas still need stronger grounding in real database state
- contractor-chain workflow does not exist yet
- buyer mapping does not exist yet
- crew package recommendation does not exist yet

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
3. add contractor-chain mapping
4. add buyer mapping
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
6. read this file

Then inspect the current git status before making assumptions about what is already committed.
