"use client";

import { useState } from "react";
import { BotMessageSquare, Copy, Check, ExternalLink } from "lucide-react";

/**
 * ResearchWithClaudeButton
 *
 * Option A: Opens Claude.ai (or another AI) with a fully structured research
 * prompt pre-loaded, including all known project context, current chain nodes,
 * contacts, and an explicit research brief.
 *
 * The user can:
 *  1. Click "Copy prompt" and paste into Claude.ai / ChatGPT
 *  2. Click "Open in Claude" to open claude.ai with the prompt pre-filled
 *
 * The prompt instructs the AI to:
 *  - Research the contractor chain
 *  - Find package opportunities
 *  - Find buyer contacts
 *  - Return findings in a structured JSON format matching the MCP schema
 */

type ChainNode = {
  role: string;
  company_name: string | null;
  level: string;
  confidence: number | null;
  rationale: string | null;
};

type BuyerContact = {
  full_name: string;
  company_name: string | null;
  job_title: string | null;
  buyer_role: string | null;
};

type ProjectResearchContext = {
  project_id: string;
  project_name: string;
  country: string | null;
  city: string | null;
  region: string | null;
  project_type: string | null;
  capacity: string | null;
  estimated_value_eur: number | null;
  phase: string | null;
  client_company: string | null;
  general_contractor: string | null;
  ai_summary: string | null;
  ai_next_actions: string[];
  source_url: string | null;
  sector_name: string;
  typical_roles: string[];
  chain_nodes: ChainNode[];
  buyer_contacts: BuyerContact[];
};

