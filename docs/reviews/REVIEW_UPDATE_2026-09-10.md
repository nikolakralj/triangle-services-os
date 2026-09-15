# Review update — 10 September 2026

Reviewed source at `c7b4174a2ad9d0e7435d967ac32b0bf752234dbb`, including the five
commits after the [September 8 review](CRITICAL_REVIEW_2026-09-08.md).
This is a targeted source follow-up, not a fresh production or signed-in test.
Migration 041 exists in the repository; its production application was not checked.
No application code was changed by this documentation review.

## Verdict

The UI is more coherent. The reliability problem remains: several actions claim
stronger outcomes than the underlying writes establish. Replacing the cockpit
with Today improved navigation, but did not close the authorization, commercial
truth, cost-accounting and durable-work gaps identified in the first review.

## What changed in the old findings

| September 8 finding | Status in this checkout |
| --- | --- |
| Wrong employee / wrong queued job | Partially repaired: `/api/ask` routes Hanna directly and names when Scout completed another job. It still calls the organization-wide queue runner instead of executing the assignment just created. |
| Missing action note input | Fixed in Today. The proposed script is still submitted as final content, without an editor for the actual sent text. |
| Hardcoded 18/174/34/2 fallback counts | Removed. The page now returns zero for missing client/count or query failure, which still confuses failure with an empty database. |
| Old cockpit clear-state wording | Superseded with the removed component; do not quote it as current UI. Data-read failure handling still needs verification across the new screen. |
| Fragile report parsing | Additional parsing and malformed-URL protections exist. The formerly uncommitted work is now in history. |
| No enforced finding shape | Migration 041 adds constraints/triggers for reachable, one_thing_missing and dead. Structural validity is progress, not proof that the reported fact is true. |
| Human/machine authority, availability pitch, CV provenance, partner readiness | Relevant inspected source paths remain unchanged since the original review. |
| Scout monetary budget | Executor changed, but still supplies no `estimatedCost` to run logging. The monetary guard remains incomplete. |

## New high-priority findings

### P1 — Human review actions still lack a role boundary

[The new came-back endpoint](../../src/app/api/came-back/route.ts) rejects demo
access but not viewers. It uses a service client to reject findings, change
assignment state and create follow-up work. The same actor distinction problem
from the original review applies to its claim that a human agreed with a refusal.
The new [Ask endpoint](../../src/app/api/ask/route.ts) rejects viewers but routes
researchers to talent context without checking the worker-access capability.

Acceptance: enforce the operation's capability and actor type before any service
read/write; exercise viewer, researcher, machine and human identities separately.

### P1 — Filing an assignment refusal returns success without persisting it

For `file_refusal`, the came-back endpoint updates only `kind === "finding"`.
For `kind === "assignment"`, it returns `{ok: true, filed: true}` without a write.
[Returned-work loading](../../src/lib/data/came-back.ts) continues selecting
completed assignments. An acknowledgment therefore has no durable evidence and
can reappear on reload. This directly contradicts the endpoint comment promising
that every button writes a record and takes the item off the screen for good.

Acceptance: persist acknowledgment with actor/time, exclude acknowledged items
appropriately, and verify that reload and repeated requests preserve the result.

### P1 — Assignment discard loses the required reason; send-back loses its parent

The same endpoint requires a discard reason, but its assignment branch only
updates `finding_state` to `dead`. It does not store the supplied reason or human
review metadata. Depending on the existing report and trigger, the transition
may fail or leave a reason different from the human's. For findings, rejection
and reason storage are separate writes and the second write's error is ignored.

`send_back` accepts a source kind/id but does not fetch and validate the source
record or link the new assignment to it. Its context is the client-supplied title
and missing fact. Repeating the action can create duplicate follow-up work while
the original item has no durable handoff state.

Acceptance: a validated source record, retained human reason, atomic transition,
parent/child linkage and replay-safe creation. Test both finding and assignment
branches; a button working for one store does not establish the other.

## Contributor assessment

Claude deserves credit for fixing the Hanna dispatch mismatch, replacing
confusing duplicate screens, enforcing report structure and exposing refusals.
However, the newest code repeats the same pattern as before: a detailed comment
promises a durable business outcome that one branch does not implement. That
points to missing state-transition tests and cross-path review, not merely
insufficient prompting or unfinished visual design.

The cockpit attribution to Antigravity remains supported by commit `7b77157`.
The replacement screen is newer Claude-coauthored work. Criticism of the removed
cockpit should not be presented as a review of the current screen, and unavailable
private Antigravity sessions cannot support a complete personal assessment.

## Documentation organization and evidence

The [documentation map](../../README.md) identifies authority and reading order.
README, HANDOFF, CLAUDE and CURRENT_STATE are concise entry points. Eleven older
files are preserved in the [archive](../archive/README.md); legacy development
agent guides redirect to the actual [automation limits](../operations/DEVELOPMENT_AUTOMATION.md).
Execution and intake notes distinguish historical counts, partial implementation
and evidence gates. Root policy and runtime role paths remain stable.

Next engineering priority remains truthful actions and server-side authority,
then durable assignment identity, accounting and CV review provenance. Do not
interpret this report as authorization to deploy, contact anyone, or change
commercial phase gates. Application acceptance and actual paid delivery need
separate evidence.
