# Claude Code entry point

@AGENTS.md

Read [SOFTWARE_AGENT_INSTRUCTIONS](SOFTWARE_AGENT_INSTRUCTIONS.md) and the
[README](README.md), which says which file answers which question. Next steps
live only in [ROADMAP_EXECUTION](ROADMAP_EXECUTION.md) and implementation status
only in [CURRENT_STATE](CURRENT_STATE.md); do not keep a competing list or
snapshot here.

## Implementation references

- Next.js 16 / React 19; read `node_modules/next/dist/docs/` before coding.
- App auth boundary: `src/proxy.ts`.
- API authentication: `src/lib/supabase/server.ts`; require explicit role and
  actor checks where the operation needs them. A returned `userId` alone does
  not prove a human session because the legacy MCP key supplies one.
- Page session/capabilities: `src/lib/auth/session.ts`.
- Domain access: `src/lib/data/`; service-role access bypasses RLS, so explicit
  organization scoping and authorization are essential.
- Research contracts: [RESEARCH_WORKBENCH](docs/reference/RESEARCH_WORKBENCH.md).
- Runtime workforce contracts: [agents/WORKFORCE](agents/WORKFORCE.md).
- Migrations: inspect `supabase/migrations/`; do not rely on a hardcoded range
  in an old guide. No automatic production migration or seed execution.

## Checks

Before every pull request: `npm run verify` (lint, types, every offline check
in `scripts/check-*.mjs`) and `npm run build`. GitHub runs the same on every
pull request (`.github/workflows/checks.yml`); red is not merged. What to build
is "Finish the product" in [ROADMAP_EXECUTION](ROADMAP_EXECUTION.md).
`test:e2e` exists, but its coverage has material gaps documented in the
[critical review](docs/reviews/CRITICAL_REVIEW_2026-09-08.md).

The `.claude` named-agent scripts are legacy shell automation, not proof of
independent Codex/Antigravity/DevPit execution or review. See
[development automation](docs/operations/DEVELOPMENT_AUTOMATION.md).

The [previous Claude guide](docs/archive/2026-09-08/CLAUDE.md) is archived;
its removed-page references and migration range must not guide new work.
