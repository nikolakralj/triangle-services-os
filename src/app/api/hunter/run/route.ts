import { NextResponse } from "next/server";
import { requireApiAccess } from "@/lib/supabase/server";
import { getSectorById, rowToSector } from "@/lib/data/sectors";
import {
  insertDiscoveredProject,
  findByFingerprint,
} from "@/lib/data/discovered-projects";
import { startHuntRun, completeHuntRun } from "@/lib/data/hunt-runs";
import {
  callOpenAIHunter,
  collectWebSources,
  estimateOpenAICost,
  extractOpenAIText,
  parseOpenAIJson,
} from "@/lib/ai/openai-client";
import {
  HUNTER_SYSTEM_PROMPT,
  buildHunterUserPrompt,
  generateProjectFingerprint,
} from "@/lib/ai/hunter-prompts";

type AIProject = {
  project_name: string;
  client_company?: string;
  general_contractor?: string;
  country?: string;
  country_code?: string;
  city?: string;
  region?: string;
  project_type?: string;
  capacity?: string;
  estimated_value_eur?: number;
  phase?: string;
  phase_confidence?: number;
  estimated_start_date?: string;
  estimated_completion_date?: string;
  peak_workforce_month?: string;
  estimated_crew_size?: number;
  crew_breakdown?: Record<string, number>;
  ai_summary?: string;
  ai_opportunity_score?: number;
  ai_match_score?: number;
  ai_match_reasoning?: string;
  ai_next_actions?: string[];
  source_url?: string;
  source_text?: string;
  source_date?: string;
};

