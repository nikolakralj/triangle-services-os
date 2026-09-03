import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Agent findings — net-new discoveries with nowhere to live yet.
//
// Why this exists: every research MCP tool requires a project_id, so Scout
// could only ever enrich projects that already existed. On his first real run
// he said so plainly: "Triangle has no German auto plant record to attach a
// new finding to. Someone needs to create those project rows first." That is
// backwards for a business-development researcher, whose main job is finding
// things Triangle has never heard of.
//
// A finding is a proposal. Accepting one PROMOTES it into a real domain
// record (today: discovered_projects). Agents can never promote their own.
// ---------------------------------------------------------------------------

export type FindingType = "project" | "company" | "contact" | "other";

export interface AgentFinding {
  id: string;
  findingType: string;
  payload: Record<string, unknown>;
  sourceUrl: string | null;
  sourceDate: string | null;
  evidenceText: string | null;
  confidence: number | null;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  agentName: string | null;
  agentEmoji: string | null;
  assignmentTitle: string | null;
  promotedEntityType: string | null;
  promotedEntityId: string | null;
}

export async function createFinding(params: {
  orgId: string;
  agentInstanceId: string | null;
  assignmentId?: string | null;
  findingType: string;
  payload: Record<string, unknown>;
  sourceUrl?: string | null;
  sourceDate?: string | null;
  evidenceText?: string | null;
  confidence?: number | null;
  idempotencyKey?: string | null;
}): Promise<{ id: string; duplicate: boolean } | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  // Re-submitting the same discovery must be harmless — agents retry.
  if (params.idempotencyKey) {
    const { data: existing } = await svc
      .from("agent_findings")
      .select("id")
      .eq("org_id", params.orgId)
      .eq("idempotency_key", params.idempotencyKey)
      .maybeSingle();
    if (existing) return { id: existing.id as string, duplicate: true };
  }

  const { data, error } = await svc
    .from("agent_findings")
    .insert({
      org_id: params.orgId,
      agent_instance_id: params.agentInstanceId,
      assignment_id: params.assignmentId ?? null,
      finding_type: params.findingType,
      payload: params.payload,
      source_url: params.sourceUrl ?? null,
      source_date: params.sourceDate ?? null,
      evidence_text: params.evidenceText ?? null,
      confidence: params.confidence ?? null,
      idempotency_key: params.idempotencyKey ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id as string, duplicate: false };
}

export async function listFindings(
  orgId: string,
  opts: { status?: string; limit?: number } = {},
): Promise<AgentFinding[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  let q = svc
    .from("agent_findings")
    .select(
      "id, finding_type, payload, source_url, source_date, evidence_text, confidence, status, created_at, agent_instance_id, assignment_id, promoted_entity_type, promoted_entity_id",
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.status) q = q.eq("status", opts.status);

  const { data } = await q;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const agentIds = Array.from(
    new Set(rows.map((r) => r.agent_instance_id).filter(Boolean) as string[]),
  );
  const agents = new Map<string, { name: string; emoji: string }>();
  if (agentIds.length > 0) {
    const { data: ags } = await svc
      .from("agent_instances")
      .select("id, display_name, emoji")
      .in("id", agentIds);
    for (const a of ags ?? []) {
      agents.set(a.id as string, {
        name: a.display_name as string,
        emoji: (a.emoji as string) || "🤖",
      });
    }
  }

  const assignmentIds = Array.from(
    new Set(rows.map((r) => r.assignment_id).filter(Boolean) as string[]),
  );
  const assignments = new Map<string, string>();
  if (assignmentIds.length > 0) {
    const { data: asg } = await svc
      .from("agent_assignments")
      .select("id, title")
      .in("id", assignmentIds);
    for (const a of asg ?? []) assignments.set(a.id as string, a.title as string);
  }

  return rows.map((r) => {
    const ag = r.agent_instance_id
      ? agents.get(r.agent_instance_id as string)
      : undefined;
    return {
      id: r.id as string,
      findingType: r.finding_type as string,
      payload: (r.payload as Record<string, unknown>) ?? {},
      sourceUrl: (r.source_url as string) ?? null,
      sourceDate: (r.source_date as string) ?? null,
      evidenceText: (r.evidence_text as string) ?? null,
      confidence: (r.confidence as number) ?? null,
      status: r.status as AgentFinding["status"],
      createdAt: r.created_at as string,
      agentName: ag?.name ?? null,
      agentEmoji: ag?.emoji ?? null,
      assignmentTitle: r.assignment_id
        ? assignments.get(r.assignment_id as string) ?? null
        : null,
      promotedEntityType: (r.promoted_entity_type as string) ?? null,
      promotedEntityId: (r.promoted_entity_id as string) ?? null,
    };
  });
}

