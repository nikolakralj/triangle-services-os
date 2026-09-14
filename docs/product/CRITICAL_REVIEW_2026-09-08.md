# Critical project review — 8 September 2026

> Historical source snapshot at `c8795b9`. Read the [10 September update](REVIEW_UPDATE_2026-09-10.md) for corrections and newer findings. The cockpit file cited below was subsequently removed.

## Verdict and scope

Triangle has substantial implementation and a coherent commercial purpose, but
its reliability and governance are materially weaker than its completion
language. The principal defect is the repeated conversion of a weaker fact into
a stronger claim: a draft into sent content, a CV into reviewed evidence, an
assignment request into execution of that request, or a run log into a spend cap.

Reviewed the documentation corpus, its historical instructions and strategy,
recent history and targeted implementation. Local access initially failed;
GitHub snapshot `f63afb51` was the fallback. Local access was then restored and
this review incorporated HEAD `c8795b9`, including `7b77157` and `803a4d2`.
The existing uncommitted change to `scout-case-report.ts` was preserved.
No production data, deployment, external communication or product code was changed.
This is a source/documentation review, not a fresh penetration test, complete
line-by-line code audit, legal opinion or signed-in workflow acceptance run.
Dated commercial counts come from prior documentation, not a new database query.

## Attribution: what can fairly be said about each contributor

Claude's recent work is identifiable through co-authored commits. It has repaired
real defects: empty stored CVs, fragile extraction, misrouted/unclaimable jobs,
missing contact-action linkage and absence of partner-firm supply. These are
valuable changes. The most concerning pattern is that a persuasive explanation
of a repair often claims a stronger guarantee than the implementation provides.

The local history explicitly calls the new UI “Antigravity's cockpit” in
`7b77157`. That supports attribution of the cockpit, not every prior screen,
test or backend defect. Claude explicitly takes responsibility in that commit
for the broken assignment constraints and missing open-research handler.
Antigravity's full private session history is not available here, so a complete
personal scorecard would be invented.

The old `.claude` “Antigravity” pipeline is a different matter: it is a shell
runner named after agents. Its introduction and documentation are Claude
co-authored. It is not evidence that the Antigravity IDE independently tested
or approved the application.

## 1. Critical: human authority is not reliably distinguished from machine access

[API authentication](../../src/lib/supabase/server.ts) maps the optional legacy
MCP key to `role: admin` and the configured `MCP_USER_ID`.
[Contact logging](../../src/app/api/outreach/log/route.ts) rejects missing user
IDs but that key supplies one. Therefore, when configured, a privileged machine
credential can pass the supposed human-only gate and certify a human action.
This is not an unauthenticated public exploit; it is actor misclassification.

[Assignment create/cancel](../../src/app/api/agents/assignments/route.ts) and
[partner create/confirm/status](../../src/app/api/supply-partners/route.ts) use
membership authentication without rejecting viewers. Partner confirmation also
inherits the legacy machine-as-human problem. The new feature repeated an
already documented permission defect.

[Talent questions](../../src/app/api/workers/ask/route.ts) do not enforce the
researcher's `canSeeWorkers: false` capability before reading worker context
through the service client.

**Acceptance:** one explicit human/machine actor model and server-side permission
matrix; negative tests for viewer writes, researcher worker access, machine human
confirmation and wrong-organization records. A UI-hidden button is insufficient.

## 2. Critical: the ready-to-send pitch contradicts its own availability warning

