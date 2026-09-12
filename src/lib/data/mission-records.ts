import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { companyKey, type CleanTarget } from "@/lib/ai/mission-report";
import { hostOf } from "@/lib/data/mission-shared";

// ---------------------------------------------------------------------------
// Writing what a mission step found onto the records it is about.
//
// "Don't require Add to Companies for every discovery. Scout should
// automatically structure discoveries into Company/Person records with
// provenance. You should approve actions, not basic facts." — CEO, 10 Sep.
//
// So for each target the employee:
//
//   1. finds the company Triangle already has, or creates it — marked with
//      who found it, in which mission, and unverified;
//   2. does the same for the named person, under that company;
//   3. files the evidence as findings tied to the mission, the step, the
//      employee and the records, with status `applied`.
//
// Nothing is copied between tables. The finding is the evidence and points at
// the record; the record points back at the mission that found it; a second
// mission that finds the same company links to the same row. That is what
// lets Triangle say, six months later, "we researched this company, this was
// the buyer, and this is who ruled it out".
//
// Existing records are only ever filled where blank. A human's company is not
// renamed, re-statused or overwritten by an employee's search.
//
// The three-state contract still applies to every finding filed here —
// migration 041's trigger checks each row on insert, and a refusal is
// returned in the database's own words rather than swallowed.
// ---------------------------------------------------------------------------

type Svc = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;

export interface FilingContext {
  orgId: string;
  missionId: string;
  missionTitle: string;
  stepId: string;
  agentInstanceId: string;
  agentName: string;
  /** The person who delegated the mission. Records carry their name, not the service role's. */
  createdBy: string | null;
}

export interface FiledTarget {
  target: CleanTarget;
  companyId: string | null;
  contactId: string | null;
  companyIsNew: boolean;
  contactIsNew: boolean;
  /** The database's own sentence when it refused a row. */
  refused: string | null;
}

export async function fileMissionTargets(
  ctx: FilingContext,
  targets: CleanTarget[],
): Promise<FiledTarget[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) {
    return targets.map((target) => ({
      target,
      companyId: null,
      contactId: null,
      companyIsNew: false,
      contactIsNew: false,
      refused: "Database unavailable.",
    }));
  }

  // One after another. Two targets resolving to the same company in parallel
  // would each find nothing and create it twice.
  const out: FiledTarget[] = [];
  for (const target of targets) {
    out.push(await fileOne(svc, ctx, target));
  }
  return out;
}

