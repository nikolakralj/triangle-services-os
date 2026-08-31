# Research Workbench

## Purpose

This module is the Option C foundation: an auditable AI research workbench for contractor-chain and buyer-route intelligence.

It is not a generic chatbot and it is not a LinkedIn scraper.

The goal is to turn a discovered project into reviewed commercial intelligence:

`project -> evidence -> contractor chain -> buyer/procurement route -> package hypothesis -> human approval -> next commercial action`

Research is supporting work. An accepted suggestion is not a commercial win
until it contributes to a buyer route, qualified requirement, supplier action,
proposal, order, or delivery.

## Current Implementation

Implemented in code:

- `supabase/migrations/004_research_workbench.sql`
- `src/app/api/mcp/route.ts`
- `src/lib/data/research.ts`
- `src/app/api/research/suggestions/[id]/route.ts`
- `src/components/modules/research-suggestions-panel.tsx`
- project detail page shows pending research suggestions
- `src/app/api/research/chat/route.ts` with persistent project conversation
- `src/app/api/research/run/route.ts` for one-shot advanced research
- unified `/approvals` queue across research suggestions and agent findings
- agent findings can propose previously unknown projects/companies/contacts
- accepted company findings can create a company and place it on a project
  contractor chain

The MCP route is authenticated, org-scoped, Zod-validated, rate-limited, and logs tool calls to `ai_tool_calls`.

## Database Tables

- `research_runs`
- `research_sources`
- `research_suggestions`
- `ai_tool_calls`

The live project has migrations through `026_agent_replies.sql` applied/useful
features beyond the original foundation. Always verify live schema rather than
assuming this early setup note is still current.

## Tool Boundary

MCP tools are intentionally split into:

- read-only context tools
- suggestion tools
- review tools

Agents must not directly write final CRM or contractor-chain records.
They propose evidence-backed suggestions first.

Final writes happen only when a user or approved review tool accepts a suggestion.

## Available MCP Tools

Read-only:

- `list_projects`
- `get_project`
- `get_research_context`
- `list_chain_nodes`
- `list_buyer_contacts`
- `list_project_notes`
- `list_research_sources`
- `list_research_suggestions`

Suggestion tools:

- `log_research_source`
- `propose_chain_node`
- `propose_buyer_contact`
- `propose_package_opportunity`
- `propose_note`

Review tools:

- `accept_research_suggestion`
- `reject_research_suggestion`
- `edit_and_accept_research_suggestion`

## Research Rules

Every suggestion must include:

- source URL
- evidence text
- confidence
- agent name
- project ID

AI output must separate:

- facts
- inferences
- unknowns

Unknown means unknown.
Do not convert uncertainty into fake confidence.

## LinkedIn / Browser Rules

- No automated LinkedIn crawling.
- No mass profile extraction.
- No automated messages or connection requests.
- No bypassing login, paywalls, CAPTCHA, or access controls.
- Browser-assisted research may only read the currently visible page opened by the user.
- Save only business-relevant information.
- User approval is required before a contact becomes final.

## What Is Still Missing

The workbench is functional, but commercial closure is still missing:

- buyer/procurement/contract route is not a complete first-class workflow;
- accepted package suggestions are still thinner than a contract-ready
  package;
- accepted research does not consistently require an owner, next action, and
  due date;
- buyer coverage is low in live data;
- source/action/outcome attribution is not complete;
- structured rejection reasons and bulk triage may be useful if real backlog
  work proves the need;
- dedicated public-procurement/supplier-route monitors are deferred until the
  selected package and target accounts are proven;
- no multi-agent specialist fan-out is required in the current roadmap phase.

## Definition Of Done

The research workbench is useful when it can answer:

- Who owns this project?
- Who is actually buying?
- Which contractor controls each package?
- Which people should we contact?
- What can Triangle offer?
- What evidence supports it?
- What is the next commercial action?

A suggestion without source evidence is incomplete.
A project without a next commercial action is incomplete.
Accepted research without a downstream action remains stored knowledge, not a
qualified opportunity.
