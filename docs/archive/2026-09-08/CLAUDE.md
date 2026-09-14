# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

---

## Commands

```bash
npm run dev        # Start dev server
npm run build      # Type-check + production build (run before committing)
npm run lint       # ESLint
npm run test:e2e   # Playwright E2E tests
```

---

## Architecture

**Stack:** Next.js 16 · React 19 · Supabase (Postgres + auth) · OpenAI Responses API · Tailwind CSS v4

**Core workflow the product encodes:**
`signal → qualified project → contractor chain → buyer contacts → crew package → outreach → opportunity → placement`

### Directory layout

```
src/
  app/
    (app)/            # Authenticated shell (layout, sidebar)
      hunter/[id]/    # Project detail — main cockpit page
      companies/[id]/ # Company cross-project intel
      workers/        # Worker pool management
      pipeline/       # Kanban opportunity board
      contacts/ tasks/ dashboard/ settings/ …
    api/              # Route handlers (all under /api/…)
      research/       # AI research loop + outreach PATCH
      packages/[id]/match/  # Worker matching engine
  components/
    ui/               # Primitive design system (Badge, Button, Card, Field, StatCard)
    modules/          # Feature-level smart components
  lib/
    data/             # All Supabase query functions (server-only unless noted)
    supabase/         # Client factories + requireApiAccess
supabase/
  migrations/         # Sequential SQL migrations (001–009)
```

### Supabase client rules

Three clients — pick the right one:

| Client | Factory | When to use |
|---|---|---|
| Cookie (SSR) | `createCookieSupabaseClient()` | Server components, page.tsx, middleware — reads user JWT from cookies |
| Service role | `createServiceSupabaseClient()` | All `lib/data/*.ts` functions, API route data reads — bypasses RLS |
| Request (Bearer) | `createRequestSupabaseClient(authHeader)` | API routes that accept MCP/external Bearer tokens |

**API route pattern** — always call `requireApiAccess(request)` first. It handles both cookie JWT auth and `MCP_API_KEY` static key auth, and returns `{ ok, demo, organizationId, userId }`. Never call the cookie client for membership lookups; it hits RLS and silently returns null.

### Data layer conventions

- All `src/lib/data/*.ts` files start with `import "server-only"`.
- PostgREST foreign-key relationships are NOT configured — do **not** use nested select syntax like `.select("projects(id, title)")`. Always run separate queries and join in JavaScript using a `Map`.
- Schema inconsistency to know: `contractor_chain_nodes` and `buyer_contacts` use `organization_id`; `project_packages` and `outreach_drafts` use `org_id`. Check per table.
- After any column/enum change, append `NOTIFY pgrst, 'reload schema';` to the migration.

### UI component contracts

**`Badge`** — `intent` prop only (no `variant`): `neutral | info | success | warning | danger | purple`

**`Button`** — `variant` prop only (no `size`): `primary | secondary | ghost | danger`. Control size via `className="h-7 px-2 text-xs"` etc.

**`Card`** — use `<Card>`, `<CardHeader title="…" description="…" action={…} />`, `<CardContent>` sub-components.

**`PersistedCollapsible`** — collapsible panel that stores open/closed state in localStorage. Use for right-panel sections on project detail page.

### Research / AI agent

`/api/research/chat` runs a multi-turn OpenAI Responses API agentic loop. Rules:
- Turn 0: pass `input` as a **string**. Turn N+: pass `{type:"function_call_output", …}` items + `previous_response_id`.
- AI never writes to `contractor_chain_nodes` or `buyer_contacts` directly — it writes to `research_suggestions` (status `pending`). Human accept triggers `acceptResearchSuggestion()`.
- All agent tools are defined in `src/lib/data/research.ts` and `src/lib/data/global-scout.ts`.

### Worker matching engine (Pass 2)

- Migration: `supabase/migrations/009_package_worker_matches.sql` — apply manually in Supabase SQL editor before first use.
- Scoring in `src/lib/data/worker-matching.ts`: role match (40 pts) + skill coverage (40 pts) + availability (20 pts), multiplied by `avg(reliability + quality + safety) / 100`.
- Status lifecycle: `shortlisted → submitted → placed | rejected`.
- UI: `WorkerMatchPanel` receives `packages` + `initialMatchesMap` as server-rendered props; all PATCH actions call `router.refresh()` to re-fetch.

### Migrations

Numbered sequentially under `supabase/migrations/`. Current: 001–009. Apply new ones by pasting into the Supabase SQL editor. Always:
1. Use `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE … ADD COLUMN IF NOT EXISTS` (never drop-and-recreate).
2. End with `NOTIFY pgrst, 'reload schema';`.

### Agent delegation pattern

For large features, delegate backend (migration + data layer + API route) and frontend (UI component) to parallel background agents simultaneously. Agents sometimes write to the wrong project directory (OneDrive copy vs `C:\Users\nikol\Projects\…`). Verify written files are in `C:\Users\nikol\Projects\triangle-services-os\`.
