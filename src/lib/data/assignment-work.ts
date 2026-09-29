import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { countMessagesByAssignment } from "@/lib/data/assignment-threads";
import {
  caseWorkSentence,
  caseWorkState,
  type CaseWorkState,
} from "@/lib/data/case-work-status";
import { withLabelFor } from "@/lib/data/today-handoff";

// ---------------------------------------------------------------------------
// What one case is, for the thread drawer.
//
// The drawer was a chat window: a title, everything anybody had written, and
// a box to write more. Whose move it was had to be inferred from reading the
// scroll, and a Grok write-up is long enough that nobody did.
//
// This is the other half — who owns it and where it stands — read on the
// server from the record, so a browser cannot tell the drawer that an
// employee is working when the row says queued.
// ---------------------------------------------------------------------------

export interface AssignmentWork {
  assignmentId: string;
  caseType: string | null;
  state: CaseWorkState;
  statusLine: string;
  agentName: string;
  /** "With Hanna" for Hanna's work, "With Bob" for Bob's. Never guessed. */
  withLabel: string;
  finished: boolean;
}

export async function getAssignmentWork(
  assignmentId: string,
  orgId: string,
): Promise<AssignmentWork | null> {
  const svc = createServiceSupabaseClient();
  if (!svc) return null;

  const { data: row } = await svc
    .from("agent_assignments")
    .select("id, agent_instance_id, status, constraints")
    .eq("org_id", orgId)
    .eq("id", assignmentId)
    .maybeSingle();
  if (!row) return null;

  const [{ data: agent }, threads] = await Promise.all([
    svc
      .from("agent_instances")
      .select("display_name, role_key")
      .eq("org_id", orgId)
      .eq("id", row.agent_instance_id as string)
      .maybeSingle(),
    countMessagesByAssignment([assignmentId], orgId),
  ]);

  const agentName = ((agent?.display_name as string) || "").trim() || "The employee";
  const status = (row.status as string) || "queued";
  const awaitingAgent = threads.get(assignmentId)?.awaitingAgent ?? 0;
  const state = caseWorkState({ status, awaitingAgent });
  const constraints = (row.constraints as Record<string, unknown> | null) ?? {};

  return {
    assignmentId,
    caseType:
      typeof constraints.case_type === "string" ? constraints.case_type : null,
    state,
    statusLine: caseWorkSentence({ state, agentName, awaitingAgent }),
    agentName,
    withLabel: withLabelFor((agent?.role_key as string) || "", agentName),
    finished: status === "completed",
  };
}
