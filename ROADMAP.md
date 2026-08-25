# Triangle Services OS — Build Roadmap

> Living doc. Update after each sprint. Architecture: Next.js 16, Supabase, OpenAI Responses API, Tailwind.
> Agent-first: all intelligence lives in the research chat agent — no magic buttons.
> Sub-agents: use Claude Code parallel agents for backend + frontend slices.

---

## ✅ Completed Sprints

### Sprint A — Hunter / Project Discovery
- `discovered_projects` table + full CRUD
- Project list + detail page at `/hunter/[id]`
- Contractor chain panel (chain_nodes with role, confidence, rationale)
- Buyer contacts panel (people at each chain node)

### Sprint B — Research Workbench
- `research_runs` + `research_suggestions` tables
- Persistent conversation memory (`research_conversations`, `research_messages`)
- OpenAI Responses API agentic loop in `/api/research/chat`
- 8 agent tools: `add_chain_node`, `add_buyer_contact`, `add_note`, `add_package_opportunity`, `reject_suggestion`, `web_search`, `recall_memory`, `propose_package`
- Suggestion queue with human-review gate (accept / reject)
- Research chat panel with message streaming

### Sprint C — Packages
- `project_packages` table (roles[], estimated_crew_size, confidence)
- `propose_package` agent tool creates packages via suggestion queue
- Package list embedded on project detail page

### Sprint D — Outreach Agent
- `outreach_drafts` table (channels: linkedin_connect, linkedin_message, email_cold, email_followup)
- Outreach lifecycle: draft → sent → replied / no_reply / archived
- `draft_outreach` agent tool — drafts multi-variant outreach in a single call
- Hard rules in system prompt: research-grounded, no boilerplate, no fake specifics
- `/api/research/outreach/[id]` PATCH endpoint (mark_sent, mark_replied, archive, edit)
- `OutreachDraftsPanel` component — copy, edit inline, lifecycle transitions

### Pass 1 — Company Cross-Project Intelligence
- `getCompanyCrossProjectIntel()` data function — aggregates across all projects
- `CompanyIntelligencePanel` component — 5 sections: stats, projects, contacts, packages, outreach
- Company detail page now shows every project the company is involved in
- "Open project chat" button per project row navigates to `/hunter/[id]`

### Pass 2 — Worker Matching Engine ✅ tested 2026-05-11
- Migration `009_package_worker_matches.sql` — `package_worker_matches` table with enum status
- `src/lib/data/worker-matching.ts` — scoring algorithm + CRUD
- `src/app/api/packages/[id]/match/route.ts` — POST (run match), GET (list), PATCH (update status)
- `src/components/modules/worker-match-panel.tsx` — shortlist / submit / place UI with 4 status tabs
- Wired into `hunter/[id]` project page below packages via `PersistedCollapsible`
- Lifecycle tested: shortlisted → submitted (with note) → placed | rejected

### Pass 3 — Internal-use fixes (post strategic audit) ✅ 2026-05-16
- Re-tuned scoring formula (additive, not multiplicative) so a perfect-fit supervisor scores 85+ not 55
- Status filter pills on Signal Inbox (All / New / Reviewing / Qualified / Pursuing / Won / Lost / Archived) so closed projects are findable
- **Submission packet generator** — `/api/packages/[id]/submission-packet` builds buyer-ready markdown from submitted workers (project context, crew profiles with rates/skills/certificates/track record, next-steps section). UI: "Generate packet" + "Copy" buttons in Submitted/Placed tabs of Worker Matching panel

---

## 🎯 Strategic decision (2026-05-16)

Brutal audit + deep market research → **Path A locked in:**
- Use it internally at Triangle for 6 months. Prove the workflow on real placements.
- **Do NOT chase Hays/G2/Vivid yet.** Today the product fails enterprise procurement (no SOC 2, no SSO, OpenAI direct = GDPR blocker, no LinkedIn Recruiter / Bullhorn / Outlook integrations).
- Realistic v0 ICP if/when commercialising: boutique construction-staffing agencies (5–25 recruiters) at $500–$2k/mo.
- Defensible moat = contractor-chain graph + worker outcome data (compounds per placement). NOT AI agents (commodity).
- Do not merge into hybrid-social-app — different audience, different sale, different compliance.

