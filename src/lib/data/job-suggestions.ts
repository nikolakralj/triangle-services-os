import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Work that needs doing.
//
// "New assignment" used to be a blank form: pick an employee, invent a title,
// write a brief. That asks the board to already know what the company should
// be working on, phrase it well, and pick the right person — which is the
// board doing the work, again.
//
// Triangle already knows. Four buyers with no way to reach them. Projects with
// no contractor chain. Available people with no package to sell them into.
// Every one of those is a job with an obvious brief, and the brief can be
// written here instead of by the CEO.
//
// These are proposals, not automation. The CEO picks what the company works on
// next — that is the actual board decision, and it should be one click.
// ---------------------------------------------------------------------------

/** How many "map the chain" jobs to surface at once. */
const CHAIN_JOB_LIMIT = 4;

export interface SuggestedJob {
  /** Stable across refreshes; also the idempotency key. */
  id: string;
  title: string;
  objective: string;
  /** Why this is on the list, in the CEO's language, with the real number. */
  reason: string;
  /** Which kind of employee should get it. */
  roleKey: string;
  priority: "urgent" | "high" | "normal" | "low";
  kind: "reach" | "chain" | "supply";
  entityRefs: Array<{ type: string; id: string; relation?: string }>;
  constraints: Record<string, unknown>;
}

