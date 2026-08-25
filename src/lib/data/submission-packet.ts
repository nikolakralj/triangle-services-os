import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  certLabel,
  computeDocumentReadiness,
  resolveRequiredDocuments,
  type DocumentReadinessItem,
  type RequiredDocsSource,
} from "@/lib/required-documents";

// ─────────────────────────────────────────────────────────────────────────
// Structured types for PDF generation (Sprint F)
// ─────────────────────────────────────────────────────────────────────────

export type PdfCertDoc = {
  certType: string;
  label: string;
  status: "valid" | "expiring_soon" | "expired" | "no_expiry";
  expiryDate: string | null;
};

export type PdfPacketWorker = {
  name: string;
  role: string | null;
  country: string | null;
  languages: string[];
  availability: string | null;
  availableFrom: string | null;
  skills: string[];
  certificates: string[];
  hasA1: boolean;
  dailyRate: number | null;
  hourlyRate: number | null;
  currency: string | null;
  reliability: number;
  quality: number;
  safety: number;
  matchScore: number;
  note: string | null;
  /** Documents uploaded to the Document Vault for this worker */
  certDocs: PdfCertDoc[];
};

export type PdfPacketData = {
  packageTitle: string;
  projectName: string;
  countryCode: string | null;
  phase: string | null;
  buyerCompany: string | null;
  crewSize: number | null;
  roles: string[];
  summary: string | null;
  workers: PdfPacketWorker[];
  /** Document types this package requires (resolved: explicit or template). */
  requiredDocuments: string[];
  /** Whether requiredDocuments came from the package or the country/role template. */
  requiredDocsSource: RequiredDocsSource;
  /** Per-document readiness across the submitted crew. */
  documentReadiness: DocumentReadinessItem[];
  generatedAt: string;
};

// Helper: build the set of cert types a worker has satisfied (on file & not
// expired) from their PdfCertDoc list.
function satisfiedCertTypesOf(certDocs: PdfCertDoc[]): Set<string> {
  return new Set(
    certDocs.filter((d) => d.status !== "expired").map((d) => d.certType),
  );
}