## 📋 Planned Sprints (internal-use first)

### Sprint F — Submission Tracking (Pass 3 was the foundation)
- PDF generation from the markdown packet (use Puppeteer / @react-pdf)
- Track which buyer/contact each packet was sent to + when + response
- Placement fee / billing milestone tracking
- Email template flow (still copy-to-clipboard — manual send for trust/GDPR)

### Sprint G — Document Vault
- Worker certificates (A1, CSCS, IPAF, etc.) upload + expiry tracking
- Project documents (contracts, POs, NDA)
- Auto-expiry alerts
- Document checklist per package

### Sprint E — Streaming UX (deferred — nice-to-have, not commercial)
- SSE streaming in research chat
- Real-time tool call visualization
- Typing indicator

### Sprint G — Document Vault
- Worker certificates (A1, CSCS, IPAF, etc.) upload + expiry tracking
- Project documents (contracts, POs, NDA)
- Auto-expiry alerts
- Document checklist per package

### Sprint H — Pipeline Automation
- Auto-advance opportunity stages based on events (outreach sent → replied → placed)
- Weekly digest email: active projects, pending actions, expiring certs
- Slack / Teams webhook for high-priority alerts

### Sprint I — Analytics Dashboard
- Revenue pipeline by project and company
- Placement rate, outreach reply rate, time-to-placement
- Worker utilization chart
- Top performing buyer contacts

---

## Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Agent framework | OpenAI Responses API + tool-calling | Streaming, persistent state via `previous_response_id` |
| Suggestion pattern | Human-review gate before DB commit | Prevents AI garbage polluting CRM |
| Outreach | Copy-to-clipboard, manual send | GDPR, LinkedIn ToS, user trust |
| Auth | Supabase RLS + cookie session | Multi-tenant safe, row-level isolation |
| Worker matching | Postgres query + JS scoring | Simple, no ML infra needed |
| Sub-agents | Claude Code parallel agents | Backend + frontend slices run simultaneously |

---

## Data Model Summary

```
organizations
  └─ discovered_projects
      ├─ contractor_chain_nodes      (companies in delivery chain)
      ├─ buyer_contacts              (people to pitch to)
      ├─ project_packages            (labor packages to staff)
      │    └─ package_worker_matches (← Pass 2: scored shortlist)
      ├─ outreach_drafts             (AI-drafted messages)
      └─ research_conversations
           └─ research_messages

companies ←→ contractor_chain_nodes (optional FK)
contacts  ←→ buyer_contacts         (optional FK)
workers   ←→ package_worker_matches (← Pass 2)
```

---

## Agent Tooling (research chat)
| Tool | What it does |
|---|---|
| `web_search` | Duckduckgo search with snippets |
| `recall_memory` | Fetches prior conversation messages |
| `add_chain_node` | Suggests a company for the contractor chain |
| `add_buyer_contact` | Suggests a buyer contact at a chain node |
| `add_note` | Persists a research note |
| `add_package_opportunity` | Suggests a new labor package |
| `propose_package` | Accepts a package suggestion into project_packages |
| `reject_suggestion` | Marks a suggestion as rejected |
| `draft_outreach` | Generates multi-variant outreach drafts |

---

## 🚧 Known enterprise-SaaS gaps (deferred until Path B/C — design-partner traction)

| Area | Gap | Blocks |
|---|---|---|
| Auth | No SSO/SAML/SCIM | Any agency >50 users |
| Compliance | No SOC 2, no DPA, no DSAR workflow | All EU/UK enterprise |
| AI data flow | Raw OpenAI (not Azure OpenAI ZDR) | GDPR procurement review |
| Integrations | No Bullhorn / LinkedIn Recruiter / Outlook / Indeed | Every staffing agency |
| Billing | No Stripe / subscription layer | Cannot sell |
| Operations | No rate limits, no Sentry, no background jobs, no CI/CD | Production hardening |
| Testing | 3 e2e specs, zero unit tests | Refactoring confidence |
| Mobile | UI breaks on phone | Field-recruiter workflow |
| Submission packets | Markdown only (no PDF) | Commercial polish |

These are NOT bugs — they are deliberate deferrals until commercial validation proves the thesis.

---

*Last updated: 2026-05-16 — Pass 3 (internal-use fixes) complete after strategic audit. Path A in motion.*