export async function suggestJobs(orgId: string): Promise<SuggestedJob[]> {
  const svc = createServiceSupabaseClient();
  if (!svc) return [];

  const [contacts, projects, chainNodes, workers, openJobs, doneJobs] =
    await Promise.all([
    svc
      .from("buyer_contacts")
      .select("id, full_name, company_name, email, linkedin_url, notes")
      .eq("organization_id", orgId),
    svc
      .from("discovered_projects")
      .select("id, project_name, client_company, country, created_at")
      .eq("organization_id", orgId)
      // Newest first. Not a relevance ranking — Triangle cannot compute one
      // yet — but the most recently discovered project is the most likely to
      // still be live, and it beats an arbitrary order.
      .order("created_at", { ascending: false }),
    svc
      .from("contractor_chain_nodes")
      .select("discovered_project_id")
      .eq("organization_id", orgId),
    svc
      .from("workers")
      .select("id, full_name, role, availability_status")
      .eq("organization_id", orgId)
      .eq("availability_status", "available"),
    svc
      .from("agent_assignments")
      .select("constraints, status")
      .eq("org_id", orgId)
      .in("status", ["queued", "active"]),
    // Jobs already reported on. A completed reachability run that filed no
    // findings is not the same as one never done — the answer exists, it just
    // never reached the record. Saying so points the CEO at the report
    // instead of silently offering the identical job again.
    svc
      .from("agent_assignments")
      .select("id, constraints")
      .eq("org_id", orgId)
      .eq("status", "completed"),
  ]);

  // Never propose a job an employee is already working on.
  //
  // Matched two ways on purpose. `suggestion_id` is the direct stamp, but jobs
  // queued before that existed — or started from a record's own button —
  // carry only the entity they are about. Relying on the stamp alone put a
  // contact back on the list while Scout was already looking for them.
  const taken = new Set<string>();
  for (const row of openJobs.data ?? []) {
    const c = (row.constraints as Record<string, unknown>) ?? {};
    if (typeof c.suggestion_id === "string") taken.add(c.suggestion_id);
    if (typeof c.buyer_contact_id === "string") {
      taken.add(`reachability:${c.buyer_contact_id}`);
    }
  }

  // Which contacts already had someone look, and whether anything was filed.
  const reportedOn = new Map<string, string>();
  const doneIds: string[] = [];
  for (const row of doneJobs.data ?? []) {
    const c = (row.constraints as Record<string, unknown>) ?? {};
    if (c.case_type === "contact_reachability" && typeof c.buyer_contact_id === "string") {
      reportedOn.set(c.buyer_contact_id, row.id as string);
      doneIds.push(row.id as string);
    }
  }
  const filedFor = new Set<string>();
  if (doneIds.length > 0) {
    const { data: filed } = await svc
      .from("agent_findings")
      .select("assignment_id")
      .eq("org_id", orgId)
      .in("assignment_id", doneIds);
    for (const f of filed ?? []) filedFor.add(f.assignment_id as string);
  }

  const jobs: SuggestedJob[] = [];
  const push = (job: SuggestedJob) => {
    if (!taken.has(job.id)) jobs.push(job);
  };

  // Buyers nobody can reach.
  for (const c of contacts.data ?? []) {
    const reachable =
      c.email || c.linkedin_url || /Phone:/.test(String(c.notes ?? ""));
    if (reachable) continue;
    const name = (c.full_name as string) ?? "this contact";
    const company = (c.company_name as string) ?? null;
    push({
      id: `reachability:${c.id}`,
      title: `Reach ${name}`,
      objective: reachObjective(name, company),
      reason: reachReason(reportedOn, filedFor, c.id as string),
      roleKey: "project_researcher",
      priority: "high",
      kind: "reach",
      entityRefs: [{ type: "contact", id: c.id as string, relation: "target" }],
      constraints: {
        case_type: "contact_reachability",
        execution_mode: "bot",
        buyer_contact_id: c.id,
        no_outreach: true,
      },
    });
  }

  // Projects where nobody knows who buys.
  //
  // Capped. Eighteen projects with no chain is a real backlog, but eighteen
  // rows is a wall the CEO scrolls past instead of a decision they make.
  const withChain = new Set(
    (chainNodes.data ?? []).map((n) => n.discovered_project_id as string),
  );
  const unmapped = (projects.data ?? []).filter(
    (p) => !withChain.has(p.id as string),
  );
  for (const p of unmapped.slice(0, CHAIN_JOB_LIMIT)) {
    const name = (p.project_name as string) ?? "this project";
    push({
      id: `chain:${p.id}`,
      title: `Map the contractor chain on ${name}`,
      objective: [
        `Work out who actually buys the labour on ${name}${p.country ? ` (${p.country})` : ""}.`,
        p.client_company
          ? `The owner appears to be ${p.client_company}. The owner is usually NOT the labour buyer — go further down the chain.`
          : "Identify the owner first, then keep going: the owner is usually not the labour buyer.",
        "Map owner to EPC/GC to the electrical or automation subcontractor, and stop when you reach the company that would actually hire a subcontracted crew.",
        "Every link needs a source URL and the line that supports it. File what you find as findings for human review. Do not contact anyone.",
      ].join("\n\n"),
      reason: "No contractor chain — nobody knows who buys here.",
      roleKey: "project_researcher",
      priority: "normal",
      kind: "chain",
      entityRefs: [{ type: "project", id: p.id as string, relation: "target" }],
      constraints: { execution_mode: "bot", no_outreach: true },
    });
  }

  // Confirmed-available people with nothing to sell them into.
  const available = workers.data ?? [];
  if (available.length > 0) {
    const names = available.map((w) => String(w.full_name)).join(", ");
    const roles = Array.from(
      new Set(available.map((w) => String(w.role ?? "")).filter(Boolean)),
    );
    push({
      id: `supply:${available
        .map((w) => w.id as string)
        .sort()
        .join("-")}`,
      title: `Find work for ${available.length} available ${
        available.length === 1 ? "person" : "people"
      }`,
      objective: [
        `These people are confirmed available: ${names}.`,
        roles.length > 0 ? `Roles: ${roles.join(", ")}.` : null,
        "Find contracts or projects that could absorb exactly these people. Their skills, certificates, languages and rates are the search criteria — this is not a general market scan.",
        "For each candidate: who owns the project, who actually buys the labour, the quoted evidence, the source URL, and how well it fits these specific people.",
        "Do not contact anyone. Fewer strong fits beat a long list.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      reason: `${available.length} confirmed available, none sold into a package.`,
      roleKey: "project_researcher",
      priority: "high",
      kind: "supply",
      entityRefs: available.map((w) => ({
        type: "worker",
        id: w.id as string,
        relation: "input",
      })),
      constraints: { execution_mode: "bot", no_outreach: true },
    });
  }

  return jobs;
}

/**
 * A previous run that reported but filed nothing is a system failure, not an
 * absence of work. It should read differently from "nobody has looked".
 */
function reachReason(
  reportedOn: Map<string, string>,
  filedFor: Set<string>,
  contactId: string,
): string {
  const assignmentId = reportedOn.get(contactId);
  if (!assignmentId) return "Named buyer, no way to contact them.";
  if (filedFor.has(assignmentId)) {
    return "Named buyer. A previous search filed channels — check Approvals.";
  }
  return "Reported on already, but nothing was filed. The answer is in the report below.";
}

/** Projects with no contractor chain beyond the ones offered above. */
export async function countUnmappedProjects(orgId: string): Promise<number> {
  const svc = createServiceSupabaseClient();
  if (!svc) return 0;
  const [projects, chainNodes] = await Promise.all([
    svc.from("discovered_projects").select("id").eq("organization_id", orgId),
    svc
      .from("contractor_chain_nodes")
      .select("discovered_project_id")
      .eq("organization_id", orgId),
  ]);
  const withChain = new Set(
    (chainNodes.data ?? []).map((n) => n.discovered_project_id as string),
  );
  const unmapped = (projects.data ?? []).filter(
    (p) => !withChain.has(p.id as string),
  ).length;
  return Math.max(0, unmapped - CHAIN_JOB_LIMIT);
}

/**
 * Shared with queueReachabilityJob so the brief is written once. Two copies of
 * an agent's instructions drift, and the drift is invisible until an employee
 * does the job differently depending on which button started it.
 */
export function reachObjective(name: string, company: string | null): string {
  return [
    `Find a published, legitimate way to reach ${name}${company ? ` at ${company}` : ""}.`,
    "Do not contact them. Do not submit a contact form, send an email, or send a connection request. You are finding the door, not opening it.",
    company
      ? `Start with ${company}'s own website. In Germany and Austria the Impressum (legal notice) must publish a phone number and an email — find it. Then check Kontakt, Ansprechpartner, Standorte, and any supplier or Nachunternehmer portal.`
      : "Start with the company's own website and its legal notice.",
    "Never invent or pattern-derive an address. Do not construct firstname.lastname@company.de because it looks plausible. Report only a channel you have actually seen published, with the source URL and the line that says so.",
    "Be honest about precision: say whether each channel is the person's own, their department's, or the company switchboard.",
    "A switchboard number plus the right opening sentence is a complete result. Write what the caller should actually say — in German if the company is German-speaking — naming the person and the package.",
    "If nothing is published, say so and say where you looked. A sourced absence beats a fabricated address.",
  ].join("\n\n");
}
