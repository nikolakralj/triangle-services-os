# Sellable Product Strategy — Hybrid Contract-to-Crew OS

**Decision date:** 30 August 2026  
**Research date:** 30 August 2026  
**Status:** adopted product hypothesis; customer and price claims remain evidence-gated  
**Tenant zero:** Triangle Services

## Executive decision

Build a sellable **contract-to-crew operating system for technical staffing,
crew-supply, and subcontracting agencies**.

Do not build a generic HR platform, generic CRM, job board, freelancer
marketplace, or horizontal human-and-agent work canvas.

The initial promise is:

> Turn fragmented project demand and truthful worker capacity into qualified
> buyer conversations, credible crew/specialist packages, human-approved
> submissions, placements, mobilization, and measurable margin—with AI doing
> research and administrative work and people retaining commercial authority.

Triangle is the first operating customer and proof environment. External
customer discovery starts now, in parallel with Triangle's first-contract
work. Product features for external users remain gated by signed interest,
paid pilots, and observed workflow—not imagined personas.

## Who should buy it

### Primary beachhead

European boutique technical contract-staffing and crew-supply businesses with:

- 2–25 internal recruiters, salespeople, coordinators, or operations staff;
- roughly 25–500 active or known workers/contractors;
- industrial automation, electrical/MEP, commissioning, data-center,
  energy, infrastructure, rail, or adjacent technical focus;
- project-based and cross-border work rather than only permanent hiring;
- fragmented work across email, spreadsheets, an ATS/CRM, documents, and
  messaging apps;
- an owner or operations lead who can buy without enterprise procurement;
- a need to win demand and deliver people, not merely store candidates.

The economic buyer is usually the founder/managing director, recruitment
director, or operations director. Daily users are business-development staff,
recruiters, resourcers, compliance coordinators, and delivery coordinators.

### Segment ranking

| Segment | Workflow fit | Urgency | Reachability | Likely value | Decision |
|---|---:|---:|---:|---:|---|
| Technical crew suppliers / labor subcontractors | 5 | 5 | 4 | 5 | First design-partner pool |
| Boutique contract staffing agencies | 5 | 4 | 4 | 5 | First design-partner pool |
| Specialist recruitment agencies with contract desks | 4 | 4 | 4 | 4 | Strong adjacent segment |
| Solo recruiters / HR freelancers | 3 | 4 | 5 | 2 | Later starter plan; useful interviews now |
| Technical subcontractors seeking projects | 4 | 5 | 3 | 4 | Sell a business-development/crew-packaging edition after core proof |
| Internal HR / talent acquisition teams | 2 | 3 | 2 | 4 | Later; buying process and workflow differ |
| Large staffing enterprises | 4 | 4 | 1 | 5 | Later; security/integration burden is premature |
| Individual job seekers and generic freelancers | 1 | 4 | 5 | 1 | Supply-side users, not initial paying customer |
| Generic companies “looking for work” | 2 | 3 | 3 | 3 | Too horizontal for the first product |

Scores are strategic judgments, not market-size measurements. They must be
updated after interviews and paid pilots.

### Who is not the first customer

- **Corporate HR departments:** they primarily optimize internal requisitions,
  candidates, interviews, and employee hiring. Triangle's differentiator is
  project/buyer intelligence plus commercial crew delivery.
- **Job seekers:** they may maintain profiles and availability later, but they
  do not have the budget or the multi-sided operating problem.
- **All freelancers:** a solo specialist looking for one job needs discovery
  and application help, not a contract-to-crew operating system.
- **Generic sales agencies:** removing worker, package, compliance,
  mobilization, and margin objects would destroy the product wedge.
- **Enterprise staffing firms:** SSO, procurement, integrations, migrations,
  security reviews, and change management create a long sales cycle before
  the product has reference outcomes.

## Jobs the product must perform

### Commercial jobs

1. Convert inbound jobs, project news, tenders, referrals, and worker
   availability into one prioritized action queue.
2. Distinguish project owner from the contractor or agency that can actually
   buy labor.
3. Qualify scope, headcount, location, timing, duration, shifts, budget/rate,
   engagement model, supplier route, and unknowns.
4. Assemble a truthful individual-specialist or crew package from available
   people and evidence.
5. Draft relevant outreach, replies, questions, and submissions while keeping
   a human responsible for the final external action.
6. Track the conversation, objection, next action, proposal, client decision,
   placement, and lost reason.

### Delivery jobs

1. Prevent the same worker being promised twice.
2. Track documents, country/site readiness, expiry, onboarding, and
   mobilization without pretending software is legal counsel.
3. Connect order, assignment, timesheet, invoice, payment, and realized margin.
4. Preserve a reusable evidence trail for redeployment and future sales.

### Hybrid-team jobs

