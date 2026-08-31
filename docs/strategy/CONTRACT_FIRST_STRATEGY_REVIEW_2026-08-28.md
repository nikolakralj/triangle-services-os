# Triangle Services: Contract-First Strategy Review

**Date:** 28 August 2026

**Status:** Research basis; core direction adopted in `ROADMAP.md`,
`ROADMAP_EXECUTION.md`, and `DECISIONS.md` on 29 August 2026

**Scope:** Product direction, competitive market, commercial operating model, contract acquisition, legal/compliance gates, and roadmap. No software work was performed.

The adopted roadmap adds a detailed 24–36 month software sequence and
development-agent instructions. If this research note and the canonical
roadmap differ, the canonical roadmap and later decision log control.

## Executive verdict

Triangle has a viable roadmap, but it is not the roadmap described by either of the two broad “AI workforce” proposals.

The correct near-term product is:

> **Triangle's internal contract-to-crew operating system: a human-led, AI-assisted machine that turns verified technical labor capacity and live demand signals into buyer conversations, supplier approvals, job orders, mobilized crews, and gross margin.**

The product should support two directions at once:

```text
SUPPLY-FIRST
verified available workers
  -> sellable crew package
  -> target projects and buyers
  -> qualified demand
  -> contract
  -> mobilization

DEMAND-FIRST
inbound job / project / tender / hiring signal
  -> real buyer and contracting route
  -> commercial requirement
  -> matched crew
  -> contract
  -> mobilization
```

Those lanes converge into one workflow:

```text
verified capacity <-> qualified demand
       -> buyer/procurement route
       -> compliant commercial offer
       -> vendor approval / MSA / job order
       -> mobilization
       -> margin and outcome learning
```

The “AI employees” metaphor can remain an internal interaction model. It is not a defensible company category. The “generic hybrid work OS” should be explicitly deferred. In 2026, horizontal agent identity, permissions, centralized inboxes, memory, governance, and task routing are already being supplied by OpenAI, Microsoft, Google, Salesforce, LangChain, Relevance AI, Taskade, Sintra, and others. Competing there would require enterprise distribution, integrations, security, governance, and capital that are unrelated to Triangle's current advantage.

Claude was right to reject a generic product pivot at this stage. The weakness in the current direction is different: the roadmap remains too focused on software objects and not focused enough on the commercial acts required to win the first contract.

## 1. What the two proposals got right—and wrong

### Proposal A: “AI workforce” interface

Useful ideas worth retaining:

- one approvals inbox;
- task-first delegation;
- durable agent identity separated from provider credentials;
- human approval for consequential external actions;
- outcome attribution rather than token/activity vanity metrics;
- company memory stored in Triangle, not in a vendor's bot memory.

These are good operating principles. They do not answer who pays Triangle, why a buyer changes supplier, what can be delivered now, or how a project becomes a signed job order.

### Proposal B: generic “hybrid work operating system”

This is a premature abstraction. It asks Triangle to become a horizontal enterprise-software company before Triangle has proven one repeatable vertical transaction.

The proposal would place Triangle against platforms that already offer the generic layer:

