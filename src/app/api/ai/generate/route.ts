import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  buildTrianglePrompt,
  fallbackAIOutput,
  TRIANGLE_AI_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";
import { aiGenerationRequestSchema } from "@/lib/validation";
import {
  requireApiAccess,
  createServiceSupabaseClient,
} from "@/lib/supabase/server";

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  const parsed = aiGenerationRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const prompt = buildTrianglePrompt(input);
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  if (!apiKey) {
    return NextResponse.json({
      outputText: fallbackAIOutput(input),
      warning:
        "AI is not configured. Add OPENAI_API_KEY to environment variables.",
    });
  }

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model,
      input: [
        { role: "developer", content: TRIANGLE_AI_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });
    const outputText = response.output_text;

    const service = createServiceSupabaseClient();
    if (service && !access.demo) {
      await service.from("ai_generations").insert({
        organization_id: access.organizationId,
        generation_type: input.generationType,
        input_snapshot: input,
        prompt,
        output_text: outputText,
        company_id: input.companyId ?? null,
        contact_id: input.contactId ?? null,
        opportunity_id: input.opportunityId ?? null,
        model,
        created_by: access.userId,
      });
    }

    return NextResponse.json({ outputText, model });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "AI generation failed.",
      },
      { status: 500 },
    );
  }
}