1. Give every human and AI agent a role, scope, assignment, and expected
   output.
2. Let AI extract, research, rank, match, and draft.
3. Route uncertain or consequential work to a human approval queue.
4. Preserve evidence, model/provider, prompt/context, output, human decision,
   and downstream outcome.
5. Evaluate agents on accepted commercial outcomes and time saved, not task or
   token volume.

## Product boundary

The sellable product has three layers.

### Vertical operating core

`signal -> qualified requirement -> buyer route -> worker/crew package ->
human-approved action -> opportunity -> placement -> mobilization -> margin`

This is the product. It must stay explicit in the data model and interface.

### Hybrid execution layer

- humans and provider-independent agent identities;
- assignments and conversations;
- scoped credentials and tools;
- evidence-backed findings and suggestions;
- approvals, decisions, audit, and outcome attribution;
- shared organization memory with source and date.

This layer makes the vertical workflow faster. It is not a separate horizontal
product yet.

### Decision on the earlier hybrid-work proposal

Keep the strongest operating ideas from the attached Claude/ChatGPT proposals:

- provider-independent agent identity and credentials;
- one management approvals/decisions queue;
- define the outcome before choosing an agent;
- deterministic capability checks before assignment;
- shared organization memory grounded in structured records;
- progressive disclosure of provider/model/tool/cost traces;
- outcome attribution from agent contribution to conversation, placement, and
  margin.

Do not make these the immediate product shell:

- Collaboration Field or spatial organization canvas;
- generic Today/Work/Team/Missions navigation replacing the domain workflow;
- AI employee marketplace or “hire agent” catalog;
- agent cost/performance dashboards before real outcome volume;
- a generic hybrid-member/mission data model that rewrites staffing objects;
- design-lab work while sends, buyer conversations, and placements remain
  unproven.

This is not a rejection of human-and-AI collaboration. It is a sequencing
decision: governance is foundational now; a new organization metaphor becomes
valuable only when several humans and agents have real concurrent work.

### SaaS trust layer

- organization isolation and tenant-specific identity;
- onboarding, invitations, roles, safe defaults, import/export;
- audit, retention, privacy/DSAR operations, backup/restore;
- usage limits, cost controls, observability, support, and billing;
- documented AI purpose, human oversight, evaluation, and incident handling.

## Competitive reality

### Recruitment systems of record are crowded

- Bullhorn markets an end-to-end staffing platform, AI digital workers, more
  than 10,000 customer firms, and published entry pricing from $99/user/month.
- Access Vincere combines CRM, ATS, contract/temp operations, portals,
  analytics, automation, and AI; its published base starts at £69/user/month,
  with AI packages priced separately.
- Recruit CRM sells an AI-powered ATS/CRM for agencies with sourcing,
  matching, sequencing, candidate submissions, resume formatting, audit, and
  enterprise controls.
- Manatal sells AI recruitment software for agencies and internal HR at
  published annual prices of $15, $35, and $55 per user/month.
- Avionté positions itself as a connected front- and back-office staffing
  platform with embedded AI, onboarding/compliance, payroll, invoicing, and a
  partner ecosystem.

Conclusion: competing as “another AI ATS/CRM” is a weak strategy.

### AI sourcing and outreach are also crowded

Juicebox sells PeopleGPT search and outreach at $99–$179 per seat/month and an
AI agent at $199/month. Recruit CRM, Bullhorn, Vincere, and Loxo all promote
AI matching, content, enrichment, sourcing, or outreach.

Conclusion: a chat box, sourcing agent, email generator, or CV parser is a
feature—not the wedge.

### Vertical workforce platforms validate the problem

- Skillit describes a construction labor graph, system of action, and system
  of intelligence built around vetted craft workers and AI hiring workflows.
- Job&Talent combines workforce service delivery with an AI-enabled workforce
  management platform and purpose-specific AI agents.

Conclusion: vertical labor data plus executed workflow can be valuable, but
Triangle should begin as agency software and service enablement—not fund a
two-sided marketplace before it has liquidity.

## Defensible wedge

Triangle should win where generic recruitment products are weakest:

1. **Demand-side project intelligence:** find the project, contractor chain,
   real labor buyer, procurement route, and timing—not only published jobs.
2. **Crew/package selling:** package individuals into a credible commercial
   capability tied to scope, readiness, capacity, and rate/margin logic.
3. **Cross-border delivery truth:** availability, A1/posting/work-permit/site
   states, mobilization, and documentary evidence with human/legal ownership.
4. **One commercial-to-delivery graph:** connect origin signal to buyer,
   submission, placement, mobilization, invoice, payment, and margin.
5. **Governed hybrid execution:** AI performs volume work; humans approve
   claims, messages, pricing, worker disclosure, and commitments.

The moat is real outcome data across these relationships. It is not the model,
prompt, agent avatar, dashboard, or number of collected leads.