- [OpenAI Frontier](https://openai.com/business/frontier/) provides agent execution, business context, enterprise identity/access, audit, and improvement loops.
- [Microsoft Copilot Studio and Agent 365](https://learn.microsoft.com/en-us/microsoft-copilot-studio/security-and-governance) provide agent identity, conditional access, centralized governance, observability, and policy enforcement.
- [Google Gemini Enterprise Agent Platform](https://cloud.google.com/blog/products/ai-machine-learning/the-new-gemini-enterprise-one-platform-for-agent-development) combines agent development, runtime, marketplace, security, and third-party agents.
- [LangSmith Fleet](https://www.langchain.com/blog/introducing-langsmith-fleet) provides agent identity, credentials, permissions, tracing, and a centralized approval inbox.

This does not mean the proposal's UX ideas are bad. It means they are infrastructure patterns, not Triangle's market wedge.

### The product principle to adopt

> **Agents are a capability inside Triangle's business model. They are not the business model.**

Triangle should first prove that its system helps win and deliver labor contracts. Only repeated external demand can justify productizing it for other agencies. A generic work OS should require at least two proven non-staffing verticals before it is reconsidered.

## 2. Honest audit of the current product

### Repository and deployment state

- The real project is `C:\Users\nikol\Projects\triangle-services-os`.
- The active branch is `wip-jules-2026-05-03T18-13-13-596Z`, not `main`.
- The worktree was clean during this audit.
- The latest branch commit is deployed to a Vercel preview and reports commit `88430ac`.
- The public production alias loads the login page but `/api/version` returns 404, while the latest preview reports the current branch and commit. Production therefore appears behind the latest preview. This is housekeeping, not the present revenue bottleneck.

### What is already built

The codebase is much further along than a prototype description suggests. It includes:

- job-email ingestion and classification;
- lead scoring for team potential;
- reply drafting;
- project discovery;
- contractor-chain and buyer suggestions;
- research evidence and human approvals;
- project packages;
- worker profiles, documents, and matching;
- submission-packet PDF generation;
- agent identities, scoped credentials, assignments, conversations, findings, and approvals.

That is enough to run a founder-led commercial experiment now.

### Live operating evidence

A read-only live database audit on 28 August 2026 found:

| Commercial object | Live count | Interpretation |
|---|---:|---|
| Job leads | 24 | Real input exists |
| Leads still `new` | 21 | The queue is not being worked |
| Leads scoring 70+ | 4 | A small priority set exists |
| Reply drafts | 3 | The system can prepare action |
| Replies marked sent | 0 | No commercial action is recorded |
| Discovered projects | 18 | Signal collection works |
| Projects still `new` | 18 | None has progressed commercially |
| Contractor-chain nodes | 11 | Some chain research exists |
| Buyer contacts | 3 | Buyer coverage is still thin |
| Accepted research suggestions | 22 | Research is being reviewed |
| Pending suggestions | 8 | Manageable backlog remains |
| Project packages | 2 | Package hypotheses exist |
| Worker matches | 3 | Matching has run |
| Submission packets sent | 0 | No package reached a buyer |
| Open opportunities | 1 | Pipeline conversion is minimal |
| Available workers in the system | 3 | Stored deliverable capacity is extremely small |

Three worker matches are marked `placed`, but there is no packet-send record and no corresponding commercial progression. Those statuses cannot be treated as evidence of actual client placements without an external contract/mobilization record.

### The most important data mismatch

The four highest-scoring inbound leads are predominantly PCS7, PLC, automation, and offline programming opportunities. The three workers recorded as available are:

- one electrician;
- one cable puller;
- one electrical supervisor.

The active package titled “50 electricians” is therefore not supported by the stored available roster. It may represent real people who have not yet been imported, but the application cannot presently prove that.

This is the critical strategic point:

> **Triangle cannot sell from AI-inferred demand while its real deliverable supply is unknown or absent from the system.**

Before expanding Hunter, hiring more agents, or redesigning Workforce, Triangle needs one truthful, sellable package backed by workers who can actually mobilize.

## 3. Is the market real?

Yes. Skilled technical labor shortage is real, persistent, and relevant to Triangle's sectors.

- The European Labour Authority's [2024 shortage report](https://www.ela.europa.eu/en/publications/labour-shortages-and-surpluses-europe-2024) lists welders and building electricians among the most widespread shortages and notes persistent shortages in engineering and construction.
- The [IEA World Energy Employment 2025](https://www.iea.org/reports/world-energy-employment-2025/executive-summary) reports that more than half of surveyed energy firms, unions, and educators faced critical hiring bottlenecks; electricians, pipefitters, line workers, and engineers are among the constrained roles.
- Uptime Institute's [2025 Global Data Center Survey](https://datacenter.uptimeinstitute.com/rs/711-RIA-145/images/2025.Annual.Survey.Report.pdf?version=0) reports that 46% of operators had difficulty finding qualified candidates, with continuing shortages in electrical and mechanical trades.
- The European Commission's [AI Continent plan](https://commission.europa.eu/topics/competitiveness/ai-continent_en) aims to at least triple EU data-center capacity within five to seven years, while the [AI Gigafactories initiative](https://commission.europa.eu/topics/competitiveness/competitiveness-coordination-tool-projects/ai-gigafactories_en) targets major additional infrastructure investment.

Demand is not the problem. Access to the real buyer, vendor approval, legal delivery, price, and readiness are the problem.

## 4. What profitable comparable companies actually prove

The strongest comparable businesses do not earn money from presenting agents as employees. They earn money by controlling a real transaction, workforce network, compliance layer, or procurement route.

| Company/model | 2025/most recent evidence | Lesson for Triangle |
|---|---|---|
| [NES Fircroft](https://sitescdn.wearevennture.co.uk/public/nes-fircroft/assets/nesfircroftannualreport2025-6.pdf) | $3.2bn revenue, $148m underlying EBITDA, 4.6% EBITDA margin in 2025 | Specialized engineering staffing, global clients, compliance, and delivery create value; margins remain operationally demanding |
| [Job&Talent](https://www.jobandtalent.com/news/strong-profitability-gains-and-ai-evolution) | €1.8bn 2024 revenue, €61.3m underlying EBITDA; AI used to cut time-to-hire and cost-to-serve | AI is embedded in a workforce transaction, not sold as theater |
| [Randstad](https://www.randstad.com/press/2026/fy-2025-perform-transform/) | €23.1bn 2025 revenue; digital marketplaces at about €4bn annualized revenue | Scale comes from client relationships, workforce liquidity, and operations |
| [Adecco](https://www.adeccogroup.com/our-group/media/press-releases/q4-fy-2025-results) | €23.1bn revenue and 3.0% adjusted EBITA margin in 2025 | Staffing can be large but has thin operating margins; automation must improve productivity |
| [Workrise](https://www.workrise.com/about) | Vertical energy source-to-pay, vendor management, bid management, staffing, payroll, and compliance | A vertical supplier/workflow network is more defensible than generic agent management |
| [Skillit](https://skillit.com/mission) | Structured construction labor graph plus AI-assisted hiring actions | Structured, verified craft data is the asset; AI activates it |

The financial lesson is sober: staffing and workforce services can be profitable, but operating margins at large firms are often only a few percent. Triangle cannot ignore working capital, compliance cost, utilization, bad debt, and management overhead.

## 5. Competition map

### A. Generic agent/workforce platforms: very high competition

OpenAI, Microsoft, Google, Salesforce, LangChain, Relevance AI, Taskade, Sintra, and CrewAI already cover combinations of:

- agent creation;
- identity and permissions;
- shared memory;
- task assignment;
- approvals;
- integrations;
- audit and cost analytics;
- multi-agent coordination.

Triangle has no reason to compete at that generic layer. It can consume those capabilities when useful.

### B. Sales intelligence and AI outbound: very high competition

- [Apollo](https://www.apollo.io/product/prospect-and-enrich) advertises 240m+ contacts, enrichment, intent data, sequencing, and workflow APIs.
- [Cognism](https://www.cognism.com/) specializes in verified European B2B contact data and compliance controls.
- [Clay](https://www.clay.com/blog) combines hundreds of data providers, research agents, qualification, personalization, and CRM workflows.

Triangle should not build another contact database, enrichment tool, or autonomous AI SDR. Those are commodities with high data costs and crowded distribution.

### C. Project and construction intelligence: high competition

- [Barbour ABI](https://barbour-abi.com/) combines verified projects, contractor relationships, decision-maker contacts, bidder history, and AI prospecting. It explicitly sells to construction recruiters and subcontractors.
- [ConstructConnect](https://www.constructconnect.com/solutions/subcontractors) connects project intelligence, general contractors, bid invitations, and takeoff tools.
- [GlobalData Construction](https://www.globaldata.com/industries/construction/) covers projects, owners, contractors, designers, consultants, tenders, and buying signals.

Triangle cannot win by collecting more project headlines. It must turn selected project intelligence into a deliverable crew offer and a contract route.

### D. Labor marketplaces and workforce platforms: high competition, but useful validation

Job&Talent, Workrise, Veryable, Traba, Skillit, Field Nation, Randstad, Adecco, and many regional agencies already match workers and demand.

Triangle's possible wedge is not “a labor marketplace.” A marketplace requires substantial liquidity on both sides, localized compliance, payments, support, and trust. Triangle's wedge is initially a managed supplier with unusually strong intelligence and execution.

### E. Supplier/procurement networks: established gateways

- [SAP Business Network Discovery](https://www.sap.com/products/business-network/find-suppliers.html) connects buying needs to qualified suppliers across millions of businesses.
- [Avetta](https://www.avetta.com/clients/solutions/platform/contractor-sourcing) combines contractor sourcing with readiness and compliance across 120+ countries.
- [Achilles](https://www.achilles.com/achilles-network) provides prequalification and tender alerts across energy, utilities, and industrial supply chains.

These networks prove that work-readiness and qualification are part of sales. Triangle must be easy to approve as a supplier, not merely easy to discover.

## 6. Triangle's defensible wedge

Triangle should position itself as:

> **A specialist cross-border supplier of supervised electrical, automation, commissioning, and industrial crews—with evidence-backed project targeting and a verified mobilization pack.**

Its long-term data moat can become the connection among:

- real worker availability;
- skills and evidence;
- country readiness and documents;
- landed cost and rate;
- project phase;
- contractor chain;
- buyer/procurement route;
- outreach and conversation outcome;
- job order;
- worker performance;
- gross margin.

No generic agent UI contains that operating graph. The moat grows only when real transactions produce outcome data.

### Revised success object

The current “qualified project package opportunity” is directionally correct but incomplete. The commercial success object should be a **contract-qualified crew opportunity** with:

1. a real demand signal;
2. a named organization with authority to buy or subcontract;
3. a known buyer/procurement route;
4. a defined scope or role package;
5. headcount and timing;
6. location, shift pattern, and expected duration;
7. accepted engagement model: labor supply, service subcontract, agency, or referral;
8. rate range or budget logic;
9. country/legal feasibility;
10. supplier-prequalification feasibility;
11. credible crew coverage and mobilization date;
12. a specific next human action.

Until those exist, it is a signal—not an opportunity.

## 7. The first commercial wedge

Triangle should not pursue every sector and every labor type. For the first 90 days, choose one of two offers based on supply truth.

### Offer A: managed electrical installation crew

Example:

> One electrical supervisor plus qualified electricians/cable installers for data-center or industrial electrical installation, with a defined mobilization window, document pack, and site-readiness status.

The stored roster currently supports only a three-person micro-team. If Triangle really has 10–20 people outside the system, those workers and their readiness must be imported and verified before this becomes the offer.

### Offer B: PCS7/automation commissioning team

The inbox shows stronger current demand for PCS7 and automation. This should be chosen only if Triangle can prove access to several available specialists. Otherwise it is a buyer-development hypothesis, not a deliverable offer.

### Decision rule

Select the offer with the highest score across:

```text
available people now
× evidence/certification completeness
× commercial demand already observed
× legal ability to deliver
× buyer access
× expected contribution margin
```

Do not select based on the number of articles, projects, or AI suggestions.

## 8. Contract acquisition channels, ranked

| Priority | Channel | Why | Triangle action |
|---:|---|---|---|
| 1 | Existing inbound recruiters/agencies | They already initiated contact; fastest route to a conversation and legally safer than unsolicited email | Reply manually to the four 70+ leads and ask whether the client accepts a supplier team/framework partner |
| 2 | Existing relationships and referrals | Trust is decisive in subcontracting | Ask every known recruiter, project manager, contractor, and placed worker for one introduction to procurement/workforce leadership |
| 3 | Invited supplier and labor-agency portals | The buyer has explicitly created a route for new suppliers | Register and submit a professional supplier-readiness pack |
| 4 | Live project/award intelligence | Identifies the prime contractor and timing | Use news, TED awards, and company announcements to select the prime, then use its approved supplier route |
| 5 | Targeted calls and one-to-one outreach | Useful when highly relevant and lawful | Human-led, low-volume, with a specific project/package reason |
| 6 | Public tenders | Often too large or qualification-heavy for Triangle to bid directly | Use award notices to identify winning primes and downstream attack points |
| 7 | Job advertisements | Good signal of workload, weak proof of subcontractor demand | Ask whether the demand can be fulfilled by a managed supplier team |
| 8 | Automated cold email | Legally and operationally risky, easily commoditized | Do not use as the default growth engine |

### Public procurement should be intelligence first

The EU [TED Search API](https://docs.ted.europa.eu/api/latest/search.html) is openly available for searching published procurement notices. TED's [open-data examples](https://docs.ted.europa.eu/ODS/latest/connecting/sparql.html) explicitly demonstrate finding companies that won contracts.

That makes a strong workflow:

```text
planning/tender notice
  -> award notice
  -> winning prime contractor
  -> supplier portal / subcontract manager
  -> Triangle crew package
```

This is often more valuable than attempting to bid the entire public contract.

## 9. Immediate real target routes

These are current public routes that match Triangle's model. They are leads to qualify, not promises of work.

### Mercury Engineering

Mercury's [supply-chain page](https://www.mercuryeng.com/supply-chain/) explicitly invites European subcontractors, labor agencies, consultants, and suppliers to register through SAP Ariba. Its published onboarding guide lists separate contacts for subcontractors and labor agencies. This is a much stronger route than guessing an owner contact.

**Action:** prepare one supplier pack and register interest under the correct delivery model. Do not present as both a labor agency and works subcontractor until legal/commercial classification is settled.

### Exyte

Exyte announced [three Frankfurt-area AI data-center awards worth close to €750m](https://www.exyte.net/Newsroom/Exyte-secures-three-major-AI-driven-data-center-projects-near-Frankfurt) in June 2026. Its [supplier registration process](https://www.exyte.net/en/Exyte-Supplier-Portal/Register-SAP-Ariba) includes financial/legal standing, HSE, technical references, compliance, quality, export control, and annual requalification.

**Action:** use the projects as timing evidence and the supplier process as the route. The first objective is an invitation/prequalification conversation, not a generic sales email.

### SPIE

SPIE announced the phased 16 MW [FRA7 AI-enabled data center](https://www.spie.com/en/news/spie-builds-ai-enabled-data-centre-firstcolo-rosbach-vor-der-hohe-germany) in June 2026. Its [MySourcing supplier platform](https://www.spie.com/en/suppliers/simple-and-effective-relationship-mysourcing-spies-supplier-portal) handles invitations to tender, proposals, contracts, and signatures.

**Action:** identify the relevant German business unit and procurement/subcontract route; qualify whether Triangle's package fits a shortage category.

### Bilfinger

Bilfinger states that suppliers, subcontractors, and service providers account for nearly half of its added value and provides a [supplier registration route](https://www.bilfinger.com/en/uk/about-us/become-a-supplier/). A current Austrian business page explicitly lists electrical installation, automation, welders, fitters, and external personnel among supplier needs.

**Action:** qualify the right Bilfinger entity and engagement type before registering. A country/entity-specific approach is essential.

### Existing agency partners

The current inbox already contains strong leads from agencies. These are the shortest route to discovering whether a “single engineer” request hides repeat or multi-person demand.

**Action:** reply with a team-supplier question and a short list of missing commercial fields. Do not wait for another feature.

## 10. Contract readiness comes before outreach scale

### A. Delivery-model classification

Triangle must decide for each offer and country whether it is providing:

- a defined subcontracted work/service under Triangle's own supervision;
- temporary agency labor under the client's supervision;
- independent contractors;
- recruitment/referral only;
- employer-of-record or payroll services through a partner.

The label in a proposal does not decide the legal reality. In Germany, the Federal Ministry of Labour explains that actual execution controls classification: workers integrated into the client's organization and subject to its instructions can constitute labor leasing. Germany's [AÜG](https://www.gesetze-im-internet.de/englisch_a_g/index.html) generally requires a permit for temporary agency work, and the construction sector has additional restrictions.

This needs qualified legal advice for the exact company, worker relationships, target country, and contract. The product should never imply that calling labor a “crew package” avoids labor-leasing law.

### B. Cross-border posting readiness

EU postings can require advance host-country declarations, host-country employment conditions, document retention, and Portable Document A1. The EU's [posted-worker guidance](https://europa.eu/youreurope/business/hiring-managing-staff/cross-border-posted-workers/posting-staff-abroad/indexamp_en.htm) states that A1 coverage can generally remain in the home system for up to 24 months when the conditions are met. Temporary agency workers are generally entitled to equal basic working conditions under [EU rules](https://europa.eu/youreurope/business/hiring-managing-staff/employment-arrangements-types/temporary-agency-work/index_en.htm).

Every country/package should therefore have a red/amber/green deployment matrix covering:

- right to work;
- posting declaration;
- A1 feasibility;
- agency/labor-leasing license;
- sector restrictions;
- local collective agreement/minimum remuneration;
- working time and overtime;
- accommodation/travel rules;
- safety training and site cards;
- insurance;
- tax/permanent-establishment risk;
- subcontractor-chain declarations.

### C. Supplier-prequalification pack

At minimum, prepare:

- company registration, VAT/VIES, ownership, bank details;
- proof of insurances and coverage limits;
- HSE policy and incident history;
- quality policy and certifications;
- anti-bribery, modern-slavery, sanctions, and code-of-conduct confirmations;
- technical references with contactable clients;
- organization chart and responsible supervisor;
- worker competence matrix;
- document-readiness matrix;
- country coverage;
- financial standing;
- data-protection information;
- standard commercial assumptions and exclusions.

Exyte, Mercury, SPIE, Bilfinger, Achilles, and Avetta all signal that this material is part of access to work.

### D. Economics and working capital

For every package, calculate:

```text
client bill rate
- worker pay/subcontract rate
- payroll/employer costs where applicable
- travel, accommodation, per diem
- supervisor/non-productive time
- PPE, tools, training, certification
- insurance and compliance administration
- recruitment and mobilization cost
- financing cost and FX risk
- expected bad debt / delay
= contribution margin
```

Illustration only: ten workers paid €30/hour for 50 hours per week require €15,000 of weekly labor cash. If the client pays after 45 days, the payroll funding gap can exceed €90,000 before travel, accommodation, tax, or disputes. A contract can be profitable on paper and still bankrupt the supplier through cash flow.

No package is “ready” until price, payment terms, credit risk, and funding are understood.

## 11. Outreach policy

### Human authority should remain permanent

The existing rule that nothing sends email automatically is correct. Keep it until Triangle has:

- a country-specific lawful-outreach policy;
- verified sender authentication and reputation monitoring;
- a suppression/objection list;
- an approved audience and lawful basis;
- proven manual messaging that converts;
- management acceptance of brand risk.

### Germany is not a normal cold-email market

Germany's [UWG §7](https://www.gesetze-im-internet.de/uwg_2004/__7.html) generally treats advertising by electronic mail without prior express consent as an unreasonable nuisance, with a narrow existing-customer exception. Generic AI cold-email sequences aimed at German buyers should therefore not be Triangle's plan.

By contrast, the UK ICO explains that [PECR's electronic-mail consent rule does not apply to corporate subscribers](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/), although UK GDPR, identification, opt-out, suppression, and lawful-basis duties still apply. Rules vary by country and recipient type.

The EDPB's [legitimate-interest guidance](https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202401_legitimateinterest_en.pdf) makes clear that direct marketing is not automatically lawful merely because it can be a legitimate interest; necessity, balancing, expectations, and ePrivacy/national rules still matter.

### Deliverability reinforces the same conclusion

Google's [sender guidelines](https://support.google.com/mail/answer/81126?hl=en) require authentication and recommend keeping spam complaints below 0.1%, never reaching 0.3%. Bulk senders need SPF, DKIM, DMARC, alignment, and one-click unsubscribe. Microsoft also enforces SPF, DKIM, and DMARC for high-volume Outlook consumer senders.

Triangle should send fewer, better, human-approved messages tied to a real project/package—not use agents to manufacture volume.

### Recommended first-contact structure

```text
Reason: the specific project, job request, or supplier route.

Offer: the exact supervised crew or specialist capability Triangle can
actually mobilize, with a truthful date and country-readiness statement.

Question: does this buyer accept this engagement model, and what are the
scope, headcount, timing, rate/budget, site, and prequalification requirements?

Action: a short qualification call or permission to submit the supplier pack.
```

Example:

> We supply supervised electrical/automation teams rather than only individual freelancers. Your current requirement appears relevant, but before sending profiles I would like to confirm whether the client accepts a supplier team, expected headcount, site/shift pattern, engagement model, rate range, and vendor-onboarding requirements. If useful, we can share a concise capability and readiness pack for review.

Do not claim crew size, certificates, availability, client references, or legal readiness that Triangle cannot prove.

## 12. Human-agent operating model

### What agents should do

- monitor approved sources and inbound mail;
- extract raw facts and preserve evidence;
- rank against a specific sellable package;
- map contractor chains and procurement routes;
- find official supplier registration channels;
- prepare account dossiers and call briefs;
- draft one-to-one communications for approval;
- maintain follow-up tasks;
- record outcomes and propose lessons.

### What humans should do

- choose the offer and market;
- confirm worker reality and availability;
- approve every external communication;
- make calls and build trust;
- qualify scope, authority, budget, timing, and engagement model;
- negotiate rates and terms;
- obtain legal/compliance advice;
- approve supplier submissions;
- sign contracts;
- make mobilization decisions.

### Agent roster recommendation

- **Bob:** keep as an inbox courier. Its narrowness is a control, not a weakness.
- **Scout:** focus only on a named package/market mission, not generic project discovery.
- **Buyer/Procurement Mapper:** create only after the first package and target-account list are fixed; it should find attack points and official routes, not send.
- **Follow-up coordinator:** only after human outreach volume becomes hard to track.

Do not add more agents until Bob and Scout contribute to a buyer conversation or a signed supplier step.

## 13. Contract-first roadmap

### Phase 0 — commercial truth (days 1–7)

**Goal:** know exactly what Triangle can sell now.

1. Freeze generic-agent UX work, new dashboards, and new agent roles.
2. Reconcile the real subcontractor roster with the database.
3. Confirm availability by direct human contact; stale availability is not inventory.
4. Choose one package only.
5. Complete its worker, document, rate, country, and supervisor matrix.
6. Classify the intended delivery model with qualified legal support.
7. Calculate landed cost, contribution margin, payment-gap funding, and walk-away terms.
8. Assemble the supplier-prequalification pack.
9. Select 25 named target accounts and one accountable buyer/procurement route per account.
10. Reply manually to the four current 70+ inbound leads with the team-supplier qualification question.

**Exit criteria:** one truthful package, one lawful target-market approach, one supplier pack, and at least three real buyer conversations requested.

### Phase 1 — founder-led contract sprint (days 8–30)

**Goal:** learn which route produces qualified demand.

Run three parallel but small campaigns:

1. **Inbound conversion:** work every relevant recruiter/agency lead.
2. **Supplier access:** Mercury, Exyte, SPIE, Bilfinger, and selected vendor networks.
3. **Project-triggered account development:** use current awards/projects only to approach the downstream buyer or procurement route.

Suggested activity targets—not forecasts:

- 25 fully researched target accounts;
- 10 warm/inbound qualification conversations;
- 8 supplier/prequalification submissions or introductions;
- 15 highly relevant, human-approved direct actions across lawful channels;
- 5 qualified buyer conversations;
- 2 RFQs, vendor-prequalification processes, or concrete job requirements;
- 1 written commercial proposal.

Every interaction must be recorded with outcome and next date.

**Do not build software during the sprint unless a verified bug blocks a real commercial action.**

### Phase 2 — close and mobilize (days 31–60)

**Goal:** move from interest to a contractable job.

1. Concentrate on the channel and buyer segment that responded.
2. Complete vendor onboarding and contract review.
3. Confirm rate, payment terms, scope, supervision, timesheets, expenses, liability, replacement, termination, and dispute rules.
4. Reserve the crew and update availability.
5. Prepare only the documents the client/site actually requires.
6. Issue a named submission or crew proposal.
7. Secure an MSA/framework, approved-supplier status, purchase order, or job order.

**Exit criteria:** a signed commercial route and a mobilization-ready assignment, or clear evidence why the offer/market failed.

### Phase 3 — first paid delivery and learning loop (days 61–90)

**Goal:** deliver safely and prove economics.

1. Mobilize the first worker or crew.
2. Track attendance, safety, quality, timesheets, client feedback, invoice, payment, and actual contribution margin.
3. Attribute the outcome to the originating signal, buyer route, message, package, and workers.
4. Conduct a win/loss review.
5. Update the playbook only with evidence and human approval.

**Exit criteria:** paid work and known unit economics. A signed agreement with no mobilization is progress, not final proof.

### Phase 4 — repeatability (months 4–6)

**Goal:** prove this was not a one-off.

- win at least three unrelated paying clients;
- complete or mobilize at least five assignments/crew packages;
- establish one repeatable acquisition channel;
- establish one repeatable supplier-onboarding pack;
- maintain trustworthy worker availability and document readiness;
- demonstrate positive contribution margin after all delivery costs.

Only now should Triangle expand to a second package or country.

### Phase 5 — productization decision (months 6–12)

Consider selling the software/workflow to other agencies only when:

- Triangle uses it weekly to run real revenue;
- another agency has the same workflow problem;
- that agency will pay for a pilot;
- the workflow survives outside Nikola's tacit knowledge;
- onboarding, tenant security, support, and data rights are understood;
- the repeatable value is more than “we have AI agents.”

The likely external product, if proven, is:

> **A contract-to-crew revenue and delivery OS for cross-border technical staffing/subcontracting firms.**

It is not a generic hybrid work OS.

## 14. Metrics that matter

### Commercial funnel

```text
contract-ready packages
-> named target accounts
-> verified buyer/procurement routes
-> human commercial actions
-> replies/conversations
-> qualified requirements
-> supplier approvals / RFQs
-> proposals
-> MSAs / job orders
-> worker submissions
-> mobilizations
-> paid invoices
-> contribution margin
```

### Weekly management metrics

- number of contract-ready packages;
- workers whose availability was human-confirmed in the last 14 days;
- document-ready workers by target country;
- target accounts with a verified attack point;
- supplier registrations in progress;
- buyer conversations held;
- qualified requirements received;
- proposals outstanding;
- signed commercial agreements/job orders;
- mobilized workers;
- forecast and realized contribution margin;
- aged receivables and payroll funding exposure.

### Agent metrics are secondary

- accepted finding rate;
- percentage of findings that create a human commercial action;
- buyer-route accuracy;
- time saved per qualified account;
- cost per qualified conversation;
- error/hallucination rate;
- outcomes originated.

Do not optimize task count, sources searched, emails generated, or agent activity in isolation.

### Stop/change rules

- If 25 well-selected accounts produce no buyer conversations, revisit the package and buyer route before adding more data.
- If conversations occur but no buyer accepts the engagement model, change legal/commercial structure or market.
- If demand exists but crew coverage is weak, build supply before more outreach.
- If proposals fail on price, model full landed costs and segment economics; do not blindly reduce margin.
- If a channel yields only individual-freelancer roles, decide whether those placements are economically valuable or stop calling them crew opportunities.
- If manual messages do not convert, automation will scale failure.

## 15. What to keep, defer, and change in the existing roadmap

### Keep

- project-to-placement philosophy;
- contractor-chain mapping;
- suggestions as the source of AI proposals;
- human approvals;
- evidence provenance;
- Job Intake;
- worker/document truth;
- package matching and submission packets;
- provider-independent agent identity;
- no autonomous external sending.

### Change

- Add a supply-first lane alongside signal-first discovery.
- Put commercial validation before Hunter expansion.
- Add delivery-model/legal feasibility before “outreach ready.”
- Add supplier-prequalification status.
- Add full landed-cost, credit, and working-capital readiness.
- Define opportunity by buyer authority and contract route, not by AI score.
- Treat vendor registration and buyer conversations as product outcomes.
- Measure mobilization and margin, not project volume.

### Defer

- Collaboration Field/spatial organization canvas;
- generic hybrid work OS refactor;
- employee performance dashboards;
- agent catalogs and elaborate “hire” flows;
- autonomous AI SDR/email sending;
- broad marketplace features;
- more research agents;
- expanding to many sectors/countries;
- cosmetic dashboard work.

## 16. The decision Triangle should make now

Adopt this statement:

> **For the next 90 days, Triangle is not building an AI workforce product. Triangle is using AI and its existing operating system to win and deliver one profitable technical labor contract. Every feature, agent, research run, and human task must contribute directly to a verified crew package, buyer conversation, supplier approval, job order, mobilization, or margin learning.**

That gives Claude, Codex, Grok, Nikola, and Ralph one unambiguous instruction.

## Primary research sources

### Market and labor demand

- [European Labour Authority — Labour shortages and surpluses in Europe 2024](https://www.ela.europa.eu/en/publications/labour-shortages-and-surpluses-europe-2024)
- [IEA — World Energy Employment 2025](https://www.iea.org/reports/world-energy-employment-2025/executive-summary)
- [Uptime Institute — Global Data Center Survey 2025](https://datacenter.uptimeinstitute.com/rs/711-RIA-145/images/2025.Annual.Survey.Report.pdf?version=0)
- [European Commission — AI Continent](https://commission.europa.eu/topics/competitiveness/ai-continent_en)

### Profitable/commercial comparables

- [NES Fircroft Annual Report 2025](https://sitescdn.wearevennture.co.uk/public/nes-fircroft/assets/nesfircroftannualreport2025-6.pdf)
- [Job&Talent 2024 profitability update](https://www.jobandtalent.com/news/strong-profitability-gains-and-ai-evolution)
- [Randstad FY 2025](https://www.randstad.com/press/2026/fy-2025-perform-transform/)
- [Adecco FY 2025](https://www.adeccogroup.com/our-group/media/press-releases/q4-fy-2025-results)
- [Workrise](https://www.workrise.com/about)
- [Skillit](https://skillit.com/mission)

### Project, procurement, and supplier channels

- [TED Search API](https://docs.ted.europa.eu/api/latest/search.html)
- [SAP Business Network Discovery](https://www.sap.com/products/business-network/find-suppliers.html)
- [Avetta contractor sourcing](https://www.avetta.com/clients/solutions/platform/contractor-sourcing)
- [Achilles Network](https://www.achilles.com/achilles-network)
- [Mercury Supply Chain](https://www.mercuryeng.com/supply-chain/)
- [Exyte supplier registration](https://www.exyte.net/en/Exyte-Supplier-Portal/Register-SAP-Ariba)
- [SPIE MySourcing](https://www.spie.com/en/suppliers/simple-and-effective-relationship-mysourcing-spies-supplier-portal)
- [Bilfinger supplier registration](https://www.bilfinger.com/en/uk/about-us/become-a-supplier/)

### Legal, privacy, and deliverability

- [EU posted-worker guidance](https://europa.eu/youreurope/business/hiring-managing-staff/cross-border-posted-workers/posting-staff-abroad/indexamp_en.htm)
- [EU temporary-agency-work guidance](https://europa.eu/youreurope/business/hiring-managing-staff/employment-arrangements-types/temporary-agency-work/index_en.htm)
- [Germany AÜG](https://www.gesetze-im-internet.de/englisch_a_g/index.html)
- [Germany UWG §7](https://www.gesetze-im-internet.de/uwg_2004/__7.html)
- [EDPB legitimate-interest guidelines](https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202401_legitimateinterest_en.pdf)
- [UK ICO B2B marketing guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/)
- [Google email sender guidelines](https://support.google.com/mail/answer/81126?hl=en)

## Important limitation

This review is business/product research, not legal, tax, payroll, insurance, or immigration advice. Cross-border labor supply is highly country- and fact-specific. Triangle should have a qualified adviser validate the engagement model, contracts, licenses, posting rules, and worker status before mobilization or making binding claims to a buyer.