function buildResearchPrompt(ctx: ProjectResearchContext): string {
  const knownChain = ctx.chain_nodes
    .map(
      (n) =>
        `  - ${n.role.toUpperCase()}: ${n.company_name ?? "unknown"} [${n.level}, ${n.confidence ?? "?"}% confidence]${n.rationale ? ` — ${n.rationale}` : ""}`,
    )
    .join("\n");

  const knownContacts = ctx.buyer_contacts
    .map(
      (c) =>
        `  - ${c.full_name} @ ${c.company_name ?? "?"} — ${c.job_title ?? "?"} (${c.buyer_role ?? "unknown role"})`,
    )
    .join("\n");

  const missingRoles = ["owner", "developer", "epc", "gc", "mep", "electrical"].filter(
    (role) => !ctx.chain_nodes.some((n) => n.role === role && n.company_name),
  );

  const valueStr = ctx.estimated_value_eur
    ? `€${(ctx.estimated_value_eur / 1_000_000).toFixed(0)}M`
    : "value unknown";

  return `You are an expert construction-sector sales intelligence analyst working for a labor brokerage.

Your goal is to build a complete contractor chain map for the project below, identify the package buyers, find the right people to contact, and recommend a commercial attack plan.

══════════════════════════════════════════════════════════════
PROJECT: ${ctx.project_name}
══════════════════════════════════════════════════════════════
Location:     ${[ctx.city, ctx.region, ctx.country].filter(Boolean).join(", ") || "unknown"}
Type:         ${ctx.project_type ?? "unknown"}
Capacity:     ${ctx.capacity ?? "unknown"}
Value:        ${valueStr}
Phase:        ${ctx.phase ?? "unknown"}
Sector:       ${ctx.sector_name}
Worker types: ${ctx.typical_roles.join(", ")}

Source article: ${ctx.source_url ?? "none"}

AI summary:
${ctx.ai_summary ?? "none"}

Already known AI next actions:
${ctx.ai_next_actions.length ? ctx.ai_next_actions.map((a) => `- ${a}`).join("\n") : "none"}

══════════════════════════════════════════════════════════════
CURRENT CONTRACTOR CHAIN (what we already know)
══════════════════════════════════════════════════════════════
${knownChain || "  — nothing confirmed yet —"}

══════════════════════════════════════════════════════════════
CURRENT BUYER CONTACTS (what we already know)
══════════════════════════════════════════════════════════════
${knownContacts || "  — no contacts yet —"}

══════════════════════════════════════════════════════════════
MISSING / TO RESEARCH
══════════════════════════════════════════════════════════════
Chain roles not yet confirmed: ${missingRoles.join(", ") || "all confirmed"}

══════════════════════════════════════════════════════════════
YOUR RESEARCH TASKS
══════════════════════════════════════════════════════════════

1. CONTRACTOR CHAIN
   Search: official project pages, contractor press releases, permit filings, government announcements, planning portals, energy/grid filings, SPV registry.
   Map every company from OWNER → DEVELOPER → EPC → GC → MEP → ELECTRICAL.
   For each: confirm or infer with source URL + evidence text.
   Status: confirmed | inferred | historical | weak | rejected

2. PACKAGE OPPORTUNITIES
   Identify which packages we (labor broker) can win:
   - Electrical installation / cable pulling
   - Mechanical / HVAC
   - Commissioning
   - Welding / piping
   - Civil / structure
   - BMS / controls
   - UPS / battery / generator
   - Fire & security
   For each: name the likely buyer company and explain why.

3. BUYER CONTACTS
   Search LinkedIn (search queries only — do not scrape profiles automatically).
   Find: procurement manager, project director, subcontract manager, site manager, supply chain lead.
   For each person: name, company, job title, LinkedIn URL (if found), and why they influence buying.

4. EVIDENCE AUDIT
   Every item you propose must have:
   - source_url (actual URL where you found it)
   - source_date (when it was published, YYYY-MM-DD)
   - evidence_text (1-3 sentence quote or summary from that source)
   - confidence (0-100)
   Do NOT invent or guess. If you can't find a source, mark it as inferred with low confidence.

5. COMMERCIAL PLAN
   - Best 3 attack points (who to approach, in what order, with what offer)
   - First outreach message angle for each
   - Packages we are most likely to win

══════════════════════════════════════════════════════════════
OUTPUT FORMAT
══════════════════════════════════════════════════════════════

Return a clean JSON object with this structure. This will be imported into our CRM.

\`\`\`json
{
  "project_id": "${ctx.project_id}",
  "research_summary": "2-3 sentence overall summary of findings",
  "overall_confidence": 0,
  "chain_nodes": [
    {
      "company": "Company Name",
      "role": "gc",
      "package": "civil construction",
      "status": "confirmed",
      "confidence": 85,
      "source_url": "https://...",
      "source_date": "2025-01-15",
      "evidence_text": "According to the official press release..."
    }
  ],
  "package_opportunities": [
    {
      "package_type": "electrical installation",
      "likely_buyer": "Mercury Engineering",
      "reason": "Mercury is named as MEP contractor — they will sub out cable pulling",
      "confidence": 75,
      "source_url": "https://...",
      "evidence_text": "..."
    }
  ],
  "buyer_contacts": [
    {
      "name": "John Smith",
      "company": "Mercury Engineering",
      "title": "Project Director",
      "linkedin_url": "https://linkedin.com/in/...",
      "email": null,
      "role_reason": "Named project director in Mercury press release for this site",
      "confidence": 80,
      "source_url": "https://...",
      "evidence_text": "..."
    }
  ],
  "sources_checked": [
    {
      "source_url": "https://...",
      "source_title": "...",
      "source_type": "news",
      "source_date": "2025-01-15",
      "relevance_score": 90,
      "extracted_text": "..."
    }
  ],
  "commercial_plan": {
    "attack_points": [
      {
        "rank": 1,
        "target_company": "Mercury Engineering",
        "target_person": "John Smith, Project Director",
        "package": "electrical installation / cable pulling",
        "outreach_angle": "...",
        "next_action": "..."
      }
    ]
  }
}
\`\`\`

After you produce this JSON, I will import it into our system. Every chain_node, package_opportunity, and buyer_contact becomes a suggestion that a human must approve before it enters our CRM.

Start with a web search for the project name and location, then work through each contractor layer. Be thorough — this is agency-grade sales intelligence, not a demo.`;
}

export function ResearchWithClaudeButton({
  context,
}: {
  context: ProjectResearchContext;
}) {
  const [copied, setCopied] = useState(false);

  const prompt = buildResearchPrompt(context);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenClaude = () => {
    // Claude.ai supports ?q= for pre-filled prompts up to ~4000 chars
    // For longer prompts, open a blank tab and instruct user to paste
    const encoded = encodeURIComponent(prompt.substring(0, 3800));
    const url = `https://claude.ai/new?q=${encoded}`;
    window.open(url, "_blank", "noopener");
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleOpenClaude}
        className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 transition-colors"
        title="Open Claude with full project research context pre-loaded"
      >
        <BotMessageSquare className="h-4 w-4" />
        Research with Claude
        <ExternalLink className="h-3.5 w-3.5 opacity-70" />
      </button>

      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"
        title="Copy research prompt to clipboard"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-emerald-700">Copied</span>
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            Copy prompt
          </>
        )}
      </button>
    </div>
  );
}