[Lead matching](../../src/lib/data/lead-match.ts) includes workers other than
blacklisted ones, adds caveats for candidates and unknown availability, then
`draftLeadReply` unconditionally writes that an engineer is “available who fits it.”
The [cockpit](https://github.com/nikolakralj/triangle-services-os/blob/c8795b97a9aff2ce3ce16710e76ef47eb10ff51e/src/components/modules/operations-cockpit.tsx) exposes that
text through Copy Pitch and Open Mail. A warning elsewhere does not repair a
false assertion inside the message the operator copies.

The ranking also subtracts one point per caveat but adds ten per shared keyword.
That contradicts its comment that work eligibility outranks a better word match.
No confirmation timestamp is read for individual availability in this path.

**Acceptance:** never state confirmed availability from a candidate/unconfirmed,
stale, busy or do-not-use profile. Separate potential-fit research from offers;
hard constraints must not be overwhelmed by keyword points. Verify the exact
message copied/opened, not only the warning badge.

## 3. High: Run Now does not mean “run the assignment I just created”

The cockpit creates an assignment for the selected employee, discards the
returned assignment ID, then calls [run-now](../../src/app/api/agents/run-now/route.ts)
without that ID. That endpoint claims the next eligible Scout assignment across
the organization. With older queued work it can run a different job; choosing
Hanna or Bob does not change the executor into that employee.

Credit `7b77157`: default constraints and open-research dispatch are repaired.
The job/result identity problem remains. The UI's “Agent is researching” and
“Zero human transport” language claims more than the execution contract proves.

**Acceptance:** authorized execution of the requested assignment, supported-role
validation before queuing, assignment-specific progress/result and reload-safe
status. Test two queued jobs and every employee offered in the selector.

## 4. High: the daily euro budget does not bound the current Scout spend

[Budget checks](../../src/lib/data/agent-budget.ts) sum `estimated_cost`, but
[Scout execution](../../src/lib/ai/scout-executor.ts) does not pass an
`estimatedCost` to [logAgentRun](../../src/lib/data/agents.ts). That logger only
copies the optional value; it does not calculate cost from tokens. Missing cost
is counted as zero. The new open-research success path omits token counts too,
and its catch path does not log a failed run.

The spend query's error is not checked: `runs.data ?? []` can treat a failed
history read as no usage. Logging is best effort. Concurrent runs also have no
atomic budget reservation. An eight-step limit is useful but is not a monetary
ceiling.

**Acceptance:** durable usage accounting for success/failure, currency and model/
tool pricing basis, explicit unknown-cost behavior, fail-closed usage reads,
atomic reservation and reconciliation of in-flight work. Do not report the
monetary guard as complete before those paths are exercised.

## 5. High: CV processing silently manufactures approval evidence

[CV upload](../../src/app/api/workers/cv/route.ts) inserts a finding as `accepted`,
with `reviewed_by` and `reviewed_at`, immediately after extraction. Uploading a
file is not reviewing the model's resulting claims. Candidate status is a useful
separation from deployable supply, but does not make this review history true.

For existing active workers, scalar protection is incomplete: extracted arrays
are unioned automatically. Identity matching falls back to normalized name with
matching OR missing country and returns the first match. Two people sharing a
name can be merged. Avoiding a review screen because it resembles CRM is not a
valid reason to remove ambiguity handling.

**Acceptance:** separate extracted, reviewed and approved facts; flag ambiguous
identity; preserve field provenance; keep human-approved arrays protected too.
A new model reading must not silently acquire the authority of the uploader.

## 6. High: the cockpit records the proposed script as final contact content

`CockpitActionPanel` submits `action.script` as `content` when the operator logs
an outcome. The server writes it to `commercial_actions.final_content`.
There is no final-sent-text editor in this panel. If the person edited the email
in their mail app or said something different on the call, the record is false.
The local `note` state is sent, but there is no note input in the inspected panel.
There is also no promised next-action date input.

[Contact logging](../../src/lib/data/contact-log.ts) still writes draft and action
separately with best-effort cleanup and no stable retry key. Migration `038`
correctly removed the old project requirement; that particular blocker is fixed.

**Acceptance:** capture actual final content or an explicitly labeled call
summary, recipient and occurred date, owner and promised follow-up; commit the
logical event atomically and replay it without duplication.

## 7. High: reassuring cockpit states are not backed by complete checks

[The page](<../../src/app/(app)/decisions/page.tsx>) falls back to 18 projects,
174 companies, 34 leads and 2 workers when counts are unavailable. These are
plausible historical values presented through a live interface. Database failure
must produce unavailable state, not a familiar number.

The cockpit's clear state says there are no overdue calls or unworked buyer
requisitions and agents are hunting in the background. The selector is not a
complete overdue-requirement/agent-health check. Several data readers convert
query errors into empty arrays. The new intake selector can also treat any
linked outreach draft as answered, without checking sent status.

**Acceptance:** distinguish empty, failed, stale and incomplete reads; show only
verified counts; do not claim background execution without worker-health
information; retain leads with unsent drafts as actionable.

## 8. High: partner firms are the right addition, but “sellable” is too broad

Credit the new supply-partner model: Triangle need not employ every person itself,
and a small individual bench does not establish the firm's commercial capacity.
A partner company's confirmed capacity is a legitimate separate supply source.

However, [the readiness predicate](../../src/lib/data/supply-partners.ts) considers
status, availability and confirmation age only. It does not require positive
headcount, trades, destination or start-window compatibility. It also does not
reject candidate status. A capacity-confirmed firm is not yet a crew committed
to a particular requirement. Keep partner aggregate capacity separate from named
worker clearance and reservation against dates/orders.

**Acceptance:** precise labels for confirmed aggregate capacity versus
requirement-ready coverage; validation of headcount/trade/date/country evidence;
separate approval and reservation; no assumed certificates for unnamed personnel.

## 9. High: instructions are duplicated, and policy text is mistaken for enforcement

The newer Scout `HOUSE_RULES` improve the in-app prompt, but the external bot
still reads markdown while the in-app implementation maintains a separate
constant. The source comment itself says the code is what ran if the two differ.
This is still duplicated policy, not one canonical deployed brief.

The plain-string safe-steps list is useful guidance but not permission enforcement.
Missing role files are tolerated by `agent-brief.ts`. Reading a local deployment
file at request time does not establish that editing a developer checkout changes
a running cloud deployment.

The new supply-first rule also overcorrects: refusing all research outside recorded
supply can block the demand-first lane and explicitly assigned supply-gap work.
The narrower invariant is to forbid unsupported delivery promises. Researching a
buyer requirement or a potential partner can legitimately reveal missing supply.

**Acceptance:** versioned instruction source and resolved-policy hash per run;
role-specific tools/permissions; missing required policy blocks execution; distinguish
research targets, proposed supply and approved deliverable capacity.

## 10. High: automated verification is not a credible release gate yet

The Contacts/Pipeline E2E suites target removed screens and skip substantive
assertions when sent to login. Their unauthenticated tests accept either the
protected URL or login. The Hunter test also skips when there is no project.
None of those outcomes proves a signed-in business workflow.

The legacy orchestrator labels shell checks as named agents, excludes failed
unit tests from `allPassed`, and its DevPit summary checks only TypeScript/lint.
The package does not define the unit-test command it tries to run. Large
`.claude` guides describe a coordination and review system more capable than
its code. That documentation created false confidence.

**Acceptance:** authenticated fixtures for at least two organizations and roles;
non-skipping tests of authority, upload/download integrity, assignment identity,
retry behavior, exact commercial content and rejected state transitions. Track
critical scenario coverage, not test count or screenshots of a page loading.

## 11. Documentation itself was creating repeat work

The former README described a 300-company CRM and removed screens. CLAUDE.md
listed migrations only through 009. CURRENT_STATE mixed useful session evidence
with stale current claims. CASE-004 remained entirely gated while slice 5 was
being implemented and a commit declared it finished. Bob's brief called model
extraction deterministic and free; `job-intake/extract.ts` makes a paid model call.

The statement that nobody queried Job Intake is also too absolute: the historical
Job Intake page existed; the more specific issue was exclusion from the default
next-move path. Likewise `team_potential` is a numeric score even though its column
is not named `score`. Missing that literal column does not invalidate every older
statement about scored leads.

The [organization pass](../README.md) adds a current index, concise current-state
file, archived old snapshots and explicit limits in affected guides. It does not
rewrite historical tests as if they had been rerun.

## What should be kept

Keep the domain architecture, organization-scoped records, proposal boundary,
case-linked evidence, individual and firm supply distinction, and the one-place
intent of the cockpit. The recent bug fixes represent useful progress.
Do not rewrite the app or add a generic agent platform to solve these issues.

The cockpit is a useful consolidation prototype. It is not yet an operational
control surface whose labels and outcomes can be trusted without checking.
Claude has been effective at responding to concrete failures, but needs stronger
cross-path verification and less absolute completion language. Antigravity's
UI work needs acceptance against actual backend contracts, not visual confidence.

## Recommended next engineering sequence — not an implementation authorization

1. Close actor/role boundaries and false availability/final-content claims.
2. Bind assignment, executor and result; expose failures and interrupted work.
3. Make run accounting, budget reservations and retry behavior reliable.
4. Separate CV extraction, identity resolution and human approval.
5. Validate partner capacity and individual freshness in the actual offer path.
6. Exercise one complete intake-to-decision-to-follow-up case using isolated
   fixtures, then an authorized real case; measure review time and manual rescue.

Commercial proof and software acceptance are different gates. Management's
app-development focus is valid; it does not require freezing reliability fixes
until a buyer replies. Conversely, successful tests are not proof of revenue.
The next milestone should remove a complete manual job with trustworthy evidence,
not merely add another report or move a button.
