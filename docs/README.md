# Documentation map

Latest review: [10 September source update](product/REVIEW_UPDATE_2026-09-10.md). It records which September 8 findings changed after the Today screen replaced the cockpit.

Updated 10 September 2026. This index routes readers; it does not replace product
rules. Stable root filenames are retained because coding agents and existing
references use them.

## Read for your task

| Question | Authoritative starting point |
| --- | --- |
| What are we building? | [VISION](../VISION.md) |
| What counts as truth, success or authorized action? | [PRODUCT_OPERATING_RULES](../PRODUCT_OPERATING_RULES.md) |
| What exists, at which source snapshot? | [CURRENT_STATE](../CURRENT_STATE.md) |
| What should happen next? | [ROADMAP_EXECUTION](../ROADMAP_EXECUTION.md), then [AUTONOMOUS_WORK_QUEUE](../AUTONOMOUS_WORK_QUEUE.md) |
| Why was a direction chosen? | [DECISIONS](../DECISIONS.md) |
| What is the long-term sequence? | [ROADMAP](../ROADMAP.md) |
| How does a case reach paid delivery? | [WORKFLOW_SIGNAL_TO_PLACEMENT](../WORKFLOW_SIGNAL_TO_PLACEMENT.md) |
| How should a coding agent work? | [AGENTS](../AGENTS.md), [SOFTWARE_AGENT_INSTRUCTIONS](../SOFTWARE_AGENT_INSTRUCTIONS.md), [Claude entry point](../CLAUDE.md) |
| Where does a new session start? | [HANDOFF](../HANDOFF.md) |

## Module and operations references

- [Job Intake](../JOB_INTAKE.md): mail ingestion, extraction and reply workflow.
- [Research Workbench](../RESEARCH_WORKBENCH.md): sourced proposals and human acceptance.
- [Runtime workforce](../agents/WORKFORCE.md), [constitution](../agents/shared-constitution.md), [Bob](../agents/bob.md), [Scout](../agents/scout.md), [Hanna](../agents/hanna.md).
- [Deployment](../DEPLOY.md) and [SMTP setup](../SMTP_SETUP.md): operator runbooks; configuration and provider claims need verification at use time.
- [Tenant onboarding](product/TENANT_ONBOARDING_READINESS.md): record-presence checks, not commercial clearance.
- [Development automation](operations/DEVELOPMENT_AUTOMATION.md): actual limits of the legacy named-agent shell scripts.

## Reviews and strategy evidence

| Document | How to use it |
| --- | --- |
| [Critical review, 8 September](product/CRITICAL_REVIEW_2026-09-08.md) | Source-checked findings, including newer cockpit and partner-firm work; engineering recommendations, not authorization to implement |
| [Product/growth audit, 7 September](product/PRODUCT_AND_GROWTH_AUDIT_2026-09-07.md) | Dated technical snapshot plus 8 September management clarification; some defects were subsequently repaired |
| [Commercial identity audit](product/COMMERCIAL_IDENTITY_AUDIT_2026-08-31.md) | Historical check; later PDF changes reintroduced hardcoded seller identity |
| [Contract-first strategy research](strategy/CONTRACT_FIRST_STRATEGY_REVIEW_2026-08-28.md) | Research basis; later management decisions govern execution |
| [First-contract playbook](strategy/FIRST_CONTRACT_30_DAY_PLAYBOOK.md) | Commercial reference; old counts and time windows are not a live queue |
| [Sellable-product strategy](strategy/SELLABLE_PRODUCT_STRATEGY_2026-08-30.md) | Long-term hypothesis; external discovery is paused |
| [Design-partner targets](strategy/DESIGN_PARTNER_TARGETS_2026-09-04.md) | Dormant research, not current staffing demand or permission to contact |
| [Problem interview kit](strategy/PROBLEM_INTERVIEW_KIT_2026-09-04.md) and [evidence log](strategy/problem-interview-evidence-log.csv) | Dormant customer-discovery materials |

## Resolve contradictions

Latest explicit management direction governs intent and authority. Use the
execution plan for active scope, operating rules for truth/approval boundaries,
and the current-state file for implementation evidence. A historical audit or
commit message cannot prove present live state. Code can contradict policy;
record that as a defect, not an implicit permission change.

Source implementation, automated checks, signed-in smoke tests, production
deployment, applied schema and commercial use are separate evidence states.
Attach date and commit/environment to each. Never turn a dated database count
into an undated operating fact.

## Maintain one source for each fact

Update the owner document above and link to it from others. Keep current-state
summaries short; put detailed sessions and superseded instructions in
[the archive](archive/README.md). Preserve role-file paths because runtime code
reads them. Do not physically relocate those files as a cosmetic cleanup.

The 8 September organization pass preserved the previous README, handoff,
Claude guide, current-state/session log, and seven legacy development-agent
documents verbatim. Their original paths now direct readers to current guidance.
