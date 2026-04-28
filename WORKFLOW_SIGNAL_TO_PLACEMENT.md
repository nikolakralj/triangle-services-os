# Workflow: Signal To Placement

## Purpose

This document defines the real operating workflow behind the app.

The app should not stop at "we found a project."
It should help move from discovery to a credible labor offer and then to placement.

## End-To-End Flow

`signal -> qualification -> contractor chain -> buyer mapping -> crew package -> outreach -> follow-up -> placement`

## 1. Signal

Input:

- news announcement
- permit filing or permit approval
- tender notice
- contractor announcement
- project financing announcement
- hiring spike or subcontractor signal

Output:

- a discovered project record with source URL, summary, country, phase, and AI confidence

Automation potential:

- high

## 2. Qualification

Questions:

- is the project real and current?
- is it in a target country?
- is the phase early enough to matter?
- is the scale large enough to justify effort?
- is there likely electrical / MEP / industrial labor demand?

Output:

- keep / reject
- opportunity score
- worker match score
- recommended next action

Automation potential:

- medium to high

## 3. Contractor Chain Mapping

This is the missing middle and a critical module.

Questions:

- who is the owner / developer?
- who is the EPC or GC?
- who is the MEP contractor?
- who is the electrical subcontractor?
- are there labor intermediaries or agencies already visible?

Output:

- contractor chain with confidence level
- role labels for each company in the chain
- known unknowns flagged clearly

Automation potential:

- medium

Human review remains important.

## 4. Buyer Mapping

For each relevant company in the chain, identify likely buyers:

- project director
- site manager
- construction manager
- subcontract manager
- procurement
- workforce / mobilization lead
- operations manager

Output:

- contact list ranked by likely buying relevance
- outreach priority

Automation potential:

- medium

## 5. Crew Package Recommendation

This should translate a project into a commercial offer.

Examples:

- 20 cable pullers + 2 electrical supervisors
- 12 electricians for fit-out
- 8 commissioning technicians for energization window
- 10 tray installers + 1 foreman for 12 weeks

Questions:

- what phase is the project in?
- what labor packages fit that phase?
- what duration is likely?
- what revenue range could this create?
- what worker coverage does Triangle currently have?

Output:

- recommended package
- timing window
- worker coverage confidence
- revenue estimate

Automation potential:

- medium

## 6. Outreach

The outreach should target the likely buyer, not just the project owner.

Good outreach should reference:

- the specific project
- the project phase
- the likely package demand
- the exact crew package Triangle can supply
- proof of relevant capability

Output:

- email draft
- LinkedIn / phone script
- follow-up task

Automation potential:

- high for drafting
- low for judgment

## 7. Follow-Up

Once outreach is sent, the app should support:

- response logging
- next-step creation
- hot-reply escalation
- task reminders
- conversion into formal opportunity

Automation potential:

- medium

## 8. Placement

If interest is real, the workflow becomes delivery-oriented:

- shortlist workers
- collect and link CVs / documents
- track compliance items
- confirm mobilization dates
- convert into won opportunity / active project

Automation potential:

- medium

## What The App Must Eventually Visualize

For each discovered project:

- project phase
- contractor chain
- buyer confidence
- recommended crew package
- current worker coverage
- next best action

That is the core view that turns signals into placements.
