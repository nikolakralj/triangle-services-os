import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  buildBusinessAiSystemPrompt,
  buildBusinessPrompt,
  fallbackAIOutput,
  type CommercialAIContext,
} from "@/lib/ai/prompts";
import {
  DEMO_ORGANIZATION_PROFILE,
  getOrganizationOperatingProfile,
  isOrganizationProfileComplete,
} from "@/lib/data/organization-profile";
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
  const service = createServiceSupabaseClient();
  if (!access.demo && !service) {
    return NextResponse.json(
      { error: "Database service is not configured." },
      { status: 503 },
    );
  }

  const profile = access.demo
    ? DEMO_ORGANIZATION_PROFILE
    : await getOrganizationOperatingProfile(access.organizationId);

  if (!isOrganizationProfileComplete(profile)) {
    return NextResponse.json(
      {
        error:
          "Complete the organization profile in Settings before generating commercial content.",
      },
      { status: 409 },
    );
  }

  const [companyResult, contactResult, opportunityResult] = service
    ? await Promise.all([
        input.companyId
          ? service
              .from("companies")
              .select(
                "id,name,legal_name,company_type,company_status,country,city,website,sectors,priority,lead_score,lead_score_reason,description,pain_points,notes,do_not_contact,next_action_at",
              )
              .eq("organization_id", access.organizationId)
              .eq("id", input.companyId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        input.contactId
          ? service
              .from("contacts")
              .select(
                "id,company_id,full_name,job_title,role_category,email,phone,language,country,priority,opt_out,do_not_contact,notes,next_action_at",
              )
              .eq("organization_id", access.organizationId)
              .eq("id", input.contactId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        input.opportunityId
          ? service
              .from("opportunities")
              .select(
                "id,company_id,primary_contact_id,title,opportunity_type,sector,country,city,site_location,estimated_value,estimated_monthly_value,currency,probability,estimated_crew_size,estimated_supervisors,expected_start_date,expected_end_date,expected_duration_weeks,scope_summary,client_need,pain_points,required_documents,language_requirements,certification_requirements,pricing_notes,risk_notes,next_step,next_action_at,status",
              )
              .eq("organization_id", access.organizationId)
              .eq("id", input.opportunityId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
    : [
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ];

  const lookupError =
    companyResult.error || contactResult.error || opportunityResult.error;
  if (lookupError) {
    return NextResponse.json(
      { error: "Could not load the selected commercial records." },
      { status: 500 },
    );
  }

  if (
    (input.companyId && !companyResult.data) ||
    (input.contactId && !contactResult.data) ||
    (input.opportunityId && !opportunityResult.data)
  ) {
    return NextResponse.json(
      { error: "A selected record was not found in this organization." },
      { status: 404 },
    );
  }

  const context: CommercialAIContext = {
    company: companyResult.data as Record<string, unknown> | null,
    contact: contactResult.data as Record<string, unknown> | null,
    opportunity: opportunityResult.data as Record<string, unknown> | null,
  };

  const isOutreach = ["outreach_email", "follow_up_email"].includes(
    input.generationType,
  );
  if (
    isOutreach &&
    (context.company?.do_not_contact ||
      context.contact?.do_not_contact ||
      context.contact?.opt_out)
  ) {
    return NextResponse.json(
      { error: "Outreach is blocked by the do-not-contact or opt-out status." },
      { status: 409 },
    );
  }

  const prompt = buildBusinessPrompt(input, context);
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  if (!apiKey) {
    return NextResponse.json({
      outputText: fallbackAIOutput(input, context, profile),
      warning:
        "AI is not configured. Add OPENAI_API_KEY to environment variables.",
    });
  }

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model,
      input: [
        { role: "developer", content: buildBusinessAiSystemPrompt(profile) },
        { role: "user", content: prompt },
      ],
    });
    const outputText = response.output_text;

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