async function fileOne(svc: Svc, ctx: FilingContext, t: CleanTarget): Promise<FiledTarget> {
  const result: FiledTarget = {
    target: t,
    companyId: null,
    contactId: null,
    companyIsNew: false,
    contactIsNew: false,
    refused: null,
  };

  // A company the mission already holds is filed onto exactly that record.
  // Matching it again by name or domain once put a Neuss machine builder's
  // buyer onto an Essen company with a similar name.
  let company: { id: string; isNew: boolean } | { refused: string };
  const { data: known } = t.knownCompanyId
    ? await svc
        .from("companies")
        .select("id, website, website_domain, city, country")
        .eq("id", t.knownCompanyId)
        .eq("organization_id", ctx.orgId)
        .maybeSingle()
    : { data: null };
  if (known) {
    const fill: Record<string, unknown> = {};
    if (!known.website && t.website) fill.website = t.website;
    if (!known.website_domain && t.domain) fill.website_domain = t.domain;
    if (!known.city && t.city) fill.city = t.city;
    if (!known.country && t.country) fill.country = t.country;
    if (Object.keys(fill).length > 0) {
      await svc
        .from("companies")
        .update(fill)
        .eq("id", known.id as string)
        .eq("organization_id", ctx.orgId);
    }
    company = { id: known.id as string, isNew: false };
  } else {
    company = await upsertCompany(svc, ctx, t);
  }
  if ("refused" in company) {
    result.refused = company.refused;
    return result;
  }
  result.companyId = company.id;
  result.companyIsNew = company.isNew;

  if (t.person) {
    const contact = await upsertContact(svc, ctx, t, company.id);
    if ("refused" in contact) {
      result.refused = contact.refused;
    } else {
      result.contactId = contact.id;
      result.contactIsNew = contact.isNew;
    }
  }

  const companyFinding = await insertFinding(svc, {
    org_id: ctx.orgId,
    mission_id: ctx.missionId,
    assignment_id: ctx.stepId,
    agent_instance_id: ctx.agentInstanceId,
    finding_type: "company",
    finding_state: t.state,
    status: "applied",
    promoted_entity_type: "company",
    promoted_entity_id: company.id,
    source_url: t.sources[0]?.url ?? null,
    evidence_text: t.sources[0]?.claim || t.why,
    // The state belongs in the key. A bot files as it goes, so the same
    // company arrives first without a person and again once its door is
    // found; keyed without the state, that upgrade was silently dropped and
    // the company stayed "missing one thing" for the finish line.
    idempotency_key: `mission:${ctx.stepId}:company:${t.companyKey}:${t.state}`,
    payload: {
      source: "mission",
      company_name: t.company,
      company_id: company.id,
      website: t.website,
      city: t.city,
      country: t.country,
      role: t.role,
      why: t.why,
      // Migration 041 reads a reachable company's person from decision_maker
      // and its channel from value.
      decision_maker: t.person,
      person_title: t.personTitle,
      contact_id: result.contactId,
      kind: t.channel?.kind ?? null,
      value: t.channel?.value ?? null,
      whose: t.channel?.whose ?? null,
      how_to_open: t.words,
      project: t.project?.name ?? null,
      project_evidence: t.project?.evidence ?? null,
      missing: t.missing,
      missing_owner: t.missingOwner,
      dead_reason: t.deadReason,
      sources: t.sources,
      // The site was opened for this company. Recorded so the next step does
      // not open it again, and so "no named person" says where it looked.
      reach_checked_at: t.reachChecked ? new Date().toISOString() : null,
      reach_note: t.reachNote ?? null,
    },
  });
  if (typeof companyFinding === "object" && companyFinding !== null) {
    result.refused = companyFinding.refused;
  }

  if (t.person && result.contactId) {
    const contactFinding = await insertFinding(svc, {
      org_id: ctx.orgId,
      mission_id: ctx.missionId,
      assignment_id: ctx.stepId,
      agent_instance_id: ctx.agentInstanceId,
      finding_type: "contact",
      finding_state: t.state,
      status: "applied",
      promoted_entity_type: "contact",
      promoted_entity_id: result.contactId,
      source_url: t.sources[0]?.url ?? null,
      evidence_text: t.sources[0]?.claim || t.why,
      idempotency_key: `mission:${ctx.stepId}:contact:${t.companyKey}:${companyKey(t.person)}:${t.state}`,
      payload: {
        source: "mission",
        full_name: t.person,
        job_title: t.personTitle,
        company_name: t.company,
        company_id: company.id,
        contact_id: result.contactId,
        kind: t.channel?.kind ?? null,
        value: t.channel?.value ?? null,
        whose: t.channel?.whose ?? null,
        how_to_open: t.words,
        missing: t.missing,
        missing_owner: t.missingOwner,
        dead_reason: t.deadReason,
      },
    });
    if (typeof contactFinding === "object" && contactFinding !== null && !result.refused) {
      result.refused = contactFinding.refused;
    }
  }

  return result;
}

// ── companies ───────────────────────────────────────────────────────────────

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const COMPANY_FIELDS = "id, name, website, website_domain, city, country, source_url";

async function findCompany(svc: Svc, orgId: string, t: CleanTarget) {
  if (t.domain) {
    const { data } = await svc
      .from("companies")
      .select(COMPANY_FIELDS)
      .eq("organization_id", orgId)
      .eq("website_domain", t.domain)
      .limit(1);
    if (data?.[0]) return data[0];
  }

  // Probe with the longest real word of the name as written — "Köster", not
  // its normalised "koster", which ILIKE would never match — then compare the
  // normalised keys, so "GOLDBECK GmbH" finds "Goldbeck".
  const probe =
    t.company
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3 && companyKey(w) !== "")
      .sort((a, b) => b.length - a.length)[0] ?? t.company;
  const { data } = await svc
    .from("companies")
    .select(COMPANY_FIELDS)
    .eq("organization_id", orgId)
    .ilike("name", `%${escapeLike(probe)}%`)
    .limit(50);
  return (data ?? []).find((c) => companyKey(String(c.name)) === t.companyKey) ?? null;
}

