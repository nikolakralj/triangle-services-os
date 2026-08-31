# Workflow: Signal or Supply to Paid Delivery

**Updated:** 29 August 2026

## Purpose

This document defines the real operating workflow behind Triangle.

The application must not stop at finding a project, scoring a lead, matching a
worker, generating a packet, or recording `placed`. It must help move from
truthful input to a contractable requirement, mobilized delivery, payment, and
known margin.

## Two entry lanes

### Demand-first

```text
signal
-> review/qualification
-> contractor chain
-> buyer/procurement route
-> confirmed requirement
-> crew/specialist package
-> human commercial action
-> proposal/order
-> submission
-> mobilization
-> delivery/payment
```

### Supply-first

```text
human-confirmed available people
-> crew/specialist package
-> target project/account
-> buyer/procurement route
-> confirmed requirement
-> human commercial action
-> proposal/order
-> submission
-> mobilization
-> delivery/payment
```

Both use the same domain truth after a requirement and package meet.

## 1. Input signal

Examples:

- recruiter/client email;
- referral or prior relationship;
- worker/team availability;
- job advert or hiring spike;
- project announcement, permit, tender, or award;
- contractor appointment;
- supplier portal or framework opportunity;
- current client workload.

Output:

- an idempotent source-backed record;
- enough metadata for review;
- privacy-safe raw-material handling.

Automation potential: high for ingest, low for interpreting commercial
authority.

Success test: the signal reaches the correct review queue once. It is not yet
an opportunity.

## 2. Review and qualification

Questions:

- Is it real, current, relevant, and sufficiently evidenced?
- Does it fit the selected package or truthful supply?
- Is this individual employment, freelance augmentation, managed team,
  subcontracted scope, agency/framework, or unknown?
- Is the timing usable?
- Is there a plausible buyer/route?
- What is missing?
- What is the next human action?

Output:

- pursue now / follow up later / needs research / monitor / reject;
- structured reason;
- owner and due date;
- facts, inferences, and unknowns.

Automation potential: medium. Human judgment remains decisive.

## 3. Supply truth and package formation

For each proposed package:

- named or reservable people;
- exact roles and current competence;
- availability confirmation date and source;
- countries accepted and travel constraints;
- languages;
- rate/engagement expectations;
- certificates/documents and expiry;
- A1/right-to-work/posting feasibility state;
- supervisor/foreman coverage;
- earliest mobilization;
- package scope and exclusions.

Output:

- truthful package;
- current coverage and gaps;
- readiness and expiry;
- no double-promise/reservation conflict.

Automation potential: low to medium. AI may extract and suggest; humans confirm
people and commitments.

Success test: headcount and readiness are supported by real records.

## 4. Contractor chain and contracting entity

Map:

- owner/operator/developer;
- EPC/GC;
- MEP/electrical/automation/specialist contractor;
- labor agency/framework partner;
- entity that would sign with or pay Triangle.

Output:

- relationships with evidence and confidence;
- known unknowns;
- likely labor buyer;
- contracting entity hypothesis;
- best current attack point.

Automation potential: medium with human review.

Success test: Triangle is no longer targeting only the headline owner.

## 5. Buyer, procurement, and supplier route

Identify:

- buyer role/person;
- procurement/subcontract/workforce owner;
- recruiter/framework contact;
- supplier portal and relevant legal entity;
- onboarding/prequalification process;
- referral/introduction route;
- permitted engagement model.

Output:

- verified route;
- source/evidence;
- route status and requirements;
- human owner, next action, and due date.

Automation potential: medium for research, low for submission/contact.

Success test: a human knows exactly whom or which process to approach next.

## 6. Qualified commercial requirement

Confirm with the buyer/recruiter:

- actual client/site and contracting entity;
- scope and exclusions;
- roles, headcount, and seniority;
- start window, duration, shifts, and location;
- required skills, references, and documents;
- supplier team versus individual augmentation;
- engagement model;
- budget/rate and payment-term logic;
- onboarding and decision process;
- next decision date.

Output:

- contract-qualified crew opportunity or explicit disqualification;
- missing fields and owner;
- dated next step.