## Business model and pricing hypothesis

Price must be validated with real buyers. Initial offers should include
service and onboarding because customer data/process cleanup will be material.

### Design-partner offer

- €1,500–€5,000 one-time onboarding and workflow configuration;
- €500–€1,500/month for a 90-day paid pilot;
- defined workflow, data volume, users, AI budget, support, success metric, and
  exit/export terms;
- no discounted lifetime deal and no free custom development promise.

### Post-pilot packaging hypothesis

| Plan | Intended customer | Hypothesis |
|---|---|---:|
| Solo | founder / independent technical recruiter | €149/month, one human seat, limited AI/workflows |
| Agency | 2–10 person contract staffing or crew supplier | €749/month including 5 seats and governed agents |
| Operator | staffing/crew business needing mobilization and margin | €1,500–€2,500/month plus onboarding |
| Enterprise | larger firms with SSO/integrations/security needs | custom, only after readiness gates |

Use a base platform fee plus included humans/agents and metered overage. Avoid
pure seat pricing: customers are buying more placements and operator capacity,
while AI usage and data-provider costs vary. Never promise ROI before a
measured baseline.

## Go-to-market sequence

### Track A — Triangle proves the workflow

- confirm one sellable package and real available supply;
- work current high-priority inbound demand;
- request buyer/procurement conversations;
- record human-approved sends, follow-ups, objections, proposals, placements,
  delivery, and margin;
- turn every failure into a structured workflow lesson.

### Track B — founder-led customer discovery starts immediately

First 30 days:

1. Build a list of 30 target companies: 15 technical crew suppliers and 15
   boutique contract staffing agencies in Europe.
2. Conduct at least 12 problem interviews: owner/MD, operations, recruiter, and
   delivery/compliance perspectives.
3. Show the real Triangle workflow only after understanding current tools,
   costs, delays, errors, and buying authority.
4. Ask for three concrete commitments: data/process workshop, pilot LOI, or
   paid design-partner agreement.
5. Do not count compliments, wait-list signups, or feature requests as demand.

Qualifying questions:

- How do you find new client/project demand today?
- Where does a job/project become a qualified requirement?
- How do you identify the actual labor buyer or approved supplier route?
- How do you know which workers are truly available and mobilizable?
- How is a candidate/crew package prepared and submitted?
- Where are follow-ups, objections, client decisions, and next actions stored?
- How are compliance, mobilization, timesheets, invoices, and margin connected?
- Which manual work consumes the most recruiter/coordinator time each week?
- Which error costs money or loses a placement?
- What system is the source of truth? What cannot be replaced?
- Who owns the budget, and what would justify a paid pilot in 90 days?

### Track C — productization only where it removes a proven adoption risk

Safe work before a signed pilot:

- eliminate Triangle identity leakage across tenant-facing workflows;
- make organization profile, role scopes, approvals, and audit explicit;
- inventory onboarding, import/export, deletion, security, and support gaps;
- create a reproducible local/test tenant setup;
- maintain clean domain boundaries and RLS.

Gated until a real design partner requires it:

- billing implementation;
- broad ATS/CRM integrations;
- white-label themes;
- SSO/SCIM;
- generic workflow builders;
- enterprise analytics;
- self-serve marketplace/network effects.

## Human and AI operating model

| Work | AI role | Human role | Required record |
|---|---|---|---|
| Signal ingestion | classify/extract/dedupe | tune rules, review exceptions | source, evidence, classification |
| Project/buyer research | search, map, propose | verify authority and relevance | citations, fact/inference/unknown |
| Requirement qualification | identify missing facts, draft questions | conduct conversation and decide qualify/disqualify | fields, unknowns, decision reason |
| Worker/package matching | rank and explain | confirm availability, capability, rate, consent | evidence and confirmation date |
| Outreach/submission | draft and personalize | edit, approve, send | draft, final, sender, recipient, time |
| Pricing/commercial terms | calculate deterministic scenarios | approve price, terms, risk | assumptions, floor, decision |
| Compliance | checklist and expiry reminders | worker, operator, and qualified adviser decide | document/status/source/owner |
| Placement/mobilization | coordinate tasks and alerts | accept commitments and resolve exceptions | client decision and milestone evidence |
| Learning | summarize outcomes and propose playbook changes | approve rule/playbook update | before/after metrics and decision |

## Sellability requirements

### Before the first external pilot

- no tenant-facing commercial output contains hardcoded Triangle identity;
- organization profile is required for AI commercial drafting;
- RLS and service-client authorization tests cover all pilot objects;
- admin/member invitation and role behavior are documented and verified;
- import path exists for workers, companies, contacts, and active requirements;
- customer can export its operational data;
- audit covers external actions, approvals, model output, and human decision;
- privacy notice/DPA responsibilities and deletion/retention procedure exist;
- backup and restore are tested;
- usage/cost limits and a support/incident route exist;
- pilot scope, success metric, data ownership, and exit terms are signed.

