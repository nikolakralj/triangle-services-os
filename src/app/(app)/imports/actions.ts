"use server";

import OpenAI from "openai";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";

const openAiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy",
});

const aiExtractionSchema = z.object({
  name: z.string(),
  legal_name: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  website: z.string().optional(),
  sectors: z.array(z.string()).optional(),
  description: z.string().optional(),
  pain_points: z.string().optional(),
  lead_score: z.number().min(0).max(100),
  lead_score_reason: z.string(),
  primary_contact: z
    .object({
      full_name: z.string(),
      job_title: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
});

export async function processImportRow(rowId: string) {
  if (!process.env.OPENAI_API_KEY) {
    return { error: "OPENAI_API_KEY is not configured in .env.local" };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );

  const { data: row, error: fetchError } = await supabase
    .from("import_rows")
    .select("*")
    .eq("id", rowId)
    .single();

  if (fetchError || !row) {
    return { error: "Failed to fetch row from database" };
  }

  try {
    const response = await openAiClient.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert business development assistant for Triangle Services, a company providing supervised electrical installation crews for data centers, rail retrofits, and industrial projects. Analyze the following raw scraped company data. Extract the structured fields. Assign a lead_score (0-100) based on how well they fit our target profile (MEP contractors, data center builders, rail OEM). Provide a brief reason for the score.",
        },
        {
          role: "user",
          content: JSON.stringify(row.raw_data),
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("No content from OpenAI");

    const parsedContent = JSON.parse(content);
    // In a real scenario, use zod to validate parsedContent here.

    // Save back to database
    const { error: updateError } = await supabase
      .from("import_rows")
      .update({
        normalized_data: parsedContent,
        status: "updated",
      })
      .eq("id", rowId);

    if (updateError) {
      return { error: "Failed to save AI results to database" };
    }

    return { success: true, data: parsedContent };
  } catch (err: any) {
    console.error("AI processing error:", err);
    return { error: err.message || "Failed to process with AI" };
  }
}

export async function approveImportRow(rowId: string) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );

  const { data: row, error: fetchError } = await supabase
    .from("import_rows")
    .select("*")
    .eq("id", rowId)
    .single();

  if (fetchError || !row) return { error: "Row not found" };
  if (!row.normalized_data) return { error: "Row must be AI evaluated first" };

  const nd = row.normalized_data;
  
  // 1. Insert Company
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .insert({
      organization_id: row.organization_id,
      name: nd.name,
      legal_name: nd.legal_name,
      country: nd.country,
      city: nd.city,
      website: nd.website,
      sectors: nd.sectors,
      description: nd.description,
      pain_points: nd.pain_points,
      lead_score: nd.lead_score,
      lead_score_reason: nd.lead_score_reason,
      company_status: "target",
      data_source: "import_pipeline",
    })
    .select("id")
    .single();

  if (companyError) return { error: "Failed to create company: " + companyError.message };

  // 2. Insert Contact (if exists)
  let contactId = null;
  if (nd.primary_contact && nd.primary_contact.full_name) {
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .insert({
        organization_id: row.organization_id,
        company_id: company.id,
        full_name: nd.primary_contact.full_name,
        job_title: nd.primary_contact.job_title,
        email: nd.primary_contact.email,
        data_source: "import_pipeline",
      })
      .select("id")
      .single();
    if (!contactError && contact) contactId = contact.id;
  }

  // 3. Update row status
  await supabase
    .from("import_rows")
    .update({
      status: "created",
      created_company_id: company.id,
      created_contact_id: contactId,
    })
    .eq("id", rowId);

  return { success: true };
}