const VALID_PHASES = new Set([
  "announced",
  "permits_filed",
  "permits_approved",
  "groundbreaking",
  "foundation",
  "shell",
  "fit_out",
  "mep_install",
  "commissioning",
  "operational",
  "unknown",
]);

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  if (access.demo) {
    return NextResponse.json(
      { error: "Hunter is not available in demo mode." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const { sectorId } = body as { sectorId?: string };

  if (!sectorId) {
    return NextResponse.json(
      { error: "sectorId is required" },
      { status: 400 },
    );
  }

  // Verify the sector belongs to user's org
  const sectorRow = await getSectorById(sectorId);
  if (!sectorRow || sectorRow.organization_id !== access.organizationId) {
    return NextResponse.json({ error: "Sector not found" }, { status: 404 });
  }

  if (!sectorRow.is_active) {
    return NextResponse.json(
      { error: "This sector is inactive. Activate it first." },
      { status: 400 },
    );
  }

  const sector = rowToSector(sectorRow);

  // Start audit log entry
  const huntRun = await startHuntRun({
    organizationId: access.organizationId,
    sectorId: sector.id,
    triggeredBy: "manual",
    triggeredByUserId: access.userId,
  });

  if (!huntRun) {
    return NextResponse.json(
      { error: "Failed to start hunt run" },
      { status: 500 },
    );
  }

  const startedAt = huntRun.started_at;
  let aiTokensUsed = 0;
  let aiCostUsd = 0;
  let rawResultsCount = 0;
  let duplicatesFiltered = 0;
  let newProjectsInserted = 0;

  try {
    // ======================================================
    // 1. Call OpenAI with web search to find projects
    // ======================================================
    const userPrompt = buildHunterUserPrompt(sector);
    const aiResponse = await callOpenAIHunter({
      systemPrompt: HUNTER_SYSTEM_PROMPT,
      userPrompt,
    });

    const usage = estimateOpenAICost(aiResponse);
    aiTokensUsed = usage.totalTokens;
    aiCostUsd = usage.estimatedCostUsd;

    const finalText = extractOpenAIText(aiResponse);
    if (!finalText.trim()) {
      throw new Error("OpenAI returned no text content from the Hunter response.");
    }

    let parsed: { projects: AIProject[] };
    try {
      parsed = parseOpenAIJson<{ projects: AIProject[] }>(finalText);
    } catch (parseErr) {
      throw new Error(
        `Could not parse OpenAI's response as JSON: ${
          parseErr instanceof Error ? parseErr.message : "unknown"
        }. First 300 chars: ${finalText.substring(0, 300)}`,
      );
    }

    const aiProjects = parsed.projects ?? [];
    rawResultsCount = aiProjects.length;
    const webSources = collectWebSources(aiResponse);

    // ======================================================
    // 2. Insert each project (with dedup by fingerprint)
    // ======================================================
    for (const ai of aiProjects) {
      if (!ai.project_name) continue;

      const fingerprint = generateProjectFingerprint(
        ai.project_name,
        ai.country,
      );

      // Check for duplicate
      const existing = await findByFingerprint(
        access.organizationId,
        fingerprint,
      );
      if (existing) {
        duplicatesFiltered++;
        continue;
      }

      // Sanitize phase
      const phase =
        ai.phase && VALID_PHASES.has(ai.phase) ? ai.phase : "unknown";

      // Clamp scores 0-100
      const clamp = (n?: number) =>
        n === undefined || n === null
          ? null
          : Math.max(0, Math.min(100, Math.round(n)));

      const inserted = await insertDiscoveredProject(access.organizationId, {
        project_name: ai.project_name,
        sector_id: sector.id,
        client_company: ai.client_company ?? null,
        general_contractor: ai.general_contractor ?? null,
        country: ai.country ?? null,
        country_code: ai.country_code?.toUpperCase() ?? null,
        city: ai.city ?? null,
        region: ai.region ?? null,
        project_type: ai.project_type ?? null,
        capacity: ai.capacity ?? null,
        estimated_value_eur: ai.estimated_value_eur ?? null,
        phase,
        phase_confidence: clamp(ai.phase_confidence),
        estimated_start_date: ai.estimated_start_date ?? null,
        estimated_completion_date: ai.estimated_completion_date ?? null,
        peak_workforce_month: ai.peak_workforce_month ?? null,
        estimated_crew_size: ai.estimated_crew_size ?? null,
        crew_breakdown: ai.crew_breakdown ?? {},
        source_url: ai.source_url ?? null,
        source_type: "web_search",
        source_text:
          ai.source_text ??
          (webSources.length
            ? `Discovered via OpenAI web search. Sources consulted included ${webSources
                .slice(0, 3)
                .map((source) => source.title)
                .join(", ")}.`
            : null),
        source_date: ai.source_date ?? null,
        ai_summary: ai.ai_summary ?? null,
        ai_opportunity_score: clamp(ai.ai_opportunity_score),
        ai_match_score: clamp(ai.ai_match_score),
        ai_match_reasoning: ai.ai_match_reasoning ?? null,
        ai_next_actions: ai.ai_next_actions ?? [],
        ai_extracted_at: new Date().toISOString(),
        ai_model: aiResponse.model,
        status: "new",
        fingerprint,
      });

      if (inserted) newProjectsInserted++;
    }

    // ======================================================
    // 3. Mark hunt as success
    // ======================================================
    await completeHuntRun(huntRun.id, {
      status: "success",
      sourcesQueried: 1,
      rawResultsCount,
      aiClassifiedCount: rawResultsCount,
      duplicatesFiltered,
      newProjectsInserted,
      aiTokensUsed,
      aiCostUsd,
      logSummary: `Hunted ${sector.name} via OpenAI web_search. Found ${rawResultsCount} projects, ${newProjectsInserted} new.`,
      startedAt,
    });

    return NextResponse.json({
      ok: true,
      huntRunId: huntRun.id,
      newProjects: newProjectsInserted,
      duplicates: duplicatesFiltered,
      total: rawResultsCount,
      aiCostUsd,
      aiTokensUsed,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await completeHuntRun(huntRun.id, {
      status: "failed",
      sourcesQueried: 1,
      rawResultsCount,
      aiClassifiedCount: 0,
      duplicatesFiltered,
      newProjectsInserted,
      aiTokensUsed,
      aiCostUsd,
      errorMessage,
      logSummary: `Hunt failed: ${errorMessage.substring(0, 500)}`,
      startedAt,
    });

    return NextResponse.json(
      { error: errorMessage, huntRunId: huntRun.id },
      { status: 500 },
    );
  }
}