/**
 * Accept a finding. A `project` finding becomes a real discovered_project,
 * which is what unblocks the agent: from then on it can enrich that project
 * with the normal research tools.
 */
export async function acceptFinding(params: {
  findingId: string;
  orgId: string;
  userId: string | null;
}): Promise<{
  promotedTo: string | null;
  entityId: string | null;
  continuationAssignmentId: string | null;
  destinationHref: string | null;
} | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data: finding } = await svc
    .from("agent_findings")
    .select(
      "id, finding_type, payload, source_url, evidence_text, status, confidence, assignment_id, agent_instance_id",
    )
    .eq("id", params.findingId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  if (!finding || finding.status !== "pending") return null;

  const payload = (finding.payload as Record<string, unknown>) ?? {};
  let promotedTo: string | null = null;
  let entityId: string | null = null;
  let continuationAssignmentId: string | null = null;
  let destinationHref: string | null = null;

  if (finding.finding_type === "project") {
    const name = String(payload.project_name ?? payload.name ?? "").trim();
    if (!name) return null;

    // File it under a sector. Projects promoted without one were invisible on
    // Signal Inbox, which filters by sector — 21 projects existed and the page
    // showed an empty list. Match on what the finding says, fall back to the
    // org's active sector; null only if the org has no sectors at all.
    const haystack = [
      name,
      payload.project_type,
      payload.sector,
      payload.summary,
      finding.evidence_text,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const { data: sectors } = await svc
      .from("sectors")
      .select("id, name, is_active")
      .eq("organization_id", params.orgId);

    const words = (n: string) =>
      n.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
    const matched = (sectors ?? []).find((s) =>
      words(s.name as string).some((w) => haystack.includes(w)),
    );
    const sectorId =
      (matched?.id as string | undefined) ??
      ((sectors ?? []).find((s) => s.is_active)?.id as string | undefined) ??
      null;

    const { data: project } = await svc
      .from("discovered_projects")
      .insert({
        organization_id: params.orgId,
        sector_id: sectorId,
        project_name: name.slice(0, 300),
        country: payload.country ? String(payload.country) : null,
        city: payload.city ? String(payload.city) : null,
        project_type: payload.project_type ? String(payload.project_type) : null,
        client_company: payload.client_company
          ? String(payload.client_company)
          : null,
        general_contractor: payload.general_contractor
          ? String(payload.general_contractor)
          : null,
        source_url: (finding.source_url as string) ?? null,
        ai_summary:
          (finding.evidence_text as string) ??
          (payload.summary ? String(payload.summary) : null),
        status: "new",
      })
      .select("id")
      .maybeSingle();
    if (project) {
      promotedTo = "discovered_project";
      entityId = project.id as string;
      destinationHref = `/hunter/${entityId}`;
    }
  }

  if (finding.finding_type === "company") {
    const companyName = String(
      payload.company_name ?? payload.name ?? payload.company ?? "",
    ).trim();
    if (!companyName) return null;

    const roleText = String(payload.role ?? "").trim();

    // A company Scout finds is only worth the queue if it lands somewhere it
    // will be seen again. So: create or find the company record, then — when
    // the finding names the project — put it on that project's contractor
    // chain, which is the screen someone actually opens.
    const { createCompany, searchAndFilterCompanies } = await import("./companies");
    const existing = await searchAndFilterCompanies(params.orgId, {
      search: companyName,
    });
    const match = existing.find(
      (c) => c.name.toLowerCase() === companyName.toLowerCase(),
    );

    let companyId: string | null = match?.id ?? null;
    if (!companyId) {
      const created = await createCompany(params.orgId, params.userId ?? "", {
        name: companyName,
        company_status: "research",
        priority: "medium",
        sectors: roleText ? [roleText] : [],
        source_url: (finding.source_url as string) ?? undefined,
        description: [
          roleText ? `Role: ${roleText}` : null,
          payload.parent ? `Part of ${String(payload.parent)}` : null,
          payload.project ? `Found on ${String(payload.project)}` : null,
        ]
          .filter(Boolean)
          .join(". "),
      });
      if (created.ok) companyId = created.id;
    }

    if (companyId) {
      promotedTo = "company";
      entityId = companyId;
      destinationHref = `/companies/${companyId}`;

      // Keep what the employee actually found.
      //
      // Impressum runs come back with a domain, a switchboard, a published
      // mailbox, a register entry, and judgement like "do not pitch the
      // Geschäftsführer as the Nachunternehmer buyer". Creating the company
      // and discarding all of it is the same failure as a report with no
      // findings: the work happened and the record does not show it.
      //
      // Only empty fields are filled and notes are appended, never replaced —
      // an earlier PATCH that rewrote notes from a request body destroyed a
      // sourced line about Peter Östlund.
      await enrichCompanyFromImpressum(svc, {
        companyId,
        orgId: params.orgId,
        payload,
        sourceUrl: (finding.source_url as string) ?? null,
        userId: params.userId,
      });

      // Preserve where this company came from. The assignment is the case
      // history; losing it at approval is what turned the company page into a
      // dead CRM record with no evidence, memory, or responsible employee.
      if (finding.assignment_id) {
        const { data: existingLink } = await svc
          .from("agent_assignment_entities")
          .select("id")
          .eq("org_id", params.orgId)
          .eq("assignment_id", finding.assignment_id as string)
          .eq("entity_type", "company")
          .eq("entity_id", companyId)
          .maybeSingle();
        if (!existingLink) {
          await svc.from("agent_assignment_entities").insert({
            org_id: params.orgId,
            assignment_id: finding.assignment_id as string,
            entity_type: "company",
            entity_id: companyId,
            relation: "output",
          });
        }
      }

      // Approval means "this lead is worth pursuing", not "CEO, please open
      // four more pages and manually reconstruct the research plan". Queue a
      // safe research-only continuation for the same employee. External
      // outreach still remains behind its separate human approval boundary.
      if (finding.agent_instance_id) {
        const { createAssignment } = await import("./workforce");
        const continuation = await createAssignment({
          orgId: params.orgId,
          agentInstanceId: finding.agent_instance_id as string,
          title: `Qualify ${companyName} into a placement opportunity`,
          objective: [
            `Continue the accepted company finding for ${companyName} as one durable commercial case.`,
            "Do not contact the company or any person.",
            "Find a current, named project relevant to Triangle's approved services; map the contractor chain far enough to identify the actual labor buyer; identify sourced buyer contacts; propose a specific Triangle-supported crew package; and state the exact next commercial action.",
            "Separate verified facts, strong inferences, and unknowns. Every material claim needs a source URL and evidence. File net-new projects, companies, and contacts as findings for human review.",
            "Do not call this an opportunity unless the result has a plausible project, buyer path, crew package, and next action. Return a short CEO decision brief, not a list of links.",
          ].join("\n\n"),
          priority: "high",
          expectedOutput:
            "A decision-ready qualified project package opportunity, or a clear no-go with the evidence and remaining blocker.",
          constraints: {
            case_type: "company_qualification",
            execution_mode: "in_app",
            company_id: companyId,
            source_finding_id: params.findingId,
            no_outreach: true,
            required_outcome: [
              "named_project",
              "buyer_path",
              "buyer_contact",
              "crew_package",
              "next_commercial_action",
            ],
          },
          idempotencyKey: `company-qualification:${params.findingId}`,
          entityRefs: [{ type: "company", id: companyId, relation: "target" }],
          userId: params.userId,
        });
        continuationAssignmentId = continuation?.id ?? null;
      }

      const projectName = String(payload.project ?? "").trim();
      if (projectName) {
        // Matched by name because that is all the finding carries. A miss just
        // means no chain node — the company still exists, so nothing is lost.
        const { data: project } = await svc
          .from("discovered_projects")
          .select("id")
          .eq("organization_id", params.orgId)
          .ilike("project_name", projectName)
          .limit(1)
          .maybeSingle();

        if (project) {
          const { normalizeChainRole } = await import("./research");
          const { upsertChainNode } = await import("./contractor-chain");
          const role = normalizeChainRole(roleText);
          await upsertChainNode(
            params.orgId,
            project.id as string,
            {
              role,
              label: roleText || role,
              company_name: companyName,
              company_id: companyId,
              level: "known",
              confidence: (finding.confidence as number) ?? null,
              rationale: String(finding.evidence_text ?? "").slice(0, 500),
              sort_order: 50,
              notes: null,
              created_by: params.userId,
            },
            params.userId ?? "",
          );
        }
      }
    }
  }

  // A way in, found by an employee sent to look for one.
  //
  // Accepting writes the channel onto the buyer contact so the CEO can act on
  // it from the contact itself. A switchboard number is stored in the notes
  // with whose desk it is and the sentence to say, because pretending it is
  // the manager's direct line is how someone ends up dialling and asking for
  // the wrong thing.
  //
  // Matched on shape, not only on the type name. An agent that could not send
  // `contact_channel` past the endpoint's whitelist filed the same payload as
  // `contact`; refusing those on a technicality would strand real published
  // numbers in the pending queue.
  const looksLikeChannel =
    Boolean(payload.buyer_contact_id) &&
    Boolean(payload.kind) &&
    Boolean(payload.value);
  if (
    finding.finding_type === "contact_channel" ||
    (finding.finding_type === "contact" && looksLikeChannel)
  ) {
    const contactId = String(payload.buyer_contact_id ?? "").trim();
    if (!contactId) return null;

    const { data: contact } = await svc
      .from("buyer_contacts")
      .select("id, notes, email, linkedin_url")
      .eq("organization_id", params.orgId)
      .eq("id", contactId)
      .maybeSingle();
    if (!contact) return null;

    const kind = String(payload.kind ?? "");
    const value = String(payload.value ?? "").trim();
    const scope = String(payload.scope ?? "switchboard");
    const belongsTo = payload.belongs_to ? String(payload.belongs_to) : null;
    if (!value) return null;

    // No `updated_by` column on buyer_contacts. Including one made every
    // write fail, and because the failure was swallowed the finding was
    // still marked accepted — a published phone number silently discarded
    // while the queue reported the decision as done.
    const updates: Record<string, unknown> = {};

    // Only a channel that is actually theirs goes in the person's own field.
    if (kind === "email" && scope === "person" && !contact.email) {
      updates.email = value;
    } else if (kind === "linkedin" && scope === "person" && !contact.linkedin_url) {
      updates.linkedin_url = value;
    }

    const whose =
      scope === "person"
        ? "their own"
        : belongsTo
          ? `${scope} — ${belongsTo}`
          : scope;
    const line = `${kind === "phone" ? "Phone" : kind === "email" ? "Email" : kind}: ${value} (${whose}) — source: ${finding.source_url ?? "unknown"}`;
    const howTo = payload.how_to_open ? String(payload.how_to_open) : null;

    const existingNotes = String(contact.notes ?? "").trim();
    const parts = [existingNotes, line];
    if (howTo && !existingNotes.includes(howTo)) parts.push(`How to open: ${howTo}`);
    updates.notes = parts.filter(Boolean).join("\n").slice(0, 4000);

    const { error } = await svc
      .from("buyer_contacts")
      .update(updates)
      .eq("id", contactId)
      .eq("organization_id", params.orgId);
    if (error) {
      // Refuse the whole acceptance. Marking it accepted while the record
      // did not change is the failure this product exists to prevent.
      console.error("acceptFinding contact_channel:", error);
      throw new Error(`Could not write that channel to the contact: ${error.message}`);
    }
    {
      promotedTo = "buyer_contact";
      entityId = contactId;

      // The company website is a byproduct worth keeping: 172 companies were
      // on record and not one had a domain, which is why nobody could reach
      // an Impressum in the first place.
      const site = payload.company_website ? String(payload.company_website) : null;
      const company = payload.company ? String(payload.company) : null;
      if (site && company) {
        const domain = site.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        await svc
          .from("companies")
          .update({ website_domain: domain })
          .eq("organization_id", params.orgId)
          .ilike("name", company)
          .is("website_domain", null);
      }
    }
  }

  if (finding.finding_type === "worker") {
    const name = String(payload.full_name ?? payload.name ?? "").trim();
    if (!name) return null;

    const asList = (v: unknown) =>
      Array.isArray(v) ? v.map(String).filter(Boolean) : [];

    // Re-uploading a CV for someone already on the books should enrich them,
    // not create a second copy of the same person.
    const email = payload.email ? String(payload.email).toLowerCase() : null;
    const { data: existing } = await svc
      .from("workers")
      .select("id, skills, certificates, languages")
      .eq("organization_id", params.orgId)
      .or(email ? `email.eq.${email},full_name.ilike.${name}` : `full_name.ilike.${name}`)
      .limit(1);

    const incoming = {
      role: payload.role ? String(payload.role) : null,
      email,
      phone: payload.phone ? String(payload.phone) : null,
      country: payload.country ? String(payload.country) : null,
      city: payload.city ? String(payload.city) : null,
      skills: asList(payload.skills),
      certificates: asList(payload.certificates),
      languages: asList(payload.languages),
    };

    const merge = (current: unknown, add: string[]) => {
      const have = Array.isArray(current) ? current.map(String) : [];
      const lower = new Set(have.map((v) => v.toLowerCase()));
      return [...have, ...add.filter((v) => !lower.has(v.toLowerCase()))];
    };

    if (existing && existing.length > 0) {
      const row = existing[0];
      const { error } = await svc
        .from("workers")
        .update({
          ...(incoming.role ? { role: incoming.role } : {}),
          ...(incoming.email ? { email: incoming.email } : {}),
          ...(incoming.phone ? { phone: incoming.phone } : {}),
          ...(incoming.country ? { country: incoming.country } : {}),
          ...(incoming.city ? { city: incoming.city } : {}),
          skills: merge(row.skills, incoming.skills),
          certificates: merge(row.certificates, incoming.certificates),
          languages: merge(row.languages, incoming.languages),
          updated_by: params.userId,
        })
        .eq("id", row.id as string);
      if (!error) {
        promotedTo = "worker";
        entityId = row.id as string;
      }
    } else {
      const { data: created } = await svc
        .from("workers")
        .insert({
          organization_id: params.orgId,
          full_name: name.slice(0, 200),
          role: incoming.role,
          email: incoming.email,
          phone: incoming.phone,
          country: incoming.country,
          city: incoming.city,
          skills: incoming.skills,
          certificates: incoming.certificates,
          languages: incoming.languages,
          availability_status: "unknown",
          status: "candidate",
          created_by: params.userId,
          updated_by: params.userId,
        })
        .select("id")
        .maybeSingle();
      if (created) {
        promotedTo = "worker";
        entityId = created.id as string;
      }
    }

    // Attach the CV to whoever it turned out to be, so the original document
    // lives on the person rather than in an inbox nobody opens again.
    if (entityId && payload.cv_document_id) {
      await svc
        .from("documents")
        .update({ linked_entity_type: "worker", linked_entity_id: entityId })
        .eq("id", String(payload.cv_document_id))
        .eq("organization_id", params.orgId);
    }
  }

  await svc
    .from("agent_findings")
    .update({
      status: "accepted",
      reviewed_by: params.userId,
      reviewed_at: new Date().toISOString(),
      promoted_entity_type: promotedTo,
      promoted_entity_id: entityId,
    })
    .eq("id", params.findingId)
    .eq("org_id", params.orgId);

  return {
    promotedTo,
    entityId,
    continuationAssignmentId,
    destinationHref,
  };
}

export async function rejectFinding(params: {
  findingId: string;
  orgId: string;
  userId: string | null;
}): Promise<boolean> {
  const svc = createServiceSupabaseClient();
  if (!svc) return false;
  const { data, error } = await svc
    .from("agent_findings")
    .update({
      status: "rejected",
      reviewed_by: params.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.findingId)
    .eq("org_id", params.orgId)
    .eq("status", "pending")
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}


/**
 * Write published company reachability onto the company record.
 *
 * `companies` has no email or phone column — those live in notes, the same
 * convention buyer contacts use for a found number — while domain, website,
 * address and legal name have real homes.
 */
async function enrichCompanyFromImpressum(
  svc: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  params: {
    companyId: string;
    orgId: string;
    payload: Record<string, unknown>;
    sourceUrl: string | null;
    userId: string | null;
  },
): Promise<void> {
  const p = params.payload;
  const str = (v: unknown) => (v ? String(v).trim() : "");

  const domain = str(p.domain).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const impressum = str(p.impressum_url);
  const website = str(p.company_website) || str(p.website);
  const address = str(p.address_register) || str(p.address);
  const legalName = str(p.legal_name);
  const email = str(p.email);
  const phone = str(p.phone);
  const register = str(p.register);
  const note = str(p.note);
  const leadership = Array.isArray(p.geschaeftsfuehrung)
    ? (p.geschaeftsfuehrung as unknown[]).map(String).filter(Boolean)
    : [];

  if (!domain && !impressum && !email && !phone && !note) return;

  const { data: row } = await svc
    .from("companies")
    .select("website_domain, website, address, legal_name, notes")
    .eq("id", params.companyId)
    .eq("organization_id", params.orgId)
    .maybeSingle();
  if (!row) return;

  const updates: Record<string, unknown> = { updated_by: params.userId };
  if (domain && !row.website_domain) updates.website_domain = domain;
  if (website && !row.website) updates.website = website;
  if (address && !row.address) updates.address = address;
  if (legalName && !row.legal_name) updates.legal_name = legalName;

  const lines = [
    email ? `Published email: ${email}` : null,
    phone ? `Switchboard: ${phone}` : null,
    impressum ? `Impressum: ${impressum}` : null,
    register ? `Register: ${register}` : null,
    leadership.length > 0 ? `Geschäftsführung: ${leadership.join(", ")}` : null,
    note ? `Note: ${note}` : null,
    params.sourceUrl ? `Source: ${params.sourceUrl}` : null,
  ].filter(Boolean) as string[];

  const existingNotes = String(row.notes ?? "").trim();
  const fresh = lines.filter((l) => !existingNotes.includes(l));
  if (fresh.length > 0) {
    updates.notes = [existingNotes, ...fresh]
      .filter(Boolean)
      .join("\n")
      .slice(0, 8000);
  }

  if (Object.keys(updates).length > 1) {
    await svc
      .from("companies")
      .update(updates)
      .eq("id", params.companyId)
      .eq("organization_id", params.orgId);
  }
}