Automation potential: low for truth. AI may prepare questions and structure
human conversation notes.

Success test: buyer-confirmed demand and an acceptable route exist.

## 7. Commercial readiness and proposal

Calculate and review:

- worker/direct cost;
- employment/statutory cost where applicable;
- travel, accommodation, per diem, PPE, tools, training;
- supervision/nonproductive hours;
- insurance/compliance/admin;
- financing, FX, and bad-debt allowance;
- contribution-margin range;
- target/minimum rate and payment-term limit;
- funding exposure and walk-away conditions.

The proposal contains:

- buyer/project/site;
- scope and exclusions;
- crew composition;
- supervision and mobilization;
- rate and time assumptions;
- responsibilities/dependencies;
- timesheet/acceptance process;
- required documents;
- validity and next decision date;
- contracting route.

Automation potential: medium for preparation, none for binding approval.

Success test: a human-approved offer can be commercially and legally delivered.

## 8. Human commercial action

Channels:

- reply to inbound recruiter/client;
- call or warm introduction;
- supplier/prequalification submission;
- project-triggered direct contact;
- packet/capability submission;
- proposal.

Record:

- AI draft and final human version;
- recipient/entity and channel;
- sender and actual action time;
- document/package version;
- named or anonymized state;
- follow-up date;
- response/objection/outcome.

Automation potential: high for drafting, low for judgment. External action
remains human.

Success test: the communication or submission actually left Triangle and is
auditable.

## 9. Supplier approval and commercial order

Possible states:

- registration/prequalification;
- approved supplier;
- NDA/DPA;
- framework/MSA;
- rate card;
- statement of work;
- job order/PO;
- rejected/dormant with reason.

Track:

- entity and agreement version;
- scope;
- rate/payment terms;
- liability/insurance;
- timesheet/acceptance;
- termination/replacement;
- legal/commercial owner;
- validity and renewal.

Automation potential: low. Human/legal review is mandatory.

Success test: Triangle has a valid route to perform and be paid for the work.

## 10. Worker/crew submission and client decision

Output:

- appropriate named/anonymized submission;
- worker/package version;
- client decision per person/crew;
- rejection/withdrawal reason;
- reservation and availability update;
- replacement path.

Automation potential: medium for assembling, low for sharing and committing.

Success test: submitted people are real, available, qualified, and not promised
elsewhere.

## 11. Mobilization

Track:

- client acceptance/order;
- start date, site, supervisor;
- posting/A1/work permit and site requirements;
- insurance, inductions, medical, PPE/tools;
- travel/accommodation;
- contract/engagement confirmation;
- readiness blockers and owner.

Automation potential: medium for reminders/checklists; legal and readiness
decisions remain human.

Success test: the person/crew is cleared and scheduled to start.

## 12. Delivery

Track:

- attendance and approved timesheets;
- scope changes;
- safety/quality/issues;
- worker and client feedback;
- replacements and early termination;
- utilization and completion;
- next/redeployment opportunity.

Automation potential: medium for collection and alerts.

Success test: Triangle knows what happened on the job, not only that it began.

## 13. Invoice, payment, and margin

Track:

- billable time/milestone;
- approved invoice amount and date;
- due date and payment;
- payroll/subcontractor funding exposure;
- travel/accommodation/other actual costs;
- forecast versus realized contribution margin;
- dispute/bad-debt reason.

Automation potential: high for calculation/integration, low for accounting and
commercial authority.

Success test: paid work and known economics.

## 14. Outcome learning

Connect the outcome back to:

- original signal/source;
- account and buyer/procurement route;
- human action and message version;
- package and people;
- proposal/order terms;
- agent findings and recommendations;
- delivery quality and margin.

An agent may propose a playbook lesson. A human approves any role/house-rule
change.

Success test: the next decision becomes better because a real outcome exists.

## What the application must visualize

For every active commercial/delivery object:

- current state and time in state;
- verified facts and evidence;
- unknowns/blockers;
- buyer/contracting route;
- package and coverage;
- commercial/legal readiness;
- owner;
- next action and due date;
- external-action history;
- downstream outcome and margin when available.

The most important default view is “what needs human action now,” not an agent
activity map.
