import "server-only";
import { createAssignment } from "@/lib/data/workforce";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Send an employee to find a way in.
//
// Triangle held four named buyers and could reach none of them. The instinct
// was to add a field for the CEO to paste an address into — which is a CRM,
// and CRMs are why the addresses were never found. The board does not do data
// entry. A worker goes and looks, and a human accepts what comes back.
//
// The job is a normal assignment, so it appears in the same inbox, the same
// thread, the same audit trail as every other piece of work. Nothing new to
// learn and nowhere else to look.
// ---------------------------------------------------------------------------

/**
 * Where the job runs.
 *
 * `bot` hands it to the Scout already running on a provider platform — it
 * polls /api/agent/inbox, it is already paid for, and it has a real browser.
 * `in_app` gives it to Triangle's own OpenAI executor, which runs unattended
 * but bills per run. The two must not both take the same job, so the mode is
 * explicit rather than implied.
 */
export type ReachabilityRuntime = "bot" | "in_app";

export interface QueueReachabilityResult {
  ok: boolean;
  assignmentId?: string;
  error?: string;
}

export async function queueReachabilityJob(params: {
  buyerContactId: string;
  orgId: string;
  userId: string | null;
  runtime?: ReachabilityRuntime;
}): Promise<QueueReachabilityResult> {
  const svc = createServiceSupabaseClient();
  if (!svc) return { ok: false, error: "Database unavailable" };

  const { data: contact } = await svc
    .from("buyer_contacts")
    .select("id, full_name, job_title, company_name, email, linkedin_url, notes")
    .eq("organization_id", params.orgId)
    .eq("id", params.buyerContactId)
    .maybeSingle();
  if (!contact) return { ok: false, error: "Buyer contact not found" };

  const scout = await findResearcher(params.orgId);
  if (!scout) {
    return {
      ok: false,
      error:
        "No active project researcher to give this to. Hire one in Workforce first.",
    };
  }

  const name = (contact.full_name as string) ?? "this contact";
  const company = (contact.company_name as string) ?? null;
  const runtime = params.runtime ?? "bot";

  const assignment = await createAssignment({
    orgId: params.orgId,
    agentInstanceId: scout,
    title: `Reach ${name}`,
    objective: [
      `Find a published, legitimate way to reach ${name}${company ? ` at ${company}` : ""}.`,
      "Do not contact them. Do not submit a contact form, send an email, or send a connection request. You are finding the door, not opening it.",
      company
        ? `Start with ${company}'s own website. In Germany and Austria the Impressum (legal notice) must publish a phone number and an email — find it. Then check Kontakt, Ansprechpartner, Standorte, and any supplier or Nachunternehmer portal.`
        : "Start with the company's own website and its legal notice.",
      "Never invent or pattern-derive an address. Do not construct firstname.lastname@company.de because it looks plausible. Report only a channel you have actually seen published, with the source URL and the line that says so.",
      "Be honest about precision: say whether each channel is the person's own, their department's, or the company switchboard.",
      "A switchboard number plus the right opening sentence is a complete result. Write what the caller should actually say — in German if the company is German-speaking — naming the person and the package.",
      "If nothing is published, say so and say where you looked. A sourced absence beats a fabricated address.",
    ].join("\n\n"),
    priority: "high",
    expectedOutput:
      "Published contact channels with source URL, quoted evidence, and how close each one gets to the person — or a sourced statement that none is published.",
    constraints: {
      case_type: "contact_reachability",
      execution_mode: runtime === "in_app" ? "in_app" : "bot",
      buyer_contact_id: contact.id,
      no_outreach: true,
      required_outcome: ["published_channel_or_sourced_absence"],
    },
    // One open job per contact. Clicking twice does not queue Scout twice.
    idempotencyKey: `reachability:${contact.id}`,
    entityRefs: [{ type: "contact", id: contact.id as string, relation: "target" }],
    userId: params.userId,
  });

  if (!assignment) return { ok: false, error: "Could not queue the job" };
  return { ok: true, assignmentId: assignment.id };
}

/** The employee whose job this is. Same role as company qualification. */
async function findResearcher(orgId: string): Promise<string | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;
  const { data } = await svc
    .from("agent_instances")
    .select("id")
    .eq("org_id", orgId)
    .eq("role_key", "project_researcher")
    .eq("status", "active")
    .order("created_at")
    .limit(1);
  return (data?.[0]?.id as string) ?? null;
}
