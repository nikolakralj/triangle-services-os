# Development automation: verified boundary

Source review: 8 September 2026. These scripts are separate from Triangle's
runtime business employees Bob, Scout and Hanna.

`.claude/coordinator/orchestrator.js` runs shell commands under names such as
`codex-format` and `antigravity-test`. It does not invoke the corresponding IDE
agents or model APIs. `triggerDevPit` prints an approval summary; it does not
provide an independent reviewer. Provider choices in descriptive configuration
do not change TypeScript's or ESLint's reasoning.

Known limits in the inspected source:

- The queue is one JSON object; writes can overwrite work.
- `next_agent` is metadata, not an implemented chained dispatcher.
- Formatting catches failures and can still emit a successful completion.
- Unit-test failure is excluded from the `allPassed` expression.
- DevPit checks TypeScript/lint booleans, not complete business acceptance.
- Existing Playwright tests skip authenticated checks at login and reference
  removed Contacts/Pipeline screens.
- `package.json` defines `test:e2e`, but no `test` script for the runner's
  `npm test -- --passWithNoTests` command.

Treat this as legacy development tooling, not a quality or deployment gate.
No runner was started, removed or changed during documentation organization.
Use explicit checks and authenticated workflow evidence for actual releases.

Historical guides and their illustrative model/cost claims are preserved under
[the documentation archive](../archive/README.md). They do not establish what
Antigravity independently authored or tested in its IDE.
