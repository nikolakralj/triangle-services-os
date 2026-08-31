import { NextResponse } from "next/server";
import { requireApiAccess, createServiceSupabaseClient } from "@/lib/supabase/server";
import { createOutreachDraft } from "@/lib/data/outreach";
import { draftBuyerOutreach } from "@/lib/data/draft-outreach";
import {
  getOrganizationOperatingProfile,
  isOrganizationProfileComplete,
} from "@/lib/data/organization-profile";

// ---------------------------------------------------------------------------
// POST /api/research/outreach — write the first message to a labour buyer.
//
// The last mile. Everything upstream produced a name; this produces something
// you can actually send to it. The panel could already edit, mark sent and
// archive a draft — there was simply no way to make one.
//
// It writes a draft and stops. Nothing here sends mail: the human reads it,
// edits it, sends it from their own client, and marks it sent. The record of
// what was really sent is the thing the business needs, and only a person can
// supply it.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const access = await requireApiAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (access.demo) {
    return NextResponse.json({ error: "Not available in demo mode." }, { status: 403 });
  }

  let body: {
    projectId?: string;
    buyerContactId?: string;
    buyerSuggestionId?: string;
    projectPackageId?: string;
    channel?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectId = String(body.projectId ?? "").trim();
  // The stored enum is channel-and-intent; the drafter only needs the medium.
  const storedChannel =
    body.channel === "linkedin_connect" || body.channel === "linkedin_message"
      ? (body.channel as "linkedin_connect" | "linkedin_message")
      : body.channel === "email_followup"
        ? "email_followup"
        : "email_cold";
  const medium = storedChannel.startsWith("linkedin") ? "linkedin" : "email";
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required." }, { status: 400 });
  }
  if (!body.buyerContactId && !body.buyerSuggestionId) {
    return NextResponse.json(
      { error: "Choose who this is going to." },
      { status: 400 },
    );
  }

  const svc = createServiceSupabaseClient();
  if (!svc) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  const organization = await getOrganizationOperatingProfile(access.organizationId);
  if (!isOrganizationProfileComplete(organization)) {
    return NextResponse.json(
      {
        error:
          "Complete the organization profile and sign-off in Settings before drafting outreach.",
      },
      { status: 409 },
    );
  }

  const { data: project } = await svc
    .from("discovered_projects")
    .select("id, project_name, country, city, client_company, general_contractor, ai_summary")
    .eq("id", projectId)
    .eq("organization_id", access.organizationId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // The buyer is either an accepted contact or a pending suggestion — writing
  // to someone still awaiting approval is allowed, because a draft is not an
  // action, and it is often what makes the accept decision obvious.
  let buyer: { name: string; company: string; title?: string | null } | null = null;
  let buyerRationale: string | null = null;

  if (body.buyerContactId) {
    const { data: contact } = await svc
      .from("buyer_contacts")
      .select("id, full_name, company_name, job_title, buyer_role, notes")
      .eq("id", body.buyerContactId)
      .eq("organization_id", access.organizationId)
      .maybeSingle();
    if (!contact) {
      return NextResponse.json({ error: "Buyer contact not found." }, { status: 404 });
    }
    buyer = {
      name: contact.full_name as string,
      company: (contact.company_name as string) ?? "their company",
      title: (contact.job_title as string) ?? null,
    };
    buyerRationale =
      ((contact.buyer_role as string) ?? "") || ((contact.notes as string) ?? "") || null;
  } else {
    const { data: suggestion } = await svc
      .from("research_suggestions")
      .select("id, payload_json, evidence_text")
      .eq("id", body.buyerSuggestionId)
      .eq("org_id", access.organizationId)
      .maybeSingle();
    if (!suggestion) {
      return NextResponse.json({ error: "Suggestion not found." }, { status: 404 });
    }
    const p = (suggestion.payload_json as Record<string, unknown>) ?? {};
    buyer = {
      name: String(p.name ?? "").trim(),
      company: String(p.company ?? "their company").trim(),
      title: p.title ? String(p.title) : null,
    };
    buyerRationale =
      (p.role_reason ? String(p.role_reason) : null) ??
      ((suggestion.evidence_text as string) ?? null);
  }

  if (!buyer.name) {
    return NextResponse.json(
      { error: "That buyer record has no name to write to." },
      { status: 400 },
    );
  }

  let pkg: { title: string; summary?: string | null; roles?: string[] } | null = null;
  if (body.projectPackageId) {
    const { data: row } = await svc
      .from("project_packages")
      .select("id, title, summary, roles")
      .eq("id", body.projectPackageId)
      .eq("org_id", access.organizationId)
      .maybeSingle();
    if (row) {
      pkg = {
        title: row.title as string,
        summary: (row.summary as string) ?? null,
        roles: (row.roles as string[]) ?? [],
      };
    }
  }

  let drafted;
  try {
    drafted = await draftBuyerOutreach({
      organization: organization!,
      buyer,
      project: {
        name: project.project_name as string,
        country: (project.country as string) ?? null,
        city: (project.city as string) ?? null,
        clientCompany: (project.client_company as string) ?? null,
        generalContractor: (project.general_contractor as string) ?? null,
        summary: (project.ai_summary as string) ?? null,
      },
      buyerRationale,
      package: pkg,
      channel: medium,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not draft that." },
      { status: 502 },
    );
  }

  const created = await createOutreachDraft({
    orgId: access.organizationId,
    projectId,
    buyerContactId: body.buyerContactId ?? null,
    buyerSuggestionId: body.buyerSuggestionId ?? null,
    projectPackageId: body.projectPackageId ?? null,
    channel: storedChannel,
    subject: drafted.subject,
    body: drafted.body,
    createdByUserId: access.userId,
  });

  if (!created) {
    return NextResponse.json({ error: "Could not save the draft." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    draftId: created.id,
    subject: drafted.subject,
    body: drafted.body,
  });
}