async function upsertCompany(
  svc: Svc,
  ctx: FilingContext,
  t: CleanTarget,
): Promise<{ id: string; isNew: boolean } | { refused: string }> {
  const existing = await findCompany(svc, ctx.orgId, t);
  if (existing) {
    const fill: Record<string, unknown> = {};
    if (!existing.website && t.website) fill.website = t.website;
    if (!existing.website_domain && t.domain) fill.website_domain = t.domain;
    if (!existing.city && t.city) fill.city = t.city;
    if (!existing.country && t.country) fill.country = t.country;
    if (!existing.source_url && t.sources[0]) fill.source_url = t.sources[0].url;
    if (Object.keys(fill).length > 0) {
      await svc
        .from("companies")
        .update(fill)
        .eq("id", existing.id as string)
        .eq("organization_id", ctx.orgId);
    }
    return { id: existing.id as string, isNew: false };
  }

  const { data, error } = await svc
    .from("companies")
    .insert({
      organization_id: ctx.orgId,
      name: t.company.slice(0, 200),
      website: t.website,
      website_domain: t.domain,
      city: t.city,
      country: t.country,
      company_type: t.role?.slice(0, 80) ?? null,
      // A company found dead is recorded as not relevant rather than left
      // out: the reason is the memory that stops it being researched again.
      company_status: t.state === "dead" ? "not_relevant" : "research",
      research_status: "not_reviewed",
      source_url: t.sources[0]?.url ?? null,
      source_description: `Found by ${ctx.agentName} in the mission “${ctx.missionTitle}”`,
      data_source: "mission",
      description: t.why,
      found_by_agent_instance_id: ctx.agentInstanceId,
      found_in_mission_id: ctx.missionId,
      created_by: ctx.createdBy,
      updated_by: ctx.createdBy,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { refused: error?.message ?? `Could not record ${t.company}.` };
  }
  return { id: data.id as string, isNew: true };
}

// ── people ──────────────────────────────────────────────────────────────────

async function upsertContact(
  svc: Svc,
  ctx: FilingContext,
  t: CleanTarget,
  companyId: string,
): Promise<{ id: string; isNew: boolean } | { refused: string }> {
  const person = t.person as string;

  // Only a channel that is actually theirs goes in the person's own fields. A
  // switchboard stored as somebody's phone number is how a caller ends up
  // asking the receptionist for the wrong thing.
  const own =
    t.channel && (t.channel.whose === "person" || t.channel.kind === "linkedin")
      ? t.channel
      : null;
  const channelFields = {
    email: own?.kind === "email" ? own.value : null,
    phone: own?.kind === "phone" ? own.value : null,
    linkedin_url: own?.kind === "linkedin" ? own.value : null,
  };

  const { data: found } = await svc
    .from("contacts")
    .select("id, job_title, email, phone, linkedin_url, source_url")
    .eq("organization_id", ctx.orgId)
    .eq("company_id", companyId)
    .ilike("full_name", escapeLike(person))
    .limit(1);

  const existing = found?.[0];
  if (existing) {
    const fill: Record<string, unknown> = {};
    if (!existing.job_title && t.personTitle) fill.job_title = t.personTitle;
    if (!existing.email && channelFields.email) fill.email = channelFields.email;
    if (!existing.phone && channelFields.phone) fill.phone = channelFields.phone;
    if (!existing.linkedin_url && channelFields.linkedin_url) {
      fill.linkedin_url = channelFields.linkedin_url;
    }
    if (!existing.source_url && t.sources[0]) fill.source_url = t.sources[0].url;
    if (Object.keys(fill).length > 0) {
      await svc
        .from("contacts")
        .update(fill)
        .eq("id", existing.id as string)
        .eq("organization_id", ctx.orgId);
    }
    return { id: existing.id as string, isNew: false };
  }

  const source = t.sources[0]?.url ?? null;
  const desk =
    t.channel && !own
      ? `${t.channel.whose === "department" ? "Department" : "Switchboard"} ${t.channel.kind}: ${t.channel.value}`
      : null;

  const { data, error } = await svc
    .from("contacts")
    .insert({
      organization_id: ctx.orgId,
      company_id: companyId,
      full_name: person.slice(0, 200),
      job_title: t.personTitle,
      ...channelFields,
      source_url: source,
      source_description: `Named on ${source ? hostOf(source) : "a public page"} — found by ${ctx.agentName} in “${ctx.missionTitle}”`,
      data_source: "mission",
      gdpr_notes: `Business contact from a public source${source ? ` (${hostOf(source)})` : ""}, recorded ${new Date().toISOString().slice(0, 10)} for B2B outreach.`,
      notes: desk,
      found_by_agent_instance_id: ctx.agentInstanceId,
      found_in_mission_id: ctx.missionId,
      created_by: ctx.createdBy,
      updated_by: ctx.createdBy,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { refused: error?.message ?? `Could not record ${person}.` };
  }
  return { id: data.id as string, isNew: true };
}

// ── evidence ────────────────────────────────────────────────────────────────

/**
 * Returns null when written (or already written by a retry of the same step),
 * or the refusal.
 */
async function insertFinding(
  svc: Svc,
  row: Record<string, unknown> & { org_id: string; idempotency_key: string },
): Promise<null | { refused: string }> {
  const { data: existing } = await svc
    .from("agent_findings")
    .select("id")
    .eq("org_id", row.org_id)
    .eq("idempotency_key", row.idempotency_key)
    .limit(1);
  if (existing && existing.length > 0) return null;

  const { error } = await svc.from("agent_findings").insert(row);
  if (error) {
    console.error("mission finding refused:", error.message);
    return { refused: error.message };
  }
  return null;
}