// Helper: fetch uploaded documents for a set of workers and return, per worker,
// the set of cert types they have on file and not expired. Used by the markdown
// packet (the PDF path derives the same info from its richer cert map).
async function fetchWorkerSatisfiedCertTypes(
  svc: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  orgId: string,
  workerIds: string[],
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  if (workerIds.length === 0) return result;

  const { data: docRows } = await svc
    .from("documents")
    .select("linked_entity_id, document_category, expiry_date")
    .eq("organization_id", orgId)
    .eq("linked_entity_type", "worker")
    .in("linked_entity_id", workerIds);

  for (const doc of docRows ?? []) {
    const workerId = doc.linked_entity_id as string;
    const certType = doc.document_category as string;
    const expired =
      doc.expiry_date != null && new Date(doc.expiry_date).getTime() < Date.now();
    if (expired) continue;
    if (!result.has(workerId)) result.set(workerId, new Set());
    result.get(workerId)!.add(certType);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// Submission packet generator
// ─────────────────────────────────────────────────────────────────────────
// Generates a buyer-facing markdown packet from a package + submitted workers.
// This is the *commercial deliverable* that turns the Submit button into a
// real action. Today: markdown only. Sprint F+: PDF, branded template, email.
// ─────────────────────────────────────────────────────────────────────────

export type SubmissionPacketResult = {
  packageId: string;
  packageTitle: string;
  projectTitle: string;
  workerCount: number;
  markdown: string;
  generatedAt: string;
};

export async function buildSubmissionPacket(
  packageId: string,
  orgId: string,
): Promise<SubmissionPacketResult | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  // 1. Load package + project
  const { data: pkg } = await svc
    .from("project_packages")
    .select("id, title, summary, roles, estimated_crew_size, project_id, contractor_node_id, required_documents")
    .eq("id", packageId)
    .eq("org_id", orgId)
    .single();
  if (!pkg) return null;

  const { data: project } = await svc
    .from("discovered_projects")
    .select("project_name, country_code, phase, ai_summary, source_url")
    .eq("id", pkg.project_id)
    .single();

  // 2. Load chain node (likely buyer) if linked
  let buyerCompany: string | null = null;
  if (pkg.contractor_node_id) {
    const { data: node } = await svc
      .from("contractor_chain_nodes")
      .select("company_name, role")
      .eq("id", pkg.contractor_node_id)
      .single();
    buyerCompany = node?.company_name ?? null;
  }

  // 3. Load submitted workers via match rows
  const { data: matchRows } = await svc
    .from("package_worker_matches")
    .select("worker_id, match_score, match_reasons, notes")
    .eq("package_id", packageId)
    .eq("org_id", orgId)
    .in("status", ["submitted", "placed"])
    .order("match_score", { ascending: false });

  const workerIds = (matchRows ?? []).map((r) => r.worker_id);
  if (workerIds.length === 0) {
    return {
      packageId,
      packageTitle: pkg.title,
      projectTitle: project?.project_name ?? "Unknown project",
      workerCount: 0,
      markdown: "No workers submitted yet. Move workers to the Submitted tab first.",
      generatedAt: new Date().toISOString(),
    };
  }

  const { data: workers } = await svc
    .from("workers")
    .select(
      "id, full_name, role, country, languages, skills, certificates, hourly_rate_expectation, daily_rate_expectation, currency, availability_status, available_from, reliability_score, quality_score, safety_score, has_a1_possible",
    )
    .in("id", workerIds);

  const workerMap = new Map((workers ?? []).map((w) => [w.id, w]));

  // 4. Build markdown
  const lines: string[] = [];
  lines.push(`# Crew Submission — ${pkg.title}`);
  lines.push("");
  lines.push(`**Project:** ${project?.project_name ?? "—"}`);
  if (project?.country_code) lines.push(`**Country:** ${project.country_code}`);
  if (project?.phase) lines.push(`**Phase:** ${project.phase}`);
  if (buyerCompany) lines.push(`**Submitting to:** ${buyerCompany}`);
  if (pkg.estimated_crew_size) lines.push(`**Crew size:** ${pkg.estimated_crew_size}`);
  if (Array.isArray(pkg.roles) && pkg.roles.length > 0) {
    lines.push(`**Roles:** ${pkg.roles.join(", ")}`);
  }
  lines.push("");
  if (pkg.summary) {
    lines.push(pkg.summary);
    lines.push("");
  } else if (project?.ai_summary) {
    lines.push(project.ai_summary);
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push(`## Proposed Crew (${matchRows!.length})`);
  lines.push("");

  for (const row of matchRows!) {
    const w = workerMap.get(row.worker_id);
    if (!w) continue;
    lines.push(`### ${w.full_name} — ${w.role ?? "—"}`);
    const meta: string[] = [];
    if (w.country) meta.push(w.country);
    if (Array.isArray(w.languages) && w.languages.length > 0) {
      meta.push(`Languages: ${w.languages.join(", ")}`);
    }
    if (w.availability_status) meta.push(`Availability: ${w.availability_status}`);
    if (w.available_from) meta.push(`Available from: ${w.available_from}`);
    if (meta.length > 0) lines.push(meta.join(" · "));

    if (Array.isArray(w.skills) && w.skills.length > 0) {
      lines.push(`- **Skills:** ${w.skills.join(", ")}`);
    }
    if (Array.isArray(w.certificates) && w.certificates.length > 0) {
      lines.push(`- **Certificates:** ${w.certificates.join(", ")}`);
    }
    if (w.has_a1_possible) lines.push(`- **A1 portable:** yes`);
    const rateBits: string[] = [];
    if (w.daily_rate_expectation) rateBits.push(`${w.daily_rate_expectation} ${w.currency}/day`);
    if (w.hourly_rate_expectation) rateBits.push(`${w.hourly_rate_expectation} ${w.currency}/hr`);
    if (rateBits.length > 0) lines.push(`- **Indicative rate:** ${rateBits.join(" or ")}`);
    const quality = Math.round(
      ((w.reliability_score ?? 0) + (w.quality_score ?? 0) + (w.safety_score ?? 0)) / 3,
    );
    if (quality > 0) {
      lines.push(
        `- **Triangle track record:** ${quality}/100 (reliability ${w.reliability_score}, quality ${w.quality_score}, safety ${w.safety_score})`,
      );
    }
    lines.push(`- **Match score for this package:** ${row.match_score}%`);
    if (row.notes) lines.push(`- _Note:_ ${row.notes}`);
    lines.push("");
  }

  // Document readiness — required-vs-on-file across the submitted crew.
  const pkgRoles = Array.isArray(pkg.roles) ? pkg.roles : [];
  const { docs: requiredDocuments, source: requiredDocsSource } =
    resolveRequiredDocuments({
      explicit: pkg.required_documents as string[] | null,
      countryCode: project?.country_code ?? null,
      roles: pkgRoles,
    });

  if (requiredDocuments.length > 0) {
    const satisfiedMap = await fetchWorkerSatisfiedCertTypes(svc, orgId, workerIds);
    const readiness = computeDocumentReadiness(
      requiredDocuments,
      matchRows!.flatMap((row) => {
        const w = workerMap.get(row.worker_id);
        if (!w) return [];
        return [{
          name: w.full_name as string,
          satisfiedCertTypes: satisfiedMap.get(row.worker_id) ?? new Set<string>(),
        }];
      }),
    );

    lines.push("---");
    lines.push("");
    lines.push("## Document readiness");
    lines.push("");
    lines.push(
      requiredDocsSource === "template"
        ? "_Required documents inferred from project country and roles (no explicit list set)._"
        : "_Required documents defined for this package._",
    );
    lines.push("");
    const statusIcon: Record<string, string> = {
      complete: "✅",
      partial: "⚠️",
      missing: "❌",
    };
    for (const item of readiness) {
      lines.push(
        `- ${statusIcon[item.status]} **${item.label}** — ${item.onFile}/${item.total} on file` +
          (item.missingWorkers.length > 0
            ? ` (missing: ${item.missingWorkers.join(", ")})`
            : ""),
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Next steps");
  lines.push("");
  lines.push("- Confirm role/headcount fit");
  lines.push("- Confirm start date and duration");
  lines.push("- Confirm commercial rate per role");
  lines.push("- Triangle Services to share certificates and references for shortlisted workers");
  if (project?.source_url) {
    lines.push("");
    lines.push(`Project source: ${project.source_url}`);
  }

  return {
    packageId,
    packageTitle: pkg.title,
    projectTitle: project?.project_name ?? "Unknown project",
    workerCount: matchRows!.length,
    markdown: lines.join("\n"),
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// buildPdfPacketData — same data fetching, returns structured type for PDF
// ─────────────────────────────────────────────────────────────────────────
export async function buildPdfPacketData(
  packageId: string,
  orgId: string,
): Promise<PdfPacketData | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data: pkg } = await svc
    .from("project_packages")
    .select("id, title, summary, roles, estimated_crew_size, project_id, contractor_node_id, required_documents")
    .eq("id", packageId)
    .eq("org_id", orgId)
    .single();
  if (!pkg) return null;

  const { data: project } = await svc
    .from("discovered_projects")
    .select("project_name, country_code, phase, ai_summary, source_url")
    .eq("id", pkg.project_id)
    .single();

  let buyerCompany: string | null = null;
  if (pkg.contractor_node_id) {
    const { data: node } = await svc
      .from("contractor_chain_nodes")
      .select("company_name")
      .eq("id", pkg.contractor_node_id)
      .single();
    buyerCompany = node?.company_name ?? null;
  }

  const { data: matchRows } = await svc
    .from("package_worker_matches")
    .select("worker_id, match_score, notes")
    .eq("package_id", packageId)
    .eq("org_id", orgId)
    .in("status", ["submitted", "placed"])
    .order("match_score", { ascending: false });

  const workerIds = (matchRows ?? []).map((r) => r.worker_id);
  const { data: workers } = workerIds.length > 0
    ? await svc
        .from("workers")
        .select(
          "id, full_name, role, country, languages, skills, certificates, hourly_rate_expectation, daily_rate_expectation, currency, availability_status, available_from, reliability_score, quality_score, safety_score, has_a1_possible",
        )
        .in("id", workerIds)
    : { data: [] };

  const workerMap = new Map((workers ?? []).map((w) => [w.id, w]));

  // Load uploaded documents for all submitted workers
  const { data: docRows } = workerIds.length > 0
    ? await svc
        .from("documents")
        .select("linked_entity_id, document_category, expiry_date")
        .eq("organization_id", orgId)
        .eq("linked_entity_type", "worker")
        .in("linked_entity_id", workerIds)
    : { data: [] };

  function expiryStatus(expiryDate: string | null): PdfCertDoc["status"] {
    if (!expiryDate) return "no_expiry";
    const diffDays = Math.floor(
      (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays < 0) return "expired";
    if (diffDays <= 30) return "expiring_soon";
    return "valid";
  }

  // Build map: workerId → Map<certType, PdfCertDoc>
  // If a worker has multiple docs of same cert type, keep the best status
  const STATUS_RANK: Record<PdfCertDoc["status"], number> = {
    valid: 0, expiring_soon: 1, no_expiry: 2, expired: 3,
  };

  const workerCertMap = new Map<string, Map<string, PdfCertDoc>>();
  for (const doc of docRows ?? []) {
    const workerId = doc.linked_entity_id as string;
    const certType = doc.document_category as string;
    if (!workerCertMap.has(workerId)) workerCertMap.set(workerId, new Map());
    const existing = workerCertMap.get(workerId)!.get(certType);
    const status = expiryStatus(doc.expiry_date);
    if (!existing || STATUS_RANK[status] < STATUS_RANK[existing.status]) {
      workerCertMap.get(workerId)!.set(certType, {
        certType,
        label: certLabel(certType),
        status,
        expiryDate: doc.expiry_date ?? null,
      });
    }
  }

  const pdfWorkers: PdfPacketWorker[] = (matchRows ?? []).flatMap((row) => {
    const w = workerMap.get(row.worker_id);
    if (!w) return [];
    const certDocs = Array.from(workerCertMap.get(row.worker_id)?.values() ?? []);
    return [{
      name: w.full_name,
      role: w.role ?? null,
      country: w.country ?? null,
      languages: Array.isArray(w.languages) ? w.languages : [],
      availability: w.availability_status ?? null,
      availableFrom: w.available_from ?? null,
      skills: Array.isArray(w.skills) ? w.skills : [],
      certificates: Array.isArray(w.certificates) ? w.certificates : [],
      hasA1: w.has_a1_possible ?? false,
      dailyRate: w.daily_rate_expectation ?? null,
      hourlyRate: w.hourly_rate_expectation ?? null,
      currency: w.currency ?? null,
      reliability: w.reliability_score ?? 0,
      quality: w.quality_score ?? 0,
      safety: w.safety_score ?? 0,
      matchScore: row.match_score,
      note: row.notes ?? null,
      certDocs,
    }];
  });

  const pkgRoles = Array.isArray(pkg.roles) ? pkg.roles : [];
  const { docs: requiredDocuments, source: requiredDocsSource } =
    resolveRequiredDocuments({
      explicit: pkg.required_documents as string[] | null,
      countryCode: project?.country_code ?? null,
      roles: pkgRoles,
    });

  const documentReadiness = computeDocumentReadiness(
    requiredDocuments,
    pdfWorkers.map((w) => ({
      name: w.name,
      satisfiedCertTypes: satisfiedCertTypesOf(w.certDocs),
    })),
  );

  return {
    packageTitle: pkg.title,
    projectName: project?.project_name ?? "Unknown project",
    countryCode: project?.country_code ?? null,
    phase: project?.phase ?? null,
    buyerCompany,
    crewSize: pkg.estimated_crew_size ?? null,
    roles: pkgRoles,
    summary: pkg.summary ?? project?.ai_summary ?? null,
    workers: pdfWorkers,
    requiredDocuments,
    requiredDocsSource,
    documentReadiness,
    generatedAt: new Date().toISOString(),
  };
}
