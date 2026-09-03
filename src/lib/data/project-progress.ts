import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// How far a discovered project has actually got.
//
// Signal Inbox showed every project an "Opportunity 75" bar, and sorted by it.
// Sixteen of eighteen scored exactly 75 — including a software research
// programme with no crew to supply. The number came from asking a model for a
// 0-100 score with no rubric; it returned the same middling figure every time,
// and the UI dressed that up as measurement.
//
// The honest replacement is not a better score. Triangle does not know enough
// about these projects to rank them, and pretending otherwise is the problem.
// What it DOES know is how far each one has been worked: whether anyone has
// mapped who buys, found a person, or shaped a package. That is derived from
// real rows, it is what decides where the next hour goes, and it cannot drift
// from the truth because it IS the truth.
// ---------------------------------------------------------------------------

export interface ProjectProgress {
  hasChain: boolean;
  hasBuyerContact: boolean;
  hasReachableContact: boolean;
  hasPackage: boolean;
  /** 0-4 — steps completed, not a quality judgement. */
  step: number;
  label: string;
}

const NOTHING: ProjectProgress = {
  hasChain: false,
  hasBuyerContact: false,
  hasReachableContact: false,
  hasPackage: false,
  step: 0,
  label: "Nothing known yet",
};

export async function getProjectProgress(
  projectIds: string[],
  orgId: string,
): Promise<Map<string, ProjectProgress>> {
  const out = new Map<string, ProjectProgress>();
  const ids = Array.from(new Set(projectIds.filter(Boolean)));
  if (ids.length === 0) return out;

  const svc = createServiceSupabaseClient();
  if (!svc) return out;

  const [chain, contacts, packages] = await Promise.all([
    svc
      .from("contractor_chain_nodes")
      .select("discovered_project_id")
      .eq("organization_id", orgId)
      .in("discovered_project_id", ids),
    svc
      .from("buyer_contacts")
      .select("discovered_project_id, email, linkedin_url, notes")
      .eq("organization_id", orgId)
      .in("discovered_project_id", ids),
    svc
      .from("project_packages")
      .select("project_id")
      .eq("org_id", orgId)
      .in("project_id", ids),
  ]);

  const withChain = new Set(
    (chain.data ?? []).map((r) => r.discovered_project_id as string),
  );
  const withContact = new Set<string>();
  const withReachable = new Set<string>();
  for (const c of contacts.data ?? []) {
    const pid = c.discovered_project_id as string;
    withContact.add(pid);
    // Same test the buyer-contacts panel uses: a found number lives in notes.
    if (c.email || c.linkedin_url || /Phone:/.test(String(c.notes ?? ""))) {
      withReachable.add(pid);
    }
  }
  const withPackage = new Set(
    (packages.data ?? []).map((r) => r.project_id as string),
  );

  for (const id of ids) {
    const hasChain = withChain.has(id);
    const hasBuyerContact = withContact.has(id);
    const hasReachableContact = withReachable.has(id);
    const hasPackage = withPackage.has(id);
    const step =
      (hasChain ? 1 : 0) +
      (hasBuyerContact ? 1 : 0) +
      (hasReachableContact ? 1 : 0) +
      (hasPackage ? 1 : 0);

    out.set(id, {
      hasChain,
      hasBuyerContact,
      hasReachableContact,
      hasPackage,
      step,
      label: hasReachableContact
        ? "Someone to call"
        : hasBuyerContact
          ? "Buyer named, no way to reach them"
          : hasChain
            ? "Chain mapped, no buyer named"
            : NOTHING.label,
    });
  }
  return out;
}