### Before self-serve sales

- repeatable onboarding succeeds without developer intervention;
- billing, entitlements, usage limits, cancellation, and export work;
- product analytics measure activation and outcome without exposing personal
  data;
- tenant-safe defaults cover several real customers;
- security, subprocessors, retention, incident response, and service status
  are published;
- at least three customers have completed the same core workflow.

## AI and employment compliance

Recruitment and candidate evaluation can fall under the EU AI Act's high-risk
employment category. The roadmap must assume that ranking/filtering people can
be regulated even when a human is present. Build toward:

- documented intended purpose and classification assessment;
- human oversight that is real, trained, and logged;
- data provenance, relevance, quality controls, and protected-attribute
  minimization;
- accuracy/evaluation by use case, segment, language, and failure type;
- automatic logs, versioned prompts/models, incident handling, and monitoring;
- candidate/worker transparency and an accessible correction/appeal route;
- no emotion recognition, sensitive-attribute inference, or automated final
  hiring/termination decision;
- legal review before claiming compliance or placing a high-risk system on the
  EU market.

The European Commission states that Annex III high-risk rules for employment
apply from 2 December 2027 under the current 2026 timeline. This is a design
deadline, not permission to defer governance.

## Evidence gates

| Gate | Evidence required | What it unlocks |
|---|---|---|
| G0 tenant zero | one truthful package, five sends, buyer conversations | contract-readiness workflow |
| G1 problem demand | 12 interviews, 5 repeated pains, 3 concrete pilot commitments | external-pilot hardening |
| G2 paid pilot | signed scope, payment, real data, success metric | onboarding/integration work for that pilot |
| G3 external activation | customer reaches qualified requirement and submission in 14 days | repeatable onboarding and billing |
| G4 external value | measurable time saved or commercial outcome for 3 customers | scalable go-to-market |
| G5 delivery proof | placements/mobilization and known margin without governance failure | delivery intelligence and integrations |
| G6 vertical scale | repeatable acquisition, retention, support economics, security maturity | wider niches and partner ecosystem |
| G7 network | recurring narrow-market demand and supply liquidity | portal/marketplace experiments |

## Success metrics

### Business

- paying design partners and monthly recurring revenue;
- qualified requirements, submissions, placements, mobilizations, repeat
  clients, and contribution margin;
- time to first qualified requirement and first submission;
- gross and net revenue retention after a cohort exists;
- onboarding and support hours per customer.

### Workflow

- percentage of active work with owner, next action, and due date;
- signal-to-qualified-requirement conversion;
- qualified-requirement-to-submission and submission-to-placement conversion;
- worker availability freshness and package coverage;
- follow-up completion and response rate;
- compliance/mobilization exceptions and duplicate-allocation prevention.

### Hybrid execution

- AI suggestion acceptance with reason;
- human edit distance from draft to final;
- factual-error, unsupported-claim, and permission-violation rate;
- operator time saved per qualified outcome;
- AI/provider cost per qualified outcome and placement;
- incidents or discriminatory outcome signals.

## Stop or change direction when

- fewer than five of twelve qualified interviews share the project-to-placement
  pain;
- no target customer accepts a paid pilot after a focused founder-led sales
  cycle;
- customers only want a commodity ATS feature at Manatal-level pricing;
- Triangle cannot produce truthful supply, buyer conversations, or delivery
  economics itself;
- compliance/support cost overwhelms plausible contract value;
- requested horizontal workflows require removing the domain objects that make
  the product differentiated.

## Research sources

Primary sources checked 30 August 2026:

- Bullhorn platform, AI, customer scale, and pricing:
  https://www.bullhorn.com/
- Bullhorn Amplify digital workers:
  https://www.bullhorn.com/products/amplify/
- Recruit CRM product and pricing:
  https://recruitcrm.io/pricing/
- Manatal pricing:
  https://www.manatal.com/pricing
- Access Vincere platform and pricing:
  https://www.vincere.io/
- Avionté AI and automation:
  https://www.avionte.com/ai-and-automation/
- Loxo recruitment AI:
  https://www.loxo.co/products/ai
- Juicebox/PeopleGPT pricing:
  https://juicebox.ai/pricing
- Skillit construction labor infrastructure:
  https://skillit.com/mission
- Job&Talent workforce platform:
  https://www.jobandtalent.com/companies
- EU AI Act official overview and timeline:
  https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai
- EU AI Act legal text, including employment systems in Annex III:
  https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689

Commercial claims from vendors are evidence of positioning, packaging, and
market activity—not independent proof of customer ROI or vendor profitability.
